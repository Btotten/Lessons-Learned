#!/usr/bin/env python3
"""Neutral (white / gray) 3D garment renders -> recolorable Kickflip layers, per view.

Works on renders where every fabric is white or mid-gray on a black or transparent background:
the fabric zones are separated by brightness + shape, and the render's own lighting becomes
shadow / highlight layers so any color looks photoreal.

Usage: python3 tools/render_to_layers.py styles/VC-JKT3D.json
Requires: pip install numpy pillow scipy

Per view, all PNGs share one size (the garment's crop):
  00-details-under.png  fixed pixels kept as rendered (e.g. inside lining at the neck)
  10-<zone>.png         white mask of one fabric zone - recolor in Kickflip
  60-shadows.png        black with alpha (multiply the render's shading onto any color)
  65-highlights.png     white with alpha (sheen)
  preview.png, guide.png, zones-debug.png (false-color check of the zone split)
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as nd

cfg_path = sys.argv[1]
cfg = json.load(open(cfg_path))
base = os.path.dirname(os.path.abspath(cfg_path))
out_root = os.path.join(base, cfg["out"])
T = cfg.get("thresholds", {})
WHITE_T = T.get("white", 200)
STRIPE_R = T.get("stripeRadius", 10)
SLEEVE_MIN = T.get("sleeveMinArea", 15000)

DEBUG_COLORS = {"body": (240, 240, 240), "sleeves": (70, 110, 200), "knit": (40, 160, 70),
                "stripes": (250, 200, 0), "snaps": (220, 40, 40), "pocket-trim": (200, 60, 200),
                "details": (0, 200, 220)}


def poly_mask(shape, pts):
    im = Image.new("L", (shape[1], shape[0]), 0)
    ImageDraw.Draw(im).polygon([tuple(p) for p in pts], fill=1)
    return np.array(im, bool)


def disk(r):
    y, x = np.ogrid[-r:r + 1, -r:r + 1]
    return x * x + y * y <= r * r


def hex_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def save_rgba(path, rgb, alpha):
    arr = np.dstack([np.broadcast_to(rgb, alpha.shape + (3,)) if np.ndim(rgb) == 1 else rgb,
                     np.clip(alpha * 255, 0, 255)]).astype(np.uint8)
    Image.fromarray(arr, "RGBA").save(path, optimize=True)


def process(view):
    src = Image.open(os.path.join(base, view["image"])).convert("RGBA")
    a = np.array(src).astype(float)
    L = a[..., :3].mean(-1)
    H, W = L.shape

    # Garment coverage (anti-aliased edge) from alpha, else from the black background.
    if view.get("background") == "alpha":
        al = a[..., 3]
        trim = view.get("trimEdge", 0)  # cut-outs often carry a thin white outline
        if trim:
            al = nd.grey_erosion(al, footprint=disk(trim))
        cover = al / 255.0
        solid = al > 128
    else:
        solid = nd.binary_fill_holes(L > 20)
        cover = solid.astype(float)
        edge = solid & ~nd.binary_erosion(solid, iterations=3)
        cover[edge] = np.clip((L[edge] - 8) / 45.0, 0, 1)
    solid = nd.binary_opening(solid, iterations=1)

    Ls = nd.median_filter(L, 5)
    white = solid & (Ls > WHITE_T)
    gray = solid & ~white

    # Body = large smooth white areas; thin white bands are knit stripes.
    opened = nd.binary_opening(white, structure=disk(STRIPE_R))
    lab, n = nd.label(opened)
    sizes = nd.sum(opened, lab, range(1, n + 1))
    big = np.isin(lab, 1 + np.flatnonzero(sizes > 5000))
    body = white & nd.binary_dilation(big, structure=disk(STRIPE_R + 1))

    interior = np.zeros_like(solid)
    for pts in view.get("interior", []):
        interior |= poly_mask(L.shape, pts)
    interior &= solid

    bands_stripes = np.zeros_like(solid)
    knit = np.zeros_like(solid)
    hem_body = np.zeros_like(solid)
    for band in view.get("bands", []):
        pm = poly_mask(L.shape, band["poly"]) & ~interior
        st = white & ~body & pm
        # Drop specks (snap highlights, noise): stripes are long thin runs.
        sl, sn = nd.label(st)
        if sn:
            ss = nd.sum(st, sl, range(1, sn + 1))
            st = np.isin(sl, 1 + np.flatnonzero(ss > band.get("minStripe", 150)))
        if band.get("column", False):
            # Waistband / cuff stripes run across; vertical white bits (placket edges) are body.
            across = nd.binary_opening(st, structure=np.ones((1, band.get("minRun", 15)), bool))
            hem_body |= st & ~across
            st = across
        bands_stripes |= st
        g = gray & pm
        if band.get("column", False):
            # Keep gray only within t_top above the column's first stripe and t_bottom below its last,
            # so a sleeve hanging in front of (or right above) the band is not taken as knit.
            ys = np.arange(H)[:, None]
            has = st.any(0)
            top = np.where(has, st.argmax(0), H)
            bot = np.where(has, H - 1 - st[::-1].argmax(0), -1)
            g &= (ys >= top - band.get("tTop", 18)) & (ys <= bot + band.get("tBottom", 80))
            # Knit is darker than a shadowed white hem; bright "gray" above the stripes is the body's hem.
            hem = g & (Ls >= band.get("grayMax", 165)) & (ys < top)
            hem_body |= hem
            g &= ~hem
            # Real stripes sit below the band's first row of knit; white above it is hem highlight.
            first_knit = np.where(g.any(0), g.argmax(0), H)
            stray = st & (ys < first_knit)
            hem_body |= stray
            st &= ~stray
            bands_stripes &= ~stray
        knit |= g

    stripes = bands_stripes
    body |= (white & ~stripes & ~interior) | hem_body  # leftover white (highlights, placket) belongs to the body

    rest = gray & ~knit & ~interior & ~hem_body
    lab, n = nd.label(rest)

    def ring_body_share(lab, i, sl):
        # Snaps sit on the body fabric: most of the garment right around them is body.
        pad = 8
        ys = slice(max(0, sl[0].start - pad), sl[0].stop + pad)
        xs = slice(max(0, sl[1].start - pad), sl[1].stop + pad)
        c = lab[ys, xs] == i
        ring = nd.binary_dilation(c, iterations=6) & ~nd.binary_dilation(c, iterations=2) & solid[ys, xs]
        return body[ys, xs][ring].mean() if ring.any() else 0

    sleeves = np.zeros_like(solid)
    snaps = np.zeros_like(solid)
    pockets = np.zeros_like(solid)
    for i, sl in enumerate(nd.find_objects(lab), start=1):
        comp = lab[sl] == i
        area = comp.sum()
        if area >= SLEEVE_MIN:
            sleeves[sl] |= comp
            continue
        h, w = comp.shape
        fill = area / float(h * w)
        near = nd.binary_dilation(comp, iterations=10)
        touches_trim = (near & (knit | stripes)[sl]).any()
        if area < 300 or touches_trim:
            body[sl] |= comp  # seams, creases, placket shadows: keep as body so shading carries them
        elif area < 2500 and fill > 0.45 and ring_body_share(lab, i, sl) > 0.85:
            snaps[sl] |= nd.binary_fill_holes(comp)  # round from the front, edge-on from the side
        elif area >= 1500:
            pockets[sl] |= comp  # welt pocket trim
        else:
            body[sl] |= comp
    snaps = nd.binary_dilation(snaps, iterations=2) & solid
    body &= ~snaps

    labels = {"body": body, "sleeves": sleeves, "knit": knit, "stripes": stripes,
              "snaps": snaps, "pocket-trim": pockets & ~snaps}

    # Soft edges between zones, normalized to the garment coverage.
    soft = {k: nd.gaussian_filter(v.astype(float), 0.8) for k, v in labels.items()}
    soft["details"] = nd.gaussian_filter(interior.astype(float), 0.8)
    total = sum(soft.values()) + 1e-6
    for k in soft:
        soft[k] = soft[k] / total * cover

    # Lighting: ratio of each pixel to its zone's typical brightness.
    base_l = np.full(L.shape, 200.0)
    for k, m in labels.items():
        if m.sum() > 50:
            base_l[m] = np.median(L[m])
    shadow = np.clip(1 - L / base_l, 0, 1) * cover * (1 - soft["details"])
    highlight = np.clip((L - base_l) / 255.0 * 2.0, 0, 0.6) * cover * (1 - soft["details"])

    ys, xs = np.nonzero(cover > 0.02)
    pad = 10
    y0, y1 = int(max(0, ys.min() - pad)), int(min(H, ys.max() + pad + 1))
    x0, x1 = int(max(0, xs.min() - pad)), int(min(W, xs.max() + pad + 1))
    crop = (slice(y0, y1), slice(x0, x1))

    vdir = os.path.join(out_root, view["id"])
    os.makedirs(vdir, exist_ok=True)
    layers = []
    if interior.any():
        save_rgba(os.path.join(vdir, "00-details-under.png"), a[..., :3][crop], soft["details"][crop])
        layers.append({"file": "00-details-under.png", "kind": "details-under"})
    zones = {z["id"]: z for z in cfg["zones"]}
    for zid in zones:
        m = soft.get(zid)
        if m is None or m.max() < 0.05:
            continue
        save_rgba(os.path.join(vdir, f"10-{zid}.png"), np.array([255, 255, 255]), m[crop])
        layers.append({"file": f"10-{zid}.png", "kind": "fabric", "zone": zid, "label": zones[zid]["label"]})
    save_rgba(os.path.join(vdir, "60-shadows.png"), np.array([0, 0, 0]), shadow[crop])
    save_rgba(os.path.join(vdir, "65-highlights.png"), np.array([255, 255, 255]), highlight[crop])
    layers += [{"file": "60-shadows.png", "kind": "lines"}, {"file": "65-highlights.png", "kind": "lines"}]

    # Preview with sample colors: over-composite each layer in order.
    Hc, Wc = y1 - y0, x1 - x0
    out = np.zeros((Hc, Wc, 3))
    alpha = np.zeros((Hc, Wc))

    def over(rgb, al):
        nonlocal out, alpha
        al = al[..., None]
        out = rgb * al + out * (1 - al)
        alpha[:] = al[..., 0] + alpha * (1 - al[..., 0])

    if interior.any():
        over(a[..., :3][crop], soft["details"][crop])
    for zid, z in zones.items():
        if zid in soft:
            over(np.array(hex_rgb(z["sample"]), float), soft[zid][crop])
    over(np.zeros(3), shadow[crop])
    over(np.full(3, 255.0), highlight[crop])
    prev = np.dstack([out, alpha * 255]).astype(np.uint8)
    Image.fromarray(prev, "RGBA").save(os.path.join(vdir, "preview.png"), optimize=True)

    dbg = np.zeros((Hc, Wc, 3))
    for k, col in DEBUG_COLORS.items():
        dbg += np.array(col, float) * soft[k][crop][..., None]
    Image.fromarray(np.clip(dbg, 0, 255).astype(np.uint8)).save(os.path.join(vdir, "zones-debug.png"))

    locations = []
    for g in view.get("guides", []):
        bx, by, bw, bh = g["box"]
        locations.append({"id": g["id"], "label": g["label"], "x": bx - x0, "y": by - y0, "w": bw, "h": bh})
    if locations:
        gim = Image.fromarray(prev, "RGBA")
        bg = Image.new("RGBA", gim.size, (236, 234, 228, 255))
        bg.alpha_composite(gim)
        d = ImageDraw.Draw(bg)
        for l in locations:
            d.rectangle([l["x"], l["y"], l["x"] + l["w"], l["y"] + l["h"]], outline=(232, 100, 27), width=4)
            ty = l["y"] - 26 if l["y"] >= 26 else l["y"]  # no room above: label inside the box
            d.rectangle([l["x"], ty, l["x"] + 12 + 9 * len(l["label"]), ty + 26], fill=(232, 100, 27))
            d.text((l["x"] + 6, ty + 5), l["label"], fill=(255, 255, 255))
        bg.convert("RGB").save(os.path.join(vdir, "guide.png"))

    return {"id": view["id"], "width": Wc, "height": Hc, "crop": {"x": x0, "y": y0, "w": Wc, "h": Hc},
            "scale": 1, "locations": locations, "layers": layers}


manifest = {"style": cfg["style"], "name": cfg["name"], "zones": cfg["zones"], "views": []}
for v in cfg["views"]:
    manifest["views"].append(process(v))
    print("built", v["id"])
json.dump(manifest, open(os.path.join(out_root, "manifest.json"), "w"), indent=2)

# Same aggregate the vector pipeline writes, so preview.html lists every style.
root = os.path.dirname(out_root)
allm = {}
for d in sorted(os.listdir(root)):
    mf = os.path.join(root, d, "manifest.json")
    if os.path.exists(mf):
        allm[d] = json.load(open(mf))
open(os.path.join(root, "manifests.js"), "w").write("window.VC_MANIFESTS = " + json.dumps(allm) + ";\n")
print("wrote", out_root)
