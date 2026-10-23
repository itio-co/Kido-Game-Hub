# Hunyuan3D-2 result

`model.glb`: image-to-3D from `ref/nightstand-isolated-1024.png` with the prompt.md settings, cleaned up and
coloured. 8,100 triangles, flat vertex colours from `asset.json` (top / front / side / back / bottom), no texture,
61 × 43 × 55 cm (incl. knob), origin at the floor centre, front = glTF +Z. Silhouette IoU **0.937** (refined mask) /
**0.767** (rembg mask), vs 0.92 / 0.75 for the Blender master. Previews in `preview/`.

## How it was made

1. `python generate.py ref.png out 7 42 2025 99`: public `tencent/Hunyuan3D-2` Space, shape only (the
   anonymous ZeroGPU quota does not cover texturing). Seed **99** had the fewest made-up parts at the back;
   all four seeds score IoU ≈ 0.87 before clean-up. Raw output (~900k faces, 14 MB) is not committed.
2. `blender -b --python decimate.py -- seed99.glb s99-10k.glb 10000`
3. `blender -b --python ../../../tools/import_external.py -- ../.. s99-10k.glb`: upright, yaw 0, box fit.
4. `blender -b --python finish.py -- compare/s99-10k-normalised.glb model.glb`: drop loose bits, keep the
   right (+X) half and mirror it (the left side, hidden in the ref, came out as a blob), flat palette colours.
5. Import check again on `model.glb` → `preview/`.

## Known issues

- Legs and stretchers are slightly wobbly / tapered (generated geometry, not clean boxes).
- The back has an apron like the front; the far side is a guess.
- Not a true low-poly topology: 8k triangles of decimated mesh, vs 224 for `export/nightstand.glb`.
