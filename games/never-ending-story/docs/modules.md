# Modules (modular monolith)

The game ships as one bundle but the code is split into modules under `src/modules/<id>/`.

| id | kind | owns |
|---|---|---|
| `core` | core | app shell, hub room, save, i18n, cloudSync, prologue, `worker/`. Its version **is the app version** in `package.json`. |
| `minigame-core` | minigame-core | shared minigame framework: lifecycle, play mode, ruleset key, share paths, run token, ruleset HUD shells |
| `crossword`, `jigsaw`, `slide` | minigame | puzzle rules + board state; depend on `minigame-core` |
| `rhythm` | engine | rhythm mechanism; depends on `minigame-core` |
| `stirfry` | pack | Stir-fry with Grandma; depends on `rhythm` and `minigame-core` |
| `challenge` | feature | puzzle challenge mode and leaderboards. Stays its own feature and depends on `minigame-core` (see below) |
| `event-core` | event-core | shared event framework: cutscenes, stage map, case notebook, event HUD, D1 progress document |
| `event-01` | event | Event 01 content (`case-01`) on top of `event-core` |
| `character` | character | people already in the story: names, portraits, generation prompts |
| `cutscene` | cutscene | Cut Scene: prologue, case-01 opening/ending, and room art; people in a frame are character ids |

## Manifest

Each module has `src/modules/<id>/module.json`:

```json
{
  "id": "challenge",
  "name": "Challenge mode",
  "kind": "feature",             // core | feature | minigame | event (other kinds are shown as their own group)
  "version": "1.0.0",            // semver; core uses "app" = package.json version
  "description": "…",
  "entry": "src/modules/challenge/index.ts",
  "publicEntries": ["src/modules/challenge/index.ts", "src/modules/challenge/proto.ts"],
  "dependsOn": { "core": ">=0.6.0", "crossword": "^1.0.0" }
}
```

Supported ranges: exact `1.2.3`, `^1.2.3`, `~1.2.3`, `>=1.2.3`, `*` (space-separated = AND).

## Rules

- Code outside a module imports it **only through a file listed in `publicEntries`** (usually `index.ts`). No deep imports such as `modules/slide/puzzle`.
- Modules may import core (`src/lib/*`) freely.
- `npm run check:modules` checks boundaries and that every `dependsOn` range is satisfied. `npm run build` runs the same boundary check and fails on a violation.

## Registry

`npm run build` writes `dist/modules.json` (id, kind, version, deps with satisfied flag, source size, file count, content hash, last git commit touching the module). It is uploaded to KV with the other files but is **not public**: the Worker serves it only through the admin API `GET /never/api/god/modules`, shown on `/never/god#/modules`.

## Bumping a version

1. Change code inside `src/modules/<id>/`.
2. Bump `version` in that module's `module.json`:
   - patch (`1.0.1`): bug fix, same behaviour/API
   - minor (`1.1.0`): new exports or features, backwards compatible
   - major (`2.0.0`): changed/removed exports or save format
3. On a major bump, update the `dependsOn` ranges of modules that use it (`npm run check:modules` tells you which).
4. Core changes bump the app version in `package.json` as before (`v0.6.x`).
5. Mention `module@version` in the commit message, e.g. `feat(nes): slide@1.1.0 add undo`.

## Mechanisms and packs

A **mechanism** (`kind: "engine"`) owns the rules: timing, judging, combo, scoring, difficulty, run store, and server submission. A **pack** (`kind: "pack"`, called `edition` before 0.6.11) reuses one mechanism and supplies theme, art, Stage component, sounds, copy and params.

- The pack's `module.json` has a `pack` block: `{ "mechanism": "rhythm", "leaderboardId": "stirfry", "storageKey": ..., "route": ..., "params": ... }` and `dependsOn` the mechanism. `check:modules` still accepts a legacy `edition` block.
- Rhythm packs implement `RhythmPack` (`src/modules/rhythm/types.ts`): `id`, `leaderboardId`, `copy` (i18n prefix), `storageKey`, `route`, `version`, `rulesets`, `theme`, `Stage` (gets `StageProps`: progress, pressure, pressureZone, combo, beat, extraDue, last judgement, pulse, packVersion) and optional hooks `onBeat` / `onJudge` / `onFinish`.
- Leaderboards are keyed by the pack's `leaderboardId` **and** the ruleset (engine version + pack version). The app version is not part of that key.
- The registry lists `pack` on packs and `packs` (ids) on mechanisms, and still emits `edition` / `editions` as aliases. `/never/god/games/<id>` shows the relationship.
- God admin is its own module (`kind: "admin"`, `src/modules/god`). The page is still `/never/god` and the API is still `/never/api/god/*`.
- `npm run check:modules` requires every `minigame`, `engine`, and `pack`, plus the `challenge` feature, to depend on `minigame-core`. Every `event` must depend on `event-core`.

## Why challenge stays a feature

`minigame-core` is the shell every game shares. `challenge` is the crossword/jigsaw/slide product: seeded boards, its scoring `ruleset.json`, the versus banner, and the leaderboard screen. Folding that into the framework would make rhythm and stir-fry depend on puzzle boards. Challenge imports the framework's public entry for paths, phases, the run token, and the ruleset shells.

## Event content vs framework

`event-core` plays whatever story pack is loaded. `event-01` only names the case (`EVENT_ID`, ending id, image list) and the JSON in `public/data/case-flow.json`. The first unlocked event is still `case-01`, and its ending pages are still `case-01-ending`.

## Rulesets

Gameplay params (chart generation, timing windows, scoring, pack thresholds) live in `src/modules/<id>/ruleset.json`, one entry per module version that must stay playable. `ruleset.ts` next to it is a public entry.

- A share link carries every module that affects the run, in a path segment: `rhythm@1.1.0+stirfry@1.2.0` (canonical form sorts ids). Puzzle links look like `#/challenge/cross/medium/482913/challenge@1.1.0+crossword@1.0.0`.
- A link with no segment is the **v0.6.10 ruleset** (`src/lib/ruleset-games.json` → `legacy`). Today that matches the current params, so old links and new shares land on the same board.
- Changing a gameplay param means: bump that module's version, add a `ruleset.json` entry for the new version, leave the old entry in place. `npm run check:modules` fails if the current version is missing, or if a legacy pin is missing.
- An unknown version shows a localized notice and a button to play the current ruleset instead.
- The server stores `runs.ruleset` and partitions `GET /leaderboard` by game + difficulty + ruleset. Submitted rulesets must be on the allowlist (every registered combination of that game's modules). Empty `ruleset` on an old token is stored as the v0.6.10 ruleset.
- Existing D1 databases: run `worker/migrations/002_ruleset.sql` once. Fresh installs already have the column from `worker/schema.sql`.

## GDD per module

Every module has a Thai GDD from `docs/gdd/TEMPLATE.md`, linked by `"gdd"` in `module.json` (core: `docs/gdd/core.md`). `npm run check:modules` fails if a GDD is missing. The registry embeds the markdown; god shows it in the **GDD** tab of `/never/god/modules/<id>` and `/never/god/games/<id>`.
