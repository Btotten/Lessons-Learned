/*!
 * Varsity Customs — Team Uniform Builder
 * Framework-free. Mounts into #vc-builder. Works standalone or inside a Shopify theme
 * (see shopify/sections/varsity-builder.liquid, which sets window.VC_CONFIG).
 */
(function () {
  'use strict';

  var CFG = Object.assign({
    mount: '#vc-builder',
    brand: 'Varsity Customs',
    currency: 'USD',
    initialProduct: 'jersey',
    designEndpoint: null, // optional: POST design + artwork here (see server/server.js)
    shopify: null,        // { products: { jersey: { variants: [...] }, ... }, addonVariantId }
    pricing: { namePerUnit: 5, logoPerUnit: 4 },
  }, window.VC_CONFIG || {});

  var FONT_URL = 'https://fonts.googleapis.com/css2?family=Alfa+Slab+One&family=Bebas+Neue&family=Black+Ops+One&family=Graduate&family=Oswald:wght@600&family=Yellowtail&display=swap';
  // Offline build embeds the fonts and sets this, so exports never reach for the web.
  var FONT_CSS = window.VC_FONT_CSS || '';
  var fontStyle = function () { return '<style>' + (FONT_CSS || '@import url(\'' + FONT_URL + '\');') + '</style>'; };

  /* ------------------------------------------------------------------ data */

  var PALETTE = [
    ['Black', '#111111'], ['White', '#FFFFFF'], ['Varsity Red', '#B3122E'], ['Cardinal', '#8C1D40'],
    ['Maroon', '#5B1A2A'], ['Orange', '#E8641B'], ['Athletic Gold', '#F2B705'], ['Vegas Gold', '#C5B358'],
    ['Kelly Green', '#1E8C45'], ['Forest', '#154734'], ['Columbia Blue', '#7BAFD4'], ['Royal', '#1D4FA0'],
    ['Navy', '#14213D'], ['Purple', '#4B2E83'], ['Teal', '#00827F'], ['Pink', '#E86FA5'],
    ['Silver', '#A7A9AC'], ['Charcoal', '#3C3F44'], ['Cream', '#F3E9D2'], ['Brown', '#5C3A21'],
  ].map(function (c) {
    // `code` is the supplier/thread code handed to production. Replace with your mill's codes.
    return { name: c[0], hex: c[1], code: 'VC-' + c[0].toUpperCase().replace(/[^A-Z]+/g, '-') };
  });

  var FONTS = [
    { id: 'Graduate', label: 'Collegiate', css: "'Graduate', serif", k: 0.72 },
    { id: 'Alfa Slab One', label: 'Slab', css: "'Alfa Slab One', serif", k: 0.74 },
    { id: 'Bebas Neue', label: 'Block', css: "'Bebas Neue', sans-serif", k: 0.45 },
    { id: 'Oswald', label: 'Athletic', css: "'Oswald', sans-serif", k: 0.55 },
    { id: 'Yellowtail', label: 'Script', css: "'Yellowtail', cursive", k: 0.5 },
    { id: 'Black Ops One', label: 'Stencil', css: "'Black Ops One', sans-serif", k: 0.7 },
  ];

  var SCHEMES = [
    ['Navy / Gold', '#14213D', '#F2B705', '#FFFFFF'],
    ['Black / Red', '#111111', '#B3122E', '#FFFFFF'],
    ['Royal / White', '#1D4FA0', '#FFFFFF', '#111111'],
    ['Forest / Gold', '#154734', '#F2B705', '#FFFFFF'],
    ['Maroon / Cream', '#5B1A2A', '#F3E9D2', '#111111'],
    ['Purple / Vegas', '#4B2E83', '#C5B358', '#FFFFFF'],
    ['Charcoal / Orange', '#3C3F44', '#E8641B', '#FFFFFF'],
    ['White / Columbia', '#FFFFFF', '#7BAFD4', '#14213D'],
  ];

  var MIRROR = 'matrix(-1 0 0 1 400 0)';
  function part(zone, d, c, extra) {
    return '<path data-zone="' + zone + '" d="' + d + '" fill="' + c[zone] + '"' + (extra || '') + '/>';
  }
  function pair(zone, d, c) { return part(zone, d, c) + part(zone, d, c, ' transform="' + MIRROR + '"'); }

  var LONG_SLEEVE = 'M122,72 L80,96 L54,382 L94,388 L120,190 Z';
  var LONG_CUFF = 'M54,382 L94,388 L92,414 L52,408 Z';

  // Garment templates. Coordinates live in a 400x440 viewBox; unitIn converts to inches (adult L).
  var PRODUCTS = {
    jersey: {
      name: 'Pro Crew Jersey', style: 'VC-J100', category: 'Uniforms', basePrice: 42, unitIn: 0.134,
      fabric: '100% polyester performance mesh, 160 gsm', method: 'Full sublimation',
      sizes: ['YS', 'YM', 'YL', 'S', 'M', 'L', 'XL', '2XL', '3XL'],
      zones: [
        { id: 'body', label: 'Body', role: 0 }, { id: 'sleeves', label: 'Sleeves', role: 0 },
        { id: 'collar', label: 'Collar', role: 1 }, { id: 'cuffs', label: 'Sleeve Cuffs', role: 1 },
        { id: 'stripe', label: 'Side Panels', role: 1 },
      ],
      deco: { team: 'Sublimated', name: 'Sublimated', number: 'Sublimated', logo: 'Sublimated' },
      render: function (view, c) {
        var neck = view === 'front' ? 86 : 66;
        return [
          '<path d="M162,54 Q200,40 238,54 Q200,' + neck + ' 162,54 Z" fill="' + shade(c.body, -0.45) + '"/>',
          pair('sleeves', 'M122,70 L62,106 L86,172 L126,152 Z', c),
          pair('cuffs', 'M62,106 L72,100 L95,166 L86,172 Z', c),
          part('body', 'M122,70 L162,54 Q200,' + neck + ' 238,54 L278,70 L284,420 Q200,428 116,420 Z', c),
          pair('stripe', 'M120,150 L130,150 L132,423 L116,420 Z', c),
          part('collar', 'M162,54 Q200,' + neck + ' 238,54 L244,57 Q200,' + (neck + 12) + ' 156,57 Z', c),
        ].join('');
      },
      place: {
        front: [{ src: 'team', label: 'Front chest', x: 200, y: 160, size: 34, maxW: 150, arc: 16 },
                { src: 'number', label: 'Front number', x: 200, y: 262, size: 88, maxW: 120 }],
        back: [{ src: 'name', label: 'Back name', x: 200, y: 118, size: 22, maxW: 140, arc: 10 },
               { src: 'number', label: 'Back number', x: 200, y: 262, size: 140, maxW: 170 }],
      },
      logos: {
        'Left Chest': { view: 'front', x: 250, y: 104, s: 28 },
        'Right Chest': { view: 'front', x: 150, y: 104, s: 28 },
        'Left Sleeve': { view: 'front', x: 312, y: 124, s: 22 },
        'Back Neck': { view: 'back', x: 200, y: 84, s: 20 },
      },
    },

    jacket: {
      name: 'Heritage Varsity Jacket', style: 'VC-V200', category: 'Jackets', basePrice: 165, unitIn: 0.14,
      fabric: '24oz melton wool body, genuine or vegan leather sleeves, rib-knit trim', method: 'Chenille + embroidery',
      sizes: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'],
      zones: [
        { id: 'body', label: 'Wool Body', role: 0 }, { id: 'sleeves', label: 'Leather Sleeves', role: 1 },
        { id: 'knit', label: 'Knit Trim', role: 0 }, { id: 'stripe', label: 'Knit Stripes', role: 1 },
        { id: 'snaps', label: 'Snaps', role: 1 },
      ],
      deco: { team: 'Chenille / embroidery', name: 'Embroidery', number: 'Chenille patch', letter: 'Chenille letter, felt backing', logo: 'Embroidered patch' },
      render: function (view, c) {
        var front = view === 'front', neck = front ? 100 : 72;
        var out = [
          '<path d="M160,58 Q200,44 240,58 Q200,' + neck + ' 160,58 Z" fill="' + shade(c.knit, -0.4) + '"/>',
          pair('sleeves', LONG_SLEEVE, c), pair('knit', LONG_CUFF, c),
          pair('stripe', 'M53.4,391 L93.6,397 L93.4,400.5 L53.2,394.5 Z', c),
          pair('stripe', 'M52.9,399 L93.1,405 L92.9,408.5 L52.7,402.5 Z', c),
          part('body', 'M122,72 L160,58 Q200,' + neck + ' 240,58 L278,72 L282,392 L118,392 Z', c),
          part('knit', 'M117,392 L283,392 L284,424 L116,424 Z', c),
          part('stripe', 'M116.5,401 L283.5,401 L283.6,405 L116.4,405 Z', c),
          part('stripe', 'M116.3,411 L283.7,411 L283.8,415 L116.2,415 Z', c),
          part('knit', 'M150,64 L160,58 Q200,' + neck + ' 240,58 L250,64 Q200,' + (neck + (front ? 18 : 14)) + ' 150,64 Z', c),
        ];
        if (front) {
          out.push(pair('sleeves', 'M138,300 L158,258 L165,261 L145,303 Z', c));
          out.push('<line x1="200" y1="90" x2="200" y2="392"/>');
          [112, 164, 216, 268, 320, 372].forEach(function (y) {
            out.push('<circle data-zone="snaps" cx="200" cy="' + y + '" r="5" fill="' + c.snaps + '"/>');
          });
        }
        return out.join('');
      },
      place: {
        front: [{ src: 'letter', label: 'Left chest letter', x: 248, y: 172, size: 74, maxW: 62 },
                { src: 'number', label: 'Left sleeve number', x: 96, y: 206, size: 34, maxW: 38 }],
        back: [{ src: 'team', label: 'Back arch', x: 200, y: 140, size: 40, maxW: 180, arc: 24 },
               { src: 'name', label: 'Back lower name', x: 200, y: 340, size: 22, maxW: 150 }],
      },
      logos: {
        'Back Center': { view: 'back', x: 200, y: 240, s: 92 },
        'Right Chest': { view: 'front', x: 152, y: 170, s: 48 },
        'Right Sleeve': { view: 'front', x: 304, y: 206, s: 36 },
      },
    },

    hoodie: {
      name: 'Team Fleece Hoodie', style: 'VC-H300', category: 'Warmups', basePrice: 58, unitIn: 0.14,
      fabric: '80/20 cotton-poly fleece, 300 gsm', method: 'Screen print',
      sizes: ['YS', 'YM', 'YL', 'S', 'M', 'L', 'XL', '2XL', '3XL'],
      zones: [
        { id: 'body', label: 'Body', role: 0 }, { id: 'hood', label: 'Hood', role: 0 },
        { id: 'lining', label: 'Hood Lining', role: 1 }, { id: 'sleeves', label: 'Sleeves', role: 0 },
        { id: 'pocket', label: 'Pocket', role: 0 }, { id: 'rib', label: 'Cuffs & Waistband', role: 0 },
        { id: 'cord', label: 'Drawcord', role: 2 },
      ],
      deco: { team: 'Screen print', name: 'Screen print', number: 'Screen print', logo: 'Screen print' },
      render: function (view, c) {
        var body = part('body', 'M122,72 L160,60 Q200,88 240,60 L278,72 L282,392 L118,392 Z', c);
        var sleeves = pair('sleeves', LONG_SLEEVE, c) + pair('rib', LONG_CUFF, c);
        var rib = part('rib', 'M117,392 L283,392 L284,424 L116,424 Z', c);
        if (view === 'front') {
          return [
            part('hood', 'M146,70 Q136,12 200,8 Q264,12 254,70 Q200,100 146,70 Z', c),
            part('lining', 'M166,66 Q168,30 200,26 Q232,30 234,66 Q200,84 166,66 Z', c),
            sleeves, body, rib,
            part('pocket', 'M150,292 L250,292 L272,386 L128,386 Z', c),
            '<g data-zone="cord" stroke="' + c.cord + '" stroke-width="3.5" stroke-linecap="round" fill="none">' +
              '<path d="M186,82 Q184,120 182,158"/><path d="M214,82 Q216,120 218,158"/></g>',
          ].join('');
        }
        return sleeves + body + rib +
          part('hood', 'M150,64 Q142,14 200,10 Q258,14 250,64 Q226,150 200,154 Q174,150 150,64 Z', c);
      },
      place: {
        front: [{ src: 'team', label: 'Front chest', x: 200, y: 214, size: 38, maxW: 150, arc: 14 }],
        back: [{ src: 'name', label: 'Back name', x: 200, y: 190, size: 22, maxW: 140 },
               { src: 'number', label: 'Back number', x: 200, y: 285, size: 100, maxW: 140 }],
      },
      logos: {
        'Left Chest': { view: 'front', x: 250, y: 128, s: 26 },
        'Pocket': { view: 'front', x: 200, y: 340, s: 40 },
        'Left Sleeve': { view: 'front', x: 304, y: 250, s: 30 },
      },
    },

    shorts: {
      name: 'Game Shorts', style: 'VC-S400', category: 'Uniforms', basePrice: 32, unitIn: 0.12,
      fabric: '100% polyester double-knit mesh, 150 gsm', method: 'Full sublimation',
      sizes: ['YS', 'YM', 'YL', 'S', 'M', 'L', 'XL', '2XL', '3XL'],
      zones: [
        { id: 'body', label: 'Body', role: 0 }, { id: 'side', label: 'Side Panels', role: 1 },
        { id: 'waist', label: 'Waistband', role: 0 }, { id: 'trim', label: 'Hem Trim', role: 2 },
      ],
      deco: { team: 'Sublimated', name: 'Sublimated', number: 'Sublimated', logo: 'Sublimated' },
      render: function (view, c) {
        return [
          part('body', 'M108,90 L292,90 L312,360 L212,372 L200,170 L188,372 L88,360 Z', c),
          pair('side', 'M108,90 L128,90 L113,363 L88,360 Z', c),
          pair('trim', 'M88,360 L188,372 L187,384 L87,372 Z', c),
          part('waist', 'M110,60 L290,60 L292,90 L108,90 Z', c),
        ].join('');
      },
      place: {
        front: [{ src: 'number', label: 'Left leg number', x: 256, y: 296, size: 46, maxW: 56 }],
        back: [{ src: 'team', label: 'Back waist', x: 200, y: 124, size: 20, maxW: 120 }],
      },
      logos: {
        'Right Leg': { view: 'front', x: 146, y: 296, s: 40 },
        'Front Waist': { view: 'front', x: 200, y: 120, s: 26 },
      },
    },
  };

  /* --------------------------------------------------------------- helpers */

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function isHex(h) { return /^#[0-9a-f]{6}$/i.test(h); }
  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    function f(v) { return Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt); }
    return '#' + [f(r), f(g), f(b)].map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join('');
  }
  function colorInfo(hex) {
    if (!hex || hex === 'none') return null;
    var p = PALETTE.find(function (c) { return c.hex.toLowerCase() === hex.toLowerCase(); });
    return p ? { hex: p.hex, name: p.name, code: p.code } : { hex: hex, name: 'Custom', code: 'CUSTOM' };
  }
  function colorName(hex) { var c = colorInfo(hex); return c ? c.name : 'None'; }
  function font(id) { return FONTS.find(function (f) { return f.id === id; }) || FONTS[0]; }
  function money(v) {
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: CFG.currency }).format(v); }
    catch (e) { return '$' + v.toFixed(2); }
  }
  function newId() {
    return 'VC-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
  }
  function round25(v) { return Math.round(v * 4) / 4; }
  function download(name, content, type) {
    var url = URL.createObjectURL(new Blob([content], { type: type }));
    var a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }
  function toast(msg) {
    var t = $('.vc-toast', root);
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  /* ----------------------------------------------------------------- state */

  var STORE_KEY = 'vc-builder-design';

  function schemeColors(pid, primary, secondary, accent) {
    var roles = [primary, secondary, accent];
    var out = {};
    PRODUCTS[pid].zones.forEach(function (z) { out[z.id] = roles[z.role]; });
    return out;
  }

  function defaults(pid) {
    pid = PRODUCTS[pid] ? pid : 'jersey';
    return {
      v: 1, designId: newId(), product: pid, view: 'front', step: 0,
      colors: schemeColors(pid, '#14213D', '#F2B705', '#FFFFFF'),
      team: { text: 'VARSITY', font: 'Graduate', fill: '#FFFFFF', outline: '#F2B705', outline2: '#111111' },
      num: { font: 'Graduate', fill: '#FFFFFF', outline: '#F2B705', outline2: 'none' },
      logo: null, logoName: '', logoPlacement: Object.keys(PRODUCTS[pid].logos)[0],
      roster: [{ name: 'PLAYER', number: '23', size: 'L', qty: 1 }], sel: 0, notes: '',
    };
  }

  // Everything that ends up in SVG markup is validated here, so shared links can't inject markup.
  function sanitize(raw) {
    var d = defaults(raw && raw.product);
    if (!raw || typeof raw !== 'object') return d;
    var p = PRODUCTS[d.product];
    if (typeof raw.designId === 'string' && /^VC-[A-Z0-9]{6,20}$/.test(raw.designId)) d.designId = raw.designId;
    if (raw.view === 'back' || raw.view === 'both') d.view = raw.view;
    p.zones.forEach(function (z) { if (raw.colors && isHex(raw.colors[z.id])) d.colors[z.id] = raw.colors[z.id]; });
    ['team', 'num'].forEach(function (k) {
      var s = raw[k] || {};
      if (k === 'team' && typeof s.text === 'string') d.team.text = s.text.slice(0, 20);
      if (FONTS.some(function (f) { return f.id === s.font; })) d[k].font = s.font;
      if (isHex(s.fill)) d[k].fill = s.fill;
      ['outline', 'outline2'].forEach(function (o) { if (s[o] === 'none' || isHex(s[o])) d[k][o] = s[o]; });
    });
    if (typeof raw.logo === 'string' && /^data:image\/(png|jpeg|svg\+xml|webp);base64,[A-Za-z0-9+/=]+$/.test(raw.logo)) {
      d.logo = raw.logo; d.logoName = String(raw.logoName || 'logo').slice(0, 80);
    }
    if (p.logos[raw.logoPlacement]) d.logoPlacement = raw.logoPlacement;
    if (Array.isArray(raw.roster) && raw.roster.length) {
      d.roster = raw.roster.slice(0, 200).map(function (r) {
        return {
          name: String(r.name || '').slice(0, 16),
          number: String(r.number || '').replace(/\D/g, '').slice(0, 2),
          size: p.sizes.indexOf(r.size) >= 0 ? r.size : 'L',
          qty: Math.max(1, Math.min(999, parseInt(r.qty, 10) || 1)),
        };
      });
    }
    d.sel = Math.min(Math.max(0, parseInt(raw.sel, 10) || 0), d.roster.length - 1);
    if (typeof raw.notes === 'string') d.notes = raw.notes.slice(0, 1000);
    return d;
  }

  function loadInitial() {
    var h = location.hash.match(/design=([^&]+)/);
    if (h) {
      try { return sanitize(JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(h[1])))))); } catch (e) { /* fall through */ }
    }
    try {
      var saved = localStorage.getItem(STORE_KEY);
      if (saved) return sanitize(JSON.parse(saved));
    } catch (e) { /* storage unavailable */ }
    return defaults(CFG.initialProduct);
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (e) {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(Object.assign({}, state, { logo: null }))); } catch (e2) { /* ignore */ }
    }
  }

  // Keep a zone's color when the new style has the same zone in the same role; otherwise use the role's color.
  function carryColors(fromPid, prev, toPid) {
    var from = {}, roles = {}, out = {};
    PRODUCTS[fromPid].zones.forEach(function (z) { from[z.id] = z; if (!(z.role in roles)) roles[z.role] = prev[z.id]; });
    PRODUCTS[toPid].zones.forEach(function (z) {
      out[z.id] = from[z.id] && from[z.id].role === z.role ? prev[z.id] : roles[z.role] || roles[0] || '#FFFFFF';
    });
    return out;
  }

  function switchProduct(pid) {
    var p = PRODUCTS[pid];
    state.colors = carryColors(state.product, state.colors, pid);
    state.product = pid;
    if (!p.logos[state.logoPlacement]) state.logoPlacement = Object.keys(p.logos)[0];
    state.roster.forEach(function (r) { if (p.sizes.indexOf(r.size) < 0) r.size = 'L'; });
  }

  /* ------------------------------------------------------------- rendering */

  function player() { return state.roster[state.sel] || state.roster[0] || { name: '', number: '' }; }

  function textFor(src) {
    if (src === 'team') return state.team.text;
    if (src === 'letter') { var m = state.team.text.match(/[A-Za-z0-9]/); return m ? m[0].toUpperCase() : ''; }
    if (src === 'name') return (player().name || '').toUpperCase();
    if (src === 'number') return player().number || '';
    return '';
  }

  function fittedSize(el, txt, st) {
    var k = font(st.font).k;
    return Math.min(el.size, el.maxW / Math.max(txt.length * k, 0.01));
  }

  function textEl(el, id) {
    var txt = textFor(el.src);
    if (!txt) return '';
    var st = el.src === 'number' ? state.num : state.team;
    var size = fittedSize(el, txt, st);
    var sw = Math.max(1.2, size * 0.06);
    var base = 'font-family="' + esc(font(st.font).css) + '" font-size="' + size.toFixed(1) +
      '" text-anchor="middle" stroke-linejoin="round"';
    var by = el.y + size * 0.35;
    var defs = '', inner;
    if (el.arc) {
      defs = '<path id="' + id + '" d="M' + (el.x - el.maxW / 2 - 30) + ',' + by + ' Q' + el.x + ',' +
        (by - el.arc * 2) + ' ' + (el.x + el.maxW / 2 + 30) + ',' + by + '" fill="none" stroke="none"/>';
      inner = function (attrs) {
        return '<text ' + base + attrs + '><textPath href="#' + id + '" startOffset="50%">' + esc(txt) + '</textPath></text>';
      };
    } else {
      inner = function (attrs) { return '<text x="' + el.x + '" y="' + by + '" ' + base + attrs + '>' + esc(txt) + '</text>'; };
    }
    var outlines = [st.outline, st.outline2].filter(function (o) { return o && o !== 'none'; });
    var layers = '';
    for (var i = outlines.length - 1; i >= 0; i--) {
      layers += inner(' fill="' + outlines[i] + '" stroke="' + outlines[i] + '" stroke-width="' + (sw * 2 * (i + 1)).toFixed(1) + '"');
    }
    layers += inner(' fill="' + st.fill + '"');
    return '<g data-deco="' + el.src + '">' + defs + layers + '</g>';
  }

  function logoEl(view) {
    var pl = PRODUCTS[state.product].logos[state.logoPlacement];
    if (!state.logo || !pl || pl.view !== view) return '';
    return '<image data-deco="logo" href="' + esc(state.logo) + '" x="' + (pl.x - pl.s / 2) + '" y="' + (pl.y - pl.s / 2) +
      '" width="' + pl.s + '" height="' + pl.s + '" preserveAspectRatio="xMidYMid meet"/>';
  }

  var svgSeq = 0;
  function garmentSVG(view, opts) {
    opts = opts || {};
    var pid = opts.product || state.product;
    var p = PRODUCTS[pid];
    var c = opts.colors || state.colors;
    var uid = 'vc' + (++svgSeq) + view;
    var white = {};
    p.zones.forEach(function (z) { white[z.id] = '#fff'; });
    var deco = opts.bare ? '' :
      (p.place[view] || []).map(function (el, i) { return textEl(el, uid + 't' + i); }).join('') + logoEl(view);
    var shading = opts.production ? '' :
      '<defs><linearGradient id="' + uid + 'g" x1="0" x2="1">' +
      '<stop offset="0" stop-color="#000" stop-opacity=".22"/><stop offset=".22" stop-color="#fff" stop-opacity=".08"/>' +
      '<stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset=".78" stop-color="#fff" stop-opacity=".06"/>' +
      '<stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient>' +
      '<mask id="' + uid + 'm"><g fill="#fff" stroke="none">' + p.render(view, white) + '</g></mask></defs>' +
      '<rect x="0" y="0" width="400" height="440" fill="url(#' + uid + 'g)" mask="url(#' + uid + 'm)" pointer-events="none"/>';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 440" role="img" aria-label="' +
      esc(p.name + ' ' + view) + '"' + (opts.size ? ' width="' + opts.size + '" height="' + Math.round(opts.size * 1.1) + '"' : '') + '>' +
      (opts.standalone ? fontStyle() : '') +
      '<g class="vc-garment" stroke="rgba(0,0,0,.35)" stroke-width="1.2" stroke-linejoin="round">' + p.render(view, c) + '</g>' +
      '<g class="vc-deco">' + deco + '</g>' + shading + '</svg>';
  }

  /* ---------------------------------------------------------------- pricing */

  function shopifyProduct(pid) {
    return CFG.shopify && CFG.shopify.products && CFG.shopify.products[pid || state.product] || null;
  }
  function unitPrice(pid) {
    var sp = shopifyProduct(pid);
    if (sp && sp.variants && sp.variants.length) return sp.variants[0].price / 100;
    return PRODUCTS[pid || state.product].basePrice;
  }
  function totals() {
    var units = 0, named = 0;
    state.roster.forEach(function (r) { units += r.qty; if (r.name.trim()) named += r.qty; });
    var base = unitPrice() * units;
    var names = named * CFG.pricing.namePerUnit;
    var logo = state.logo ? units * CFG.pricing.logoPerUnit : 0;
    return { units: units, named: named, base: base, names: names, logo: logo, total: base + names + logo };
  }

  /* ------------------------------------------------------ production output */

  function buildSpec() {
    var p = PRODUCTS[state.product], t = totals();
    var decorations = [];
    ['front', 'back'].forEach(function (view) {
      (p.place[view] || []).forEach(function (el) {
        var perPlayer = el.src === 'name' || el.src === 'number';
        var content = perPlayer ? 'Per roster' : textFor(el.src);
        if (!content) return;
        var st = el.src === 'number' ? state.num : state.team;
        var sample = perPlayer ? (el.src === 'number' ? '00' : 'PLAYERNAME') : content;
        decorations.push({
          view: view, element: el.src, placement: el.label, content: content,
          method: p.deco[el.src] || p.method, font: st.font,
          fill: colorInfo(st.fill),
          outlines: [st.outline, st.outline2].map(colorInfo).filter(Boolean),
          approxLetterHeightIn: round25(fittedSize(el, sample, st) * p.unitIn * 0.72),
          arched: !!el.arc,
        });
      });
    });
    if (state.logo) {
      var pl = p.logos[state.logoPlacement];
      decorations.push({
        view: pl.view, element: 'logo', placement: state.logoPlacement, content: state.logoName || 'Customer logo',
        method: p.deco.logo, approxWidthIn: round25(pl.s * p.unitIn), artwork: 'Attached (customer upload — verify resolution / vectorize)',
      });
    }
    var sizeBreakdown = {};
    p.sizes.forEach(function (s) { sizeBreakdown[s] = 0; });
    state.roster.forEach(function (r) { sizeBreakdown[r.size] = (sizeBreakdown[r.size] || 0) + r.qty; });
    Object.keys(sizeBreakdown).forEach(function (s) { if (!sizeBreakdown[s]) delete sizeBreakdown[s]; });
    return {
      schema: 'varsity-customs/production-spec@1',
      designId: state.designId,
      createdAt: new Date().toISOString(),
      brand: CFG.brand,
      product: { id: state.product, name: p.name, style: p.style, category: p.category, fabric: p.fabric, method: p.method },
      zones: p.zones.map(function (z) { return Object.assign({ zone: z.id, label: z.label }, colorInfo(state.colors[z.id])); }),
      decorations: decorations,
      roster: state.roster.map(function (r, i) {
        return { line: i + 1, name: r.name.trim().toUpperCase(), number: r.number, size: r.size, qty: r.qty };
      }),
      sizeBreakdown: sizeBreakdown,
      totalUnits: t.units,
      pricing: { currency: CFG.currency, unit: unitPrice(), nameAddOn: t.names, logoAddOn: t.logo, estimatedTotal: t.total },
      notes: state.notes,
    };
  }

  function csvCell(v) {
    var s = String(v == null ? '' : v);
    if (/^[=+\-@]/.test(s)) s = "'" + s; // spreadsheet formula-injection guard
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function rosterCSV() {
    var p = PRODUCTS[state.product];
    var rows = [['Design ID', 'Style', 'Line', 'Name', 'Number', 'Size', 'Qty']];
    state.roster.forEach(function (r, i) {
      rows.push([state.designId, p.style, i + 1, r.name.trim().toUpperCase(), r.number, r.size, r.qty]);
    });
    return rows.map(function (r) { return r.map(csvCell).join(','); }).join('\n') + '\n';
  }

  function productionSVG(view) {
    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<!-- ' + CFG.brand + ' | ' + state.designId + ' | ' + PRODUCTS[state.product].style + ' | ' + view +
      ' | Convert text to outlines before RIP / digitizing. -->\n' +
      garmentSVG(view, { production: true, standalone: true });
  }

  function techPackHTML() {
    var spec = buildSpec(), p = PRODUCTS[state.product];
    function row(cells, th) { return '<tr>' + cells.map(function (c) { return (th ? '<th>' : '<td>') + c + (th ? '</th>' : '</td>'); }).join('') + '</tr>'; }
    function sw(ci) { return ci ? '<span class="sw" style="background:' + ci.hex + '"></span>' + esc(ci.name) + ' <code>' + esc(ci.code) + '</code>' : '—'; }
    return '<!doctype html><html><head><meta charset="utf-8"><title>Tech Pack ' + esc(spec.designId) + '</title>' +
      (FONT_CSS ? fontStyle() : '<link rel="stylesheet" href="' + FONT_URL + '">') +
      '<style>body{font:13px/1.45 system-ui,sans-serif;color:#111;margin:24px;max-width:1000px}' +
      'h1{font:22px Graduate,serif;margin:0}h2{font-size:14px;text-transform:uppercase;letter-spacing:.08em;border-bottom:2px solid #111;padding-bottom:4px;margin-top:28px}' +
      '.hdr{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:4px solid #111;padding-bottom:10px}' +
      '.views{display:flex;gap:16px}.views figure{flex:1;margin:0;border:1px solid #ccc;padding:8px;text-align:center}.views svg{width:100%;height:auto}' +
      'table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:5px 8px;text-align:left;vertical-align:top}th{background:#f1f1f1}' +
      '.sw{display:inline-block;width:12px;height:12px;border:1px solid #999;margin-right:6px;vertical-align:-1px}code{font-size:11px;color:#555}' +
      '.btn{position:fixed;top:12px;right:12px;padding:8px 14px}@media print{.btn{display:none}body{margin:0}}</style></head><body>' +
      '<button class="btn" onclick="print()">Print / Save PDF</button>' +
      '<div class="hdr"><div><h1>' + esc(CFG.brand) + ' — Production Tech Pack</h1><div>' + esc(p.name) + ' · Style ' + esc(p.style) + '</div></div>' +
      '<div style="text-align:right"><b>Design ' + esc(spec.designId) + '</b><br>' + esc(new Date(spec.createdAt).toLocaleString()) + '<br>Total units: <b>' + spec.totalUnits + '</b></div></div>' +
      '<h2>Artwork (sample player: ' + esc(player().name || '—') + ' #' + esc(player().number || '—') + ')</h2>' +
      '<div class="views"><figure>' + garmentSVG('front', { production: true }) + '<figcaption>FRONT</figcaption></figure>' +
      '<figure>' + garmentSVG('back', { production: true }) + '<figcaption>BACK</figcaption></figure></div>' +
      '<h2>Materials</h2><table>' + row(['Fabric', esc(p.fabric)]) + row(['Primary method', esc(p.method)]) + '</table>' +
      '<h2>Color zones</h2><table>' + row(['Zone', 'Color / code'], true) +
      spec.zones.map(function (z) { return row([esc(z.label), sw(z)]); }).join('') + '</table>' +
      '<h2>Decorations</h2><table>' + row(['View', 'Placement', 'Content', 'Method', 'Font', 'Fill', 'Outline(s)', 'Approx. size'], true) +
      spec.decorations.map(function (d) {
        return row([d.view, esc(d.placement), esc(d.content), esc(d.method), esc(d.font || '—'), sw(d.fill),
          (d.outlines || []).map(sw).join('<br>') || '—',
          d.approxLetterHeightIn ? d.approxLetterHeightIn + '" letters' : d.approxWidthIn ? d.approxWidthIn + '" wide' : '—']);
      }).join('') + '</table>' +
      '<h2>Size breakdown</h2><table>' + row(Object.keys(spec.sizeBreakdown), true) +
      row(Object.keys(spec.sizeBreakdown).map(function (s) { return spec.sizeBreakdown[s]; })) + '</table>' +
      '<h2>Roster</h2><table>' + row(['#', 'Name', 'Number', 'Size', 'Qty'], true) +
      spec.roster.map(function (r) { return row([r.line, esc(r.name) || '—', esc(r.number) || '—', esc(r.size), r.qty]); }).join('') + '</table>' +
      (spec.notes ? '<h2>Customer notes</h2><p>' + esc(spec.notes).replace(/\n/g, '<br>') + '</p>' : '') +
      '<p style="margin-top:24px;color:#666;font-size:11px">Sizes are approximate for an adult L; production scales per size grade. Confirm colors against physical swatches.</p>' +
      '<script type="application/json" id="vc-spec">' + JSON.stringify(spec).replace(/</g, '\\u003c') + '<\/script>' +
      '</body></html>';
  }

  /* --------------------------------------------------------------- shopify */

  async function submitDesign() {
    if (!CFG.designEndpoint) return null;
    var res = await fetch(CFG.designEndpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spec: buildSpec(), logo: state.logo,
        artwork: { front: productionSVG('front'), back: productionSVG('back') },
      }),
    });
    if (!res.ok) throw new Error('Design upload failed (' + res.status + ')');
    return res.json();
  }

  function findVariant(sp, size) {
    if (sp.variants.length === 1) return sp.variants[0];
    return sp.variants.find(function (v) {
      return (v.options || []).some(function (o) { return String(o).toUpperCase() === size.toUpperCase(); });
    });
  }

  async function addToCart() {
    var sp = shopifyProduct();
    var problems = validate();
    if (problems.length) { toast(problems[0]); goStep(4); return; }
    if (!sp) { toast('This style is not linked to a Shopify product yet.'); return; }
    var btn = $('[data-act="cart"]', root);
    btn.disabled = true; btn.textContent = 'Adding…';
    try {
      var saved = await submitDesign();
      var p = PRODUCTS[state.product];
      var colors = p.zones.map(function (z) { return z.label + ': ' + colorName(state.colors[z.id]); }).join('; ');
      var groups = {};
      state.roster.forEach(function (r) { (groups[r.size] = groups[r.size] || []).push(r); });
      var items = [];
      Object.keys(groups).forEach(function (size) {
        var v = findVariant(sp, size);
        if (!v) throw new Error('No Shopify variant for size ' + size);
        if (v.available === false) throw new Error('Size ' + size + ' is sold out');
        var rows = groups[size];
        var props = {
          'Design ID': state.designId,
          'Team Text': state.team.text + ' (' + state.team.font + ')',
          'Colors': colors,
          'Players': rows.map(function (r) { return (r.number ? '#' + r.number + ' ' : '') + (r.name || '—') + ' ×' + r.qty; }).join('; '),
        };
        if (state.logo) props['Logo'] = state.logoPlacement;
        if (saved && saved.url) props['_design_url'] = saved.url;
        items.push({ id: v.id, quantity: rows.reduce(function (a, r) { return a + r.qty; }, 0), properties: props });
      });
      var t = totals();
      if (CFG.shopify.addonVariantId && t.named) {
        items.push({ id: CFG.shopify.addonVariantId, quantity: t.named, properties: { 'Design ID': state.designId, 'For': 'Player name personalization' } });
      }
      var rootPath = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
      var res = await fetch(rootPath + 'cart/add.js', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ items: items }),
      });
      if (!res.ok) {
        var err = await res.json().catch(function () { return {}; });
        throw new Error(err.description || err.message || 'Cart error ' + res.status);
      }
      window.location.href = rootPath + 'cart';
    } catch (e) {
      toast(e.message);
      btn.disabled = false; btn.textContent = 'Add to Cart';
    }
  }

  function validate() {
    var out = [], seen = {};
    state.roster.forEach(function (r, i) {
      if (!r.size) out.push('Roster line ' + (i + 1) + ' needs a size.');
      if (r.number) { if (seen[r.number]) out.push('Number ' + r.number + ' is used twice.'); seen[r.number] = true; }
    });
    if (!state.roster.length) out.push('Add at least one player.');
    return out;
  }

  /* -------------------------------------------------------------------- UI */

  var STEPS = ['Style', 'Colors', 'Text', 'Logo', 'Roster', 'Review'];
  var root, state;

  function swatches(key, current, allowNone) {
    return '<div class="vc-sw" data-key="' + key + '">' +
      (allowNone ? '<button type="button" class="vc-swb vc-none' + (current === 'none' ? ' on' : '') + '" data-hex="none" title="None" aria-label="None"></button>' : '') +
      PALETTE.map(function (c) {
        return '<button type="button" class="vc-swb' + (c.hex === current ? ' on' : '') + '" data-hex="' + c.hex +
          '" title="' + c.name + '" aria-label="' + c.name + '" style="--c:' + c.hex + '"></button>';
      }).join('') + '</div>';
  }

  function fontPicker(key, current) {
    return '<div class="vc-fonts" data-key="' + key + '">' + FONTS.map(function (f) {
      return '<button type="button" class="vc-font' + (f.id === current ? ' on' : '') + '" data-font="' + esc(f.id) +
        '" style="font-family:' + esc(f.css) + '">' + (key === 'num.font' ? '23' : 'Aa') + '<small>' + f.label + '</small></button>';
    }).join('') + '</div>';
  }

  function field(label, body, sub) {
    return '<div class="vc-field"><div class="vc-label">' + label + (sub ? '<span class="vc-val">' + sub + '</span>' : '') + '</div>' + body + '</div>';
  }

  var stepViews = [
    function style() {
      return '<h3>Choose a style</h3><div class="vc-products">' + Object.keys(PRODUCTS).map(function (pid) {
        var p = PRODUCTS[pid];
        var c = carryColors(state.product, state.colors, pid);
        return '<button type="button" class="vc-product' + (pid === state.product ? ' on' : '') + '" data-product="' + pid + '">' +
          garmentSVG('front', { product: pid, colors: c, bare: true }) +
          '<b>' + p.name + '</b><span>' + p.category + ' · ' + p.style + '</span><span class="vc-price">from ' + money(unitPrice(pid)) + '</span></button>';
      }).join('') + '</div>' +
      '<p class="vc-help">' + esc(PRODUCTS[state.product].fabric) + '. Decoration: ' + esc(PRODUCTS[state.product].method) + '.</p>';
    },

    function colors() {
      var p = PRODUCTS[state.product];
      return '<h3>Team colors</h3><div class="vc-schemes">' + SCHEMES.map(function (s, i) {
        return '<button type="button" class="vc-scheme" data-scheme="' + i + '"><i style="background:' + s[1] + '"></i><i style="background:' + s[2] + '"></i><i style="background:' + s[3] + '"></i>' + s[0] + '</button>';
      }).join('') + '</div>' +
      p.zones.map(function (z) {
        return '<div id="vc-zone-' + z.id + '">' + field(z.label, swatches('colors.' + z.id, state.colors[z.id]), colorName(state.colors[z.id])) + '</div>';
      }).join('') + '<p class="vc-help">Tip: tap any part of the garment to jump to its color.</p>';
    },

    function text() {
      var t = state.team, n = state.num;
      return '<h3>Team name</h3>' +
        field('Text', '<input class="vc-input" data-bind="team.text" maxlength="20" value="' + esc(t.text) + '" placeholder="e.g. WILDCATS">') +
        field('Font', fontPicker('team.font', t.font)) +
        field('Fill', swatches('team.fill', t.fill), colorName(t.fill)) +
        field('Outline', swatches('team.outline', t.outline, true), colorName(t.outline)) +
        field('Second outline', swatches('team.outline2', t.outline2, true), colorName(t.outline2)) +
        '<h3>Numbers</h3>' +
        field('Font', fontPicker('num.font', n.font)) +
        field('Fill', swatches('num.fill', n.fill), colorName(n.fill)) +
        field('Outline', swatches('num.outline', n.outline, true), colorName(n.outline)) +
        field('Second outline', swatches('num.outline2', n.outline2, true), colorName(n.outline2)) +
        '<p class="vc-help">Player names and numbers come from the Roster step.</p>';
    },

    function logo() {
      var p = PRODUCTS[state.product];
      return '<h3>Logo</h3>' +
        field('Upload', '<label class="vc-upload"><input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" data-act="logo">' +
          '<span>' + (state.logo ? esc(state.logoName) + ' — replace' : 'Choose PNG, JPG or SVG (max 2 MB)') + '</span></label>' +
          (state.logo ? '<button type="button" class="vc-link" data-act="logo-remove">Remove logo</button>' : '')) +
        field('Placement', '<div class="vc-chips">' + Object.keys(p.logos).map(function (k) {
          return '<button type="button" class="vc-chip' + (k === state.logoPlacement ? ' on' : '') + '" data-placement="' + esc(k) + '">' + esc(k) + '</button>';
        }).join('') + '</div>') +
        '<p class="vc-help">Vector files (SVG/AI/EPS) give the cleanest embroidery and print. Our art team reviews every logo before production.</p>';
    },

    function roster() {
      var p = PRODUCTS[state.product];
      return '<h3>Roster</h3><p class="vc-help">Select a row to preview that player.</p>' +
        '<div class="vc-roster"><div class="vc-rhead"><span></span><span>Name</span><span>#</span><span>Size</span><span>Qty</span><span></span></div>' +
        state.roster.map(function (r, i) {
          return '<div class="vc-rrow' + (i === state.sel ? ' on' : '') + '" data-row="' + i + '">' +
            '<input type="radio" name="vc-sel" aria-label="Preview row ' + (i + 1) + '"' + (i === state.sel ? ' checked' : '') + ' data-sel="' + i + '">' +
            '<input class="vc-input" data-r="name" maxlength="16" value="' + esc(r.name) + '" placeholder="NAME">' +
            '<input class="vc-input" data-r="number" inputmode="numeric" maxlength="2" value="' + esc(r.number) + '" placeholder="00">' +
            '<select class="vc-input" data-r="size">' + p.sizes.map(function (s) { return '<option' + (s === r.size ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' +
            '<input class="vc-input" data-r="qty" type="number" min="1" max="999" value="' + r.qty + '">' +
            '<button type="button" class="vc-x" data-act="row-remove" aria-label="Remove row">×</button></div>';
        }).join('') + '</div>' +
        '<div class="vc-row-actions"><button type="button" class="vc-btn2" data-act="row-add">+ Add player</button></div>' +
        '<details class="vc-bulk"><summary>Paste a roster</summary><p class="vc-help">One player per line: <code>Name, Number, Size, Qty</code></p>' +
        '<textarea class="vc-input" rows="5" data-act="bulk-text" placeholder="SMITH, 23, L, 1&#10;JONES, 7, M"></textarea>' +
        '<button type="button" class="vc-btn2" data-act="bulk-apply">Replace roster</button></details>';
    },

    function review() {
      var spec = buildSpec(), t = totals();
      return '<h3>Review</h3><dl class="vc-dl">' +
        '<dt>Style</dt><dd>' + esc(spec.product.name) + ' <code>' + esc(spec.product.style) + '</code></dd>' +
        '<dt>Design ID</dt><dd><code>' + esc(spec.designId) + '</code></dd>' +
        '<dt>Colors</dt><dd>' + spec.zones.map(function (z) { return '<span class="vc-dot" style="background:' + z.hex + '"></span>' + esc(z.label) + ': ' + esc(z.name); }).join('<br>') + '</dd>' +
        '<dt>Sizes</dt><dd>' + Object.keys(spec.sizeBreakdown).map(function (s) { return s + ' × ' + spec.sizeBreakdown[s]; }).join(', ') + '</dd>' +
        '<dt>Estimate</dt><dd>' + money(t.base) + ' garments' + (t.names ? ' + ' + money(t.names) + ' names' : '') + (t.logo ? ' + ' + money(t.logo) + ' logo' : '') + ' = <b>' + money(t.total) + '</b></dd></dl>' +
        field('Notes for our team', '<textarea class="vc-input" rows="3" data-bind="notes" maxlength="1000" placeholder="Deadline, special requests…">' + esc(state.notes) + '</textarea>') +
        '<h3>Production files</h3><div class="vc-exports">' +
        '<button type="button" class="vc-btn2" data-act="techpack">Tech pack (print / PDF)</button>' +
        '<button type="button" class="vc-btn2" data-act="spec">Spec JSON</button>' +
        '<button type="button" class="vc-btn2" data-act="csv">Roster CSV</button>' +
        '<button type="button" class="vc-btn2" data-act="svg">Artwork SVGs</button></div>';
    },
  ];

  function shell() {
    root.innerHTML =
      '<div class="vc">' +
      '<header class="vc-top"><div class="vc-brand">VARSITY <span>CUSTOMS</span></div><div class="vc-sub">Team Builder</div>' +
      '<div class="vc-top-actions">' + (CFG.inline ? '' : '<button type="button" class="vc-link" data-act="share">Copy share link</button>') +
      '<button type="button" class="vc-link" data-act="reset">Start over</button></div></header>' +
      '<div class="vc-main"><section class="vc-stage">' +
      '<div class="vc-views" role="tablist">' + ['front', 'back', 'both'].map(function (v) {
        return '<button type="button" role="tab" data-view="' + v + '">' + v[0].toUpperCase() + v.slice(1) + '</button>';
      }).join('') + '</div>' +
      '<div class="vc-canvas"></div><div class="vc-meta"></div></section>' +
      '<aside class="vc-panel"><nav class="vc-steps">' + STEPS.map(function (s, i) {
        return '<button type="button" data-step="' + i + '"><i>' + (i + 1) + '</i>' + s + '</button>';
      }).join('') + '</nav><div class="vc-body"></div>' +
      '<footer class="vc-foot"><div class="vc-total"></div><div class="vc-cta">' +
      '<button type="button" class="vc-btn2" data-act="prev">Back</button>' +
      '<button type="button" class="vc-btn" data-act="next">Next</button></div></footer></aside></div>' +
      '<div class="vc-toast" role="status" aria-live="polite"></div></div>';
  }

  function renderPreview() {
    var views = state.view === 'both' ? ['front', 'back'] : [state.view];
    $('.vc-canvas', root).className = 'vc-canvas' + (views.length > 1 ? ' two' : '');
    $('.vc-canvas', root).innerHTML = views.map(function (v) { return '<div class="vc-view">' + garmentSVG(v) + '</div>'; }).join('');
    $$('.vc-views button', root).forEach(function (b) { b.setAttribute('aria-selected', b.dataset.view === state.view); });
    var p = PRODUCTS[state.product], pl = player();
    $('.vc-meta', root).innerHTML = '<b>' + esc(p.name) + '</b> · ' + esc(p.style) + ' · Previewing ' +
      esc((pl.name || 'no name') + (pl.number ? ' #' + pl.number : ''));
    renderFoot();
    save();
  }

  function renderFoot() {
    var t = totals();
    $('.vc-total', root).innerHTML = '<span>' + t.units + ' unit' + (t.units === 1 ? '' : 's') + '</span><b>' + money(t.total) + '</b><small>estimate</small>';
    var last = state.step === STEPS.length - 1;
    var next = $('[data-act="next"],[data-act="cart"],[data-act="quote"]', root);
    if (last) {
      var hasShop = !!shopifyProduct();
      next.dataset.act = hasShop ? 'cart' : 'quote';
      next.textContent = hasShop ? 'Add to Cart' : 'Download Tech Pack';
    } else { next.dataset.act = 'next'; next.textContent = 'Next: ' + STEPS[state.step + 1]; }
    $('[data-act="prev"]', root).style.visibility = state.step ? 'visible' : 'hidden';
  }

  function renderStep() {
    $('.vc-body', root).innerHTML = stepViews[state.step]();
    $$('.vc-steps button', root).forEach(function (b, i) {
      b.classList.toggle('on', i === state.step); b.classList.toggle('done', i < state.step);
    });
    renderFoot();
  }

  function goStep(i) { state.step = Math.max(0, Math.min(STEPS.length - 1, i)); renderStep(); $('.vc-body', root).scrollTop = 0; }

  function setPath(path, val) {
    var k = path.split('.');
    state[k[0]][k[1]] = val;
  }

  function bind() {
    root.addEventListener('click', function (e) {
      var b = e.target.closest('button') || e.target.closest('[data-zone]');
      if (!b || !root.contains(b)) return;
      var d = b.dataset;
      if (d.view) { state.view = d.view; renderPreview(); return; }
      if (d.step) { goStep(+d.step); return; }
      if (d.zone && b.closest('.vc-canvas')) {
        goStep(1);
        var z = $('#vc-zone-' + d.zone, root);
        if (z) { z.scrollIntoView({ block: 'center', behavior: 'smooth' }); z.classList.add('flash'); setTimeout(function () { z.classList.remove('flash'); }, 900); }
        return;
      }
      if (d.product) { switchProduct(d.product); renderStep(); renderPreview(); return; }
      if (d.hex) {
        var sw = b.closest('.vc-sw');
        setPath(sw.dataset.key, d.hex);
        $$('.vc-swb', sw).forEach(function (x) { x.classList.toggle('on', x === b); });
        var val = sw.closest('.vc-field').querySelector('.vc-val');
        if (val) val.textContent = colorName(d.hex);
        renderPreview(); return;
      }
      if (d.font) { setPath(b.closest('.vc-fonts').dataset.key, d.font); renderStep(); renderPreview(); return; }
      if (d.scheme) {
        var s = SCHEMES[+d.scheme];
        state.colors = schemeColors(state.product, s[1], s[2], s[3]);
        state.team.fill = s[3] === '#111111' ? '#FFFFFF' : s[3]; state.team.outline = s[2];
        state.num.fill = state.team.fill; state.num.outline = s[2];
        renderStep(); renderPreview(); return;
      }
      if (d.placement) { state.logoPlacement = d.placement; renderStep(); renderPreview(); return; }
      switch (d.act) {
        case 'next': goStep(state.step + 1); break;
        case 'prev': goStep(state.step - 1); break;
        case 'cart': addToCart(); break;
        case 'quote': case 'techpack': openTechPack(); break;
        case 'spec':
          if (CFG.inline) showText('Spec JSON', JSON.stringify(buildSpec(), null, 2));
          else download(state.designId + '-spec.json', JSON.stringify(buildSpec(), null, 2), 'application/json');
          break;
        case 'csv':
          if (CFG.inline) showText('Roster CSV', rosterCSV());
          else download(state.designId + '-roster.csv', rosterCSV(), 'text/csv');
          break;
        case 'svg':
          if (CFG.inline) { showText('Artwork SVG (front)', productionSVG('front'), 'Artwork SVG (back)', productionSVG('back')); break; }
          download(state.designId + '-front.svg', productionSVG('front'), 'image/svg+xml');
          setTimeout(function () { download(state.designId + '-back.svg', productionSVG('back'), 'image/svg+xml'); }, 400);
          break;
        case 'panel-close': closePanel(); break;
        case 'panel-copy':
          var ta = b.parentNode.querySelector('textarea');
          (navigator.clipboard ? navigator.clipboard.writeText(ta.value) : Promise.reject())
            .then(function () { toast('Copied.'); })
            .catch(function () { ta.focus(); ta.select(); toast('Selected. Press Copy on your keyboard or menu.'); });
          break;
        case 'row-add':
          state.roster.push({ name: '', number: '', size: state.roster.length ? state.roster[state.roster.length - 1].size : 'L', qty: 1 });
          renderStep(); renderPreview();
          var rows = $$('.vc-rrow', root); rows[rows.length - 1].querySelector('[data-r="name"]').focus();
          break;
        case 'row-remove':
          if (state.roster.length === 1) { toast('Keep at least one player.'); break; }
          var i = +b.closest('.vc-rrow').dataset.row;
          state.roster.splice(i, 1);
          if (state.sel >= state.roster.length) state.sel = state.roster.length - 1;
          renderStep(); renderPreview(); break;
        case 'bulk-apply': applyBulk(); break;
        case 'logo-remove': state.logo = null; state.logoName = ''; renderStep(); renderPreview(); break;
        case 'share': share(); break;
        case 'reset':
          // Two taps instead of confirm(): dialogs are blocked in some embeds.
          if (b.dataset.armed) {
            clearTimeout(b._t); delete b.dataset.armed; b.textContent = 'Start over';
            state = defaults(state.product); renderStep(); renderPreview(); toast('New design started.');
          } else {
            b.dataset.armed = '1'; b.textContent = 'Tap again to clear';
            b._t = setTimeout(function () { delete b.dataset.armed; b.textContent = 'Start over'; }, 3000);
          }
          break;
      }
    });

    root.addEventListener('input', function (e) {
      var t = e.target;
      if (t.dataset.bind) {
        var k = t.dataset.bind.split('.');
        if (k.length === 1) state[k[0]] = t.value; else state[k[0]][k[1]] = t.value;
        if (k[0] !== 'notes') renderPreview(); else save();
        return;
      }
      if (t.dataset.r) {
        var i = +t.closest('.vc-rrow').dataset.row, r = state.roster[i];
        if (t.dataset.r === 'number') { t.value = t.value.replace(/\D/g, '').slice(0, 2); r.number = t.value; }
        else if (t.dataset.r === 'qty') r.qty = Math.max(1, Math.min(999, parseInt(t.value, 10) || 1));
        else r[t.dataset.r] = t.value;
        if (i !== state.sel && (t.dataset.r === 'name' || t.dataset.r === 'number')) selectRow(i);
        renderPreview();
      }
    });

    root.addEventListener('change', function (e) {
      var t = e.target;
      if (t.dataset.sel) { selectRow(+t.dataset.sel); renderPreview(); }
      if (t.dataset.r === 'size') { state.roster[+t.closest('.vc-rrow').dataset.row].size = t.value; renderPreview(); }
      if (t.dataset.act === 'logo' && t.files[0]) readLogo(t.files[0]);
    });
  }

  function selectRow(i) {
    state.sel = i;
    $$('.vc-rrow', root).forEach(function (r, j) { r.classList.toggle('on', j === i); r.querySelector('[data-sel]').checked = j === i; });
  }

  function readLogo(file) {
    if (file.size > 2 * 1024 * 1024) { toast('Logo must be 2 MB or smaller.'); return; }
    if (!/^image\/(png|jpeg|svg\+xml|webp)$/.test(file.type)) { toast('Use a PNG, JPG, WEBP or SVG file.'); return; }
    var fr = new FileReader();
    fr.onload = function () { state.logo = fr.result; state.logoName = file.name; renderStep(); renderPreview(); };
    fr.readAsDataURL(file);
  }

  function applyBulk() {
    var p = PRODUCTS[state.product];
    var lines = $('[data-act="bulk-text"]', root).value.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    var rows = lines.map(function (l) {
      var c = l.split(/\s*[,\t;]\s*/);
      var size = (c[2] || 'L').toUpperCase();
      return {
        name: (c[0] || '').slice(0, 16), number: (c[1] || '').replace(/\D/g, '').slice(0, 2),
        size: p.sizes.indexOf(size) >= 0 ? size : 'L', qty: Math.max(1, Math.min(999, parseInt(c[3], 10) || 1)),
      };
    });
    if (!rows.length) { toast('Paste at least one line.'); return; }
    state.roster = rows; state.sel = 0;
    renderStep(); renderPreview(); toast(rows.length + ' players loaded.');
  }

  function share() {
    var json = JSON.stringify(Object.assign({}, state, { logo: null, step: 0 }));
    var url = location.href.split('#')[0] + '#design=' + encodeURIComponent(btoa(unescape(encodeURIComponent(json))));
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject())
      .then(function () { toast('Share link copied (logo not included).'); })
      .catch(function () { prompt('Copy this link:', url); });
  }

  function panel(title, node) {
    closePanel();
    var ov = document.createElement('div');
    ov.className = 'vc-panel-ov';
    ov.innerHTML = '<div class="vc-panel-box" role="dialog" aria-label="' + esc(title) + '"><div class="vc-panel-head"><b>' +
      esc(title) + '</b><button type="button" class="vc-btn2" data-act="panel-close">Close</button></div><div class="vc-panel-body"></div></div>';
    ov.querySelector('.vc-panel-body').appendChild(node);
    $('.vc', root).appendChild(ov);
    ov.querySelector('[data-act="panel-close"]').focus();
  }
  function closePanel() { var o = $('.vc-panel-ov', root); if (o) o.remove(); }
  function showText() {
    var wrap = document.createElement('div');
    for (var i = 0; i < arguments.length; i += 2) {
      var sec = document.createElement('div'); sec.className = 'vc-panel-text';
      sec.innerHTML = (arguments.length > 2 ? '<div class="vc-label">' + esc(arguments[i]) + '</div>' : '') +
        '<textarea class="vc-input" readonly rows="12"></textarea><button type="button" class="vc-btn2" data-act="panel-copy">Copy</button>';
      sec.querySelector('textarea').value = arguments[i + 1];
      wrap.appendChild(sec);
    }
    panel(arguments[0].replace(/ \(front\)$/, ''), wrap);
  }

  function openTechPack() {
    var html = techPackHTML();
    if (CFG.inline) {
      // Render inside the page (shadow root keeps its styles separate).
      var host = document.createElement('div');
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var sr = host.attachShadow({ mode: 'open' });
      sr.innerHTML = Array.prototype.map.call(doc.querySelectorAll('style'), function (st) { return st.outerHTML; }).join('') +
        '<style>:host{display:block;background:#fff;color:#111}.btn{display:none}body,div{max-width:100%}</style>' + doc.body.innerHTML;
      panel('Tech pack ' + state.designId, host);
      return;
    }
    var w = window.open(URL.createObjectURL(new Blob([html], { type: 'text/html' })), '_blank');
    if (!w) download(state.designId + '-techpack.html', html, 'text/html');
  }

  function init() {
    root = document.querySelector(CFG.mount);
    if (!root) return;
    state = loadInitial();
    shell(); bind(); renderStep(); renderPreview();
  }

  // Small public surface for theme code / debugging.
  window.VarsityBuilder = {
    get state() { return state; },
    buildSpec: buildSpec, rosterCSV: rosterCSV, techPackHTML: techPackHTML, productionSVG: productionSVG,
    products: PRODUCTS, palette: PALETTE,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
