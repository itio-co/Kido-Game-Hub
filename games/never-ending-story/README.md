# Never Ending Story Game

This game lives at `games/never-ending-story/`. Thai specs and story packs are in `docs/design/`. Early demos are in `prototypes/`. Per-asset source folders stay under `assets-src/<slug>/`.

Playable first screen: the player's room (hub). Portrait, touch-first. Svelte draws the HUD and the 2D player-room hub from `public/img/player-room-wide.jpg` (same mock the old Three.js room was matched to). Tap spots come from `public/data/player-room.json` `screen` percentages. The Three.js room builders in `src/lib/scene.ts` stay in the repo but are unused on the hub path.

Progress is saved in `localStorage` on this device. There is no account.

## Run

```bash
cd games/never-ending-story
npm install
npm run dev
```

This folder is an npm workspace of the repo root. `npm install` here installs into the root `node_modules` and updates the root `package-lock.json`. There is no `games/never-ending-story/package-lock.json`. Running `npm install` at the repo root does the same.

Open the URL Vite prints (default `http://localhost:5173`) on a phone, or use a narrow portrait window such as 390×844.

## Reproducible build and AI guidance

Use `make help` and `make verify` from the repository root. See
[build workflow and module release direction](docs/build.md) and the project
[AI contributor instructions](AGENTS.md). These commands build locally; they do not deploy.

## Build a static preview

```bash
npm run build
npm run preview
```

`npm run build` writes a static site to `games/never-ending-story/dist`. `npm run preview` serves that folder. Asset paths are relative, so the same `dist` folder can be hosted as static files at the site root or in a subfolder.

## Install (PWA)

The built site is an installable web app. `public/manifest.webmanifest` names it **Never Ending Story Game**, locks portrait orientation, and uses standalone display. Theme color is `#10141c`. Icons at 192 and 512 live in `public/icons/`, with a maskable pair whose artwork sits inside the center safe circle. The manifest does not set `id`. The installed app's identity is the start URL, so a copy served from a subfolder stays that folder's app.

The production build writes `dist/sw.js`. That worker precaches every file in `dist` except itself. URLs in the cache list are relative (`./index.html`, `./assets/...`), so they resolve next to the worker when the folder is served from a subpath. The cache name includes a hash of those files. A new build installs, calls `skipWaiting`, deletes the previous cache, and reloads an already-open page once so the new files replace the old ones. The first visit does not reload. Returning to the app checks for an update.

`npm run dev` does not register the worker.

Open the hosted folder with a trailing slash, or open `index.html`. Relative files, including `sw.js`, resolve inside that folder. An installed app starts at `index.html`.

## Checks

```bash
npm run check
npm run validate
```

`npm run validate` reads `public/data/player-room.json`, `public/data/screens.json`, and `public/data/case-flow.json`. It fails if any id or slug is duplicated, an id is not a UUID v4 stored in the file, a slug is not unique kebab-case, a title is missing, a kind is unknown, or a reference (`targetId`, `stackOn`, `hintTarget`, calendar `theme`) points at a missing id. The game runs the same check when the room and the story flow load.

## Scene objects

Every authored object — the room, walls, bed, wall shelf, shelf rows, books, door, hotspots, decor slots, calendar, themes, and entries — stores:

| Field | Meaning |
|---|---|
| `id` | Stable UUID v4. Written in the JSON. Not generated at runtime. |
| `kind` | Type name (`room`, `bookshelf`, `shelf-row`, `book`, `hotspot`, `decor-slot`, `door`, …). The kind registry maps each kind to a builder or a non-mesh role, and the scene is built by dispatching on `kind`. |
| `title` | Thai name. Optional English `titleEn`. |
| `slug` | Unique kebab-case path, such as `player-room/bookshelf/row-1/book-03`. |

Links between objects use `id`. `SceneCatalog.getById` and `getBySlug` look an object up after validation.

The wall shelf is a Three.js group: `bookshelf` → `shelf-row` → `book`. Each book is its own mesh. Rows and books are data, so another room can reuse the same builder.

## This build

- The game opens in the player's room as a 2D backdrop with one-tap hotspots. It has no DEMO ribbon.
- Dots are static. The first tap shows a Thai name. The second tap acts.
- Door → event select, a 3-page cutscene, difficulty, the house map, then the living room, study, and kitchen.
- The living room clock lists hour slots. The living-room calendar lists days and can travel to yesterday or this afternoon. Leaving the living room returns the slot to “now”.
- The case button opens the evidence notebook. With E01, E02, and E04 it opens the case board. The star-box lock opens the sliding-block puzzle only after the case is deduced. Winning that puzzle opens the album. The postcard sends the player home with the portrait reward, which can be placed on an empty decor slot in the player room.
- The nightstand opens the practice grid and its level maps (crossword, jigsaw, sliding block).
- Text size uses the phone setting (`sm` / `md` / `lg`). Sound is remembered but not played yet.
- A 3-step lesson shows on the first launch only.

Every screen other than the player room is a 2D image scene ported from `prototypes/poc-clickthrough`, with the same pictures and tap spots. `public/data/screens.json` is the registry. Each entry has `screen` and `status`: `demo` or `real`. A demo screen shows a static diagonal **DEMO** ribbon in the top corner. The ribbon does not receive taps. Set `status` to `real` and the ribbon for that screen disappears. `return-home` is `real` because the reward is placed in the player room. `player-room` is `real`.

| Screen | Status |
|---|---|
| player-room | real |
| return-home | real |
| event-select, cutscene, difficulty, house-map | demo |
| living-room, study, kitchen, kitchen-close, table, tray, grandma, uncle, star-box | demo |
| crossword, jigsaw, slide | demo |
| notebook, case-board, album | demo |
| practice, level-map | demo |

Clock, calendar, and day travel are overlays on the living room, so they use that screen's ribbon.

Story content (events, spots, evidence, dialogues, practice cards) lives in `public/data/case-flow.json` with the same `id` / `kind` / `title` / `slug` model. Room positions stay in `public/data/player-room.json`. `scripts/author-flow.mjs` is the authoring source for the flow files. Do not regenerate it casually: ids are assigned in call order.

The UI fonts are Noto Sans and Noto Sans Thai, licensed under the SIL Open Font License 1.1 (`src/fonts/OFL.txt`).

## Asset browser

Open `#/assets` for the responsive project catalog. It reads the model registry,
per-asset manifests and checked-in image files, keeping models distinct from 2D
artwork and reference crops. Search Thai/English titles, filenames or source paths;
filter by type; switch grid/list; inspect metadata; download images or GLBs; open
any model variant directly in the 3D editor. Filters, sort, layout and selection
are preserved in the URL. The editor's back button returns to the selected asset.

The current catalog has two editable models (four GLB variants), 18 artwork JPGs
and two reference crops. Render thumbnails come from existing project QA renders.
Source paths are informational, not links to hosted Blender/source files. The
catalog does not upload, delete, import or change game assets. Model/camera drafts
continue to use the editor's existing local storage and file-export behavior.

### Comparison and Bring to view

In image and camera-match views, use the **เทียบภาพ** icon in the right toolbar
for the before/after wipe. Drag its yellow line or 48-pixel handle; arrow keys
move 1%, Shift+arrow and Page Up/Down 10%, Home/End reach either edge, and
Enter/Space or double-click returns to 50%. There is no floating comparison
button over the reference image.

**เข้าภาพ / Bring to view** moves and uniformly rescales the entire model into
the center of the chosen reference image, not merely the viewport. It handles
objects outside/behind the camera and incorrect huge or tiny scales. It stays
in the current image/matching mode and fits the reference image on screen.
The solved camera, guide lines, part rotations, pivots and relative layout are
preserved. The reference-image center may differ from the camera principal
point. This is a recovery placement, not an automatic geometry-to-photo match.

This operation is a real model edit and creates one model-history step. The
persistent **ย้อนกลับ** action restores the previous positions/scales even in
camera-match mode, whose regular Undo operates on guides. It disappears after
another model edit, so it cannot overwrite newer work. Normal model Undo/Redo,
JSON drafts and exported edits also retain the operation. Hidden non-deleted
parts move with the whole model, keeping their flags; deleted parts remain
unchanged. Fully hidden or zero-sized models report an error without changes.

Bring to view turns off the wipe and difference blend and shows the model at
100% opacity. In free 3D/orbit mode, **กลางจอ** remains view-only framing; it
does not perform the image-placement edit. WebGL failure is reported rather
than claiming success.
