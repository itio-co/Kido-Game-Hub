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
`npm run build` / `make build` still builds the game and God together. It also
emits two pilot chunks and a manifest:

- `dist/modules/rhythm/<version>/<hash>.js`
- `dist/modules/stirfry/<version>/<hash>.js`
- `dist/modules/manifest.json` — module id, `current` version, chunk URL, and `retained` versions this build knows about
- `dist/modules/runtime/svelte*.js` plus an import map in `index.html` and `god.html`, so those chunks share one Svelte runtime with the page

The core bundle does not statically import `rhythm` or `stirfry`. It loads them with `import()` through the manifest. A share link that pins a version loads that retained file when the manifest lists it. If the file is absent, the page uses the code bundled in this build and the ruleset entry for the pinned version.

`pilot-manifest.json` records a source hash for each published pilot version. The hash covers that module's code and ruleset (the `version` field in `module.json` is ignored) and the files those sources import. `make check` fails in two cases:

- the source hash no longer matches the hash recorded for the current version (content changed, version was not bumped)
- the version was bumped but the source hash is the same as an older version (no content change)

A matching hash is not a new version. The build does not rebuild that chunk when the recorded file is already present, and it does not put the module in `dist/module-deploy`. That deploy package contains only a module whose current version has a different source hash from the previous retained version. `make deploy-modules` uploads that package only. Unchanged modules stay out of it.

`make deploy-modules` and `make rollback-module` only print a plan unless `APPLY=1`. They never delete KV keys. The Worker and the rest of the site still deploy the way they do today. See [deploy-cloudflare.md](deploy-cloudflare.md).

Other modules stay inside the core bundle. Editor modules are not independently deployed.

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
