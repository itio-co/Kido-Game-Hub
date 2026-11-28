-- God Mode "Wish" inbox. Idempotent; the Worker also runs this on first wish request (src/modules/god/wish.ts).
-- The screenshot is a size-capped base64 column (<= 400 KB decoded). No new Cloudflare resource is needed.
-- player_id / player_role record the submitter when the wish is sent with a bearer token; a password session stores role only.
CREATE TABLE IF NOT EXISTS god_wishes (
  id           TEXT PRIMARY KEY,
  created_at   INTEGER NOT NULL,
  created_iso  TEXT NOT NULL,
  day_bkk      TEXT NOT NULL,
  text         TEXT NOT NULL,
  route        TEXT,
  screen       TEXT,
  title        TEXT,
  app_version  TEXT,
  modules_json TEXT,
  user_agent   TEXT,
  player_id    TEXT,
  player_role  TEXT,
  inspect_url  TEXT,
  inspect_exp  INTEGER,
  state_json   TEXT,
  shot_mime    TEXT,
  shot_b64     TEXT,
  shot_bytes   INTEGER NOT NULL DEFAULT 0,
  read_at      INTEGER
);
CREATE INDEX IF NOT EXISTS god_wishes_created ON god_wishes (created_at);
