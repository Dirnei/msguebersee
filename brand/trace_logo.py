"""Trace the MSG logo from the high-res (AI-enhanced) reference and fix its errors.

Usage: python trace2.py <src.png> <out.svg> [gap_shift] [mode_shift]
- removes the wrong dark "l" + "s" that the enhancement inserted after "Mode"
- splits the fused glider strokes so they form two separate "l"
- smooths the lake outline (the enhancement made it bumpy)
"""
import os
import sys

import numpy as np
import potrace
from PIL import Image, ImageDraw, ImageFilter

SRC, OUT = sys.argv[1], sys.argv[2]
GAP_SHIFT = float(sys.argv[3]) if len(sys.argv) > 3 else 0
STROKE = 21
MODE_SHIFT = int(sys.argv[4]) if len(sys.argv) > 4 else 30
UP = 2

BLUE = "#0090DA"
DARK = "#3C3C44"

im = Image.open(SRC).convert("RGB")
W, H = im.size
a = np.asarray(im.resize((W * UP, H * UP), Image.BICUBIC)).astype(int)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
yy, xx = np.mgrid[0 : a.shape[0], 0 : a.shape[1]]
X, Y = xx / UP, yy / UP  # source coordinates

blue = b - r > 80
dark = (r < 150) & (abs(r - b) < 35) & ~blue

# --- fix text: erase the bogus "ls", then move "Mode" right -------------
band = (Y > 280) & (Y < 400)
left_edge = 402 - (Y - 295) * 0.31
bogus = band & (X > left_edge) & (X < 482)
dark &= ~bogus
mode = dark & band & (X <= left_edge)
dark &= ~mode
shift = MODE_SHIFT * UP
dark[:, shift:] |= mode[:, :-shift]

# --- split the fused glider strokes into two separate "l" ------------------
# the enhancement merged both strokes into one band that widens downwards;
# left edge ~ 491 - 0.469*(y-300), right edge ~ 517 - 0.391*(y-300)
fused = (Y >= 236) & (Y <= 650 + 0.234 * (382 - X)) & (X >= 489 - 0.469 * (Y - 300)) & (X <= 520 - 0.391 * (Y - 300))
blue &= ~fused
strokes = Image.new("L", (W * UP, H * UP), 0)
dr = ImageDraw.Draw(strokes)
def wing(root, tip, w_root, w_tip):
    """Tapered wing from root to a rounded tip."""
    (x0, y0), (x1, y1) = root, tip
    dx, dy = x1 - x0, y1 - y0
    n = (dx * dx + dy * dy) ** 0.5
    nx, ny = -dy / n, dx / n
    pts = [
        (x0 + nx * w_root / 2, y0 + ny * w_root / 2),
        (x1 + nx * w_tip / 2, y1 + ny * w_tip / 2),
        (x1 - nx * w_tip / 2, y1 - ny * w_tip / 2),
        (x0 - nx * w_root / 2, y0 - ny * w_root / 2),
    ]
    dr.polygon([(x * UP, y * UP) for x, y in pts], fill=255)
    rr = w_tip / 2 * UP
    dr.ellipse([x1 * UP - rr, y1 * UP - rr, x1 * UP + rr, y1 * UP + rr], fill=255)


# two independent gliders: the upper one's wing ends below the text, the lower
# one's wing ends above it; side by side they read as "ll" and never touch
lx0, ly0, lx1, ly1 = map(float, os.environ.get("LOWER_WING", "301,680,470,285").split(","))
wing((lx0 + GAP_SHIFT, ly0), (lx1 + GAP_SHIFT, ly1), float(os.environ.get("LOWER_ROOT_W", "30")), 11)
wing((544, 205), (452, 420), 27, 11)
blue |= np.asarray(strokes) > 127

lake_zone = X > 760
glider = blue & ~lake_zone
lake = blue & lake_zone


def smooth(mask, radius):
    img = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius))
    return np.asarray(img) > 127


def trace(mask, turdsize=40):
    plist = potrace.Bitmap(~mask).trace(turdsize=turdsize, alphamax=1.0, opticurve=True, opttolerance=0.4)
    k = 1 / UP
    out = []
    for curve in plist:
        sp = curve.start_point
        d = [f"M{sp.x * k:.1f},{sp.y * k:.1f}"]
        for seg in curve.segments:
            if seg.is_corner:
                d.append(f"L{seg.c.x * k:.1f},{seg.c.y * k:.1f}L{seg.end_point.x * k:.1f},{seg.end_point.y * k:.1f}")
            else:
                d.append(
                    f"C{seg.c1.x * k:.1f},{seg.c1.y * k:.1f} {seg.c2.x * k:.1f},{seg.c2.y * k:.1f} "
                    f"{seg.end_point.x * k:.1f},{seg.end_point.y * k:.1f}"
                )
        d.append("Z")
        out.append("".join(d))
    return " ".join(out)


dark_d = trace(smooth(dark, UP * 0.8))
glider_d = trace(smooth(glider, UP * 0.8))
lake_d = trace(smooth(lake, UP * 5.0), turdsize=400)

svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}">
  <title>Modellsportgruppe Übersee e. V.</title>
  <path id="lettering-ring" fill="{DARK}" fill-rule="evenodd" d="{dark_d}"/>
  <path id="lake" fill="{BLUE}" fill-rule="evenodd" d="{lake_d}"/>
  <path id="gliders" fill="{BLUE}" fill-rule="evenodd" d="{glider_d}"/>
</svg>
"""
open(OUT, "w", encoding="utf-8").write(svg)
print("written", OUT, len(svg), "bytes")
