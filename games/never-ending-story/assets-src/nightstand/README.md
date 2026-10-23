# Nightstand: `player-room/nightstand`

ตู้ข้างเตียง (`3a07eebc-03c1-421c-87a7-7e6d0037ceae`). A self-contained package: everything needed to rebuild
the model in Blender, or to send the reference to an image-to-3D tool and check the result.
Metadata (dimensions, colours, crop box, camera, notes) is in [`asset.json`](asset.json).

```
nightstand/
├── asset.json        id / kind / title / slug, size in cm, colours, status, source crop, camera, notes
├── prompt.md         prompt + settings for Meshy / Tripo / Rodin / Hunyuan3D / TRELLIS, Thai how-to
├── ref/              reference images
│   ├── nightstand-ref.png               original crop from game/public/img/player-room-wide.jpg (252×284)
│   ├── nightstand-isolated.png          same crop, background removed (RGBA)
│   ├── nightstand-isolated-1024.png     1024² square, transparent, padded — input for image-to-3D
│   ├── nightstand-isolated-1024-white.png  the same on white
│   ├── nightstand-ref-mask.png          refined silhouette (GrabCut, 4×)
│   ├── nightstand-ref-mask-rembg.png    rembg silhouette (independent; misses stretchers)
│   └── make_isolated.py                 how the isolated images and refined mask were made
├── blender/          Blender 4.5 source
│   ├── nightstand-master.blend   master + low-poly + MatchCam (ref as camera background) + Key sun
│   ├── dims.json, cam.json       part dimensions (cm) and solved camera (OpenCV, cm)
│   ├── build_all.sh              build_master.py → finalize.py → add_cam.py
│   ├── render_all.sh             render.py → compare.py → make_previews.py
│   └── solve_cam.py              camera + dimension solve from 12 hand-picked landmarks
├── export/           nightstand-master.glb (948 tris, 2048² texture), nightstand.glb (212 tris), texture
├── compare/          side-by-side / overlay vs ref and 4-angle turntables for master and low-poly
└── external/         drop results from outside tools here (see external/README.md)
```

## Rebuild

```sh
cd game/assets-src/nightstand/blender
BLENDER=/path/to/blender ./build_all.sh                    # → ../export/*.glb, .blend
cp ../export/nightstand.glb ../export/nightstand-master.glb ../../../public/models/
BLENDER=/path/to/blender PYTHON=python3 ./render_all.sh    # → ../compare (needs pillow + numpy)
```

`ref/make_isolated.py` needs opencv + pillow + numpy and reads `blender/render/master_000.png`
(made by `render_all.sh`) as a shape prior, so run it after a render.

## Models

| | triangles | material |
| --- | --- | --- |
| `export/nightstand.glb` | 212 | flat-shaded vertex colours (top #e0995a, front #c47d42, side #a8652f), no texture |
| `export/nightstand-master.glb` | 948 | bevelled, smooth-by-angle, 2048² baked wood base colour |

Both GLBs have a root node (`Nightstand_Master` / `Nightstand_LowPoly`) with one mesh node per part (15:
`TopSlab`, `Leg_LF/RF/LB/RB`, `Apron_L/R/B`, `Rail_Top/Bot`, `Drawer_Face`, `Drawer_Cavity`, `Knob`,
`Stretcher_L/R`), origins at each part's centre, so `#/editor` can pick and move parts (since v0.2.5;
same triangles, texture and vertex colours as the earlier single mesh). The `.blend` keeps the joined meshes.

Size 61 × 40.5 × 55 cm (W × D × H), origin at the floor centre, front = −Y in Blender / +Z in glTF.
Width comes from the camera solve against the 55 cm height.

## Matched camera

Image 252 × 284 px, focal 1134.8 px, principal point at the centre.

- Blender: lens **162.12 mm**, sensor 36 mm (horizontal fit), location (1.5167, −3.0410, 1.3648) m,
  rotation XYZ (73.63°, 0.54°, 26.89°). HFOV 12.67°, VFOV 14.26° at 252:284.
- Three.js (Y-up, `(x, y, z)_three = (x, z, −y)_blender`): position (1.51665, 1.36477, 3.04096),
  quaternion (x −0.139571, y 0.230806, z 0.028608, w 0.962512); vertical FOV
  `2·atan(tan(12.67°/2) / aspect)`. See `game/src/lib/nightstandStage.ts`.
- Lighting: sun towards (−1.3, −0.7, 1.9) i.e. from the upper left, colour (1, 0.86, 0.7), strength 4;
  world (1, 0.85, 0.7) × 0.35; view transform Standard.

## Known differences from the reference

- The painted lighter band on the top is not modelled.
- In the ref the side apron looks deeper and the side stretcher sits a little differently; heights are estimates.
- Silhouette IoU (master / low-poly): 0.743 / 0.740 vs the rembg mask (it misses the stretchers and back legs);
  0.925 / 0.923 vs the refined mask, which is biased because that mask used the earlier master render as a prior.
- v0.2.4: side stretchers enlarged from 3 × 5 cm to 4.5 × 7 cm (z 11–18 cm); the drawer-bottom board that showed
  under the back apron in the orbit view was removed. Before: IoU 0.748 / 0.745 (rembg), 0.922 / 0.921 (refined).
- v0.2.5: GLBs split into one node per part for the 3D editor; geometry unchanged (IoU unchanged).

## Editing

Small fixes can be made in the game at `#/editor` and brought back with `import_external.py --fit none --yaw 0`;
see `../README.md` → 3D editor.
