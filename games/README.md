# games/

Each folder here is one game: its own npm workspace with its own `package.json`, build, and deploy output. Games share code through `packages/` (for example `@itio/mesh-editor`).

Planned layout:

| Folder | Game | Status |
|---|---|---|
| `games/never-ending-story/` | Never Ending Story Game (Svelte + three.js, Vite) | Still at [`../game/`](../game/). It moves here after the open editor PRs that touch `game/` are merged. Until then the root workspace list includes `game`. |
| `games/starship-interior/` | Starship Interior (SvelteKit) | GamesBuilder will import the SvelteKit app here. |

Rules for a game folder:

- Its `package.json` has a unique `name` and the usual `dev`, `build`, and `preview` scripts. `build` writes to the game's own `dist/` (or `build/` for SvelteKit static output).
- Dependencies are installed from the repo root (`npm install`). There is one lockfile, `package-lock.json` at the root. Don't commit a lockfile inside a game folder.
- To use a shared package, depend on it by name (`"@itio/mesh-editor": "*"`) and build it before the game.
- No secrets in the repo. Put local settings in `.env.local`, which is git-ignored.
