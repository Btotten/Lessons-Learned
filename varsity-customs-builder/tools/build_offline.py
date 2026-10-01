#!/usr/bin/env python3
"""Pack the builder into ONE self-contained HTML file that works with no internet.

Inlines assets/vc-builder.css, assets/vc-builder.js and the fonts in offline/fonts (base64),
so the file can be emailed, put on a USB stick, or opened straight from disk.
Usage: python3 tools/build_offline.py  ->  offline/VarsityCustomsBuilder.html
"""
import base64, json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = [  # (family, weight, file) - SIL Open Font License, see offline/fonts/OFL-LICENSES.txt
    ("Graduate", 400, "graduate-latin-400-normal.woff2"),
    ("Alfa Slab One", 400, "alfa-slab-one-latin-400-normal.woff2"),
    ("Bebas Neue", 400, "bebas-neue-latin-400-normal.woff2"),
    ("Oswald", 400, "oswald-latin-400-normal.woff2"),
    ("Oswald", 600, "oswald-latin-600-normal.woff2"),
    ("Yellowtail", 400, "yellowtail-latin-400-normal.woff2"),
    ("Black Ops One", 400, "black-ops-one-latin-400-normal.woff2"),
]


def read(*p):
    return open(os.path.join(ROOT, *p), encoding="utf-8").read()


font_css = "".join(
    "@font-face{font-family:'%s';font-weight:%d;font-style:normal;font-display:swap;"
    "src:url(data:font/woff2;base64,%s) format('woff2')}" % (
        fam, w, base64.b64encode(open(os.path.join(ROOT, "offline", "fonts", f), "rb").read()).decode())
    for fam, w, f in FONTS)

js = read("assets", "vc-builder.js")
assert "</script" not in js.lower(), "inline script would close early"
config = {"designEndpoint": None, "shopify": None}

html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Varsity Customs - Team Builder (offline)</title>
<!-- Offline build: everything is inside this file. Fonts: Graduate, Alfa Slab One, Bebas Neue, Oswald,
     Yellowtail, Black Ops One - SIL Open Font License 1.1 (see OFL-LICENSES.txt shipped with this file). -->
<style>{font_css}</style>
<style>{read("assets", "vc-builder.css")}
body {{ margin: 0; background: #e9e7e1; }} .wrap {{ max-width: 1280px; margin: 0 auto; padding: 16px; }}</style>
</head>
<body>
<div class="wrap"><div id="vc-builder"></div></div>
<script>
window.VC_CONFIG = {json.dumps(config)};
window.VC_FONT_CSS = {json.dumps(font_css)};
</script>
<script>
{js}
</script>
</body>
</html>
"""
out = os.path.join(ROOT, "offline", "VarsityCustomsBuilder.html")
open(out, "w", encoding="utf-8").write(html)
print(f"wrote {out} ({os.path.getsize(out) // 1024} KB)")
