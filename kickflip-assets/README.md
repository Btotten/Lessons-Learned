# Varsity Customs → Kickflip layer pipeline

Turns Varsity Customs Illustrator tech-pack PDFs into stacked, recolorable PNG layers for a 2D
product customizer (Kickflip), using **your own artwork** — no redrawing.

```
tech-pack PDF ──pdf_to_svg.py──▶ clean SVG ──build_layers.js──▶ output/<STYLE>/<view>/*.png
 (hides CALL OUTS + FORM layers,     (sorts every shape into a layer by   (+ preview.html to test colors)
  removes placeholder TEAM/NAME/11)   its fill color, per a style config)
```

> **Artwork stays out of git.** This repo is public, so `source/` (your PDFs), `build/` and `output/`
> are git-ignored. Only the tools and style configs are committed.

## Layers produced (per view: front, side, back)

Stack them bottom → top in this order. Every file in a view has the same pixel size, so they line up exactly.

| File | What it is | In Kickflip |
| --- | --- | --- |
| `00-details-under.png` | Fixed art beneath the fabrics (inside of neck, hem interior) | Static layer |
| `10-fabric-a.png` … `10-fabric-d.png` | **White mask** of one fabric zone | One layer per zone, driven by a color choice |
| `50-texture.png` | Mesh texture, black with transparency (darkens any color under it) | Static layer |
| `60-details-over.png` | Neck label, chest logo | Static layer |
| `70-lines.png` | Seams, stitching, folds, shading (black with transparency) | Static layer, top of garment |
| `preview.png` | Everything composited with sample colors | Product thumbnail / check |

Team name, player name, numbers and logos go **above** these layers as Kickflip text/image components, placed
per the Artwork Placement pages of the tech pack (e.g. jersey back number 10.25" tall, name 1.5" below collar).

### Zones

| Style | Zone | Tech-pack fabric |
| --- | --- | --- |
| VC010 Men's Football Jersey | `fabric-a` | Fabric A — yoke, side panels |
|  | `fabric-b` | Fabric B — mesh body (textured) |
|  | `fabric-c` | Fabric C — sleeves / stripe |
|  | `fabric-d` | Fabric D — chevron stripe |
| VC012 Men's Football Pant | `fabric-a` | Fabric A — body |
|  | `fabric-b` | Fabric B — mesh back/side panels (textured) |
|  | `fabric-c` | Fabric C — mesh side stripe (textured) |

## Setting it up in Kickflip

Kickflip's exact menu names change; the idea is the same.

1. Create a product per style (VC010, VC012) with three views: Front, Side, Back.
2. Upload the layers of each view in the order above.
3. For each fabric zone add a color question (e.g. "Body color") with your fabric colors as answers.
   - If Kickflip can **tint** an image layer with the chosen color, upload the white `10-fabric-*.png` masks once.
   - If it needs **one image per answer**, run the build with `--tinted`: it writes
     `colors/<zone>/<color>.png` for every color in `palette.json`, ready to attach to each answer.
4. Add text components (Team name, Player name, Number) and a logo upload on top, restricted to your
   licensed fonts and the placement boxes from the tech pack.
5. Place a test order and confirm what Kickflip sends to the order and production files.

## Test colors before uploading

Open `preview.html` in a browser. It recolors the masks exactly the way a layered customizer does.

## Rebuilding / adding a style

```bash
pip install pymupdf                      # once
npm i -g playwright                      # once (uses Chromium)

python3 tools/pdf_to_svg.py styles/VC010-jersey.json
node tools/build_layers.js styles/VC010-jersey.json            # add --tinted for per-color images
```

To add a new style, copy a config in `styles/` and adjust:

- `pdf` / `page` — which tech-pack page has the colored flats (page 1 in the current packs).
- `views` — `maxX` split points (PDF points) between front / side / back sketches.
- `area` — the sketch panel; anything outside (frame, sidebar, header) is dropped.
- `rules` — first match wins; map a shape to a layer by `fill`, `stroke`, `pattern`, `patternColors`,
  `image`, `minArea` or `within` box. Layers: a zone id, `details`, `shading`, `lines`, `remove`.
  Unmatched strokes become lines, unmatched fills and images become details.
- `zones` — label, preview `sample` color, `texture: true` for mesh fabrics.

Colors in `palette.json` are placeholders; replace them with your mill's fabric colors and codes.

## Placeholder varsity jacket (VC-JKT)

An original, simple varsity jacket drawing so the Kickflip jacket product can be built before production
vector flats exist. Swap in real flats later by pointing a style config at them; the Kickflip layer names stay the same.

```bash
node templates/varsity-jacket-template.js
node tools/build_layers.js styles/VC-JKT-template.json
```

- Views: `front`, `back`, `right-sleeve`, `left-sleeve` (matches the order form diagrams).
- Zones: wool body, sleeves, knit trim base, knit stripe 1, knit stripe 2, snaps, pocket trim.
- `guide.png` per view marks the order form's decoration locations (1–10, sleeve Loc. A/B, collar 6C/6D).
  The same boxes are in `output/VC-JKT/manifest.json` → `views[].locations` as pixel `x, y, w, h` on that
  view's layer images, for sizing Kickflip decoration areas. Not a layer to upload.
- Knit collar only; Byron collar, sailor collar and zipper hood need their own collar layers once drawn.
