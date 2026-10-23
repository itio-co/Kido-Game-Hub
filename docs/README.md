# Repository layout

Kido Game Hub is a monorepo. Each game owns its own folder under `games/`, including that game's app, docs, and prototypes.

```
games/never-ending-story/     Never Ending Story (npm name never-ending-story-game)
  docs/design/                Thai specs, design decisions, story packs, concepts
  prototypes/                 early demos (asset-showcase, poc-clickthrough)
  assets-src/<slug>/          self-contained source for one asset (nightstand, …)
games/starship/               Starship Interior (npm name starship-interior)
packages/                     code and tooling shared by more than one game
docs/                         repo-wide conventions (this file)
```

Root `package.json` workspaces are `packages/*` and `games/*`. A direct child of `games/` that has a `package.json` is a workspace. There is one lockfile, at the repository root.

## What each game owns

A game's app, design docs, story content, prototypes, and per-asset source stay inside `games/<name>/`. Do not put one game's files at the repository root or inside another game's folder.

The folder name and the npm package name do not have to match. `games/starship` publishes as `starship-interior`. `games/never-ending-story` publishes as `never-ending-story-game`.

## Shared work goes through the organizer

Anything used by more than one game is coordinated with the repo organizer, **Kido Game Hub**, before it is added. That includes:

- packages under `packages/`
- shared scripts, commands, and tooling
- i18n conventions
- shared assets

See [packages/README.md](../packages/README.md).
