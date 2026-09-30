#!/usr/bin/env node
/*
 * Clean tech-pack SVG -> Kickflip-ready layer PNGs, per view.
 *
 * Usage: node tools/build_layers.js styles/VC010-jersey.json [--tinted]
 * Requires Playwright (Chromium). Run tools/pdf_to_svg.py first.
 *
 * Output per view (all the same pixel size, so they stack exactly):
 *   00-details-under.png   fixed art painted beneath the fabrics (e.g. inside of neck)
 *   10-<zone>.png          white mask of one fabric zone - recolor this in Kickflip
 *   50-texture.png         mesh texture, black with alpha (darkens whatever color is under it)
 *   60-details-over.png    fixed art on top (labels, logos)
 *   70-lines.png           seams, stitching, shading, black with alpha
 *   preview.png            everything composited with each zone's sample color
 *   colors/<zone>/<color>.png   (--tinted) pre-colored zone images, one per palette color
 */
'use strict';
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright'))); }

const cfgPath = path.resolve(process.argv[2] || '');
if (!fs.existsSync(cfgPath)) { console.error('Usage: node tools/build_layers.js styles/<style>.json [--tinted]'); process.exit(1); }
const tinted = process.argv.includes('--tinted');
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const base = path.dirname(cfgPath);
const svg = fs.readFileSync(path.resolve(base, cfg.svg), 'utf8');
const outDir = path.resolve(base, cfg.out);
const textBoxesPath = path.resolve(base, cfg.svg) + '.text.json';
const textBoxes = fs.existsSync(textBoxesPath) ? JSON.parse(fs.readFileSync(textBoxesPath, 'utf8')) : [];
const palette = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'palette.json'), 'utf8'));

/* Everything below `pageMain` runs inside Chromium. */
async function pageMain({ cfg, palette, tinted, textBoxes }) {
  const svgEl = document.querySelector('svg');
  // Natural size so client px == SVG user units (bboxes, view splits and `area` use those units).
  const vb = svgEl.viewBox.baseVal;
  svgEl.setAttribute('width', vb.width); svgEl.setAttribute('height', vb.height);
  const drawables = [...svgEl.querySelectorAll('path,use,image,rect,polygon,circle,ellipse,line,polyline')]
    .filter((e) => !e.closest('defs,pattern,clipPath,mask'));

  const lc = (s) => (s || '').toLowerCase();
  function patternColors(fill) {
    const m = /url\(#([^)]+)\)/.exec(fill || '');
    if (!m) return [];
    const pat = svgEl.querySelector('#' + CSS.escape(m[1]));
    const tile = pat && pat.querySelector('use') && svgEl.querySelector(pat.querySelector('use').getAttribute('xlink:href') || pat.querySelector('use').getAttribute('href'));
    return [...(tile || pat).querySelectorAll('[fill]')].map((n) => lc(n.getAttribute('fill')));
  }
  function matches(m, info) {
    if (m.fill && lc(m.fill) !== info.fill) return false;
    if (m.stroke && lc(m.stroke) !== info.stroke) return false;
    if (m.pattern && !info.pattern) return false;
    if (m.patternColors && !info.patColors.includes(lc(m.patternColors))) return false;
    if (m.image && !info.image) return false;
    if (m.minArea && info.area < m.minArea) return false;
    if (m.within) {
      const [x0, y0, x1, y1] = m.within, b = info.bbox;
      if (b.x < x0 || b.y < y0 || b.right > x1 || b.bottom > y1) return false;
    }
    return true;
  }

  const zoneIds = cfg.zones.map((z) => z.id);
  const items = [];
  drawables.forEach((e, i) => {
    const r = e.getBoundingClientRect();
    e.setAttribute('data-i', i);
    if (r.width + r.height < 0.05) return; // invisible; render() hides anything not classified
    const fill = lc(e.getAttribute('fill'));
    const info = {
      i, el: e, bbox: r, area: r.width * r.height, fill, stroke: lc(e.getAttribute('stroke')),
      image: e.tagName === 'image', pattern: fill.startsWith('url('), patColors: patternColors(fill),
    };
    const strokeOnly = !info.image && (!fill || fill === 'none');
    const inside = (b, [x0, y0, x1, y1], pad) => b.x >= x0 - pad && b.y >= y0 - pad && b.right <= x1 + pad && b.bottom <= y1 + pad;
    const rule = cfg.rules.find((ru) => matches(ru.match, info));
    let layer = rule ? rule.layer : info.image ? 'details' : strokeOnly ? 'lines' : 'details';
    if (cfg.area && !inside(r, cfg.area, 0)) layer = 'remove'; // tech-pack frame, sidebar, header
    else if (strokeOnly && textBoxes.some((t) => inside(r, t, 3))) layer = 'remove'; // placeholder text outlines
    const cx = r.x + r.width / 2;
    info.view = cfg.views.find((v) => cx < v.maxX).id;
    info.layer = layer;
    items.push(info);
  });

  // Details/shading painted before an overlapping fabric were covered by it in the original, so they go
  // beneath the fabric layers (opaque); the rest sit on top.
  const overlaps = (a, b) => a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom;
  items.filter((d) => d.layer === 'details' || d.layer === 'shading').forEach((d) => {
    const under = items.some((z) => zoneIds.includes(z.layer) && z.view === d.view && z.i > d.i && overlaps(z.bbox, d.bbox));
    if (under) d.layer = 'details-under';
    else if (d.layer === 'details') d.layer = 'details-over';
  });

  const summary = {};
  items.forEach((it) => { const k = it.view + ' ' + it.layer; summary[k] = (summary[k] || 0) + 1; });

  const serializer = new XMLSerializer();
  async function render(view, crop, scale, setup, background) {
    const clone = svgEl.cloneNode(true);
    const byI = {};
    clone.querySelectorAll('[data-i]').forEach((n) => { byI[n.getAttribute('data-i')] = n; });
    const known = new Set(items.map((it) => String(it.i)));
    Object.keys(byI).forEach((k) => { if (!known.has(k)) byI[k].setAttribute('display', 'none'); });
    items.forEach((it) => {
      const n = byI[it.i];
      const mode = it.view === view ? setup(it) : 'hide';
      if (mode === 'hide') n.setAttribute('display', 'none');
      else if (mode !== 'keep') { n.setAttribute('fill', mode); n.removeAttribute('stroke'); }
    });
    const W = Math.round(crop.w * scale), H = Math.round(crop.h * scale);
    clone.setAttribute('viewBox', `${crop.x} ${crop.y} ${crop.w} ${crop.h}`);
    clone.setAttribute('width', W); clone.setAttribute('height', H);
    const url = URL.createObjectURL(new Blob([serializer.serializeToString(clone)], { type: 'image/svg+xml' }));
    const img = new Image();
    await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; img.src = url; });
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, W, H); }
    ctx.drawImage(img, 0, 0, W, H);
    URL.revokeObjectURL(url);
    return ctx.getImageData(0, 0, W, H);
  }
  const lum = (d, k) => (0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2]) / 255;
  function toPNG(imgData) {
    const cv = document.createElement('canvas'); cv.width = imgData.width; cv.height = imgData.height;
    cv.getContext('2d').putImageData(imgData, 0, 0);
    return cv.toDataURL('image/png');
  }
  function blank(w, h) { return new ImageData(w, h); }

  const files = [];
  const manifest = { style: cfg.style, name: cfg.name, views: [] };
  for (const v of cfg.views) {
    const mine = items.filter((it) => it.view === v.id && it.layer !== 'remove');
    const pad = 4;
    const x0 = Math.min(...mine.map((m) => m.bbox.x)) - pad, y0 = Math.min(...mine.map((m) => m.bbox.y)) - pad;
    const x1 = Math.max(...mine.map((m) => m.bbox.right)) + pad, y1 = Math.max(...mine.map((m) => m.bbox.bottom)) + pad;
    const crop = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    const S = cfg.scale || 8;
    const isZone = (it) => zoneIds.includes(it.layer);
    const layers = [];
    const masks = {};

    // Fabric masks: this zone white, other zones black (occlusion), then alpha = coverage * whiteness.
    for (const z of cfg.zones) {
      const d = await render(v.id, crop, S, (it) => (it.layer === z.id ? '#ffffff' : isZone(it) ? '#000000' : 'hide'));
      const px = d.data;
      let any = false;
      for (let k = 0; k < px.length; k += 4) {
        const a = Math.round(px[k + 3] * lum(px, k));
        px[k] = px[k + 1] = px[k + 2] = 255; px[k + 3] = a; if (a) any = true;
      }
      if (!any) continue;
      masks[z.id] = d;
      layers.push({ file: `10-${z.id}.png`, kind: 'fabric', zone: z.id, label: z.label, data: d });
    }

    // Mesh texture: original pattern for textured zones, other zones flat white; normalize to each zone's base tone.
    const W = Math.round(crop.w * S), H = Math.round(crop.h * S);
    const tex = blank(W, H);
    let texAny = false;
    for (const z of cfg.zones.filter((z) => z.texture && masks[z.id])) {
      const d = await render(v.id, crop, S, (it) => (it.layer === z.id ? 'keep' : isZone(it) ? '#ffffff' : 'hide'), '#ffffff');
      const m = masks[z.id].data, px = d.data;
      const ls = [];
      for (let k = 0; k < px.length; k += 4) if (m[k + 3] > 200) ls.push(lum(px, k));
      ls.sort((a, b) => a - b);
      const ref = ls[Math.floor(ls.length * 0.98)] || 1;
      const strength = z.textureStrength || 0.55;
      for (let k = 0; k < px.length; k += 4) {
        if (!m[k + 3]) continue;
        const a = Math.max(0, Math.min(1, (ref - lum(px, k)) / ref)) * strength * (m[k + 3] / 255);
        tex.data[k + 3] = Math.max(tex.data[k + 3], Math.round(a * 255)); texAny = true;
      }
    }
    if (texAny) layers.push({ file: '50-texture.png', kind: 'texture', data: tex });

    for (const [name, file] of [['details-under', '00-details-under.png'], ['details-over', '60-details-over.png']]) {
      if (!mine.some((it) => it.layer === name)) continue;
      layers.push({ file, kind: name, data: await render(v.id, crop, S, (it) => (it.layer === name ? 'keep' : 'hide')) });
    }

    // Lines + shading as "multiply": black with alpha = 1 - luminance.
    const ln = await render(v.id, crop, S, (it) => (it.layer === 'lines' || it.layer === 'shading' ? 'keep' : 'hide'), '#ffffff');
    for (let k = 0; k < ln.data.length; k += 4) {
      const a = Math.round((1 - lum(ln.data, k)) * 255);
      ln.data[k] = ln.data[k + 1] = ln.data[k + 2] = 0; ln.data[k + 3] = a;
    }
    layers.push({ file: '70-lines.png', kind: 'lines', data: ln });

    layers.sort((a, b) => a.file.localeCompare(b.file));

    // Preview composite with sample colors.
    const pv = document.createElement('canvas'); pv.width = W; pv.height = H;
    const pctx = pv.getContext('2d');
    for (const l of layers) {
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const cc = c.getContext('2d'); cc.putImageData(l.data, 0, 0);
      if (l.kind === 'fabric') {
        cc.globalCompositeOperation = 'source-in';
        cc.fillStyle = cfg.zones.find((z) => z.id === l.zone).sample; cc.fillRect(0, 0, W, H);
      }
      pctx.drawImage(c, 0, 0);
    }
    files.push({ path: `${v.id}/preview.png`, data: pv.toDataURL('image/png') });

    // Decoration location guide (not a Kickflip layer): boxes in pixel coordinates of this view.
    const locations = ((cfg.guides || {})[v.id] || []).map((g) => {
      const [bx, by, bw, bh] = g.box;
      return { id: g.id, label: g.label, x: Math.round((bx - crop.x) * S), y: Math.round((by - crop.y) * S), w: Math.round(bw * S), h: Math.round(bh * S) };
    });
    if (locations.length) {
      const gc = document.createElement('canvas'); gc.width = W; gc.height = H;
      const g = gc.getContext('2d');
      g.drawImage(pv, 0, 0);
      g.lineWidth = Math.max(2, S * 0.6); g.setLineDash([S * 2.5, S * 1.5]);
      g.font = `600 ${Math.round(S * 5)}px sans-serif`; g.textBaseline = 'top';
      for (const l of locations) {
        g.strokeStyle = '#e8641b'; g.strokeRect(l.x, l.y, l.w, l.h);
        const tw = g.measureText(l.label).width + S * 2;
        g.fillStyle = 'rgba(232,100,27,.92)'; g.fillRect(l.x, l.y - S * 6.5, tw, S * 6.5);
        g.fillStyle = '#fff'; g.fillText(l.label, l.x + S, l.y - S * 5.8);
      }
      files.push({ path: `${v.id}/guide.png`, data: gc.toDataURL('image/png') });
    }

    for (const l of layers) {
      files.push({ path: `${v.id}/${l.file}`, data: toPNG(l.data) });
      if (tinted && l.kind === 'fabric') {
        for (const c of palette) {
          const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
          const cc = cv.getContext('2d'); cc.putImageData(l.data, 0, 0);
          cc.globalCompositeOperation = 'source-in'; cc.fillStyle = c.hex; cc.fillRect(0, 0, W, H);
          files.push({ path: `${v.id}/colors/${l.zone}/${c.code}.png`, data: cv.toDataURL('image/png') });
        }
      }
    }
    manifest.views.push({
      id: v.id, width: W, height: H, crop, scale: S, locations,
      layers: layers.map((l) => ({ file: l.file, kind: l.kind, zone: l.zone, label: l.label })),
    });
  }
  manifest.zones = cfg.zones;
  return { files, manifest, summary };
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<!doctype html><body style="margin:0">' + svg + '</body>');
  const { files, manifest, summary } = await page.evaluate(pageMain, { cfg, palette, tinted, textBoxes });
  await browser.close();
  fs.rmSync(outDir, { recursive: true, force: true });
  for (const f of files) {
    const p = path.join(outDir, f.path);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, Buffer.from(f.data.split(',')[1], 'base64'));
  }
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  // preview.html loads these as scripts so it also works when opened straight from disk.
  const outRoot = path.dirname(outDir), all = {};
  for (const d of fs.readdirSync(outRoot)) {
    const mf = path.join(outRoot, d, 'manifest.json');
    if (fs.existsSync(mf)) all[d] = JSON.parse(fs.readFileSync(mf, 'utf8'));
  }
  fs.writeFileSync(path.join(outRoot, 'manifests.js'), 'window.VC_MANIFESTS = ' + JSON.stringify(all) + ';\n');
  fs.writeFileSync(path.join(__dirname, '..', 'palette.js'), 'window.VC_PALETTE = ' + JSON.stringify(palette) + ';\n');
  console.log(cfg.style, 'elements per view/layer:', summary);
  console.log(`wrote ${files.length} files to ${outDir}`);
})().catch((e) => { console.error(e); process.exit(1); });
