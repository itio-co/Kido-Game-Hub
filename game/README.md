# Never Ending Story Game

Playable first screen: the player's room (hub). Portrait, touch-first. Svelte draws the HUD. Three.js draws the low-poly room from `public/data/player-room.json`, matched to `prototypes/poc-clickthrough/img/player-room-wide.jpg`.

Progress is saved in `localStorage` on this device. There is no account.

## Run

```bash
cd game
npm install
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173`) on a phone, or use a narrow portrait window such as 390×844.

## Build a static preview

```bash
npm run build
npm run preview
```

`npm run build` writes a static site to `game/dist`. `npm run preview` serves that folder. Asset paths are relative, so the same `dist` folder can be hosted as static files.

## Checks

```bash
npm run check
npm run validate
```

`npm run validate` reads `public/data/player-room.json` and fails if any id or slug is duplicated, an id is not a UUID v4 stored in the file, a slug is not unique kebab-case, a title is missing, a kind is unknown, or a reference (`targetId`, `stackOn`, `hintTarget`, calendar `theme`) points at a missing id. The game runs the same check when the room loads.

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

## This screen

- The game opens in the player's room.
- Dots are static. The first tap shows a Thai name. The second tap acts.
- Door → placeholder screen **เลือกเหตุการณ์**
- Nightstand (practice corner), calendar, and decor slots → stub panels. The case-book button opens the case stub. There is no computer desk or cork board in this room; those are not in the reference picture.
- Hint, text size, and the sound switch are on the cyan HUD line. Sound is remembered but not played yet.
- A 3-step lesson shows on the first launch only.

Room positions, hotspots, calendar entries, and lesson text live in `public/data/player-room.json`, in the same spirit as a Story Pack: content in data, not hard-coded coordinates.

The UI fonts are Noto Sans and Noto Sans Thai, licensed under the SIL Open Font License 1.1 (`src/fonts/OFL.txt`).
