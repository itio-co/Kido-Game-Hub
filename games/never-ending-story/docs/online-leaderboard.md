# Online leaderboard, players and cloud save (v0.6.1)

API base: `https://games.itio.space/never/api/`. Same-origin only: browser writes with a foreign `Origin` get 403. JSON in/out. Schema: `worker/schema.sql`.

## Players and tokens
- `POST /api/players/register` `{playerId, nickname}` → `{token}` once. Server stores only `SHA-256(token)` in `players.token_hash`. 409 if already registered.
- Client keeps it in `localStorage['nesg.playerToken.v1']` (next to `nesg.playerId.v1`) and sends `Authorization: Bearer <token>`. Tokens are never logged or put in state.
- `PATCH /api/players/:id` `{nickname}` (Bearer) — nickname changes need the token.
- `POST /api/players/:id/rotate` (Bearer) → new token.
- `GET /api/players/:id` → public profile + verified bests.

## Runs
- `POST /api/runs` `{token: "<b64url protobuf>.<tag>"}` (see `challenge-links.md`). Server decodes with the same codec, checks the tag (400 on mismatch), checks `ruleset` against the allowlist (empty = the v0.6.10 ruleset for that game), plausibility (game/difficulty, time and score caps from that ruleset), then inserts idempotently by `sessionId` with `runs.ruleset` set. The app version inside `version` is stored and is **not** used to split boards.
- With a valid Bearer for the run's `playerId` → `verified=1` (ranked). Wrong token → 401. No token (challenger run embedded in a shared link) → stored `verified=0`, not ranked; a later verified submit of the same session upgrades it.
- `GET /api/leaderboard?game=cross|jig|slide|stirfry&difficulty=...&ruleset=rhythm@1.1.0+stirfry@1.2.0&limit=20` → best verified run per player **for that ruleset** (score desc, time asc). Omit `ruleset` to get the v0.6.10 ruleset. Unknown ruleset → 400. Databases created before 0.6.11 need `worker/migrations/002_ruleset.sql` once (backfills existing rows to the current ruleset).

Client: `src/lib/cloudSync.ts`. Finished challenges and opened challenge links are queued in `nesg.runQueue.v1`, retried on startup / `online`; 4xx drops the item. The leaderboard screen has an Online tab and falls back to the device board when the API is unreachable (e.g. rawcdn previews).

## Cloud save (Bearer, `/api/players/me/...`)
| Endpoint | Table | Content |
|---|---|---|
| `GET/PUT state` | `player_state` | `{"nesg.player.v1", "nesg.stirfry.v1", "nesg.eggs.v1"}` (game state incl. `flow.nav`) |
| `GET/PUT home` | `player_home` | my room: `{roomId, decor, calendarTheme, placed:[], unlocked:[]}` (room for future items/houses) |
| `GET events`, `PUT events/:eventId` | `player_events` | `{status: started|completed, progress: {evidence, solved, deduced, reward, posterShown, endingSeen, seen}}` |

PUT state/home body `{rev, schema_version, data}`; `rev` must equal the server's or 409 `{current}`. The client treats its push as the newest edit (last write wins) and retries once on the server rev. Uploads are debounced 2.5 s after each save and on tab hide. On startup with a token, the server state is adopted if its `updated_at` is newer than the last local edit (local kept when server is empty); existing `readSave()` / `nav.schema` migrations then run as usual.

Restore on a new device = put the token on that device. There is no UI for this yet (a token in a link would be a credential in a URL).

## Daily streak (0.6.39)
Rules: `src/lib/streak.ts` (shared), storage: `worker/streak.ts`, token: `worker/streakToken.ts`, Thai GDD: `docs/gdd/core.md` §9.3.

- A win is a verified `POST /api/runs` with `score > 0` (counted once per `sessionId`), or `POST /api/players/me/streak/win` `{game, streakToken}` (Bearer) for story/practice puzzles. Both answer with `streak: {view, token, check, counted, refilled}`.
- `GET /api/players/me/streak` (Bearer, optional header `x-streak-token`) → the same `streak` object. Read-only: missed days are projected, not written.
- Days are Bangkok calendar days from **server** time. The streak moves at most once per day; `totalWins` moves on every win (≤100/day). Missed days spend batteries (max 2); not enough batteries → count 0. Every 7th streak day returns one battery. A new streak starts with 2.
- D1 `player_streak (playerId, record_json, streak_count, best, last_day, rev, updated_at)`, optimistic `rev`. The Worker runs `CREATE TABLE IF NOT EXISTS` on first use; `worker/migrations/003_streak.sql` is the same SQL.
- Token: `st1.<iv>.<ciphertext>`, AES-256-GCM with a key derived (SHA-256) from the Worker secret `STREAK_TOKEN_KEY`; payload `{v, pid, streakCount, date}`. The client stores it in `nesg.streak.v1` and sends it back as `streakToken`. `check` is `ok | stale | invalid | missing | nokey`; the server record always wins and nothing about the token is logged. Without the secret the streak still counts and `token` is `null`.

## Player roles (0.6.40, unreleased)
Policy and D1 helpers: `src/lib/roles.ts`. Gate: `requireRole(req, env, min)` exported from `src/modules/god/server.ts`. Thai GDD: `src/modules/god/GDD.md` (roles section) and `docs/gdd/core.md` §9.4.

- Roles: `player` (default) < `god` < `super_god`, stored in `players.role` (+ `role_updated_at`, `role_updated_by`). The role is always read from D1; nothing a client sends can set it. `POST /players/register`, `PATCH /players/:id` and `POST /runs` never touch it.
- `GET /api/players/me` (Bearer) → `{ok, playerId, role}`. 401 without a valid token.
- A God admin password session acts as `super_god`. A player's Bearer token acts as the stored role. `GET /api/god/me` → `{ok, role, via: 'password' | 'token'}` (needs `god`); `POST /api/god/snapshots` and `POST /api/wishes` need `god`; every other `/api/god/*` endpoint, including reading and marking wishes, needs `super_god`. No credentials → 401, valid but too low → 403 `forbidden`. See `docs/god-wish-th.md`.
- `POST /api/god/players/:id/role` `{role, confirmSuperGod?}` (super god only): the player must be registered; granting or removing `super_god` needs the password session (`password-required`); a token cannot change its own role (`self-change`); demoting a `super_god` needs `confirmSuperGod: true` (`confirm-required`); compare-and-swap on the old role (`conflict`).
- For a new feature: `const who = await requireRole(req, env, 'god'); if (who instanceof Response) return who;` then use `who.role`, `who.via`, `who.playerId`.
- Migration: `worker/migrations/004_roles.sql` (SQLite has no `ADD COLUMN IF NOT EXISTS`, so a second run errors with "duplicate column" and changes nothing). The Worker also adds the columns itself the first time it reads a role, so deploying the Worker alone is safe. No new secret.

## Caveats
- The run tag salt is in the client, so a determined player can forge tokens with any plausible score. Next step: server-signed runs (issue a signed seed/session at start, verify elapsed time server-side) and Cloudflare Turnstile on register/submit.
