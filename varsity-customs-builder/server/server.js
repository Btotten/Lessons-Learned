#!/usr/bin/env node
/*
 * Varsity Customs — design storage + Shopify order webhook -> manufacturing work orders.
 * Zero dependencies (Node 18+).
 *
 *   POST /designs                        store a design from the builder, returns { id, url }
 *   GET  /designs/:id                    spec JSON
 *   GET  /designs/:id/(front|back).svg   production artwork
 *   POST /webhooks/shopify/orders-create Shopify webhook -> writes data/jobs/<order>-<design>.{json,csv}
 *   GET  /jobs                           list production jobs (Bearer ADMIN_TOKEN)
 *
 * Env: PORT, DATA_DIR, PUBLIC_URL, ALLOWED_ORIGINS (comma list), SHOPIFY_WEBHOOK_SECRET, ADMIN_TOKEN
 */
'use strict';

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 8787);
const DATA = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
const WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET || '';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const ID_RE = /^VC-[A-Z0-9]{6,20}$/;
const MAX_BODY = 6 * 1024 * 1024;

const DESIGNS = path.join(DATA, 'designs');
const JOBS = path.join(DATA, 'jobs');
fs.mkdirSync(DESIGNS, { recursive: true });
fs.mkdirSync(JOBS, { recursive: true });

function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body) || typeof body === 'string';
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json' }, headers));
  res.end(isBuf ? body : JSON.stringify(body));
}

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && (ORIGINS.includes('*') || ORIGINS.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('Payload too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function csvCell(v) {
  let s = String(v == null ? '' : v);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const safeName = (s) => String(s).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'order';

/* ---------------------------------------------------------------- designs */

async function saveDesign(req, res) {
  let payload;
  try { payload = JSON.parse((await readBody(req)).toString('utf8')); } catch (e) { return send(res, e.status || 400, { error: e.status ? e.message : 'Invalid JSON' }); }
  const spec = payload && payload.spec;
  if (!spec || spec.schema !== 'varsity-customs/production-spec@1' || !ID_RE.test(spec.designId)) {
    return send(res, 422, { error: 'Invalid design spec' });
  }
  const dir = path.join(DESIGNS, spec.designId);
  fs.mkdirSync(dir, { recursive: true });
  spec.receivedAt = new Date().toISOString();
  fs.writeFileSync(path.join(dir, 'spec.json'), JSON.stringify(spec, null, 2));
  for (const view of ['front', 'back']) {
    const svg = payload.artwork && payload.artwork[view];
    if (typeof svg === 'string' && svg.includes('<svg')) fs.writeFileSync(path.join(dir, `${view}.svg`), svg);
  }
  const m = typeof payload.logo === 'string' && payload.logo.match(/^data:image\/(png|jpeg|svg\+xml|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (m) {
    const ext = { png: 'png', jpeg: 'jpg', 'svg+xml': 'svg', webp: 'webp' }[m[1]];
    fs.writeFileSync(path.join(dir, `logo.${ext}`), Buffer.from(m[2], 'base64'));
  }
  send(res, 201, { id: spec.designId, url: `${PUBLIC_URL}/designs/${spec.designId}` });
}

function getDesign(res, id, file) {
  if (!ID_RE.test(id)) return send(res, 404, { error: 'Not found' });
  const p = path.join(DESIGNS, id, file);
  if (!fs.existsSync(p)) return send(res, 404, { error: 'Not found' });
  const svg = file.endsWith('.svg');
  send(res, 200, fs.readFileSync(p), {
    'Content-Type': svg ? 'image/svg+xml' : 'application/json',
    // Customer-supplied artwork: never let it run script in our origin.
    'Content-Security-Policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com",
    'X-Content-Type-Options': 'nosniff',
  });
}

/* ---------------------------------------------------------------- webhook */

function verifyShopify(raw, hmacHeader) {
  if (!WEBHOOK_SECRET || !hmacHeader) return false;
  const digest = crypto.createHmac('sha256', WEBHOOK_SECRET).update(raw).digest();
  const given = Buffer.from(String(hmacHeader), 'base64');
  return given.length === digest.length && crypto.timingSafeEqual(given, digest);
}

async function orderWebhook(req, res) {
  const raw = await readBody(req);
  if (!verifyShopify(raw, req.headers['x-shopify-hmac-sha256'])) return send(res, 401, { error: 'Bad signature' });
  const order = JSON.parse(raw.toString('utf8'));
  send(res, 200, { ok: true }); // acknowledge fast; Shopify retries slow responses

  const byDesign = {};
  for (const li of order.line_items || []) {
    const props = Object.fromEntries((li.properties || []).map((p) => [p.name, p.value]));
    const id = props['Design ID'];
    if (!ID_RE.test(id || '') || props.For) continue; // skip add-on fee lines
    (byDesign[id] = byDesign[id] || []).push({
      sku: li.sku, variant: li.variant_title, qty: li.quantity, players: props.Players || '', title: li.title,
    });
  }

  for (const [designId, lines] of Object.entries(byDesign)) {
    const specPath = path.join(DESIGNS, designId, 'spec.json');
    const spec = fs.existsSync(specPath) ? JSON.parse(fs.readFileSync(specPath, 'utf8')) : null;
    const job = {
      status: 'queued',
      createdAt: new Date().toISOString(),
      order: {
        id: order.id, name: order.name, createdAt: order.created_at, email: order.email,
        customer: order.customer ? `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim() : '',
        shippingAddress: order.shipping_address || null, note: order.note || '',
      },
      designId,
      artwork: spec ? { front: `${PUBLIC_URL}/designs/${designId}/front.svg`, back: `${PUBLIC_URL}/designs/${designId}/back.svg` } : null,
      orderedLines: lines,
      spec: spec || { warning: 'Design spec not found on server — check line item properties in Shopify admin.' },
    };
    const base = `${safeName(order.name || order.id)}-${designId}`;
    fs.writeFileSync(path.join(JOBS, `${base}.json`), JSON.stringify(job, null, 2));
    if (spec && Array.isArray(spec.roster)) {
      const rows = [['Order', 'Design ID', 'Style', 'Name', 'Number', 'Size', 'Qty']]
        .concat(spec.roster.map((r) => [order.name, designId, spec.product.style, r.name, r.number, r.size, r.qty]));
      fs.writeFileSync(path.join(JOBS, `${base}.csv`), rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n');
    }
    console.log(`[job] ${base} queued (${lines.reduce((a, l) => a + l.qty, 0)} units)`);
  }
}

function listJobs(req, res) {
  const auth = req.headers.authorization || '';
  if (!ADMIN_TOKEN || auth !== `Bearer ${ADMIN_TOKEN}`) return send(res, 401, { error: 'Unauthorized' });
  const jobs = fs.readdirSync(JOBS).filter((f) => f.endsWith('.json')).map((f) => {
    const j = JSON.parse(fs.readFileSync(path.join(JOBS, f), 'utf8'));
    return { file: f, status: j.status, order: j.order.name, designId: j.designId, style: j.spec.product && j.spec.product.style, units: j.spec.totalUnits };
  });
  send(res, 200, jobs);
}

/* ----------------------------------------------------------------- router */

const server = http.createServer(async (req, res) => {
  try {
    cors(req, res);
    const url = new URL(req.url, 'http://x');
    const p = url.pathname.replace(/\/+$/, '') || '/';
    if (req.method === 'OPTIONS') return send(res, 204, '');
    if (req.method === 'POST' && p === '/designs') return await saveDesign(req, res);
    if (req.method === 'POST' && p === '/webhooks/shopify/orders-create') return await orderWebhook(req, res);
    if (req.method === 'GET' && p === '/jobs') return listJobs(req, res);
    let m;
    if (req.method === 'GET' && (m = p.match(/^\/designs\/([^/]+)$/))) return getDesign(res, m[1], 'spec.json');
    if (req.method === 'GET' && (m = p.match(/^\/designs\/([^/]+)\/(front|back)\.svg$/))) return getDesign(res, m[1], `${m[2]}.svg`);
    if (req.method === 'GET' && p === '/health') return send(res, 200, { ok: true });
    send(res, 404, { error: 'Not found' });
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : 'Server error' });
  }
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`Varsity Customs design server on ${PUBLIC_URL}`));
}
module.exports = server;
