#!/usr/bin/env python3
"""Raster the brand device from favicon.svg's own geometry -> favicon.ico + apple-touch-icon.png.

Pure PIL, no SVG rasteriser (none is installed, and adding one to raster two circles would be a
dependency for nothing). The geometry and the colours are the SAME NUMBERS as favicon.svg —
32-unit box, rounded rect r=7, glow to r=13, solid dot r=5.5, #3ff07f on #0a0b0a — so the .ico and
the .png are the vector's shapes rather than a second design. Rendered at 8x and downsampled.

Run from the repo root: `python3 scripts/make_icons.py`. Same shape as scripts/make_og.py — a
committed generator beside a committed binary, so the artifact can be regenerated rather than
being a blob nobody can reproduce.

THE GLOW IS COMPOSITED ONCE, FROM A PER-PIXEL ALPHA MASK, not stacked as concentric translucent
rings. Stacking accumulates alpha: 96 rings at 13% each composite to nearly opaque, which is why
the first attempt produced a white halo instead of a green bloom. One layer, one alpha profile —
the same one the SVG's radialGradient declares (0.55 at the centre, 0.13 at 55%, 0 at the rim).
"""

from PIL import Image, ImageDraw

BG = (10, 11, 10)     # #0a0b0a
ACC = (63, 240, 127)  # #3ff07f
S = 8                 # supersample factor


def glow_alpha(t: float) -> float:
    """The SVG gradient's alpha at fraction `t` of the glow radius. Linear between its stops."""
    if t >= 1.0:
        return 0.0
    if t <= 0.55:
        return 0.55 + (0.13 - 0.55) * (t / 0.55)
    return 0.13 + (0.0 - 0.13) * ((t - 0.55) / 0.45)


def render(size: int, rounded: bool) -> Image.Image:
    n = size * S
    u = n / 32.0  # one SVG user unit in device pixels
    cx = cy = 16 * u
    glow_r = 13 * u

    base = Image.new("RGB", (n, n), BG)

    # One green layer, masked by the gradient profile. `Image.radial_gradient` gives a centred
    # 0->255 ramp over the whole square; remapping it through glow_alpha turns it into this
    # gradient, and the point() lookup keeps it to one pass over 256 values rather than n^2.
    ramp = Image.radial_gradient("L").resize((n, n), Image.BILINEAR)
    # radial_gradient's 255 sits at the CORNER distance (n/2 * sqrt(2)); rescale so 255 lands at
    # the glow radius instead, and clamp beyond it.
    corner = (n / 2) * (2 ** 0.5)
    mask = ramp.point(lambda v: int(255 * glow_alpha(min(1.0, (v / 255) * corner / glow_r))))
    base = Image.composite(Image.new("RGB", (n, n), ACC), base, mask)

    img = base.convert("RGBA")
    d = ImageDraw.Draw(img)
    d.ellipse([cx - 5.5 * u, cy - 5.5 * u, cx + 5.5 * u, cy + 5.5 * u], fill=(*ACC, 255))

    if rounded:
        corner_mask = Image.new("L", (n, n), 0)
        ImageDraw.Draw(corner_mask).rounded_rectangle([0, 0, n - 1, n - 1], radius=7 * u, fill=255)
        img.putalpha(corner_mask)

    return img.resize((size, size), Image.LANCZOS)


render(64, rounded=True).save("favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])

# Apple touch icons are composited on an opaque tile and are never rounded by the author — iOS
# masks them itself, so a rounded source shows dark corners inside the mask.
render(180, rounded=False).convert("RGB").save("apple-touch-icon.png", optimize=True)
print("wrote favicon.ico, apple-touch-icon.png")
