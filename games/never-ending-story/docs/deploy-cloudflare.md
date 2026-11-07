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
