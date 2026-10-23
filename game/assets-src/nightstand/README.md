# Nightstand (source assets)

Source for `game/public/models/nightstand.glb` (low-poly, used in-game) and
`game/public/models/nightstand-master.glb` (detailed master). Built by script in
Blender 4.5 LTS from `nightstand-ref.png` (the same crop as `public/showcase/nightstand-ref.png`).

| file | what |
| --- | --- |
| `nightstand-master.blend` | master + low-poly + `MatchCam` (ref as camera background) + `Key` sun |
| `nightstand-master_basecolor.png` | 2048² baked wood albedo used by the master GLB |
| `dims.json` | measured dimensions (cm) and colours |
| `cam.json` | solved camera (OpenCV convention, cm) |
| `solve_cam.py` | camera + dimension solve from 12 hand-picked landmarks (numpy, scipy, opencv) |
| `build_master.py` → `finalize.py` → `add_cam.py` | Blender build: parts, bake, GLB export, matched camera |
| `render.py`, `compare.py`, `make_previews.py` | matched renders, side-by-side / overlay vs ref, turntables |
| `nightstand-ref-mask.png` | rembg (isnet-general-use) silhouette of the ref, for the IoU check |

## Rebuild

```sh
cd game/assets-src/nightstand
BLENDER=/path/to/blender ./build_all.sh       # writes nightstand-master.glb, nightstand.glb, .blend
cp nightstand.glb nightstand-master.glb ../../public/models/
BLENDER=/path/to/blender PYTHON=python3 ./render_all.sh   # optional: renders + comparisons (pillow, numpy)
```

## Models

| | triangles | material |
| --- | --- | --- |
| `nightstand.glb` | 224 | flat-shaded vertex colours (top #e0995a, front #c47d42, side #a8652f), no textures |
| `nightstand-master.glb` | 960 | bevelled, smooth-by-angle, 2048² baked wood base colour |

Size: 61 × 40.5 × 55 cm (W × D × H), origin at the floor centre, front = −Y in Blender / +Z in glTF.
Width comes from the camera solve against the 55 cm height; it is wider than the 50 cm first guessed.

## Matched camera

Image 252 × 284 px, focal 1134.8 px, principal point at the centre.

- Blender: lens **162.12 mm**, sensor 36 mm (horizontal fit), location (1.5167, −3.0410, 1.3648) m,
  rotation XYZ (73.63°, 0.54°, 26.89°). HFOV 12.67°, VFOV 14.26° at 252:284.
- Three.js (Y-up, `(x, y, z)_three = (x, z, −y)_blender`): position (1.51665, 1.36477, 3.04096),
  quaternion (x −0.139571, y 0.230806, z 0.028608, w 0.962512); vertical FOV
  `2·atan(tan(12.67°/2) / aspect)` so the horizontal framing matches the crop. See `src/lib/nightstandStage.ts`.

Silhouette IoU vs the rembg mask is ~0.75; most of the gap is the mask (it misses the stretchers).
Not modelled: the painted plank band on the top. Side stretcher height is estimated.
