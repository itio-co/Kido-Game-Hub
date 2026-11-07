-- D1 migration for databases created before app 0.6.11.
-- Fresh installs already have `runs.ruleset` from worker/schema.sql; skip this file if the column exists.
-- Existing rows are the v0.6.10 ruleset, which is also the current ruleset (gameplay params did not change).
-- The app version is NOT part of the key. Boards partition by game + difficulty + ruleset.

ALTER TABLE runs ADD COLUMN ruleset TEXT NOT NULL DEFAULT '';

UPDATE runs SET ruleset = 'challenge@1.1.0+crossword@1.0.0' WHERE game = 'cross' AND ruleset = '';
UPDATE runs SET ruleset = 'challenge@1.1.0+jigsaw@1.0.0' WHERE game = 'jig' AND ruleset = '';
UPDATE runs SET ruleset = 'challenge@1.1.0+slide@1.0.0' WHERE game = 'slide' AND ruleset = '';
UPDATE runs SET ruleset = 'rhythm@1.1.0+stirfry@1.2.0' WHERE game = 'stirfry' AND ruleset = '';

CREATE INDEX IF NOT EXISTS runs_ruleset_board ON runs (game, difficulty, ruleset, verified, score DESC, timeMs ASC);
