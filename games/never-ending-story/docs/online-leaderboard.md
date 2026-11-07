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

## Caveats
- The run tag salt is in the client, so a determined player can forge tokens with any plausible score. Next step: server-signed runs (issue a signed seed/session at start, verify elapsed time server-side) and Cloudflare Turnstile on register/submit.
