#!/usr/bin/env python3
"""Compose a 512×512 low-poly wooden tabletop picture-frame item icon.

The front holds a generic mock photo (a muted landscape, no person). The frame
is seen at a slight 3/4 angle with a visible back easel stand. Outside the
object is transparent.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public/img/items/picture-frame.png"

SIZE = 512
SCALE = 8
S = SIZE * SCALE

# Wood
DARK = (92, 52, 26, 255)
MID_DARK = (150, 100, 52, 255)
MID = (196, 150, 90, 255)
LIGHT = (232, 214, 184, 255)
DEEP = (72, 42, 20, 255)
SIDE = (78, 44, 22, 255)
STAND = (128, 86, 46, 255)
STAND_DARK = (74, 42, 20, 255)
STAND_LIGHT = (176, 126, 70, 255)
HINGE = (110, 70, 36, 255)

# Muted mock-photo tones (landscape, no person)
SKY_TOP = (176, 186, 190, 255)
SKY_MID = (184, 190, 188, 255)
SKY_LOW = (192, 194, 186, 255)
SKY_BOT = (198, 196, 186, 255)
SUN = (214, 198, 162, 255)
HILL_FAR = (152, 150, 132, 255)
HILL_NEAR = (122, 130, 112, 255)
GROUND = (136, 128, 108, 255)
TREE = (102, 112, 96, 255)
TRUNK = (96, 78, 52, 255)


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


def find_coeffs(dest: list[tuple[float, float]], source: list[tuple[float, float]]):
    """PIL PERSPECTIVE coeffs mapping dest pixels back to the source image."""
    matrix = []
    for (xd, yd), (xs, ys) in zip(dest, source):
        matrix.append([xd, yd, 1, 0, 0, 0, -xs * xd, -xs * yd])
        matrix.append([0, 0, 0, xd, yd, 1, -ys * xd, -ys * yd])
    a = np.array(matrix, dtype=np.float64)
    b = np.array([c for p in source for c in p], dtype=np.float64)
    return np.linalg.solve(a, b).tolist()


def px(v: float) -> int:
    return int(round(v * SCALE))


def pt(x: float, y: float) -> tuple[int, int]:
    """Final-pixel coords -> 8× canvas ints."""
    return px(x), px(y)


def poly(draw: ImageDraw.ImageDraw, pts: list[tuple[float, float]], fill) -> None:
    draw.polygon([pt(x, y) for x, y in pts], fill=fill)


def draw_mock_photo(size: int) -> Image.Image:
    """Low-poly muted landscape: sky, sun, hills, one tree. No person."""
    im = Image.new("RGBA", (size, size), SKY_BOT)
    d = ImageDraw.Draw(im)
    bands = [SKY_TOP, SKY_MID, SKY_LOW, SKY_BOT]
    for i, color in enumerate(bands):
        y0 = int(size * i / len(bands))
        y1 = int(size * (i + 1) / len(bands))
        d.rectangle([0, y0, size, y1], fill=color)
    r = int(size * 0.13)
    cx, cy = int(size * 0.74), int(size * 0.28)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=SUN)
    d.polygon(
        [
            (0, int(size * 0.62)),
            (int(size * 0.22), int(size * 0.46)),
            (int(size * 0.48), int(size * 0.58)),
            (int(size * 0.70), int(size * 0.44)),
            (size, int(size * 0.58)),
            (size, size),
            (0, size),
        ],
        fill=HILL_FAR,
    )
    d.polygon(
        [
            (0, int(size * 0.78)),
            (int(size * 0.18), int(size * 0.66)),
            (int(size * 0.40), int(size * 0.74)),
            (int(size * 0.62), int(size * 0.60)),
            (int(size * 0.86), int(size * 0.70)),
            (size, int(size * 0.66)),
            (size, size),
            (0, size),
        ],
        fill=HILL_NEAR,
    )
    d.polygon(
        [
            (0, int(size * 0.88)),
            (int(size * 0.35), int(size * 0.84)),
            (int(size * 0.7), int(size * 0.90)),
            (size, int(size * 0.86)),
            (size, size),
            (0, size),
        ],
        fill=GROUND,
    )
    trunk_x = int(size * 0.26)
    d.rectangle(
        [trunk_x - int(size * 0.025), int(size * 0.72), trunk_x + int(size * 0.025), int(size * 0.88)],
        fill=TRUNK,
    )
    d.polygon(
        [
            (trunk_x, int(size * 0.46)),
            (int(size * 0.14), int(size * 0.74)),
            (int(size * 0.38), int(size * 0.74)),
        ],
        fill=TREE,
    )
    return im


def draw_front_texture(tex: int) -> Image.Image:
    """Orthographic beveled wooden frame with the mock photo in the opening."""
    im = Image.new("RGBA", (tex, tex), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # Outer edge is the texture edge so the dest quad is the frame outline.
    thick = int(tex * 0.145)
    outer_r = int(tex * 0.055)
    inner_r = int(tex * 0.028)

    def box(inset: float) -> list[int]:
        i = int(inset)
        return [i, i, tex - i - 1, tex - i - 1]

    def rad(base: int, inset: float) -> int:
        return max(4, int(base - inset))

    d.rounded_rectangle(box(0), radius=rad(outer_r, 0), fill=DARK)
    d.rounded_rectangle(box(tex * 0.008), radius=rad(outer_r, tex * 0.008), fill=MID_DARK)
    d.rounded_rectangle(box(tex * 0.020), radius=rad(outer_r, tex * 0.020), fill=MID)
    d.rounded_rectangle(box(tex * 0.038), radius=rad(outer_r, tex * 0.038), fill=LIGHT)
    d.rounded_rectangle(box(tex * 0.058), radius=rad(outer_r, tex * 0.058), fill=MID)
    d.rounded_rectangle(box(thick - tex * 0.024), radius=rad(inner_r, -tex * 0.008), fill=MID_DARK)
    d.rounded_rectangle(box(thick - tex * 0.010), radius=rad(inner_r, -2), fill=DEEP)

    opening = box(thick)
    photo = draw_mock_photo(max(8, opening[2] - opening[0] + 1))
    photo_layer = Image.new("RGBA", (tex, tex), (0, 0, 0, 0))
    photo_layer.paste(photo, (opening[0], opening[1]))
    mask = Image.new("L", (tex, tex), 0)
    ImageDraw.Draw(mask).rounded_rectangle(opening, radius=rad(inner_r, 0), fill=255)
    im.paste(photo_layer, (0, 0), mask)

    lip = Image.new("RGBA", (tex, tex), (0, 0, 0, 0))
    ld = ImageDraw.Draw(lip)
    ld.rounded_rectangle(
        box(thick - tex * 0.010),
        radius=rad(inner_r, -2),
        outline=DEEP,
        width=max(2, int(tex * 0.008)),
    )
    im = Image.alpha_composite(im, lip)

    marks = Image.new("RGBA", (tex, tex), (0, 0, 0, 0))
    md = ImageDraw.Draw(marks)
    w = max(2, int(tex * 0.008))
    pad = int(tex * 0.006)
    x0 = y0 = pad
    x1 = y1 = tex - pad - 1
    inner = thick - int(tex * 0.004)
    for a, b in [
        ((x0, y0), (inner, inner)),
        ((x1, y0), (tex - inner, inner)),
        ((x0, y1), (inner, tex - inner)),
        ((x1, y1), (tex - inner, tex - inner)),
    ]:
        md.line([a, b], fill=DEEP, width=w)
    wood = Image.new("L", (tex, tex), 0)
    ImageDraw.Draw(wood).rounded_rectangle(box(0), radius=rad(outer_r, 0), fill=255)
    hole = Image.new("L", (tex, tex), 0)
    ImageDraw.Draw(hole).rounded_rectangle(opening, radius=rad(inner_r, 0), fill=255)
    wood_only = ImageChops.subtract(wood, hole)
    marks.putalpha(ImageChops.multiply(marks.split()[3], wood_only))
    return Image.alpha_composite(im, marks)


def quad_mask(size: int, corners: list[tuple[float, float]]) -> Image.Image:
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).polygon([pt(x, y) for x, y in corners], fill=255)
    return m


def main() -> None:
    # Screen-space layout in final pixels (512 canvas). Left edge is closer, so
    # the frame is a slight 3/4 trapezoid; the easel peeks out at the lower right.
    # TL, TR, BR, BL of the front face:
    tl, tr, br, bl = (86, 46), (412, 78), (396, 388), (74, 424)

    # Visible left-side thickness (near edge) and a sliver of the top edge.
    left_depth = 18
    top_depth = 12
    left_back_t = (tl[0] - left_depth, tl[1] - 6)
    left_back_b = (bl[0] - left_depth + 2, bl[1] - 10)
    top_back_r = (tr[0] - 8, tr[1] - top_depth)
    top_back_l = (left_back_t[0] + 4, left_back_t[1] - 2)

    # Easel stand: a wooden back strut that tucks under the bottom-right of the
    # frame and kicks out down and to the right, ending in a small foot pad.
    hinge_tl, hinge_tr = (300, 250), (348, 258)
    hinge_br, hinge_bl = (346, 286), (298, 278)
    # Visible strut: emerges from under the lower-right of the front face.
    strut_top_l, strut_top_r = (332, 360), (372, 352)
    strut_foot_l, strut_foot_r = (408, 468), (452, 448)
    # Foot pad under the strut tip.
    pad_tl, pad_tr = (400, 456), (460, 434)
    pad_br, pad_bl = (466, 452), (406, 476)

    canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(canvas)

    # Painter's order: stand and thickness first, then the front face.
    poly(d, [pad_tl, pad_tr, pad_br, pad_bl], STAND_DARK)
    # Underside edge of the strut (slight thickness).
    underside = [
        (strut_top_l[0] - 3, strut_top_l[1] + 6),
        (strut_top_r[0] - 2, strut_top_r[1] + 8),
        (strut_foot_r[0] - 2, strut_foot_r[1] + 8),
        (strut_foot_l[0] - 3, strut_foot_l[1] + 6),
    ]
    poly(d, underside, STAND_DARK)
    poly(d, [strut_top_l, strut_top_r, strut_foot_r, strut_foot_l], STAND)
    # Highlight along the upper/right edge of the strut so it reads as a plank.
    hi = [
        strut_top_r,
        ((strut_top_r[0] + strut_foot_r[0]) / 2, (strut_top_r[1] + strut_foot_r[1]) / 2),
        ((strut_top_r[0] + strut_foot_r[0]) / 2 - 6, (strut_top_r[1] + strut_foot_r[1]) / 2 + 3),
        (strut_top_r[0] - 8, strut_top_r[1] + 5),
    ]
    poly(d, hi, STAND_LIGHT)
    poly(d, [hinge_tl, hinge_tr, hinge_br, hinge_bl], HINGE)

    # Frame thickness (left + top).
    poly(d, [left_back_t, tl, bl, left_back_b], SIDE)
    poly(d, [top_back_l, top_back_r, tr, tl], MID_DARK)

    tex_size = 2048
    front = draw_front_texture(tex_size)
    dest = [tl, tr, br, bl]
    src = [(0, 0), (tex_size, 0), (tex_size, tex_size), (0, tex_size)]
    coeffs = find_coeffs([pt(*p) for p in dest], src)
    warped = front.transform((S, S), Image.Transform.PERSPECTIVE, coeffs, Image.Resampling.BICUBIC)
    # Clip to the front quad so the warp cannot leak.
    warped.putalpha(ImageChops.multiply(warped.split()[3], quad_mask(S, dest)))
    canvas = Image.alpha_composite(canvas, warped)

    # Soften the outer silhouette only.
    soft = canvas.split()[3].filter(ImageFilter.GaussianBlur(radius=SCALE * 1.4))
    canvas.putalpha(soft)

    out = keep_largest_component(canvas.resize((SIZE, SIZE), Image.Resampling.LANCZOS))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.save(OUT, "PNG")
    arr = np.array(out)
    a = arr[..., 3]
    ys, xs = np.where(a > 10)
    print(f"wrote {OUT} {out.size} {OUT.stat().st_size} bytes")
    print("bbox", int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()), "opaque", int((a > 200).sum()))


if __name__ == "__main__":
    main()
