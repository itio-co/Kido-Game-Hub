#!/usr/bin/env python3
"""Build photo-placement.jpg from the player-room backdrop and the shelf overlay.

The page matches the 720x1280 three-strip ending comics. Every panel is a crop
of the existing room art (same camera, objects, and colors) with the existing
keepsake-shelf photo overlay; the room is never regenerated.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
ROOM = ROOT / 'public/img/player-room-wide.jpg'
OVERLAY = ROOT / 'public/img/decor/keepsake-shelf-grandpa-photo.png'
ENDING = ROOT / 'public/img/ending-01.jpg'
OUT = ROOT / 'public/img/photo-placement.jpg'

W, H = 720, 1280
# Same strip breaks as ending-01.jpg (soft cream gutters live in these rows).
STRIPS = [(0, 422), (428, 850), (856, 1280)]
GUTTERS = [(422, 428), (850, 856)]
# Full-width establishing shot: window, calendar, empty shelf, bed, nightstand.
P1 = (0, 220, 720, 642)
# Shared closer crop for the placement beat and the seated result.
P23 = (160, 160, 720, 499)
# Lift the frame off the shelf in panel 2 so it reads as being set down.
LIFT = 52


def cover_crop(src: Image.Image, window: tuple[int, int, int, int], size: tuple[int, int]) -> Image.Image:
    x0, y0, x1, y1 = window
    crop = src.crop((x0, y0, x1, y1)).convert('RGBA')
    tw, th = size
    scale = max(tw / crop.width, th / crop.height)
    nw, nh = max(1, round(crop.width * scale)), max(1, round(crop.height * scale))
    resized = crop.resize((nw, nh), Image.Resampling.LANCZOS)
    left, top = (nw - tw) // 2, (nh - th) // 2
    return resized.crop((left, top, left + tw, top + th))


def with_photo(room: Image.Image, overlay: Image.Image, lift: int = 0) -> Image.Image:
    base = room.convert('RGBA')
    layer = Image.new('RGBA', base.size, (0, 0, 0, 0))
    if lift:
        # Soft contact shadow still on the shelf while the frame is in the air.
        shadow = Image.new('RGBA', base.size, (0, 0, 0, 0))
        sh = overlay.split()[-1].point(lambda a: int(a * 0.35) if a else 0)
        shadow.putalpha(sh)
        shadow = shadow.filter(ImageFilter.GaussianBlur(radius=6))
        layer.alpha_composite(shadow, (6, 4))
        layer.alpha_composite(overlay, (0, -lift))
    else:
        layer.alpha_composite(overlay)
    return Image.alpha_composite(base, layer)


def main() -> None:
    room = Image.open(ROOM).convert('RGBA')
    overlay = Image.open(OVERLAY).convert('RGBA')
    ending = Image.open(ENDING).convert('RGB')
    empty = room
    hovering = with_photo(room, overlay, LIFT)
    seated = with_photo(room, overlay, 0)

    page = Image.new('RGB', (W, H), (248, 244, 236))
    sources = [(empty, P1), (hovering, P23), (seated, P23)]
    for (src, window), (top, bottom) in zip(sources, STRIPS):
        page.paste(cover_crop(src, window, (W, bottom - top)).convert('RGB'), (0, top))
    for top, bottom in GUTTERS:
        page.paste(ending.crop((0, top, W, bottom)), (0, top))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    page.save(OUT, 'JPEG', quality=92, subsampling=0, optimize=True)
    print(f'wrote {OUT} {OUT.stat().st_size} bytes')


if __name__ == '__main__':
    main()
