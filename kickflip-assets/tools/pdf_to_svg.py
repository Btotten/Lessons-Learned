#!/usr/bin/env python3
"""Tech-pack PDF page -> clean SVG of the garment sketches (no call-outs, form, or placeholder text).

Usage: python3 tools/pdf_to_svg.py styles/VC010-jersey.json
Requires: pip install pymupdf
"""
import json, os, sys
import pymupdf

cfg_path = sys.argv[1]
cfg = json.load(open(cfg_path))
base = os.path.dirname(os.path.abspath(cfg_path))
pdf = os.path.join(base, cfg["pdf"])
out = os.path.join(base, cfg["svg"])

doc = pymupdf.open(pdf)
hide = set(cfg.get("hideLayers", []))
off = [xref for xref, v in doc.get_ocgs().items() if v["name"] in hide]
if off:
    doc.set_layer(-1, off=off)

page = doc[cfg.get("page", 1) - 1]
text_boxes = []
if cfg.get("removeText", True):
    # Placeholder TEAM / NAME / numbers are live text; Kickflip will add real text on top.
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            for span in line["spans"]:
                page.add_redact_annot(pymupdf.Rect(span["bbox"]))
                text_boxes.append([round(v, 2) for v in span["bbox"]])
    page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE,
                          graphics=pymupdf.PDF_REDACT_LINE_ART_NONE,
                          text=pymupdf.PDF_REDACT_TEXT_REMOVE)

os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, "w") as f:
    f.write(page.get_svg_image(text_as_path=True))
# Text outlines (strokes around placeholder numbers/names) are separate paths; build_layers.js
# drops stroke-only paths that sit inside these boxes.
with open(out + ".text.json", "w") as f:
    json.dump(text_boxes, f)
print(f"wrote {out} ({len(text_boxes)} text boxes removed)")
