-- D1 schema for nes-game (Never Ending Story leaderboard). Idempotent.
CREATE TABLE IF NOT EXISTS players (
  playerId   TEXT PRIMARY KEY,
  nickname   TEXT NOT NULL DEFAULT '',
  token_hash TEXT,                 -- SHA-256 (hex) of the player's bearer token; NULL = unclaimed
  created_at INTEGER NOT NULL,
  last_seen  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
  sessionId          TEXT PRIMARY KEY,
  playerId           TEXT NOT NULL,
  nickname           TEXT NOT NULL DEFAULT '',
  game               TEXT NOT NULL,
  difficulty         TEXT NOT NULL,
  seed               INTEGER NOT NULL,
  score              INTEGER NOT NULL,
  timeMs             INTEGER NOT NULL,
  version            TEXT NOT NULL DEFAULT '',
  ruleset            TEXT NOT NULL DEFAULT '', -- gameplay ruleset only; app version must not split boards
  ts                 INTEGER NOT NULL,
  challenger_session TEXT,
  integrity_ok       INTEGER NOT NULL DEFAULT 0,
  verified           INTEGER NOT NULL DEFAULT 0, -- 1 = submitted with the owner's bearer token
  created_at         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS runs_board ON runs (game, difficulty, verified, score DESC, timeMs ASC);
CREATE INDEX IF NOT EXISTS runs_ruleset_board ON runs (game, difficulty, ruleset, verified, score DESC, timeMs ASC);
CREATE INDEX IF NOT EXISTS runs_player ON runs (playerId, game, difficulty);
CREATE INDEX IF NOT EXISTS players_token ON players (token_hash);
-- Whole persisted save (nesg.player.v1 + stir-fry + eggs). Never contains the token.
CREATE TABLE IF NOT EXISTS player_state (
  playerId       TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL DEFAULT 1,
  state_json     TEXT NOT NULL,
  rev            INTEGER NOT NULL DEFAULT 0,
  updated_at     INTEGER NOT NULL
);
-- Per-event progress (e.g. case-01: evidence, poster shown, ending seen).
CREATE TABLE IF NOT EXISTS player_events (
  playerId      TEXT NOT NULL,
  eventId       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'started', -- started | completed
  progress_json TEXT NOT NULL DEFAULT '{}',
  started_at    INTEGER NOT NULL,
  completed_at  INTEGER,
  updated_at    INTEGER NOT NULL,
  PRIMARY KEY (playerId, eventId)
);
-- The player's home room (my room): decor, theme, future placed/unlocked items.
CREATE TABLE IF NOT EXISTS player_home (
  playerId       TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL DEFAULT 1,
  room_json      TEXT NOT NULL,
  rev            INTEGER NOT NULL DEFAULT 0,
  updated_at     INTEGER NOT NULL
);
