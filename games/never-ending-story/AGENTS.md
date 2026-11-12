# Never Ending Story: instructions for AI contributors

## Read before editing

- Follow `docs/modules.md`, the affected module's `module.json` and Thai GDD,
  and `docs/build.md`. Read `docs/deploy-cloudflare.md` for hosting changes.
- Inspect branch, status and diffs before work. Preserve unrelated edits and
  existing local commits. Do not reset, discard, or silently substitute an older
  checkout. A successful build does not prove all requested editor changes exist.
- Explain your understanding and planned changes when responding to UI annotations.

## Current system, not a hypothetical deployment platform

- This is an npm-workspace modular monolith. `vite.config.ts` builds game
  `index.html` and Game of Dev `god.html` together and emits `modules.json`.
- `/never/god` is Game of Dev, the developer/admin workspace, with its own
  protected `/never/api/god/*` API. Its module registry and GDD views describe
  installed source modules; they do not dynamically install executable bundles.
- The existing Cloudflare deployment uses one `nes-game` Worker, KV static
  assets and D1. Separate source modules or chunks are NOT independent releases.
- Keep imports through declared `publicEntries`, maintain `dependsOn`, use the
  existing version/ruleset policy, and update the affected Thai GDD.

## Intended evolution: implement explicitly, do not imply it already exists

The requested direction is an editor module containing Asset Browser, Scene
Editor, Item Editor and future Cut Scene authoring, hosted within God rather
than a competing top-level workspace. Start with that cohesive authoring module;
extract smaller modules only when their contracts justify it. Keep domain/game
modules independent of editor UI and reuse `packages/mesh-editor` for mesh tools.

- Scene Editor owns scene assembly, whole-object placement and scene camera
  alignment. Keep placement and alignment in ONE persistent Scene Editor.
- Item Editor edits an asset's parts. A scene image is a viewport reference,
  restricted to scenes containing that item; it must not edit the scene camera.
- Preserve legacy links, selection, undo history and draft keys when changing
  routing. Do not bring back confusing whole-item/scene mode switches.
- Future independent frontend releases require a real build entry, immutable
  versioned artifacts, a manifest/registry loader, host/dependency compatibility
  checks, authenticated activation, and rollback. A manifest alone is insufficient.
- Keep the backend shared initially. Worker/API changes and database migrations
  have a coordinated lifecycle separate from optional frontend module releases.
- Exclude editor-only chunks from the game's service-worker precache when the
  split is implemented. Test actual downloads, base paths and deep links.
- God API authentication is not frontend secrecy. Enforce authoring/activation
  permissions on the server. `/__editor/files` is a local Vite development API,
  not cloud persistence. Never claim hosted file saving works without implementing
  and testing an authenticated storage API.

## Build and verification

From the repository root, use `make help`, then `make verify`. See `docs/build.md`
for prerequisites and focused targets. Keep npm scripts authoritative and update
Makefile wrappers when those scripts change. Do not create fake `build-module`
or `deploy-module` targets that merely rebuild/publish the entire app.

For UI or routing changes, also test game and God, direct/legacy links,
Back/Forward, repeat selection, and interrupted editor operations in a browser.
Report checks passed, warnings, failures and checks not run separately.

## Deployment and secrets

- Build/check commands are local only. Do not deploy, push, activate module
  versions, change Cloudflare permissions, or migrate D1 without authorization.
- Never put tokens, passwords or private signing material in source, manifests,
  static bundles, logs or GDD. Use approved secret storage and Cloudflare secrets.
- Preserve existing Cloudflare bindings and authentication secrets on deployment.
  Keep old hashed static assets for old clients; do not bulk-delete KV to deploy.
- Keep Worker output outside public `dist`. Validate the exact intended source,
  artifact, target and migration compatibility before release. Verify live routes
  and report deployment identity only after successful publication.
