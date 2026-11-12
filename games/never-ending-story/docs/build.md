# Local builds and module deployment direction

## Supported workflow today

Run GNU Make in the repository root (on Windows, use a working WSL or a GNU Make
installation with a POSIX shell). Use Node 24 LTS for the checked workflow; the
existing validation command uses Node's TypeScript stripping. Install dependencies
from the root lockfile, not a separate game lockfile:

```sh
make install       # npm ci; replaces installed dependencies, not source
make verify        # checks -> tests -> packages -> game/God -> Worker
```

Use `make help` for the command list. From the game directory, use
`make -C ../.. verify`. You can also invoke `make -f /path/to/repo/Makefile verify`
from another directory. `NPM` can be overridden if npm has a different executable.
No target signs in, uploads assets, deploys a Worker, or changes a database.

| Target | What it actually does |
| --- | --- |
| `check` | Shared typecheck, Svelte check, content validation, module boundaries/dependencies/GDD checks |
| `check-modules` | Existing module checker only |
| `test` | Shared mesh-editor tests and the game's test script |
| `test-shared`, `test-game` | Focused test suites |
| `build-packages` | Build shared mesh-editor package |
| `build-web` | Existing Vite build, including game, God, module registry and service worker |
| `build-worker` | Bundle `worker/index.ts` with the locally installed Rolldown |
| `build` | All three builds, in order |
| `verify` | Checks, tests and builds, sequentially even with `make -j` |
| `dev`, `preview` | Vite development or preview server; preview does not rebuild |

Outputs:

- `packages/mesh-editor/dist/`: shared package output.
- `games/never-ending-story/dist/`: game/God static files and `modules.json`.
- `games/never-ending-story/.worker-build/worker.js`: Worker bundle, deliberately
  outside static output. Upload it as Worker code, never as a public KV asset.

The local Rolldown executable comes from the locked toolchain. No build command
uses `npx` to fetch an unpinned tool. Update the lockfile deliberately when changing
build tools. Browser and live deployment verification are separate from `verify`.

## What "module build" means now

`src/modules/*/module.json` defines versioned source boundaries and public entries.
Vite builds the application as a multi-entry release. God displays the generated
module registry and GDDs. Neither the registry nor a separate chunk is an
independently deployable module. There is intentionally no `deploy-module` target.

Cloudflare serves the current app through `nes-game` with KV and D1. See
[deploy-cloudflare.md](deploy-cloudflare.md) for the current protocol. The existing
`scripts/cloudflare/mk.mjs` contains a machine-specific path; it must be made
portable and validated before automated packaging is added. The Makefile does not
call those historical upload-generation scripts or perform migrations.

## Intended next stage (not implemented by this Makefile)

1. Extract a registered editor module, including Asset Browser and the editors,
   integrated into God. Preserve Scene placement/alignment in one editor workspace.
2. Define God-host public contracts, editor lifecycle and dependency rules. Add
   the module's Thai GDD and acceptance tests before claiming a new capability.
3. Add an actual independent module build that emits immutable versioned assets
   and a release manifest (entry, dependencies, compatible host version, integrity,
   routes, GDD). Define trusted executable origins and access policy.
4. Implement God loading and an authenticated release registry. Validate a staged
   module before activation and retain the previous version for rollback. Do not
   serve mutable assets as immutable or rely on KV multi-key atomicity for a switch.
5. Separate game/editor precache and test offline behavior, stale clients, paths,
   host compatibility, upgrades and rollback. Introduce build/upload/activate
   commands only once those operations are real and testable.
6. Keep the shared Worker/API and D1 lifecycle explicit. Frontend-only independent
   deployment cannot skip required backward-compatible API changes or migrations.

Shared cloud saves need an authenticated authoring backend and storage design.
The existing development-only editor file API does not run on Cloudflare.
