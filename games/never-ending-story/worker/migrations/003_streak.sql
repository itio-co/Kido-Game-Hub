-- 0.6.39 daily streak board. Idempotent; the Worker also runs this on first streak request.
CREATE TABLE IF NOT EXISTS player_streak (
  playerId     TEXT PRIMARY KEY,
  record_json  TEXT NOT NULL,
  streak_count INTEGER NOT NULL DEFAULT 0,
  best         INTEGER NOT NULL DEFAULT 0,
  last_day     TEXT,
  rev          INTEGER NOT NULL DEFAULT 0,
  updated_at   INTEGER NOT NULL
);
