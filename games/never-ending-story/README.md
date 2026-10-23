# Never Ending Story Game

This game lives at `games/never-ending-story/`. Thai specs and story packs are in `docs/design/`. Early demos are in `prototypes/`. Per-asset source folders stay under `assets-src/<slug>/`.

Playable first screen: the player's room (hub). Portrait, touch-first. Svelte draws the HUD. Three.js draws the low-poly room from `public/data/player-room.json`, matched to `prototypes/poc-clickthrough/img/player-room-wide.jpg`.

Progress is saved in `localStorage` on this device. There is no account.

## Run

```bash
cd games/never-ending-story
npm install
npm run dev
```

This folder is an npm workspace of the repo root. `npm install` here installs into the root `node_modules` and updates the root `package-lock.json`. There is no `games/never-ending-story/package-lock.json`. Running `npm install` at the repo root does the same.

Open the URL Vite prints (default `http://localhost:5173`) on a phone, or use a narrow portrait window such as 390×844.

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
npm test
```

`npm test` runs the unit tests and the i18n guard (see [Languages (i18n)](#languages-i18n)).

`npm run validate` reads `public/data/player-room.json`, `public/data/screens.json`, and `public/data/case-flow.json`. It fails if any id or slug is duplicated, an id is not a UUID v4 stored in the file, a slug is not unique kebab-case, a title is missing, a kind is unknown, or a reference (`targetId`, `stackOn`, `hintTarget`, calendar `theme`) points at a missing id. The game runs the same check when the room and the story flow load.

## Languages (i18n)

The game ships Thai and English. The i18n code lives inside this game (`src/lib/i18n/`); there is no i18n library.

- **English is the source language.** Keys are dotted English names grouped by area: `editor.match.setOrigin`, `game.settings.title`, `asset.nightstand.title`.
- **Translations live only in the locale files**: `src/locales/en.json` and `src/locales/th.json` for the UI, and `src/locales/story.en.json` / `story.th.json` for the case story text used by `scripts/author-flow.mjs`. Code, comments, docs, and identifiers are English. Thai appears only in `th.json` and `story.th.json` (plus the language's own name, `locale.name.th`).
- **Two independent locales.** The 3D editor (`#/editor`) defaults to English; the rest of the game defaults to Thai. The editor header has an EN / TH switch, saved in `localStorage` as `nes-locale-editor`. The game's Settings panel has its own switch, saved as `nes-locale-game`. The active scope follows the route.
- **`t(key, params)`** (`src/lib/i18n/core.ts`) is typed: `key` must exist in `en.json`. `{name}` placeholders are filled from `params`. A key missing from the active locale falls back to English, then to the key itself. `t()` reads the reactive locale state (`src/lib/i18n/locale.svelte.ts`), so markup that calls it re-renders when the language changes. Editor code goes through the typed facade `src/lib/editor/strings.ts`.
- **Content data** (`public/data/*.json`) keeps the default text in a field and English in an `En` sibling: `title` / `titleEn`, `text` / `textEn`, `lines` / `linesEn`. Read it with `tx(obj, 'title')` or `txList(obj, 'lines')` from `src/lib/i18n/content.ts`. Logic uses ids rather than text: difficulty is `easy` / `medium` / `hard`, and practice groups are `word` / `picture` / `logic`. Older saves that stored Thai labels are migrated when read.

### Add a string

1. Add the key to `src/locales/en.json` (English) and `src/locales/th.json` (Thai), using the same `{placeholders}`.
2. Use it: `t('game.settings.title')`, or `t('game.notebook.found', { code })`.
3. Run `npm test`.

For story text, add the key to `story.en.json` and `story.th.json`, reference it in `scripts/author-flow.mjs` with `S('story.…')`, and regenerate with `node scripts/author-flow.mjs`. Each marker becomes a Thai field plus its `En` sibling in the JSON.

### Add a locale

1. Add the code to `LOCALES` in `src/lib/i18n/core.ts`, then create `src/locales/<code>.json` (and `story.<code>.json`) with every key. Register the import next to `th` in `core.ts`.
2. Add `locale.name.<code>` to every locale file; the language switches list `LOCALES` automatically.
3. Content data and the parity guard know only `th` + `En` siblings; extend `tx()` and `tests/i18n.test.mjs` for a third language.

### The guard

`npm test` runs `tests/i18n.test.mjs`. It fails when:

- a Thai character (U+0E00–U+0E7F) appears in `src/**/*.{ts,svelte,js,mjs}`, `scripts/`, or `tests/` (the locale JSON files are the only allowed place);
- a key exists in one locale file and not in its pair, or the `{placeholders}` differ;
- a key is not a dotted English name, or an English value contains Thai;
- a key is not used anywhere in the code. A key counts as used when it appears as a quoted literal or matches a template prefix such as `` `game.difficulty.${id}` ``.

Data-validation messages in `src/lib/catalog.ts` are plain English, because that file must load without runtime imports (`npm run validate`). They are developer diagnostics, not player text.

## Model editor: Blender conventions

The 3D model editor (`#/editor`) uses Blender's keymap and terms. The camera-match guide-line tools keep their
own controls. Touch devices keep the on-screen buttons (Move / Rotate / Scale tools, Options, Set Origin,
Place 3D Cursor).

| Keys | Action |
|---|---|
| LMB | Select a part (the whole object in Whole object scope) / drag a gizmo handle |
| MMB drag | Orbit (orbit view); pan the 2D window (mock-up view) |
| Shift+MMB drag | Pan |
| Wheel | Zoom |
| Shift+RMB | Place the 3D cursor (touch: Place 3D Cursor tool, then tap) |
| Shift+C | Reset the 3D cursor and frame all |
| G / R / S | Modal grab / rotate / scale. Mouse drives the value; click or Enter confirms; RMB or Esc cancels |
| X / Y / Z (in a modal) | Constrain to Blender's global axis (X right, Y back, Z up); press twice for the local axis |
| Digits, `-`, `.`, Backspace (in a modal) | Type an exact value (cm, degrees, or a factor) |
| Ctrl (in a modal) | Toggle snapping while held |
| Shift (in a modal) | Precision (slower movement) |
| Shift+D | Duplicate, then grab |
| X / Delete | Delete (asks for a confirm) |
| A / Alt+A | Select the whole object (Object mode on the asset root) / deselect |
| Alt+G / Alt+R / Alt+S | Clear the whole object's location / rotation / scale |
| Numpad . (F alias) | Frame selected |
| Home | Frame all |
| N | Toggle the sidebar |
| Ctrl+Z / Ctrl+Shift+Z (Ctrl+Y) | Undo / redo |
| Ctrl+S | Save the edit files (dev server) |

Options > Transform > **Affect Only Origins** moves only the part's origin. **Set Origin** offers Origin to
Geometry, Origin to 3D Cursor, Geometry to Origin, Origin to Bottom and Reset Origin. Axes use Blender's colours
(X red, Y green, Z blue) and directions (X right, Y back, Z up), also inside G / R / S. A status bar at the top of the viewport (Blender: bottom of the window) shows the running modal's value and keys. Thai labels keep
the Blender term in parentheses.

Known differences from Blender: one part (or the whole object) is selected at a time (no multi-select) and there are no edit modes; whole-object scale is uniform and locked by default;
Space+drag also pans the mock-up; Esc does not deselect; the Place 3D Cursor tool stays on until toggled; the
cursor is not saved; rotate snap is 15°; scale along a global axis uses the part's local axes; R / S do not
affect origins; Ctrl+MMB pans instead of zooming; Delete asks for a confirm; Origin to Bottom and the F alias are
extras; menus are popovers, not pie menus.

### Whole-object placement

The toolbar's **Part / Whole object** toggle sets the selection scope; **A** or the root row at the top of the
parts list selects the whole object. Its sidebar panel shows Blender's Location (cm), Rotation (degrees, XYZ
Euler) and a uniform Scale. G / R / S / gizmo / typed values work as for parts (R defaults to a Z yaw, like
rotating about the view axis seen from above); grid snap applies, and **Snap base to floor** (on by default, Ctrl
toggles snapping) lands a base within 3 cm of Z = 0 exactly on the floor. Scale is locked by default because it
changes the furniture's real size. Set Origin works on the object origin.

| Data | Where |
|---|---|
| `placement` `{positionCm, rotationDeg, scale, originCm?}` | `<variant>.edits.json` (only when moved; older files load unchanged), the local draft and the dev save API; undoable |
| GLB export | the placement is the GLB root node's transform; *Bake placement into the parts* puts it on the parts below the root instead |
| Camera match | the mock-up camera stays in world space, so moving the object moves it in the mock-up; the solver works in the object's frame |

## Scene objects

Every authored object — the room, walls, bed, wall shelf, shelf rows, books, door, hotspots, decor slots, calendar, themes, and entries — stores:

| Field | Meaning |
|---|---|
| `id` | Stable UUID v4. Written in the JSON. Not generated at runtime. |
| `kind` | Type name (`room`, `bookshelf`, `shelf-row`, `book`, `hotspot`, `decor-slot`, `door`, …). The kind registry maps each kind to a builder or a non-mesh role, and the scene is built by dispatching on `kind`. |
| `title` | Default (Thai) name. English in the `titleEn` sibling (see [Languages (i18n)](#languages-i18n)). |
| `slug` | Unique kebab-case path, such as `player-room/bookshelf/row-1/book-03`. |

Links between objects use `id`. `SceneCatalog.getById` and `getBySlug` look an object up after validation.

The wall shelf is a Three.js group: `bookshelf` → `shelf-row` → `book`. Each book is its own mesh. Rows and books are data, so another room can reuse the same builder.

## This build

- The game opens in the player's room. That room is a real 3D scene. It has no DEMO ribbon.
- Dots are static. The first tap shows the object's name. The second tap acts.
- Door → event select, a 3-page cutscene, difficulty, the house map, then the living room, study, and kitchen.
- The living room clock lists hour slots. The living-room calendar lists days and can travel to yesterday or this afternoon. Leaving the living room returns the slot to “now”.
- The case button opens the evidence notebook. With E01, E02, and E04 it opens the case board. The star-box lock opens the sliding-block puzzle only after the case is deduced. Winning that puzzle opens the album. The postcard sends the player home with the portrait reward, which can be placed on an empty decor slot in the real room.
- The nightstand opens the practice grid and its level maps (crossword, jigsaw, sliding block).
- Text size uses the phone setting (`sm` / `md` / `lg`). Sound is remembered but not played yet. Settings also switch the game language (ไทย / English).
- A 3-step lesson shows on the first launch only.

Every screen other than the player room is a 2D image scene ported from `prototypes/poc-clickthrough`, with the same pictures and tap spots. `public/data/screens.json` is the registry. Each entry has `screen` and `status`: `demo` or `real`. A demo screen shows a static diagonal **DEMO** ribbon in the top corner. The ribbon does not receive taps. Set `status` to `real` and the ribbon for that screen disappears. `return-home` is `real` because the reward is placed in the 3D room. `player-room` is `real`.

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
