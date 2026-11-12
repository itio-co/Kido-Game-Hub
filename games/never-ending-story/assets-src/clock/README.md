# Wall clock: `flow/living-room/clock`

A first editable 3D interpretation of the eight-sided wooden clock above the left
kitchen door in `public/img/living-wide.jpg`. It uses the existing clock hotspot's
ID, not a new story object. The living-room game screen is still a 2D image; these
models are available in the **3D editor** model menu, not substituted into that scene.

## Open and edit

Open `#/editor` and choose **นาฬิกาแขวน**. Both **Low-poly (เกม)** and **Master** have
13 editable parts: eight mitred frame segments, a plain case back, a recessed ivory
dial, two hands and an axle cap. The hands' origins are at the axle, so rotating a
hand around its front-facing local Z axis changes the displayed time without moving
the pivot. The default pose is 2:00, as in the reference. No numerals or invented
hour markers were added.

- Low-poly: 324 triangles, texture-free materials, about 33 KB.
- Master: 2,068 triangles, small bevels, texture-free materials, about 127 KB.
- Source: `blender/clock-master.blend`, with separate LowPoly and Master collections,
  a matched camera, lighting, and a packed reference image. Master is visible by
  default. Unhide the LowPoly collection's objects to inspect them in Blender.
- GLBs: `export/clock.glb` and `export/clock-master.glb`; byte-identical copies ship
  in `public/models/`.
- The editor's normal draft/undo/JSON/GLB workflow and dev-server save API work with
  this asset's `assets-src/clock/editor/` folder. No story IDs are regenerated.

## Rebuild

From `games/never-ending-story`:

```sh
# Optional: recreate the exact source crop and approximate camera pose.
# This uses the checked-in image and requires Pillow, NumPy and SciPy.
python3 assets-src/clock/blender/solve_cam.py

# Requires Blender 4.3+; no external assets, plugins, or network calls.
blender -b --python assets-src/clock/blender/build.py -- --render

# Load actual runtime GLBs through Three.js and verify the model contract.
node tests/clockAsset.test.mjs
```

The build writes the `.blend`, both export GLBs, their runtime copies and
`export/build-report.json`. With `--render`, it also writes matched-camera, front,
three-quarter and rear PNGs to `compare/`. To regenerate the reference comparison:

```sh
python3 assets-src/clock/blender/compare.py
```

`dims.json` is the size/time source; `build.py` is the geometry/material source.
Changing the camera solve requires copying its `three` pose and landmarks into the
clock entry in `src/lib/showcaseAssets.ts`. The regression test checks those values.

## Reference and uncertainty

The 96 × 108 pixel crop is copied exactly from `(48, 108)` in the existing
720 × 1280 living-room mock-up. It includes wall background and a sliver of door
trim; neither is part of the model. There is no new third-party model, generated
reference, texture download or external service. Source hashes and identity are
recorded in `asset.json`.

38 × 5.4 × 42 cm (W × D × H) is an **artist estimate**, not a real measurement.
The eight manually picked outer-bevel corners yield approximately **1.45 px RMS**
with an assumed 220 px focal length. This is an approximate object-view camera,
not a calibrated reconstruction of the entire room. The model has real thickness
and a closed back, but the hidden case back is inferred. Grain, glass, mounting
hardware and a working clock mechanism are not modeled. Lighting and shadow in
the small painted reference are not baked into the model; studio/editor colors
will look different. The comparison images are visual QA, not a claim of exact
pixel reproduction.

Conventions match the nightstand: metres in Blender/GLB, centimetres in metadata;
Blender Z-up/front −Y → glTF Y-up/front +Z. Origin is at the bottom centre of the
case. Clock hands are separate meshes, not animated automatically.
