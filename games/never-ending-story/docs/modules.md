# Modules (modular monolith)

The game ships as one bundle but the code is split into modules under `src/modules/<id>/`.

| id | kind | owns |
|---|---|---|
| `core` | core | everything outside `src/modules/` (app shell, hub room, flow engine, save, i18n, cloudSync, prologue, `/never/god`, `worker/`). Its version **is the app version** in `package.json`. |
| `crossword`, `jigsaw`, `slide` | minigame | puzzle rules + board state |
| `stirfry` | minigame | Stir-fry with Grandma (component + local save) |
| `challenge` | feature | challenge mode: seeded runs, scoring, share links, protobuf run token, leaderboard views |
| `event-01` | event | Event 01 (`case-01`); story data in `public/data/case-flow.json` |

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
