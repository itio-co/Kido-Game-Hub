-- 0.6.40 player roles: player (default) < god < super_god. Run once on databases created before this file.
-- SQLite has no ADD COLUMN IF NOT EXISTS, so a second run fails with "duplicate column name" and changes nothing.
-- The Worker also adds these columns itself the first time it reads a role (src/lib/roles.ts, ensureRoleColumns),
-- so deploying the Worker before or without this file is safe. Fresh installs already have them from worker/schema.sql.
-- Every existing player becomes 'player'. Nobody is promoted here: promote from God admin, which needs GOD_ADMIN_PASSWORD.

ALTER TABLE players ADD COLUMN role TEXT NOT NULL DEFAULT 'player';
ALTER TABLE players ADD COLUMN role_updated_at INTEGER;
ALTER TABLE players ADD COLUMN role_updated_by TEXT;
