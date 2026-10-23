# @itio/mesh-editor

A touch-friendly polygon mesh editor for three.js. It is shared by the games in this repo.

> **Status: mesh ops, viewport (picking, gizmo, transform sessions), history, and the Threlte adapter are implemented.** Snap *providers*, camera match, the GLB import pipeline, and the Svelte panels (`./svelte`) are still stubs. The contract is in [API.md](API.md). Ownership is in API.md §13.

## Entry points

| Import | What |
|---|---|
| `@itio/mesh-editor` | Core: `EditMesh`, `EditDocument`, edits.json types, `EditorHost`, `EditorViewport`, selection, transform session, snapping, history |
| `@itio/mesh-editor/svelte` | Optional Svelte 5 UI panels, themeable with CSS variables, Thai and English |
| `@itio/mesh-editor/threlte` | Adapter for Threlte apps |
| `@itio/mesh-editor/camera-match` | Match a camera to a reference image and export it to Blender `cam.json` or three.js |

`three` (^0.186) is a peer dependency. `svelte` (^5) and `@threlte/core` (^8) are optional peers, needed only for `./svelte` and `./threlte`.

## Develop

From the repo root:

```bash
npm install
npm -w @itio/mesh-editor run build      # tsc → packages/mesh-editor/dist (JS + .d.ts)
npm -w @itio/mesh-editor run typecheck
npm -w @itio/mesh-editor run test       # vitest
```

## Use from a game in this repo

Add `"@itio/mesh-editor": "*"` to the game's `dependencies`, then run `npm install` at the root. npm links the workspace package. Build the package first (`npm run build:packages`), because games import from `dist/`.

---

# @itio/mesh-editor (ภาษาไทย)

ตัวแก้ไขโมเดล 3 มิติแบบโพลิกอนสำหรับ three.js ใช้นิ้วแตะบนมือถือได้ เกมทุกเกมใน repo นี้ใช้ร่วมกัน

> **สถานะ: แกนแก้ไขเมช, viewport (การเลือก, gizmo, transform), history และตัวเชื่อม Threlte ใช้งานได้แล้ว** ส่วน snap provider, จับกล้อง, นำเข้า GLB และแผง Svelte (`./svelte`) ยังเป็นโครง สัญญา API อยู่ใน [API.md](API.md) (ข้อ 13)

## จุด import

| Import | ใช้ทำอะไร |
|---|---|
| `@itio/mesh-editor` | แกนหลัก: `EditMesh`, `EditDocument`, type ของ edits.json, `EditorHost`, `EditorViewport`, การเลือก, การย้าย/หมุน/ย่อขยาย, snap, undo |
| `@itio/mesh-editor/svelte` | แผง UI แบบ Svelte 5 (ไม่บังคับใช้) ปรับธีมด้วยตัวแปร CSS มีข้อความไทยและอังกฤษ |
| `@itio/mesh-editor/threlte` | ตัวเชื่อมสำหรับแอปที่ใช้ Threlte |
| `@itio/mesh-editor/camera-match` | จับกล้องให้ตรงกับภาพอ้างอิง แล้วส่งออกเป็น `cam.json` ของ Blender หรือค่ากล้องของ three.js |

ต้องติดตั้ง `three` (^0.186) เอง ส่วน `svelte` (^5) และ `@threlte/core` (^8) ต้องมีเฉพาะเมื่อใช้ `./svelte` หรือ `./threlte`

## พัฒนา

สั่งจากโฟลเดอร์บนสุดของ repo:

```bash
npm install
npm -w @itio/mesh-editor run build      # คอมไพล์ด้วย tsc ไปที่ packages/mesh-editor/dist (JS + .d.ts)
npm -w @itio/mesh-editor run typecheck
npm -w @itio/mesh-editor run test       # vitest
```

## ใช้ในเกมของ repo นี้

ใส่ `"@itio/mesh-editor": "*"` ใน `dependencies` ของเกม แล้วสั่ง `npm install` ที่โฟลเดอร์บนสุด npm จะลิงก์แพ็กเกจให้เอง ต้อง build แพ็กเกจก่อน (`npm run build:packages`) เพราะเกม import จาก `dist/`
