# Deploy to games.itio.space/never (Cloudflare)

Live: https://games.itio.space/never/ (`/never` redirects to `/never/`).

| Piece | Value |
|---|---|
| Worker | `nes-game` (`worker/index.ts`, bundled with `npx rolldown worker/index.ts --format esm`) |
| Static files | Workers KV namespace `nes-game-assets` (`fd398000ddb740198d25474d340f9d13`), binding `ASSETS_KV`, key = path under `/never` (e.g. `/index.html`), metadata `{ct: content-type, h: hash}` |
| Database | D1 `nes-game` (`65eaf360-4c9b-4a55-a8ec-e4d0be0e9d18`), binding `DB`, schema `worker/schema.sql` (idempotent) |
| DNS | `games.itio.space` AAAA `100::` proxied (placeholder origin for the route) |
| Route | `games.itio.space/never*` → `nes-game` |

Why KV and not Workers Static Assets: the deploy connection's asset-upload JWT flow was not usable from the connector, so files are stored in KV and served by the worker (ETag, `immutable` cache for `/assets/*`, `no-cache` for HTML/`sw.js`, SPA fallback to `index.html`). With wrangler you can switch to `[assets]` later.

## Steps (any machine with API access)

1. `npm run build` (Vite `base: './'` → works under `/never/`; routing is hash-based).
2. Upload `dist/*` to KV with bulk PUT `/accounts/{acct}/storage/kv/namespaces/{ns}/bulk` — `[{key, value(base64), base64:true, metadata:{ct,h}}]`. `scripts/cloudflare/mk.mjs` + `kv.mjs` build the manifest and ≤2 MB batches. Keep old hashed `/assets/*` keys (clients with an old cached `index.html` still need them).
3. Apply `worker/schema.sql` with D1 `/query`. If the database already exists from before 0.6.11, also run `worker/migrations/002_ruleset.sql` once (adds `runs.ruleset` and backfills the v0.6.10 ruleset). Skip that file on a brand-new database that already got the column from `schema.sql`.
4. PUT the worker script (multipart: metadata `{main_module, compatibility_date, bindings:[kv ASSETS_KV, d1 DB]}` + `worker.js`).

A GitHub Action would need a `CLOUDFLARE_API_TOKEN` secret with Workers Scripts/KV/D1 edit on the account (not created).

## Isolated spaces

Deployment spaces use `/<space>/never/`, with `dev` at
`https://games.itio.space/dev/never/`. Legacy production stays `/never/`.
Set the Worker plain-text `APP_BASE` binding to `/dev/never` for the dev release;
omitting it retains `/never`. Each space needs its own Worker, KV namespace, D1
and admin secret. Do not bind a dev Worker to production resources or copy data.

The Worker injects the base into both HTML entries. Client API calls and local
save/draft keys use that base; production storage keys remain unchanged. God
uses a partition-specific cookie name and path. Non-production service workers
are network-only and do not create or clear caches. This is operational isolation,
not an origin security boundary: same-host JavaScript can access other paths.
Use separate origins if untrusted code must be isolated.

Dev resources provisioned for this release:
- Worker target: `nes-game-dev`
- KV: `nes-game-dev-assets` (`1f761c42cfb240afb23e5ff941ad3d9e`)
- D1: `nes-game-dev` (`6a7404ed-8e15-447d-800f-a8eea69af505`)
- Intended route: `games.itio.space/dev/never/*` (activate only after upload/tests)

This does not implement independently released frontend modules. Build game/God
as before and upload the resulting artifacts only to the selected space's KV.
The localhost editor save endpoint is not a hosted authoring backend.
