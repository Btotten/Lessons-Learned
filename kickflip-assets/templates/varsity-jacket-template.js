#!/usr/bin/env node
/*
 * Placeholder varsity jacket (original drawing) for building the Kickflip product before
 * production vector flats exist. Writes build/VC-JKT-TEMPLATE.svg in the same shape the
 * layer pipeline expects: every fabric zone has its own flat fill, outlines are separate
 * stroke-only paths, shading uses fill="url(#shade)".
 *
 * Canvas 1200 x 460: front (0-400), back (400-800), right sleeve (800-1000), left sleeve (1000-1200).
 * Usage: node templates/varsity-jacket-template.js && node tools/build_layers.js styles/VC-JKT-template.json
 */
'use strict';
const fs = require('fs');
const path = require('path');

// Key colors: only used to tell zones apart (see styles/VC-JKT-template.json rules).
const K = {
  body: '#0a1f5c', sleeves: '#efe8d8', knit: '#102a6e', stripe1: '#c8a200', stripe2: '#fefefe',
  snaps: '#c8a201', pocket: '#efe8d9', interior: '#1a1a1a',
};
const OUTLINE = '#222222', STITCH = '#555555', RIB = '#8a8a8a';
const MIRROR = 'matrix(-1 0 0 1 400 0)';

const fills = [], shades = [], lines = [];
function shape(zone, d, { mirror = false, shade = true, outline = true } = {}) {
  for (const t of mirror ? ['', ` transform="${MIRROR}"`] : ['']) {
    fills.push(`<path d="${d}" fill="${K[zone]}"${t}/>`);
    if (shade) shades.push(`<path d="${d}" fill="url(#shade)"${t}/>`);
    if (outline) lines.push(`<path d="${d}" fill="none" stroke="${OUTLINE}" stroke-width="1.2" stroke-linejoin="round"${t}/>`);
  }
}
const stitch = (d, mirror) => {
  lines.push(`<path d="${d}" fill="none" stroke="${STITCH}" stroke-width=".6" stroke-dasharray="2 1.6"/>`);
  if (mirror) lines.push(`<path d="${d}" fill="none" stroke="${STITCH}" stroke-width=".6" stroke-dasharray="2 1.6" transform="${MIRROR}"/>`);
};
// Vertical rib lines across a band between two y values (x0..x1), one path.
const rib = (x0, x1, y0, y1, mirror) => {
  let d = '';
  for (let x = x0 + 2; x < x1 - 1; x += 3) d += `M${x.toFixed(1)},${y0}L${x.toFixed(1)},${y1}`;
  lines.push(`<path d="${d}" fill="none" stroke="${RIB}" stroke-width=".35"${mirror ? ` transform="${MIRROR}"` : ''}/>`);
};
// Quadratic band between two curves, t0..t1 of the way from outer to inner.
const lerp = (a, b, t) => a + (b - a) * t;
function band(outer, inner, t0, t1) {
  const p = (t) => outer.map((pt, i) => [lerp(pt[0], inner[i][0], t), lerp(pt[1], inner[i][1], t)].map((v) => v.toFixed(2)).join(','));
  const [a0, a1, a2] = p(t0), [b0, b1, b2] = p(t1);
  return `M${a0} Q${a1} ${a2} L${b2} Q${b1} ${b0} Z`;
}

function torso(front) {
  const neck = front ? 98 : 72;
  // Inside of the neck, seen behind the collar.
  fills.push(`<path d="M176,63 Q200,50 224,63 Q200,${front ? 86 : 70} 176,63 Z" fill="${K.interior}"/>`);
  // Collar back band standing up.
  const backOuter = [[168, 58], [200, 42], [232, 58]], backInner = [[172, 66], [200, 54], [228, 66]];
  shape('knit', band(backOuter, backInner, 0, 1), { shade: false });
  // Body.
  shape('body', `M128,80 L176,62 Q200,${neck} 224,62 L272,80 Q282,110 282,150 L284,384 L116,384 L118,150 Q118,110 128,80 Z`);
  // Sleeves + cuffs + cuff stripes.
  shape('sleeves', 'M128,80 Q96,88 88,120 L66,372 L108,376 L118,160 Q120,120 128,80 Z', { mirror: true });
  shape('knit', 'M66,372 L108,376 L106,410 L64,406 Z', { mirror: true });
  shape('stripe1', 'M65.4,382 L107.4,386 L107.2,390 L65.2,386 Z', { mirror: true, shade: false, outline: false });
  shape('stripe2', 'M65,392 L107,396 L106.8,400 L64.8,396 Z', { mirror: true, shade: false, outline: false });
  rib(64, 108, 376, 406, false); rib(64, 108, 376, 406, true);
  // Waistband + stripes.
  shape('knit', 'M116,384 L284,384 L285,416 L115,416 Z');
  shape('stripe1', 'M115.6,393 L284.4,393 L284.5,397 L115.5,397 Z', { shade: false, outline: false });
  shape('stripe2', 'M115.4,403 L284.6,403 L284.7,407 L115.3,407 Z', { shade: false, outline: false });
  rib(115, 285, 386, 414, false);
  stitch('M118,380 L282,380');
  stitch('M69,368 L109,372', true);
  if (front) {
    // Front collar band with two stripes, open at the snaps.
    const outer = [[170, 60], [200, 108], [230, 60]], inner = [[178, 57], [200, 92], [222, 57]];
    shape('knit', band(outer, inner, 0, 1), { shade: false });
    shape('stripe1', band(outer, inner, 0.2, 0.32), { shade: false, outline: false });
    shape('stripe2', band(outer, inner, 0.46, 0.58), { shade: false, outline: false });
    // Placket, snaps, welt pockets.
    lines.push(`<path d="M200,86 L200,384" fill="none" stroke="${OUTLINE}" stroke-width="1.2"/>`);
    stitch('M195,90 L195,384'); stitch('M205,90 L205,384');
    shape('pocket', 'M140,300 L156,250 L164,253 L148,303 Z', { mirror: true, shade: false });
    [110, 158, 206, 254, 302, 350].forEach((y) => {
      fills.push(`<circle cx="200" cy="${y}" r="5" fill="${K.snaps}"/>`);
      lines.push(`<circle cx="200" cy="${y}" r="5" fill="none" stroke="${OUTLINE}" stroke-width=".8"/>`);
      lines.push(`<circle cx="200" cy="${y}" r="2" fill="none" stroke="${OUTLINE}" stroke-width=".5"/>`);
    });
  } else {
    const outer = [[170, 70], [200, 60], [230, 70]], inner = [[168, 58], [200, 42], [232, 58]];
    shape('stripe1', band(outer, inner, 0.28, 0.4), { shade: false, outline: false });
    shape('stripe2', band(outer, inner, 0.54, 0.66), { shade: false, outline: false });
    stitch('M120,84 Q200,66 280,84');
  }
}

function sleeveFlat() {
  shape('sleeves', 'M40,72 Q100,18 160,72 L150,380 L50,380 Z');
  shape('knit', 'M50,380 L150,380 L149,414 L51,414 Z');
  shape('stripe1', 'M50.3,389 L149.7,389 L149.6,393 L50.4,393 Z', { shade: false, outline: false });
  shape('stripe2', 'M50.4,399 L149.6,399 L149.5,403 L50.5,403 Z', { shade: false, outline: false });
  rib(50, 150, 382, 412, false);
  stitch('M52,376 L148,376');
}

const views = [];
const capture = (fn, dx) => {
  fills.length = shades.length = lines.length = 0;
  fn();
  views.push(`<g transform="translate(${dx},0)">${fills.join('')}${shades.join('')}${lines.join('')}</g>`);
};
capture(() => torso(true), 0);
capture(() => torso(false), 400);
capture(sleeveFlat, 800);
capture(sleeveFlat, 1000);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 460" width="1200" height="460">
<defs><linearGradient id="shade" x1="0" x2="1" y1="0" y2="0">
<stop offset="0" stop-color="#000" stop-opacity=".22"/><stop offset=".2" stop-color="#000" stop-opacity="0"/>
<stop offset=".8" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/>
</linearGradient></defs>
${views.join('\n')}
</svg>
`;
const out = path.join(__dirname, '..', 'build', 'VC-JKT-TEMPLATE.svg');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, svg);
console.log('wrote', out);
