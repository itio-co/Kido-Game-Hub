# Never Ending Story Game

Playable first screen: the player's room (hub). Portrait, touch-first. Svelte draws the HUD. Three.js draws the low-poly room from `public/data/player-room.json`.

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
```

## This screen

- The game opens in the player's room.
- Dots are static. The first tap shows a Thai name. The second tap acts.
- Door → placeholder screen **เลือกเหตุการณ์**
- Desk (practice corner), calendar, decor slots, and the case board → stub panels
- Hint, text size, and the sound switch are on the cyan HUD line. Sound is remembered but not played yet.
- A 3-step lesson shows on the first launch only.

Room positions, hotspots, calendar entries, and lesson text live in `public/data/player-room.json`, in the same spirit as a Story Pack: content in data, not hard-coded coordinates.

The UI fonts are Noto Sans and Noto Sans Thai, licensed under the SIL Open Font License 1.1 (`src/fonts/OFL.txt`).
