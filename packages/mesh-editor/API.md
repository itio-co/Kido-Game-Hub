# @itio/mesh-editor: API contract v1

This is the contract that GamesBuilder and Never Ending Game both code against. The TypeScript in `src/` is the source of truth for names and signatures. This file explains the rules that types cannot express. To change the contract, open a PR that edits both this file and `src/` together, and get a review from the other owner (§13).

Status: **Agreed v1 (Never Ending Game + GamesBuilder, 2026-10-23).** Package version 0.0.1. Contract changes from now on need a PR that edits this file and `src/` together, reviewed by both owners.

| Subpath | Contents | Depends on |
|---|---|---|
| `@itio/mesh-editor` | core: EditMesh, document, edits.json, selection, host, viewport, transform, snap, history | `three` (peer) |
| `@itio/mesh-editor/svelte` | optional UI panels | core, `svelte` 5 (optional peer) |
| `@itio/mesh-editor/threlte` | Threlte adapter | core, `@threlte/core` (optional peer) |
| `@itio/mesh-editor/camera-match` | camera matching to a reference image, Blender and three.js export | `three` |

Peer dependencies: `three` is required. `svelte` and `@threlte/core` are **optional** (`peerDependenciesMeta`) and needed only for the subpath that uses them. The core never imports Svelte, Threlte, or DOM UI. It touches the DOM only through `EditorViewport` pointer listeners on `domElement`.

---

## 1. Units and axes

- **Length:** metres, object-local (vertex positions are relative to the object's own origin). Positions written to an `EditMesh` or `EditDocument` are rounded to **1e-5 m** (0.01 mm). Every op ends with `quantize()`.
- **Axes:** three.js / glTF. Y is up, +Z points to the front (towards the default camera), and the system is right-handed.
- **Blender:** Z is up and the front is −Y. `(x, y, z)_blender = (x, −z, y)_three` and `(x, y, z)_three = (x, z, −y)_blender`.
- **Rotation:** quaternions `[x, y, z, w]` in documents. Euler angles in degrees appear only in the UI and in the legacy `rotationDeg` field of edits.json (order XYZ, the three.js default).
- **edits.json:** keeps its existing **centimetre** fields. See §4.

## 2. `EditMesh`

```ts
interface EditMesh {
  v: number[];              // flat xyz, object-local metres, 1e-5 grid
  f: number[][];            // CCW (outside view) vertex loops; quads preferred, tris/n-gons allowed
  fm?: (string | null)[];   // per-face material id; length === f.length; null → object default
  sm?: boolean;             // smooth normals; absent/false → flat (low-poly look)
}
type Edge = [a: number, b: number]; // a < b
type EdgeKey = `${number}-${number}`;
```

Rules:
- Edges are not stored. `edgesOf(mesh)` returns each unique edge once, sorted `a < b`, in first-appearance order (face order, then loop order). That order is deterministic, so edge indices can be used in tests.
- No face repeats an index. Faces have ≥ 3 vertices. Unused vertices are allowed but get dropped by `deleteFaces({ dropLooseVerts: true })` and `weld`.
- **Operations are pure.** They never mutate their input and always return a new mesh, plus the new element indices where useful (`extrude` → new cap faces, `merge` → surviving vertex). The full list is in `EditMeshOps` (`src/core/mesh.ts`): `edgesOf, faceNormal, centroid, quantize, transformVerts, extrude, inset, bevel, merge, weld, deleteFaces, flip, fromBufferGeometry, toBufferGeometry`.
- `toBufferGeometry` fan-triangulates each face and makes one geometry group per distinct `fm` value, in first-appearance order. Flat normals duplicate vertices per face. Smooth normals are area-weighted.
- `fromBufferGeometry` (GLB import) welds vertices at 1e-5 by default and rebuilds quads from coplanar triangle pairs (≤ 1°). It also maps `geometry.groups[].materialIndex` to `fm` through `groupMaterialIds`.
- **v1 scope (agreed): no UVs.** Per-face UVs are out of scope for v1. Low-poly assets use flat material colours, and textured master GLBs are not edited at the vertex level. A later version can add `uv?: number[][]` (per face-corner, parallel to `f`).

## 3. `EditObject` and `EditDocument`

```ts
interface Transform { position: Vec3; quaternion: Quat; scale: Vec3 }
interface EditObject { id: string; name: string; transform: Transform; mesh: EditMesh; materialId?: string; hidden?: boolean }
interface EditDocument { version: 1; objects: EditObject[]; camera?: CameraMatch; meta?: Record<string, unknown> }
```

- `id` is stable across sessions. Kido authored entities use their UUID v4 (see `game/README.md` › Scene objects). GLB parts without an id get a fresh UUID on import, and their name is kept in `name`.
- `name` matches the GLB node name and `parts[].name` in edits.json.
- `transform` is relative to the document root. **v1 scope (agreed): flat objects.** There is no parent/child nesting. The Kido editor already flattens a GLB to its top-level parts (`partsOf()`).
- The document is plain JSON (`JSON.parse(JSON.stringify(doc))` deep-equals `doc`).

## 4. edits.json (`kido-model-edits/1`)

This is the file the editor exports so a human or an agent can port changes back into `game/assets-src/<slug>/blender/build_master.py`. The format is exactly what `exportEdits()` writes in the current Kido editor (`game/src/lib/editor/modelEditor.ts` on `cursor/model-editor-ec81`). All existing fields keep their names, units, and meanings. New fields are **optional additions**, and `format` stays `kido-model-edits/1`. Old files still validate, and old readers ignore the new fields.

```jsonc
{
  "format": "kido-model-edits/1",
  "asset": "player-room/nightstand",       // slug
  "variant": "lowpoly",
  "model": "models/nightstand.glb",        // relative to public/
  "savedAt": "2026-10-23T08:00:00.000Z",
  "units": { "positionDeltaCm": "...", "blenderBoxCm": "..." },
  "summary": { "deleted": ["..."], "added": ["top_copy1"], "changed": ["leg_fl"] },
  "parts": [{
    "name": "top_copy1", "copyOf": "top",  // copyOf only on copies
    "changed": true, "deleted": false, "hidden": false,
    "positionDeltaCm": [5, 0, 0],          // cm, three.js axes, delta vs. the loaded part (copies: vs. source)
    "rotationDeg": [0, 0, 0],              // ABSOLUTE Euler XYZ degrees
    "scale": [1, 1, 1],                    // ABSOLUTE
    "sizeCm": { "before": [50, 4, 40], "after": [50, 4, 40] },   // W×H×D (three.js X,Y,Z)
    "color": null,                         // "#rrggbb" | null
    "blenderBoxCm": {                      // world AABB, Blender axes, cm, 2 decimals
      "before": { "x": [-25, 25], "y": [-20, 20], "z": [51, 55] },
      "after":  { "x": [-20, 30], "y": [-20, 20], "z": [51, 55] }   // null when deleted
    },
    // ---- optional additions ----
    "id": "uuid",                          // EditObject.id
    "created": true,                       // new object (not in GLB, not a copy)
    "quaternion": [0, 0, 0, 1],            // absolute, avoids Euler ambiguity
    "materialId": "wood",
    "mesh": { "v": [...], "f": [...] },    // only if geometry was edited; object-local metres
    "meshStats": { "before": { "verts": 8, "faces": 6 }, "after": { "verts": 12, "faces": 10 } }
  }]
}
```

Rules:
- `summary.added` lists copies, as today, and also `created` objects.
- **Per-object delta:** `positionDeltaCm` is the transform delta. `mesh` is the geometry delta, written as the **full after-state `EditMesh`** (agreed). A mesh diff is hard to port by hand. An optional `meshDelta` (moved verts plus added and removed faces) may be added later if file size becomes a problem. It would be additive, and `mesh` would stay authoritative.
- **Bounding box:** `blenderBoxCm` maps 1:1 to `box(name, x0, x1, y0, y1, z0, z1)` in `build_master.py`. For an edited mesh, `after` is computed from the new geometry.
- `rotationDeg` and `scale` stay absolute (not deltas) because that is what the current editor writes. The name `positionDeltaCm` makes the asymmetry explicit.
- Types: `KidoModelEdits` and `KidoPartEdit` in `src/core/edits.ts`.

## 5. Host interface

The host is the app that owns the scene: the Kido game, the Starship SvelteKit app, or the Threlte adapter. It owns the documents, the THREE objects, persistence, and the render loop.

```ts
interface EditorHost {
  getMesh(objId: string): EditMesh | null;
  commit(objId: string, mesh: EditMesh, opts: { live: boolean }): void;
  onSelectionChange(selection: Selection): void;
  setNavigationEnabled(enabled: boolean): void;
  requestRender(): void;
  resolveMaterial(id: string | null): THREE.Material;
  // agreed additions
  listObjects(): string[];
  getObject3D(objId: string): THREE.Object3D | null;
  commitTransform(objId: string, transform: Transform, opts: { live: boolean }): void;
  addObject?(object: EditObject, index?: number): void;
  removeObject?(objId: string): void;
  canEdit?(objId: string): boolean | string;
}
```

- `commit(..., { live: true })` is sent during a drag. The host updates the render mesh only, with no persistence and no undo. Exactly **one** `live: false` commit per touched object follows on release, and the host may persist it. Typed values and ops send `live: false` only.
- `onSelectionChange` is a callback that the **viewport calls**. It is not a subscription. Apps that want events can also use `viewport.on('selectionchange', ...)`.
- `setNavigationEnabled(false)` is called when the editor owns a gesture (gizmo drag, box select), and `true` is called again on release or cancel. The host maps this to OrbitControls `enabled`, or the equivalent.
- `requestRender()` should be coalesced by the host (one rAF). The editor may call it many times per frame.
- `resolveMaterial(null)` returns the host default. The editor uses this for preview overlays of faces with `fm` ids.
- **Additions (agreed):** object mode needs `listObjects`, `getObject3D` (raycast, matrixWorld, gizmo attach), and `commitTransform`. Duplicate and delete, and their undo, need `addObject` and `removeObject`. If the host doesn't implement those two, the commands are disabled.
- **`getMesh(objId) === null`:** the object can be picked and selected in **object mode** (and transformed, unless it is locked) but **not edited at the element level**. Switching to vertex, edge, or face mode skips it, and element picks ignore it.
- **`canEdit?(objId)`:** optional lock. If it is absent, every object is editable.
  - `true` means editable.
  - `false` or a **string** means locked. A string is the reason, and the UI shows it (Thai or English is the host's choice).
  - A locked object can still be **selected**, so it highlights and shows in panels. It **refuses** picks-for-transform: no gizmo is attached, a drag doesn't start a session, and typed values are rejected. The reason is shown instead.
  - In a mixed selection, the locked objects are dropped from the session, and the gizmo appears only if at least one object stays editable. The viewport emits a **`notice`** event (§6) listing the skipped objects and their reasons, so the UI can say "ข้าม 2 ชิ้นที่ล็อกอยู่" / "2 locked items skipped".
  - If **every** selected object is locked, there is no gizmo and no session. The viewport emits the same notice with `allLocked: true`, and the UI shows the reason (or reasons).
  - The editor calls `canEdit` at the start of each session and each typed value, so the host can change locks at any time.

## 6. `EditorViewport`

```ts
const viewport = new EditorViewport({ scene, camera, domElement, host, snap?, history?, tapSlopPx?: 8, pickRadiusPx?: 22 });
viewport.attach();   // adds listeners + overlay group
viewport.detach();   // removes them; can attach() again
viewport.dispose();
```

- **Pointer listeners** use the **capture phase** on `domElement` (`{ capture: true }`). They ignore `!event.isPrimary`, so a second finger is left to pinch and orbit. A second finger during a drag cancels the session.
- **Swallowing:** a pointerdown that hits the gizmo, or that starts a box select, calls `stopPropagation()` and `host.setNavigationEnabled(false)`. A tap (movement under `tapSlopPx`) on empty space clears the selection and is not swallowed.
- **No render loop:** every visible change calls `host.requestRender()`.
- **Overlays** (gizmo, vertex dots, edge lines, selection box) live in one `Group` that is added on attach and removed on detach. They are never exported, and they are excluded from picking and from `Box3` computations.
- **Select mode:** `object | vertex | edge | face` (`setSelectMode`).
- **Picking:** raycast for objects and faces. Vertices use screen-space distance within `pickRadiusPx`. Edges use the distance to the projected segment within **`0.7 × pickRadiusPx`**, which is 15.4 px at the 22 px default. Occlusion is tested against a depth raycast, and `xray` turns it off.
- **Multi select:** on desktop, Shift adds and Ctrl/Cmd toggles. On touch, the `multiSelect` flag makes taps toggle.
- **Box select:** a drag that **starts on empty space** draws a box when any of these is true:
  - **Alt** is held. The op is `replace`.
  - **Shift** is held. The op is `add`.
  - The **`boxSelect` flag** is on. It works on desktop and touch alike. The op is `replace`, or `add` when Shift is held or `multiSelect` is on.

  A drag that starts on geometry or on the gizmo never boxes. Without one of these triggers, a drag on empty space goes to camera navigation. `selectBox(rect, op)` does the same programmatically.
- **Transform mode:** `translate | rotate | scale | null` (`null` means no gizmo), and `space: 'local' | 'world'`.
- **Events:** `on('selectionchange' | 'modechange' | 'transform' | 'history' | 'notice', cb)` returns an unsubscribe function. The event map is `EditorViewportEvents`.
- **Notices (agreed):** `viewport.on('notice', n => ...)` carries UI-facing messages. v1 has one kind:

  ```ts
  type EditorNotice = {
    kind: 'locked-skipped';
    count: number;                                 // locked objects left out (= reasons.length)
    reasons: { objId: string; reason?: string }[]; // reason = canEdit's string; undefined if it returned false
    allLocked: boolean;                            // true: nothing editable, no gizmo shown
  };
  ```

  - **When:** once each time the editable set is computed with locked objects in it. That happens on a selection change or `setTransformMode(non-null)` (when the gizmo would attach), at session start, and on an `applyTyped` that skips or rejects locked objects. It is **not** repeated on pointer moves, and it is not emitted while `transformMode` is `null` (plain selecting isn't refused).
  - **Mixed selection:** `allLocked: false`. The gizmo attaches to the editable objects only.
  - **All locked:** `allLocked: true`. There is no gizmo, drags don't start a session, and typed values are not applied.
  - **UI text:** the Svelte panels show it with the message keys `notice.lockedSkipped` (th "ข้าม {count} ชิ้นที่ล็อกอยู่", en "{count} locked items skipped") and `notice.allLocked` (shows the reason; with several reasons, the first one plus "+N"). Hosts that don't use the panels can listen and show their own toast.
  - Future notice kinds may be added. Listeners should ignore kinds they don't know.
- **Gizmo (agreed):** wrap `three/addons` `TransformControls`, which the current Kido editor already uses, around a proxy `Object3D` placed at the pivot. The selection is never attached directly. On each change, the editor turns the proxy's motion since session start into the session delta matrix (§7, §8).

## 7. Selection and transform session

```ts
type SelectMode = 'object' | 'vertex' | 'edge' | 'face';
interface Selection { mode: SelectMode; objects: string[]; active: string | null; elements: Record<string, { verts: number[]; edges: EdgeKey[]; faces: number[] }> }
```

- Selection is an immutable value. In object mode `elements` is `{}`. In element modes only the current mode's array is filled, and multi-object edit is allowed.
- Switching mode converts the selection: vertices become the edges and faces they fully enclose, and faces become their vertices and edges.
- `active` is the last-picked object. Local gizmo space and typed values use it.
- **Pivot:** the plain mean of the selected vertices in world space (or of the object origins in object mode), fixed at session start. It is not the bounding-box centre.
- **Session:** start → `update(matrix)` on each gizmo change → snap → apply to the **start snapshot**, never incrementally, so there is no drift. Each start position is mapped world → local with `inverse(object.matrixWorld)`, so `p_local' = inverse(W) · matrix · W · p_local_start`, where `W` is the object's `matrixWorld` at session start. In object mode, the object's world matrix becomes `matrix · W_start`, and it is decomposed back to a parent-relative `Transform` → `commit(..., { live: true })` → `requestRender()`. On release, `end()` sends one `live: false` commit per object and pushes **one** history command. `cancel()` restores the snapshot and pushes nothing.
- **Typed values** (`applyTyped({ kind, axis, value, space })`) build the candidate matrix for that absolute value and go through the same snap → apply → commit → one-command path. Units: position and size in metres (the UI shows cm), rotation in degrees, scale unitless.

## 8. Snapping

```ts
type SnapFn = (c: { matrix: THREE.Matrix4; pivot: THREE.Vector3; selection: Selection;
                    mode?; source?: 'drag' | 'typed'; axis?; space?; ray?; invert? }) => THREE.Matrix4;
```

- `matrix` is the proposed **world-space delta since session start**. The pivot is **already conjugated in**:

  ```
  matrix = T(t) · T(pivot) · R · S · T(−pivot)      // = T(pivot + t) · L · T(−pivot), L = R·S
  p'     = matrix · p_start                         // world space, for every selected point
         = L · (p_start − pivot) + pivot + t
  ```

  `t` is the **pivot displacement** (where the pivot goes is `pivot + t`). `L` is the linear part (rotation × scale about the pivot). Snap functions return a matrix of the same form, and consumers never re-apply the pivot. The session maps results to object-local through `inverse(object.matrixWorld)` (§7). Helpers: `splitDelta(matrix, pivot) → { t, linear }` and `makeDelta(pivot, t, linear)`.
- It is called on **every gizmo change and every typed value**, and must be pure and allocation-light.
- **Providers** (`SnapProvider { kind, enabled, snap(c): Matrix4 | null }`; returning `null` means no target), composed with `composeSnaps([...])`, which ships as runtime code in 0.0.1:

| kind | does | Kido default |
|---|---|---|
| `grid` | rounds the translation part to `step` (on the gizmo axis or axes) | 0.005 m |
| `angle` | rounds rotation to `stepDeg` and scale to `scaleStep` | 15°, 0.05 |
| `vertex` | moves the pivot onto the nearest unselected vertex within `radiusPx` | 16 px |
| `edge` | moves the pivot to the closest point on the nearest edge | 16 px |
| `face` | moves the pivot to the ray hit on the face under the pointer | n/a |
| `alignNormal` | with `face`, also rotates the selection's +Y onto the hit normal | off |

- **Order (`composeSnaps`, implemented in `src/core/snap.ts` and unit-tested):**
  1. **Grid and angle first**, in list order. Grid rounds `t`, and angle rounds `L`'s rotation (and scale).
  2. **Then the geometric providers** (`vertex`, `edge`, `face`, `alignNormal`), in list order. Each returns a matrix, or `null` for "no target". The **first** non-null result wins, and the rest are skipped.
  3. With a geometric hit, its `t` **replaces** the grid-rounded `t` and is **not re-rounded**. The angle-snapped rotation from step 1 is kept. The one exception is `alignNormal`: the face-aligned rotation is the snap result, so its linear part is used as-is.
  4. Without a hit, the step-1 result stands.
- `invert` (Ctrl, or a touch toggle) flips every provider's enabled state for that gesture.
- The defaults match the current Kido editor (`setSnap`: 5 mm, 15°, 0.05).

## 9. History

```ts
interface Command { label: string; do(): void; undo(): void; mergeWith?(prev: Command): Command | null }
interface History { push(cmd); undo(); redo(); canUndo; canRedo; undoLabel; redoLabel; clear(); limit; onChange(cb) }
```

- Command-shaped from day one, so diff-based commands can replace snapshots later without an API change.
- **v1 `SnapshotCommand`:** stores before and after `{ mesh, transform }` per touched object (`null` means the object did not exist), plus the selection before and after. `do()` and `undo()` write back through `host.commit(..., { live: false })`, `commitTransform`, and `add/removeObject`.
- Default limit is 100 steps. `push` clears redo.
- `mergeWith` lets repeated typed values on the same field collapse into one step.

## 10. Camera match (`@itio/mesh-editor/camera-match`)

```ts
interface CameraMatch {
  version: 1;
  image: { src?; width; height; crop?: { x; y; sourceWidth; sourceHeight } };
  guides: Partial<Record<'x'|'y'|'z', { a: Vec2; b: Vec2 }[]>>;   // image px, top-left origin
  vanishingPoints: Partial<Record<'x'|'y'|'z', Vec2 | null>>;     // null = parallel (infinite)
  points?: { label?; world: Vec3; image: Vec2 }[];
  sensorWidthMm: 36; sensorFit: 'horizontal';
  lensMm: number; hfovDeg: number; vfovDeg: number; principalPoint?: Vec2;
  position: Vec3; quaternion: Quat;    // metres; three.js camera (looks −Z)
  residualPx: number;                  // RMS
}
```

Relations: `fPx = lensMm / 36 · image.width`, `hfov = 2·atan(18 / lensMm)`, `vfov = 2·atan(tan(hfov/2) / aspect)`. Guide axes are three.js world axes. The principal point defaults to the image centre.

**Blender `cam.json`** (`BlenderCamJson`) is exactly what `solve_cam.py` writes and `add_cam.py` reads (`game/assets-src/nightstand/blender/cam.json`):

| field | meaning |
|---|---|
| `p[12]` | `[W, D, t, o, L, fPx, rx, ry, rz, tx, ty, tz]`: 0–4 are asset-specific (a generic exporter writes 0), 5 is focal length in px, 6–8 is the Rodrigues vector of `R`, 9–11 is `t = −R·C` (cm) |
| `R` | 3×3, world (Blender) → OpenCV camera (x right, y down, z forward) |
| `C` | camera centre, Blender world, **cm** |
| `IW`, `IH` | image size, px |
| `H` | asset-specific (nightstand top height, cm). Generic writes 0 |
| `lensMm?`, `sensorWidthMm?`, `residualPx?`, `crop?` | optional additions, ignored by `add_cam.py` |

Conversions, checked against the nightstand files:
- Blender camera: `matrix_world = T(C/100) · (Rᵀ · diag(1, −1, −1))`, `lens = fPx / IW · 36` (as in `add_cam.py`).
- three.js: `position = (Cx, Cz, −Cy) / 100`, and the rotation matrix is `M · Rᵀ · diag(1, −1, −1)` with `M = [[1,0,0],[0,0,1],[0,−1,0]]`.
- Nightstand check: `cam.json` gives position `(1.51665, 1.36477, 3.04096)`, quaternion `(−0.139571, 0.230806, 0.028608, 0.962512)`, and lens 162.117 mm. These are the exact values in `showcaseAssets.ts` and `nightstandStage.ts`.

**three.js export** (`ThreeCameraExport`): `{ hfovDeg, position: Vec3, quaternion: Quat, image: { width, height } }`. It is the JSON form of the showcase `MatchedCamera` (`ref.camera`). At runtime, `camera.fov = vfovFromHfov(hfovDeg, canvasAspect)`. A non-centre principal point uses `camera.setViewOffset`.

## 11. UI package (`@itio/mesh-editor/svelte`)

- **Optional.** The core works headless or with any UI. The panels are Svelte 5 components: Toolbar (modes, tools, multi and box toggles, undo/redo), TransformFields, SnapPanel, MeshOps, CameraMatchPanel, and FilePanel (import GLB, export GLB and edits.json).
- **Theme:** CSS variables on any ancestor. Defaults are a dark palette built on the game's theme colour `#10141c`:

| var | default |
|---|---|
| `--me-bg` / `--me-panel` | `#10141c` / `#1b2430` |
| `--me-fg` / `--me-muted` | `#f2f4f8` / `#9aa7b6` |
| `--me-accent` / `--me-accent-fg` | `#ffe14d` / `#10141c` |
| `--me-danger` / `--me-border` | `#ff6b6b` / `#2e3b4a` |
| `--me-radius` / `--me-gap` / `--me-hit` | `12px` / `8px` / `44px` |
| `--me-font` | `"Noto Sans Thai", "Noto Sans", system-ui, sans-serif` |
| `--me-axis-x/y/z` | `#ff5a5a` / `#6bd66b` / `#5aa0ff` |

- **i18n:** `I18nMap = Record<MessageKey, { th; en }>`. Thai is the default locale. Pass `locale` and a partial `messages` override.
- **Touch:** must work at **390×844** portrait. Hit targets are at least `--me-hit`, panels are bottom sheets, nothing relies on hover or a right click, and every modifier-key action also has an on-screen toggle.

## 12. Testing

- **Core:** Vitest in Node (`npm -w @itio/mesh-editor test`). Pure ops get table tests (cube → extrude → expected `v`/`f`). Picking gets tests with a fixed camera and synthetic pointer coordinates. Snapping gets matrix-in/matrix-out tests; the composition order (§8) is already covered by `test/snap.test.ts`. Camera match is tested against `nightstand/blender/cam.json`, round-tripping the numbers in §10.
- **Later:** a Playwright demo page (`packages/mesh-editor/demo/`) at 390×844 covering tap select, box select, a gizmo drag giving one undo step, a typed value, and export of edits.json.
- CI runs build, typecheck, and test for the package, plus `npm run build` for every game.

## 13. Ownership

| Area | Owner |
|---|---|
| `EditMesh` and `EditMeshOps` (pure ops, `edgesOf`, quantize, to/from geometry) | GamesBuilder |
| Picking: raycast, screen-space vertex and edge, occlusion, box select | GamesBuilder |
| Transform session (pivot, live updates, single commit, typed path) and the gizmo | GamesBuilder |
| Extrude, inset, bevel, merge | GamesBuilder |
| Threlte adapter (`./threlte`) | GamesBuilder |
| Camera match (`./camera-match`), cam.json and three.js export | Never Ending Game |
| Snapping (`SnapProvider`s, `composeSnaps`) | Never Ending Game |
| GLB import and weld (`fromBufferGeometry` caller, part flattening, edits.json export) | Never Ending Game |
| Svelte UI panels (`./svelte`), theme, i18n | Never Ending Game |
| Kido integration (`game/` → `games/never-ending-story/` editor route) | Never Ending Game |
| `EditorViewport` shell, `History`, `EditorHost` contract | shared (agreed): changes need both reviews |

`weld` itself lives in `EditMeshOps` (GamesBuilder). The GLB import pipeline that calls it belongs to Never Ending Game.

## 14. Workspace layout

The root `package.json` workspaces are `["packages/*", "games/*", "game"]`. **Every directory directly under `games/` that has a `package.json` becomes a workspace**, and so does `game/` until it moves to `games/never-ending-story/`.

- Don't put a stray `package.json` under `games/`, such as a scratch folder, a copied template, or a nested app. It would be installed and hoisted by the root `npm install`.
- A nested SvelteKit app keeps exactly one `package.json`, at `games/<name>/package.json`.
- There is one lockfile, the root `package-lock.json`.
- When `game/` moves, remove `"game"` from the workspaces list in the same PR.
