# Asset sources

Source packages for 3D assets. One folder per asset, named after the last part of its slug
(`player-room/nightstand` → `nightstand/`). Each folder is self-contained, so it can be zipped and
taken to an external tool (Meshy, Tripo, Rodin, Hunyuan3D, TRELLIS, Blender) and brought back.
Runtime files go to `game/public/models/`; nothing in `assets-src/` is shipped.

## Layout (copy this for new assets: bed, window, door…)

```
assets-src/
├── README.md                 this file
├── tools/
│   └── import_external.py    normalise + render + compare an external model (Blender headless)
└── <slug>/
    ├── README.md             what it is, how to rebuild, known differences
    ├── asset.json            metadata (below)
    ├── prompt.md             image-to-3D prompt, exclusions, per-tool settings, Thai how-to
    ├── ref/                  <slug>-ref.png (crop), <slug>-isolated.png (transparent),
    │                         <slug>-isolated-1024.png (+ -white), <slug>-ref-mask.png, scripts that made them
    ├── blender/              <slug>-master.blend, build/render scripts, dims.json, cam.json
    ├── export/               <slug>-master.glb, <slug>.glb (low-poly, in-game), textures
    ├── compare/              side-by-side-*.png, overlay-*.png, turntable-*.png vs the ref
    └── external/             README.md + one folder per tool (external/<tool>/model.glb)
```

## `asset.json`

Required (every entity has `id`, `kind`, `title`, `slug`, matching `game/public/data/*.json`):

| key | |
| --- | --- |
| `id`, `kind`, `title`, `slug` | same as the entity in the room data (`title` in Thai; `titleEn` optional) |
| `status` | `ref-only` → `modelled` → `in-game` (plus `statusNotes`) |
| `dimensionsCm` | `{ width, depth, height }` real size in cm. Width = X, depth = Y (front = −Y), height = Z in Blender |
| `colors` | named hex colours used by the low-poly |
| `source` | `mockup` path, `mockupSize`, `cropBox { x, y, width, height }` in mock-up pixels |
| `ref` | paths to `crop`, `isolated`, `isolatedSquare`, `mask` (relative to the asset folder) |
| `camera` | `file` (`blender/cam.json`) and the Blender / Three.js values |
| `exports` | GLB paths, triangle counts, textures |
| `notes` | what is **not** part of the asset in the crop, what is not modelled, known mismatches |

`tools/import_external.py` reads `dimensionsCm`, `ref.crop`, `ref.mask`, `ref.maskRembg` and `blender/cam.json`
(OpenCV convention: `R`, `C` in cm, `p[5]` = focal in px, `IW`, `IH`).

## Conventions

- Units: cm in JSON, metres in Blender/GLB. Origin at the floor centre of the object, upright.
- Front faces the camera: −Y in Blender, +Z in glTF / Three.js.
- Low-poly: flat-shaded vertex colours, no textures. Master: any detail, one baked base-colour texture.
- `compare/` images are made at the matched camera, so they line up pixel for pixel with `ref/<slug>-ref.png`.
- Generated scratch (`blender/render/`, `external/**/compare/`, `*.blend1`) is git-ignored.

## Checking an external model

```sh
blender -b --python game/assets-src/tools/import_external.py -- game/assets-src/<slug> path/to/model.glb
```

See `nightstand/external/README.md` for the options and outputs.
