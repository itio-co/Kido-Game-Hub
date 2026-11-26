#!/usr/bin/env python3
"""Compose a 512×512 empty low-poly wooden picture-frame item icon (RGBA, transparent opening)."""
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public/img/items/picture-frame.png"

SIZE = 512
SCALE = 8
S = SIZE * SCALE
MARGIN = 56
THICK = 68
OUTER_R = 30
INNER_R = 14

DARK = (92, 52, 26, 255)
MID_DARK = (150, 100, 52, 255)
MID = (196, 150, 90, 255)
LIGHT = (232, 214, 184, 255)
DEEP = (72, 42, 20, 255)


def r(px: float) -> int:
    return int(px * SCALE)


def box(inset: float) -> list[int]:
    return [r(MARGIN + inset), r(MARGIN + inset), S - r(MARGIN + inset) - 1, S - r(MARGIN + inset) - 1]


def rad(base: float, inset: float) -> int:
    return max(r(4), r(base) - r(inset))


def keep_largest_component(im: Image.Image) -> Image.Image:
    alpha = np.array(im.split()[3])
    labels, count = ndimage.label(alpha > 0)
    if count <= 1:
        return im
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    keep = labels == int(sizes.argmax())
    arr = np.array(im)
    arr[..., 3] = np.where(keep, arr[..., 3], 0)
    return Image.fromarray(arr, "RGBA")


def main() -> None:
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)

    d.rounded_rectangle(box(0), radius=rad(OUTER_R, 0), fill=DARK)
    d.rounded_rectangle(box(3), radius=rad(OUTER_R, 3), fill=MID_DARK)
    d.rounded_rectangle(box(8), radius=rad(OUTER_R, 8), fill=MID)
    d.rounded_rectangle(box(16), radius=rad(OUTER_R, 16), fill=LIGHT)
    d.rounded_rectangle(box(26), radius=rad(OUTER_R, 26), fill=MID)
    d.rounded_rectangle(box(THICK - 12), radius=rad(INNER_R, -4), fill=MID_DARK)
    d.rounded_rectangle(box(THICK - 5), radius=rad(INNER_R, -1), fill=DEEP)

    hole = Image.new("L", (S, S), 0)
    ImageDraw.Draw(hole).rounded_rectangle(box(THICK), radius=rad(INNER_R, 0), fill=255)
    im.putalpha(ImageChops.subtract(im.split()[3], hole))

    marks = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    md = ImageDraw.Draw(marks)
    w = max(2, r(2.2))
    x0, y0 = r(MARGIN + 4), r(MARGIN + 4)
    x1, y1 = S - r(MARGIN + 4) - 1, S - r(MARGIN + 4) - 1
    inner = r(MARGIN + THICK - 2)
    md.line([(x0, y0), (inner, inner)], fill=DEEP, width=w)
    md.line([(x1, y0), (S - inner, inner)], fill=DEEP, width=w)
    md.line([(x0, y1), (inner, S - inner)], fill=DEEP, width=w)
    md.line([(x1, y1), (S - inner, S - inner)], fill=DEEP, width=w)
    marks.putalpha(ImageChops.multiply(marks.split()[3], im.split()[3]))
    im = Image.alpha_composite(im, marks)

    # Soften the inner and outer rims so pink-QA sees a gradual alpha falloff, not a hard step.
    soft = im.split()[3].filter(ImageFilter.GaussianBlur(radius=SCALE * 1.6))
    im.putalpha(soft)

    out = keep_largest_component(im.resize((SIZE, SIZE), Image.Resampling.LANCZOS))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.save(OUT, "PNG")
    print(f"wrote {OUT} {out.size} {OUT.stat().st_size} bytes")


if __name__ == "__main__":
    main()
