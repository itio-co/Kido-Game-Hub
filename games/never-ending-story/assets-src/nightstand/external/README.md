# External results

Put models made outside this repo (Meshy, Tripo, Rodin, Hunyuan3D, TRELLIS, Blender by hand…) here,
one folder per tool or attempt:

```
external/
├── meshy/model.glb
├── tripo/model.glb
├── rodin/model.glb
├── hunyuan3d/model.glb
├── trellis/model.glb
└── blender/model.glb
```

GLB, glTF, OBJ, FBX, PLY and STL are accepted (for OBJ keep the .mtl and textures next to it).
Inputs and settings are in [`../prompt.md`](../prompt.md).

## Check a result

From the repo root, with Blender 4.x:

```sh
blender -b --python game/assets-src/tools/import_external.py -- \
    game/assets-src/nightstand game/assets-src/nightstand/external/meshy/model.glb
```

This:

1. imports the model, joins all meshes and drops cameras/lights;
2. applies `--rot X,Y,Z` if given (upright is **not** detected: if the render shows it lying down or upside
   down, rerun with e.g. `--rot 90,0,0` or `--rot -90,0,0`), then picks the turn around the vertical axis
   with the best silhouette match (`--yaw auto`, or give degrees). Front vs back can be close: check
   `model-yaw-candidates.png`; the report says `"yawAmbiguous": true` when the top two are within 0.015 IoU;
3. scales it to the bounding box in `asset.json` (61 × 43 × 55 cm including the knob; `--fit height` keeps its proportions,
   `--fit none` keeps the size as is), centres it and puts the origin on the floor;
4. renders it with Cycles at the matched camera and lighting from `blender/cam.json`;
5. writes to `external/meshy/compare/`:
   - `model-normalised.glb`: the fixed model, ready to copy to `game/public/models/`
   - `model-render.png`, `model-side-by-side.png`, `model-overlay.png` (cyan = model outline), `model-turntable.png`,
     `model-yaw-candidates.png`
   - `model-report.json`: chosen yaw, scale, triangles, silhouette IoU vs `ref/nightstand-ref-mask.png`
     and `ref/nightstand-ref-mask-rembg.png`

`compare/` folders are git-ignored; commit only the model files you want to keep.
Tested on the master GLB turned 90°, scaled ×2.3 and moved: it recovered the pose and size exactly.
For reference, the Blender master scores IoU ≈ 0.925 (refined mask) / 0.743 (rembg mask).
