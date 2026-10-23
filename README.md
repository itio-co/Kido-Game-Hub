# Kido-Game-Hub

An npm-workspaces monorepo: games plus shared packages.

| Path | What |
|---|---|
| [`game/`](game/) | Never Ending Story Game. It will move to `games/never-ending-story/`. |
| [`games/`](games/) | Planned home of every game. See [games/README.md](games/README.md). |
| [`packages/mesh-editor/`](packages/mesh-editor/) | `@itio/mesh-editor`, the shared 3D mesh editor. The API contract is in [API.md](packages/mesh-editor/API.md). |

```bash
npm install                 # once, at the repo root (one lockfile for every workspace)
npm run build               # builds game/ into game/dist (same output as before)
npm run build:packages      # builds packages/mesh-editor/dist
npm test                    # mesh-editor tests
```

`cd game && npm install && npm run build` still works. npm finds the root workspace and installs into the root `node_modules`.

## Never Ending Story Game

The playable first screen (the player's room) is in [`game/`](game/). See [game/README.md](game/README.md) for `npm run dev` and `npm run build`.