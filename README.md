# Kido Game Hub

npm-workspaces monorepo for Kido games and the code they share. Each game owns one folder under `games/`. Shared packages live in `packages/`. Repo-wide rules are in [docs/README.md](docs/README.md).

| Path | npm name | What |
|---|---|---|
| [`games/never-ending-story/`](games/never-ending-story/) | `never-ending-story-game` | Never Ending Story Game (Svelte + Vite PWA). Specs: [docs/design](games/never-ending-story/docs/design/). Prototypes: [prototypes](games/never-ending-story/prototypes/). |
| [`games/starship/`](games/starship/) | `starship-interior` | Starship Interior (SvelteKit). The folder is `games/starship`; the package name stays `starship-interior`. It depends on `@itio/mesh-editor`. |
| [`packages/mesh-editor/`](packages/mesh-editor/) | `@itio/mesh-editor` | Shared 3D mesh editor. Contract: [API.md](packages/mesh-editor/API.md). |

Install once, from the repository root. There is one lockfile, `package-lock.json`.

```bash
npm ci
npm run build:packages              # packages/mesh-editor/dist (Starship imports this)
npm run dev                         # Never Ending Story, http://localhost:5173
npm run build                       # games/never-ending-story/dist
npm run check                       # mesh-editor typecheck + Never Ending Story check
npm test                            # mesh-editor tests
npm test -w never-ending-story-game # editor unit tests + dev save-API tests

npm run dev -w games/starship       # Starship Interior (Node 22+; build packages first)
npm run check -w games/starship
npm run build -w games/starship     # games/starship/build
```

`npm run dev -w starship-interior` is the same workspace, addressed by package name. Anything added under `packages/` (or any other shared scripts, commands, tooling, i18n conventions, or shared assets) is coordinated through the repo organizer, Kido Game Hub. See [packages/README.md](packages/README.md).
