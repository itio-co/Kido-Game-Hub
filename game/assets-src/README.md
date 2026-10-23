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

## 3D editor (`#/editor`)

For small fixes without Blender: move, resize, rotate, duplicate, hide or delete parts and check them against the
mock-up. Open the game at `#/editor` (or the **✎ แก้โมเดลนี้** button in `#/showcase`).

### วิธีใช้ (ไทย)

1. เปิด `#/editor` → เลือกโมเดลที่ช่อง **โมเดล** (Low-poly สำหรับเกม หรือ Master)
2. แตะชิ้นส่วนในภาพ 3D หรือแตะชื่อในรายการ **ชิ้นส่วน** → ชิ้นที่เลือกจะมีกรอบสีเหลือง
3. แก้ได้ 2 แบบ
   - ลากลูกศร/วงแหวนบนตัวโมเดล: ปุ่ม **ย้าย / หมุน / ขนาด** ด้านล่างภาพ
   - พิมพ์ตัวเลข หรือกด − / + : ตำแหน่งและขนาดเป็น **ซม.** การหมุนเป็น **องศา**
4. **แม่เหล็ก เปิด** = ขยับทีละ 0.5 ซม. / หมุนทีละ 15° (กดอีกครั้งเพื่อปิด)
5. **ทำสำเนา / ซ่อน / ลบ** ชิ้นที่เลือก; ชิ้นที่ลบแล้วกด **คืน** ในรายการได้
6. **↶ ย้อน / ↷ ทำต่อ** (คีย์บอร์ด Ctrl+Z / Ctrl+Shift+Z หรือ Ctrl+Y)
7. **มุม Mock-up** = กล้องเดียวกับภาพ mock-up พร้อมภาพซ้อน ปรับความเข้มด้วยแถบเลื่อน;
   **หมุนดูอิสระ** = ลากหมุน/ซูมได้
8. งานบันทึกในเครื่องนี้อัตโนมัติ (localStorage); **ล้างการแก้ทั้งหมด** เพื่อเริ่มใหม่
9. **ดาวน์โหลด GLB ที่แก้แล้ว** และ **ดาวน์โหลดรายการแก้ (JSON)**

เอากลับเข้าโปรเจกต์:

- คัดลอก GLB ไปไว้ที่ `game/assets-src/<item>/external/editor/model.glb` แล้วรัน
  `import_external.py` (คำสั่งด้านล่าง) เพื่อเรนเดอร์เทียบกับ ref และดูค่า IoU
- ถ้าจะให้แก้ถาวรใน Blender: ใช้ค่า `blenderBoxCm.after` ในไฟล์ JSON แก้ `blender/dims.json` /
  `build_master.py` แล้ว build ใหม่ (ดูด้านล่าง)
- ถ้าจะใช้ GLB ตรงๆ ในเกม: คัดลอกไปทับ `game/public/models/<slug>.glb`

### How to use (English)

1. Open `#/editor`, pick the model (low-poly = in-game, or master).
2. Tap a part in the viewport or in the part list; the selection gets a yellow box.
3. Edit with the gizmo (**ย้าย** move / **หมุน** rotate / **ขนาด** scale) or type numbers: position and size in cm,
   rotation in degrees. Sizes are the part's real size; the GLB stores them as node scale.
4. **แม่เหล็ก** (snap) = 0.5 cm / 15° steps. Undo / redo: header buttons, Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y.
   Keys W/G move, E/R rotate, S scale, Delete removes the part, Esc deselects.
5. **มุม Mock-up** uses the matched camera with the reference over the model (opacity slider);
   **หมุนดูอิสระ** is free orbit.
6. Edits autosave per model in localStorage (`kido-editor:<slug>:<variant>`); **ล้างการแก้ทั้งหมด** resets.
7. Export:
   - **GLB**: binary glTF of the edited model, one node per part. Deleted parts are dropped, hidden parts are
     exported (hiding is only for working). A recoloured part gets a flat colour (no texture / vertex colours).
   - **JSON** (`kido-model-edits/1`): per part `changed`, `deleted`, `copyOf`, `positionDeltaCm`, `rotationDeg`,
     `scale`, `sizeCm.before/after`, `color`, and `blenderBoxCm.before/after` = the part's axis-aligned box in
     Blender coordinates and cm (X width, Y depth with front = −Y, Z up), the same numbers `box(name, x0, x1, y0,
     y1, z0, z1)` takes in `build_master.py`. `summary` lists deleted / added / changed parts.

Bringing it back:

```sh
mkdir -p game/assets-src/<item>/external/editor
cp ~/Downloads/<item>-lowpoly-edited.glb game/assets-src/<item>/external/editor/model.glb
blender -b --python game/assets-src/tools/import_external.py -- \
    game/assets-src/<item> game/assets-src/<item>/external/editor/model.glb --fit none --yaw 0
```

Use `--fit none --yaw 0`: the editor keeps real size and orientation, while the defaults (`--fit box`,
`--yaw auto`) would stretch it back to `asset.json` and may turn it. The script joins the parts, renders at the
matched camera and writes `external/editor/compare/` (side-by-side, overlay, IoU in `model-report.json`).
To keep the change in the Blender source, copy the `blenderBoxCm.after` numbers into `blender/dims.json` /
`build_master.py`, rebuild (`build_all.sh`, `render_all.sh`) and copy the GLBs to `game/public/models/`.
Rotations and recolours are not in `dims.json`; port them by hand.

### Adding an asset to the editor

1. Export GLBs with **one named node per part** (see `nightstand/blender/finalize.py`, `split_parts`): a root
   empty, then a mesh per part with its origin at the part centre. A single joined mesh shows as one part.
2. Add an entry to `SHOWCASE_ASSETS` in `game/src/lib/showcaseAssets.ts` (slug, title, variant URLs, `ref` image +
   matched camera for the mock-up view, orbit framing). The editor's model menu reads that list.
3. Optional: Thai part names in `game/src/lib/editor/partLabels.ts`.
