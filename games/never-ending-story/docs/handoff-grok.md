# Never Ending Story: handoff to Grok bot

Updated 2026-11-08. The user paused further game development by dot and requested
all available work committed and pushed for handoff. No ongoing development or
deployment is implied by this document.

## Repository and source

- Repository: https://github.com/itio-co/Kido-Game-Hub
- Handoff branch: `integration/cloudflare-main-20261107`
- Upstream main integrated: `c9be89e` through merge `3872176`.
- Preserved original local editor work: `43c79e0` (selection modes), plus its
  ancestor local commits. The four dirty paths left in the original checkout
  were checked byte-for-byte against this preservation commit and are included.
- Build Makefile and AI guidance: `e99f27b`.
- Deployed source: `0d1b09e`, app version `0.6.14`.
- This handoff document is a later documentation-only commit. Do not assume it
  changes the deployed application.

## Deployed spaces

- Dev: https://games.itio.space/dev/never/
- Dev God: https://games.itio.space/dev/never/god
- Legacy production: https://games.itio.space/never/
- Platform URL direction: `/<space>/never/`; `/never/dev/` is superseded.
- Dev Worker: `nes-game-dev`, version `983ec881-b2ac-4c52-b450-7ee4657931bd`.
- Dev uses separate KV and D1. See `deploy-cloudflare.md` for bindings/resources.
- Production was not changed by this work; last verified version was
  `692da37f-4d3b-41f5-a876-5cf3890b8c70`.
- God admin is deliberately locked in dev until a separate
  `GOD_ADMIN_PASSWORD` secret is securely configured. Do not copy production
  credentials or put passwords/tokens in source.

`APP_BASE=/dev/never` configures the Worker base. Browser drafts/saves and God
cookies are namespaced; the dev service worker is network-only. Path spaces are
not browser-origin security boundaries. Use separate hosts for untrusted code.

## Architecture and user decisions

Read `../AGENTS.md`, `modules.md`, `build.md`, and each affected module's Thai
GDD before changing architecture. `/never/god` means **Game of Dev**, the
existing developer/admin workspace, not just an incidental admin page. Its
frontend entry and protected API share the current Worker and database.

The user wants the Asset Browser and editors separated into modules, within
God. Independently deployable frontend modules are a proposed evolution, NOT an
implemented capability. Current builds bundle game and God together and emit a
registry. A module manifest alone neither loads executable UI nor deploys it.
Begin with a cohesive authoring module and implement real build/loading/version
contracts before claiming independent releases. Game Hub ownership under Kido
or DevSpace remains exploratory.

Scene Editor owns assembly, whole-item placement and camera alignment in one
persistent workspace. Item Editor owns asset-part editing, with scene viewports
as references. Do not revive separate scene-placement/alignment pages or
confusing whole-item/scene switches. Explain understanding and intended changes
before implementing user UI annotations.

## Known gaps: do not treat this as the latest intended UI

- The available integration checkout lacks the later unified Scene Editor
  changes reported in earlier conversations. Locate/reconcile those changes
  before claiming the latest UI is present. Do not overwrite newer work.
- Editors are the older available UI and are not independently deployed modules.
- `/__editor/files` is a localhost Vite save API. Hosted drafts/downloads do not
  constitute a cloud authoring/save backend.
- God dev admin login is not usable until its separate secret is configured.
- 3D/WebGL manipulation has not been visually verified in the test browser.

## Verification and operation

From repository root: `make help`, then `make verify`. `make -j4 verify` passed
for deployed commit `0d1b09e`: checks, module boundaries, tests, packages,
game/God assets, and Worker bundle. Existing Svelte/bundle-size warnings remain.
Make targets build locally; they do not upload or deploy.

Live smoke tests for dev passed: game/God/deep God routes, Asset Browser and
editor launch, leaderboard, synthetic registration, state write/read, and
network-only service worker. Public `modules.json` returned 404 as intended.
Browser lacked WebGL, so editor loading is not proof of 3D interaction.

Keep old hashed assets, isolate dev resources, and verify the exact source and
target before any new deployment. Do not force-push or silently merge this
branch into main. The original checkout was preserved and no new deployment
was performed for this handoff.
