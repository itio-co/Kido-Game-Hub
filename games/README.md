# games/

Each folder here is one game: its own npm workspace with its own `package.json`, build, and deploy output. Games share code through `packages/` (for example `@itio/mesh-editor`). A game also keeps its own docs and prototypes inside its folder.

| Folder | npm name | Game |
|---|---|---|
| [`never-ending-story/`](never-ending-story/) | `never-ending-story-game` | Never Ending Story Game (Svelte + three.js, Vite). Specs are in [`never-ending-story/docs/design/`](never-ending-story/docs/design/). Prototypes are in [`never-ending-story/prototypes/`](never-ending-story/prototypes/). |
| [`starship/`](starship/) | `starship-interior` | Starship Interior (SvelteKit). The folder is `starship`; the package name stays `starship-interior`. |

Root `workspaces` is `["packages/*", "games/*"]`. Every direct subfolder of `games/` that has a `package.json` becomes a workspace, so don't put a stray `package.json` (scratch, experiment, copied template) directly under `games/<name>/` unless it is meant to be a game.

Rules for a game folder:

- Its `package.json` has a unique `name` and the usual `dev`, `build`, and `preview` scripts. `build` writes to the game's own `dist/` (or `build/` for SvelteKit static output).
- Dependencies are installed from the repo root (`npm install`). There is one lockfile, `package-lock.json` at the root. Don't commit a lockfile inside a game folder.
- To use a shared package, depend on it by name (`"@itio/mesh-editor": "*"`) and build it before the game.
- No secrets in the repo. Put local settings in `.env.local`, which is git-ignored.
