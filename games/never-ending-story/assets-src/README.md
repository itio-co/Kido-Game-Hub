# Asset sources

Source packages for 3D assets. One folder per asset, named after the last part of its slug
(`player-room/nightstand` → `nightstand/`). Each folder is self-contained, so it can be zipped and
taken to an external tool (Meshy, Tripo, Rodin, Hunyuan3D, TRELLIS, Blender) and brought back.
Runtime files go to `games/never-ending-story/public/models/`; nothing in `assets-src/` is shipped.

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

Required (every entity has `id`, `kind`, `title`, `slug`, matching `games/never-ending-story/public/data/*.json`):

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
blender -b --python games/never-ending-story/assets-src/tools/import_external.py -- games/never-ending-story/assets-src/<slug> path/to/model.glb
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

- คัดลอก GLB ไปไว้ที่ `games/never-ending-story/assets-src/<item>/external/editor/model.glb` แล้วรัน
  `import_external.py` (คำสั่งด้านล่าง) เพื่อเรนเดอร์เทียบกับ ref และดูค่า IoU
- ถ้าจะให้แก้ถาวรใน Blender: ใช้ค่า `blenderBoxCm.after` ในไฟล์ JSON แก้ `blender/dims.json` /
  `build_master.py` แล้ว build ใหม่ (ดูด้านล่าง)
- ถ้าจะใช้ GLB ตรงๆ ในเกม: คัดลอกไปทับ `games/never-ending-story/public/models/<slug>.glb`

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
mkdir -p games/never-ending-story/assets-src/<item>/external/editor
cp ~/Downloads/<item>-lowpoly-edited.glb games/never-ending-story/assets-src/<item>/external/editor/model.glb
blender -b --python games/never-ending-story/assets-src/tools/import_external.py -- \
    games/never-ending-story/assets-src/<item> games/never-ending-story/assets-src/<item>/external/editor/model.glb --fit none --yaw 0
```

Use `--fit none --yaw 0`: the editor keeps real size and orientation, while the defaults (`--fit box`,
`--yaw auto`) would stretch it back to `asset.json` and may turn it. The script joins the parts, renders at the
matched camera and writes `external/editor/compare/` (side-by-side, overlay, IoU in `model-report.json`).
To keep the change in the Blender source, copy the `blenderBoxCm.after` numbers into `blender/dims.json` /
`build_master.py`, rebuild (`build_all.sh`, `render_all.sh`) and copy the GLBs to `games/never-ending-story/public/models/`.
Rotations and recolours are not in `dims.json`; port them by hand.

### Adding an asset to the editor

1. Export GLBs with **one named node per part** (see `nightstand/blender/finalize.py`, `split_parts`): a root
   empty, then a mesh per part with its origin at the part centre. A single joined mesh shows as one part.
2. Add an entry to `SHOWCASE_ASSETS` in `games/never-ending-story/src/lib/showcaseAssets.ts` (slug, title, variant URLs, `ref` image +
   matched camera for the mock-up view, orbit framing). The editor's model menu reads that list.
3. Optional: Thai part names in `games/never-ending-story/src/lib/editor/partLabels.ts`.
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

### v0.2.9 additions (English)

UI labels are shown in bold as they appear in the (Thai) UI, with an English gloss.

1. **Line snapping** (🧲 button on the view or in the panel): drag a line end (or grab the middle to move the
   whole line) near a line of **another axis** and it snaps, in priority order, to that line's endpoint → the
   intersection with that line's extension → the nearest point on the segment. Snap radius is ~12 px (mouse) /
   ~22 px (touch) on screen, independent of zoom; a yellow ring + cross marks the snap target.
   - An end snapped onto another line's end becomes **one shared corner** (dashed yellow box) and drags together;
     **long-press** the corner to split it, or use **แยกมุมที่เชื่อม** (unlink corners, selected line); hold
     **Alt** while dragging to disable snapping temporarily.
   - **วางเส้นตามกล้องปัจจุบัน** (place lines from the current camera) links shared box corners automatically;
     **↶ / ↷** (panel or header, Ctrl+Z / Ctrl+Y) undo / redo line edits.
   - While dragging, a **loupe** (~3.5×) shows image + model + lines around the point with a crosshair
     (above the finger on phones).
2. **Difference view**: while dragging lines/points the camera is re-solved every frame and the model is drawn
   in `difference` blend over the image (match = dark, mismatch = bright). Modes **ขณะลาก** (while dragging) /
   **เปิดตลอด** (always) / **ปิด** (off, default). If a solve fails the last camera is kept and a small badge shows.
3. **Consolidated vanishing points**: draw any number of lines per axis; one VP per axis is fitted from all of them
   (robust least squares) and used for the solve.
   - Axis-coloured circle = VP (an arrow at the view edge + distance in px when off-image, ∞ = parallel lines);
     faint rays run from every line to it.
   - Line outline = angular error to the VP: **green < 0.5°**, **amber 0.5–2°**, **red > 2°** (degrees next to the
     line; ⚠ + dashed outline = outlier excluded from the fit). The panel shows per-axis RMS (°) and outlier count.
   - **🎯 รวมจุดลับตา** (consolidate all, or **รวม X / Y / Z** per axis) rotates every line onto the shared VP,
     keeping length and midpoint; a line with one linked corner pivots about that corner (corners never move); a
     line with both ends linked is skipped — unlink it first. Undoable with ↶.
   - **🔒 ล็อกเข้าจุดลับตา** (lock to VP): when on, dragging an endpoint on an axis with ≥ 3 lines keeps the line
     pointing at the VP of the *other* lines (the end slides along the dashed ray); snaps on that ray still apply.
4. **Object / room lines**: the **ภาพครอป · วัตถุ** (crop · object) view edits object lines, **Mock-up เต็ม · ห้อง**
   (full mock-up · room) edits room lines (walls, floor, ceiling, door/window frames). Both share one camera (the
   crop is the part of the mock-up at x = 368, y = 540).
   - **👻** shows the other group faintly for reference; snapping works across groups (e.g. an object corner onto
     a wall edge).
   - **คำนวณจากเส้น** (solve from lines) uses both groups. If the object is rotated relative to the room, untick
     **วัตถุวางตรงกับห้อง** (object aligned with room) → the object's yaw about Z is solved (and exported), sharing
     only the vertical, horizon and lens.
   - The **วัตถุ↔ห้อง** agreement panel shows per-axis VP angle difference (green < 1°, amber ≤ 3°, red > 3°) and
     lens difference (%); tapping an axis highlights the worst lines of both groups.
   - Older data (object lines only) loads unchanged.
5. **↔ เส้นต่อถึงขอบ** (full rays, default on): every line is extended from its VP through the segment to the view
   edge (both directions for a VP at ∞); faint-group rays are faint too.
6. **Edge alignment** (guide line ↔ real edges in the mock-up): image edges are precomputed (Sobel).
   - **ขณะลาก** (default) / **เปิดตลอด** / **ปิด**: the image dims, detected edges glow, short ticks join the line
     to the nearest edge and a label shows the offset (green < 1 px, amber ≤ 2.5 px, red > 2.5 px); the loupe
     shows edges too.
   - **🧷 ดูดเข้าขอบภาพ** (snap to image edge; selected line / **ทุกเส้น** all lines) fits the line to edges within
     ±8 px (linked corners stay fixed), undoable; **ดูดขณะลาก** snaps on release (Alt = off temporarily).
   - The model difference view (item 2) is still available but defaults to off.
7. **Consolidate / parallel per axis**: each axis in the VP panel has a pair of buttons (active one is blue,
   ≥ 44 px tall on phones).
   - **รวม X/Y/Z** (consolidate) = auto mode: fit one finite VP and rotate lines onto it.
   - **ขนาน X/Y/Z** (parallel) = VP at ∞: rotate all lines parallel to their mean direction and **constrain the
     camera** so that axis is parallel to the image plane — e.g. **ขนาน Z** = level camera (no pitch, verticals
     vertical). The panel shows ∠ = deviation from parallel, and a "∞ Z ขนาน" double arrow at the view edge
     replaces the VP marker.
   - If an axis is already nearly parallel (VP very far away), a 💡 button suggests switching to parallel.
   - **Two parallel axes** = one-point perspective: the lens cannot be found from lines → lock the lens
     (**ล็อกเลนส์**) or use point pairs.
   - Applies to both object and room lines; if a group's lines are not actually parallel the agreement panel
     shows ⚠.
   - The mode is saved with the lines (`vpModes`) and exported; ↶ restores line positions but not the mode.
8. **💾 บันทึกลงไฟล์ต้นฉบับ** (save to source files; only under `npm run dev` in `games/never-ending-story/`): work is autosaved to
   localStorage; press this button (or **Ctrl+S**) to write the files in `games/never-ending-story/assets-src/<item>/editor/`, then
   commit them.
   - `camera-match.json` = guide lines (object + room), point pairs, VP lock, consolidate/parallel modes, crop and
     the solved camera.
   - `<variant>.edits.json` (e.g. `lowpoly.edits.json`) = model edits (no undo history); tick
     **รวม …-edited.glb** to also write the model file.
   - The **ไฟล์ต้นฉบับ** (source files) panel lists which files will change; after saving it shows the paths and
     `git add games/never-ending-story/assets-src/nightstand/editor && git commit -m "…"`.
   - Committed files are the baseline: a fresh page (no local draft) loads from them. If the local draft differs
     from the files, a **"มีงานที่ยังไม่บันทึกลงไฟล์"** (unsaved work) banner offers **ใช้งานที่ค้างไว้ต่อ** (keep the
     draft; hidden until the page is closed) or **กลับไปใช้ไฟล์** (revert to the files, discarding the draft).
   - Built pages (e.g. the preview link) have no API: use the **ดาวน์โหลด** (download) buttons and put the files in
     that folder yourself.

9. **★ Master line per axis**: each axis of each group (object, room) has exactly one master line — the
   reference the other lines of that axis follow.
   - The first line drawn on an axis is its master. Change it with **★ ตั้งเป็นเส้นหลัก** (★ set as master, the
     selected line) or the **★ เส้นหลัก X/Y/Z** picker / **⟳ ถัดไป** (next) in the VP panel, or right-click /
     long-press a line → **★ ตั้งเป็นเส้นหลัก**. Setting a new master demotes the old one (undoable with ↶).
   - Deleting the master promotes the remaining line with the lowest residual and says so in a toast.
   - The master is drawn thicker with a ★ badge at its midpoint (axis colour), its ray is brighter and it is
     highlighted in the loupe.
   - Meaning: the VP is constrained to the master's infinite line (fitted from the other lines; the master alone
     gives no VP); in parallel mode the direction is the master's; **รวม / ขนาน** align the other lines and never
     move the master; residual colours and the VP lock are relative to that VP (the master shows 0°). Edge
     refine may still adjust the master.

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
- Strings (i18n prep): every UI string added in v0.2.9 lives in `src/lib/editor/strings.ts` — `MESSAGES` maps
  dotted English keys (e.g. `cameraMatch.vp.consolidateAll`) to `{ en, th }` with `{name}` placeholders,
  `localeTable('en' | 'th')` gives the flat shape of `src/locales/<locale>.json`, and components use the typed `T`
  facade (renders Thai today). `tests/strings.test.ts` checks keys, both values and matching placeholders.
- Snapping (v0.2.9): `src/lib/editor/guideSnap.ts` (pure; `npm test` in `games/never-ending-story/` runs `tests/guideSnap.test.ts`
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
- Object / room groups (v0.2.9, `src/lib/editor/roomMatch.ts`, tested in `tests/roomMatch.test.ts`): lines carry
  `group: 'object' | 'room'`; object lines live in crop px, room lines are drawn on the full mock-up and stored in
  the same crop-px space through the crop transform `T = {x: 368, y: 540, s: 1}` (from `showcaseAssets`
  `mockup.crop`, pixel-checked against `player-room-wide.jpg`). **คำนวณจากเส้น** solves one camera from both
  groups. Aligned: the per-axis VPs are fitted from all lines of both groups. Yawed (untick **วัตถุวางตรงกับห้อง**):
  the room X/Y VPs and the object X/Y VPs share the vertical VP, horizon and focal length, and the yaw ψ
  (`X_room = Rz(ψ) · X_obj`) is solved jointly; it is exported as `room.yawDeg` in the camera-match file. The
  agreement panel fits each group alone and compares VP directions per axis (good < 1°, warn ≤ 3°) and focal
  (< 5 %, ≤ 15 %); tapping an axis highlights the worst lines of both groups. Saved data is `v: 2`; v1 data (crop
  lines only) migrates to the object group.
- Full rays: with **เส้นต่อถึงขอบ** on, each line is drawn from its VP through the segment to the view edge
  (both directions for a VP at infinity), clipped to the visible view.
- Edge alignment (`src/lib/editor/edgeAlign.ts`, tested in `tests/edgeAlign.test.ts`): one Sobel gradient map
  per view image (downscaled to ≤ 1400 px, computed in an idle callback). For a line, samples along it search
  ±8 px along the normal for the strongest gradient whose direction matches the line normal; the offset is
  refined with a parabola fit. Score / coverage / mean offset give the readout band (< 1 px, ≤ 2.5 px).
  **ดูดเข้าขอบภาพ** fits a line to the edge samples (iteratively, robust) and keeps linked corners fixed. The
  model difference view is unchanged but now defaults to **ปิด**.
- Per-axis VP mode (`vpModes: ['auto' | 'parallel', ×3]`, tested in `tests/parallel.test.ts`): `parallel` fits the
  common image direction θ (VP = `[cos θ, sin θ, 0]`, robust, residual = angle to θ) and **ขนาน** rotates the
  lines onto it (same pivots as consolidation). In the solver, a parallel axis adds a stiff penalty on the depth
  component of that world axis in the camera frame (`R[2] · axis`) so e.g. **ขนาน Z** gives a level camera
  (zero pitch, verticals vertical). Focal length needs ≥ 2 finite VPs, so with two parallel axes
  (one-point perspective) lock the lens or use point pairs. Modes are shared by both groups; the agreement panel
  flags a group whose lines are > 1° RMS from parallel. A suggestion appears when an auto-fitted VP lies
  > 20× the image diagonal away. Line undo does not revert the mode. There is no separate "finite only" mode.
- Master lines (v0.2.9, `src/lib/editor/masterLine.ts` + `vpFit.ts`, tested in `tests/master.test.ts`): a line
  carries `master: true` (so undo and the local draft keep it); `camera-match.json` stores
  `master: { object: [x, y, z], room: [x, y, z] }` (line ids, `null` = axis without lines). A missing map (older
  files) or an id that does not match a line of that axis falls back to the default rule (first line of the axis
  in file order), and such a file does not show as modified. Constrained fit: with the master's homogeneous line
  m, the VP is the smallest eigenvector of `Σ wᵢ lᵢ lᵢᵀ` restricted to the plane `m · v = 0` (the master gets
  weight 0 and is never an outlier); parallel mode takes θ = the master's angle. Lock-to-VP is off while dragging
  the master itself (it is the reference). Deletion promotes the lowest residual against the *free* fit of the
  remaining lines.
  **Joint rule** (one fit that mixes both groups — every axis when the object is aligned with the room, only Z
  when yawed): the **room master is authoritative** — the object's master on that axis becomes an ordinary line
  of the joint fit (`roomAuthoritative`), and in the yawed refinement master residuals are weighted ×10
  (`MASTER_WEIGHT`). An object master only governs the joint fit on an axis where the room has no lines. The
  per-group fits (overlay colours, the object↔room agreement panel) always use each group's own master.
- Source files + dev save API (`scripts/editorFilesPlugin.mjs`, `src/lib/editor/editorFilesCore.mjs`,
  `src/lib/editor/sourceFiles.svelte.ts`, tested in `tests/editorFiles.test.mjs`): a Vite plugin with
  `apply: 'serve'` (never in a build) serves `GET /__editor/files?item=<item>` and `POST /__editor/files`
  (`{item, files: [{name, json} | {name, base64}]}`). It writes only `camera-match.json`, `<variant>.edits.json`
  and `<variant>-edited.glb` inside an existing `assets-src/<item>/editor/`. Guards: loopback client, `Host`
  must be localhost (DNS rebinding), `Origin` (if sent) must be the same local origin, `Sec-Fetch-Site`
  same-origin/none, POST needs `application/json` + `x-kido-editor: 1`, item/variant names
  `^[a-z0-9][a-z0-9_-]{0,63}$`, resolved paths (and symlinks) must stay in that folder, body ≤ 48 MB / JSON ≤ 2 MB /
  GLB ≤ 32 MB (glTF magic checked), all entries validated before any write, atomic temp-file + rename (retries on
  Windows EPERM/EBUSY). JSON is written server-side as stable pretty JSON (sorted keys, 2-space indent, flat number
  arrays on one line, LF + final newline), so the same data always gives the same bytes; identical files are not
  rewritten, and CRLF checkouts compare equal (`.gitattributes` also pins LF). `camera-match.json`
  (`kido-camera-match-source/1`) holds the work only — lines in full-image px rounded to 1e-4, pairs, `lockVp`,
  `vpModes`, `principal`, `lockLens`, room alignment/yaw, crop, `camera` (crop px) and a derived `solved` block
  that is ignored on load and in comparisons; UI preferences stay in localStorage. `<variant>.edits.json`
  (`kido-model-edits-source/1`) is the parts state without timestamps or history. The page uses the API when it
  answers (dev only); otherwise the committed files bundled at build time (`import.meta.glob`) are the baseline
  and the panel offers downloads. Load order: local draft → source file → seeded default. Saving does not trigger
  HMR (`server.watch.ignored` for `assets-src/*/editor/**`).
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
