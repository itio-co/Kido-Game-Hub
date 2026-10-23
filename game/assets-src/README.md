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
4. Optional, for camera match: `ref.mockup` (full mock-up + crop offset) and `ref.keyPoints` (named model
   corners in Blender cm) and `ref.camParams` (the first five `p` values of `cam.json`).

## Camera match (`#/editor` → **จับมุมกล้อง**, v0.2.8–0.2.9)

fSpy-style camera matching inside the editor: line the model up with the mock-up and export a camera that
`add_cam.py` / `render.py` / `import_external.py` and Three.js can use.

### วิธีใช้ (ไทย)

1. เปิด `#/editor` → กด **จับมุมกล้อง** (ต้องเป็นโมเดลที่มีภาพ mock-up)
2. เลือกภาพ **ภาพครอป** (ref ของโมเดล) หรือ **Mock-up เต็ม** (`player-room-wide.jpg`, ครอปอยู่ที่ x=368, y=540)
3. **เส้นนำสายตา**: กด **+ เส้น X** (แดง = ด้านกว้าง) **+ เส้น Y** (เขียว = ด้านลึก) **+ เส้น Z** (น้ำเงิน = แนวตั้ง)
   แล้วลากจุดปลายเส้นให้ทับขอบที่ขนานกันในภาพ แกนละอย่างน้อย 2 เส้น (มากกว่า 2 เส้นจะหาจุดลับตาแบบ least-squares)
   - เส้นประยาวต่อไปจนสุดภาพ จุดลับตา (VP) แสดงเป็นวงกลม/ลูกศรที่ขอบภาพ เส้นประสีเหลือง = เส้นขอบฟ้า
   - **วางเส้นตามกล้องปัจจุบัน** = วางเส้นตามขอบโมเดลให้เริ่มง่าย; ซูม ＋ / － / ⤢ ที่มุมภาพ, ลากพื้นหลัง = เลื่อน,
     สองนิ้ว/ล้อเมาส์ = ซูม
4. กด **คำนวณจากเส้น** → ได้มุมกล้องและเลนส์ (ติ๊ก **ล็อกเลนส์** ถ้ารู้เลนส์แล้ว)
   จุดกึ่งกลางภาพ: **กลางภาพ** (ค่าเริ่ม), **จาก 3 จุดลับตา**, หรือ **ปรับเอง/จากคู่จุด**
5. **คู่จุด**: เลือกมุมที่รู้ขนาดจากรายการ (เช่น มุมหน้าซ้ายบน สูง 55 ซม.) หรือ **+ แตะจุดบนโมเดล**
   แล้วแตะจุดเดียวกันบนภาพ
   - 2 คู่ขึ้นไป → **ตั้งระยะจากคู่จุด** (ตำแหน่ง/ขนาด)
   - 4–6 คู่ขึ้นไป → **คำนวณละเอียด** (PnP: มุม + ตำแหน่ง + เลนส์ พร้อมกัน)
   - ค่าคลาดเคลื่อนเป็น px แสดงทั้งของเส้นและคู่จุด
6. **ค่ากล้อง**: เลนส์ (มม., เซ็นเซอร์ 36 มม.), FOV, ตำแหน่ง (ซม.), การหมุน (องศา, XYZ แบบ Blender), cx/cy
   พิมพ์แก้ได้ทันที; **กลับเป็นกล้องเดิม** = ใช้ cam.json ที่มากับโมเดล; **กลับด้าน 180°** ถ้ากล้องหันผิดด้าน
7. **การแสดงผล**: ทึบ / โครงลวด / เส้นขอบ, แถบความทึบโมเดล, แถบ **เลื่อนเทียบ ก่อน|หลัง**
8. บันทึกอัตโนมัติในเครื่อง (`kido-cam:<slug>`) และ **มุม Mock-up** จะใช้กล้องที่จับไว้
9. **ดาวน์โหลด cam.json** (รูปแบบเดียวกับ `blender/cam.json`) หรือ **ดาวน์โหลดค่าทั้งหมด** (Blender + Three.js)
10. **แม่เหล็กเส้น** (v0.2.9, ปุ่ม 🧲 ที่มุมภาพหรือในแผง): ลากปลายเส้น (หรือจับกลางเส้นลากทั้งเส้น) ไปใกล้เส้น
    **แกนอื่น** จะดูดติด ตามลำดับ: ปลายเส้นนั้น → จุดที่เส้นที่ลากต่อออกไปตัดเส้นนั้น → จุดใกล้สุดบนเส้น
    (ระยะดูด ~12 px เมาส์ / ~22 px นิ้ว ตามจอ ไม่ขึ้นกับการซูม) มีวงเหลือง + กากบาทบอกจุดที่ดูด
    - ปลายที่ดูดติดปลายอีกเส้น = **เชื่อมเป็นมุมเดียว** (กรอบเหลืองประ) ลากไปด้วยกัน; **กดค้าง** ที่มุม = แยก,
      หรือปุ่ม **แยกมุมที่เชื่อม** (เส้นที่เลือก); กด **Alt** ค้างขณะลาก = ปิดแม่เหล็กชั่วคราว
    - **วางเส้นตามกล้องปัจจุบัน** จะเชื่อมมุมกล่องที่ใช้ร่วมกันให้เลย; **↶ ย้อน / ↷ ทำซ้ำ** (ในแผงหรือหัวจอ,
      Ctrl+Z / Ctrl+Y) ย้อนการแก้เส้นได้
    - ขณะลากมี **แว่นขยาย** (~3.5×) แสดงภาพ + โมเดล + เส้นรอบจุด พร้อมกากบาทตรงจุดที่ลาก (บนมือถืออยู่เหนือนิ้ว)
11. **โหมดเทียบความต่าง**: ขณะลากเส้น/จุด กล้องจะคำนวณใหม่ทุกเฟรม และโมเดลแสดงแบบ difference กับภาพ
    (ตรงกัน = มืด, เพี้ยน = เรืองแสง) เลือก **ขณะลาก** (ค่าเริ่ม) / **เปิดตลอด** / **ปิด**;
    ถ้าคำนวณไม่ได้จะใช้กล้องล่าสุดและขึ้นป้ายเล็ก ๆ ที่มุมภาพ
12. **จุดลับตารวม** (v0.2.9): วาดเส้นแกนละกี่เส้นก็ได้ ระบบหา **จุดลับตาจุดเดียวต่อแกน** จากทุกเส้น
    (least-squares แบบทนเส้นเพี้ยน) และใช้จุดนั้นคำนวณกล้อง
    - วงกลมสีแกน = จุดลับตา (ถ้าอยู่นอกภาพเป็นลูกศรที่ขอบภาพ + ระยะ px, ∞ = เส้นขนานกัน) เส้นจาง ๆ จากทุกเส้นวิ่งไปที่จุดนั้น
    - ขอบเส้นบอกว่าเส้นเพี้ยนจากจุดลับตากี่องศา: **เขียว < 0.5°**, **เหลือง 0.5–2°**, **แดง > 2°**
      (ตัวเลของศาข้างเส้น, ⚠ + ขอบประ = เส้นเพี้ยนมากจนไม่นำมาคิด) แผงแสดง RMS (องศา) ของแต่ละแกนและจำนวนเส้นเพี้ยน
    - **🎯 รวมจุดลับตา** (หรือ **รวม X / Y / Z** ทีละแกน) = หมุนทุกเส้นให้ผ่านจุดลับตาเดียวกัน โดยคงความยาวและจุดกึ่งกลาง;
      เส้นที่ปลายข้างหนึ่งเชื่อมมุมอยู่จะหมุนรอบมุมนั้นแทน (มุมไม่ขยับ); เส้นที่ปลายทั้งสองเชื่อมมุมจะข้ามและแจ้ง
      ให้แยกมุมก่อน; ย้อนได้ด้วย ↶
    - **🔒 ล็อกเข้าจุดลับตา**: เมื่อเปิด ลากปลายเส้นของแกนที่มี 3 เส้นขึ้นไป เส้นจะชี้ไปจุดลับตาของเส้น**อื่น**เสมอ
      (ปลายที่ลากเลื่อนไปตามเส้นประ) แม่เหล็กยังดูดมุม/จุดตัดที่อยู่บนเส้นนั้นได้

### Notes (English)

- Coordinates: world = Blender cm (Z up, front = −Y). Image points are crop ("ref") pixels; the full mock-up is
  the same space shifted by the crop offset, so the principal point of the crop centre (126, 142) is
  (494, 682) on `player-room-wide.jpg` (−8, +100 px from that image's centre).
- `<slug>-cam.json` = `{p: [W, D, T, O, L, f, rvec(3), tvec(3)], R, C, IW, IH, H, cx, cy}` — OpenCV
  `x = K R (X − C)`, `C` in cm, `f` in crop px. Copy it over `assets-src/<item>/blender/cam.json` and run
  `add_cam.py` / `render.py`. `cx`/`cy` are new and optional: the scripts turn them into Blender lens shift
  (`shift_x = (IW/2 − cx)/IW`, `shift_y = (cy − IH/2)/IW`; Blender's shift is in units of the fitted sensor
  side, i.e. the width with `sensor_fit = HORIZONTAL` — checked against `world_to_camera_view` in Blender 4.5).
- `<slug>-camera-match.json` (`kido-camera-match/1`) also has `blender` (location m, XYZ Euler, lens, shift),
  `three` (hFOV, position, quaternion in the game's Y-up metres + a snippet), `mockup` (lens / hFOV / shift
  for the full mock-up), residuals, and the lines and point pairs.
- Snapping (v0.2.9): `src/lib/editor/guideSnap.ts` (pure; `npm test` in `game/` runs `tests/guideSnap.test.ts`
  through `tsc` + node, no test framework needed). Lines may carry optional `links: {a?, b?}` joint ids — endpoints
  with the same id are one shared corner. Older saved/exported line data without `links` loads unchanged.
- Live solve while dragging: guide-line drags re-run the line solve, point drags re-run PnP (≥4 pairs) or position
  (≥2), at most once per animation frame, always starting from the camera at drag start. The difference view is
  CSS `mix-blend-mode: difference` of the WebGL canvas over the mock-up `<img>`; the loupe copies the same patch of
  the (preserveDrawingBuffer) canvas into a small 2D canvas with the same blend. Line undo restores lines only, not
  the camera — press **คำนวณจากเส้น** again after an undo.
- VP consolidation (v0.2.9, `src/lib/editor/vpFit.ts`, pure, tested in `tests/vpFit.test.ts`): each axis gets one
  VP from all its lines — homogeneous lines `l = a × b` in a normalised frame (centre = principal point, scale =
  max(W, H)), smallest eigenvector of `Σ wᵢ lᵢ lᵢᵀ` (works for VPs at infinity: w → 0), then IRLS with Huber
  weights on the angular residual (δ = 1°) and rejection of one gross outlier per pass (> max(2°, 3 × median),
  keeping ≥ 3 lines). The residual of a line is the angle between it and the direction from its midpoint to the VP.
  Line colours: green < 0.5°, amber 0.5–2°, red > 2°. **รวมจุดลับตา** rotates each line about its midpoint (same
  length) onto the VP; a line with one linked corner pivots about that corner so joints never move; a line with
  both ends linked is skipped and reported. It is one undo step. **ล็อกเข้าจุดลับตา** (saved with the lines as
  `lockVp`) constrains an endpoint drag to the ray from the fixed end to the VP fitted from the *other* lines of
  that axis (needs ≥ 2 others); endpoint/intersection snaps that lie on that ray still win, on-segment snaps are off.
- Solver: VPs from the guide lines (the consolidated per-axis VPs above), focal length from two
  orthogonal VPs, rotation from the VP directions (signs from the current camera), then Levenberg–Marquardt on
  line-to-VP and point reprojection error. Position comes from point pairs (linear + LM); with no pairs the
  model origin stays where the previous camera put it.
- Accuracy on the nightstand (known camera 162.1 mm / 12.7° hFOV, rot 73.6°, 0.5°, 26.9°, pos 151.7, −304.1,
  136.5 cm): synthetic lines with 0.5 px noise → 160 mm and < 0.1°; on the AI mock-up, 11 hand-placed lines alone
  are ill-conditioned (the art is not perfectly perspective-consistent and a 162 mm lens puts the VPs ~2000 px
  away, so the free lens drifts to ~840 mm); with the lens locked the rotation is within ~1.4–1.9°; 12 point
  pairs + **คำนวณละเอียด** give ≈158 mm, rotation within 0.2° and position within ~7 cm. For long-lens shots,
  lock the lens or use point pairs.
