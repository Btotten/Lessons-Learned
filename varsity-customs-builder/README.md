# Varsity Customs — Team Builder (reference prototype)

> **Status:** Varsity Customs is going with **Kickflip** as the production customizer on Shopify.
> This folder is kept as a working reference / fallback. `server/` may still be useful to turn
> orders into manufacturing work orders alongside Kickflip.

An original, framework-free team uniform builder: style → colors → text & numbers → logo → roster → review.

| Path | What it is |
| --- | --- |
| `index.html` | Standalone demo — open in a browser |
| `assets/vc-builder.js`, `assets/vc-builder.css` | The builder (jersey, varsity jacket, hoodie, shorts) |
| `shopify/sections/varsity-builder.liquid` | Online Store 2.0 section; adds to cart via `/cart/add.js`, one line per size, roster in line-item properties |
| `server/server.js` | Zero-dependency Node 18+ server: stores designs, verifies Shopify `orders/create` webhooks (HMAC), writes `data/jobs/<order>-<design>.json/.csv` |

## Production output
The Review step exports a printable **tech pack** (artwork, color zones with supplier codes, decoration
methods, approx. letter sizes, size breakdown, roster), **spec JSON**, **roster CSV**, and **front/back SVGs**.
Convert text to outlines before RIP/digitizing. Replace `PALETTE` codes in `vc-builder.js` with your mill's codes.

## Run the server
```
cd server
PORT=8787 PUBLIC_URL=https://designs.example.com ALLOWED_ORIGINS=https://yourstore.com \
SHOPIFY_WEBHOOK_SECRET=... ADMIN_TOKEN=... node server.js
```
