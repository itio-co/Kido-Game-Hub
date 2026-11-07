# Challenge links (v0.6.0)

Challenge mode has no backend yet. **The share URL is the transport**: a link alone carries everything a backend needs to import the run later. The online leaderboard is postponed. For now the leaderboard is local only: your personal bests plus challengers seen through links.

## URL format (human-readable)

| URL (hash route) | Meaning |
|---|---|
| `#/challenge/<game>` | Difficulty picker. `game` = `cross` \| `jig` \| `slide` |
| `#/challenge/<game>/<difficulty>/<seed>` | A fixed seeded puzzle on the v0.6.10 ruleset. `difficulty` = `easy` \| `medium` \| `hard` |
| `#/challenge/<game>/<difficulty>/<seed>/<ruleset>` | Same puzzle pinned to a ruleset, e.g. `challenge@1.1.0+crossword@1.0.0` |
| `#/challenge/<game>/<difficulty>/<seed>[/<ruleset>]/vs/<nickname>?score=<pts>&time=<sec>&run=<token>` | A challenge from `nickname` |
| `#/leaderboard` | Local leaderboard |

Example: `#/challenge/cross/medium/482913/vs/%E0%B8%AB%E0%B8%A5%E0%B8%B2%E0%B8%99?score=1830&time=52&run=CiQ....Ab3dE2f9`

`score` and `time` are plain, readable copies. The authoritative data is in `run`.

## `run` token

`run = base64url(protobuf bytes) + "." + tag`

- The protobuf schema is `proto/challenge_run.proto` (`nesg.challenge.v1.ChallengeRun`). It is encoded by the hand-written codec in `src/lib/runProto.ts`. There is no dependency, and default/zero fields are omitted, as in proto3.
- The tag is `base64url(SHA-256("nesg-run-v1" || bytes)[0..6])`.
- The client checks the tag. If it doesn't match, the banner shows "not verified" and the plain `score`/`time` values are used.

> ⚠️ The tag only catches accidental or naive edits. The salt is public in the client, so anyone can forge a valid token. **It is not tamper-proof.** A future backend must re-validate the data: check plausibility of score against `scoreFor()` and par times, rate-limit per `player_id`, and ideally re-sign tokens server-side with an HMAC secret.

Fields: `session_id` (run UUID), `player_id` (UUID, `nesg.playerId.v1`), `nickname`, `game`, `difficulty`, `seed`, `score`, `time_ms`, `version`, `timestamp_ms`, `challenger_session_id` / `challenger_nickname` / `challenger_score` / `challenger_time_ms` (the run this one answered).

## Decode / import procedure

1. Parse the hash and take the `run` query parameter.
2. Split it on `.` into `body` and `tag`.
3. Base64url-decode `body` into bytes.
4. Recompute the tag and compare it with `tag`. Reject or flag the run if it differs.
5. Decode the bytes with any protobuf library using `proto/challenge_run.proto`. For example, in Python: `grpc_tools.protoc` → `ChallengeRun.FromString(bytes)`. In Node: `protobufjs.loadSync(...).lookupType('nesg.challenge.v1.ChallengeRun').decode(bytes)`.
6. Upsert by `session_id` (the run is idempotent). Link `challenger_session_id` to build challenge chains.
7. Re-validate on the server (see the warning above) before showing the run on a global board.

Node sketch:

```js
const [body, tag] = token.split('.');
const bytes = Buffer.from(body, 'base64url');
const h = crypto.createHash('sha256').update('nesg-run-v1').update(bytes).digest().subarray(0, 6).toString('base64url');
if (h !== tag) throw new Error('bad tag');
const run = root.lookupType('nesg.challenge.v1.ChallengeRun').decode(bytes);
```

## Scoring

`(correct×100 + maxCombo×20 − mistakes×40 − hints×150 + max(0, par − seconds)×10) × {easy 1, medium 1.5, hard 2}`, with a floor of 0. Ranking: higher score wins. If scores are equal, the faster time wins.

## Local storage

- `nesg.challenge.board.v1`: the local leaderboard in plain JSON.
- `nesg.challenge.run.v1`: the in-progress run, so a refresh resumes it.
- `nesg.runlog.v1`: the history of each run, stored as AES-GCM ciphertext plus a SHA-256 of the plaintext. The key is in `nesg.runlog.key.v1`. The key is on the same device, so this only prevents casual reading. There is no export UI.
