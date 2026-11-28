/**
 * Player roles: player < god < super_god. Pure policy plus the D1 helpers shared by the Worker and the
 * God admin API. The Worker never trusts a role sent by a client; it reads `players.role` from D1.
 * `super_god` is also what a God admin password session acts as. See docs/online-leaderboard.md.
 */

export const ROLES = ['player', 'god', 'super_god'] as const;
export type Role = (typeof ROLES)[number];

const RANK: Record<Role, number> = { player: 0, god: 1, super_god: 2 };

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/** Unknown or missing stored values are the lowest role, never an error and never a higher one. */
export function normalizeRole(value: unknown): Role {
  return isRole(value) ? value : 'player';
}

/** True when `have` is at least `need`. */
export function atLeast(have: Role, need: Role): boolean {
  return RANK[have] >= RANK[need];
}

/** Who is acting: a God admin password session (no player) or a player's bearer token. */
export type Principal = { role: Role; via: 'password' | 'token'; playerId: string | null };

export type RoleChangeError = 'bad-role' | 'not-allowed' | 'password-required' | 'self-change' | 'not-registered' | 'confirm-required';

export type RoleChangeInput = {
  actor: Principal;
  target: { playerId: string; role: Role; registered: boolean };
  next: unknown;
  /** Demoting a super god needs this explicit flag. */
  confirmSuperGod?: boolean;
};

/**
 * Whether `actor` may move `target` to `next`.
 * - Only a super god may change roles at all.
 * - Anything that grants or removes super_god needs the God admin password session; it is never self-service.
 * - A player token can never change its own role.
 * - Only a registered player can hold a role: an unclaimed playerId is public on the leaderboard and anyone could claim it.
 */
export function checkRoleChange(input: RoleChangeInput): { ok: true; next: Role; changed: boolean } | { ok: false; error: RoleChangeError } {
  const { actor, target } = input;
  if (!isRole(input.next)) return { ok: false, error: 'bad-role' };
  const next = input.next;
  if (!atLeast(actor.role, 'super_god')) return { ok: false, error: 'not-allowed' };
  if (actor.playerId && actor.playerId === target.playerId) return { ok: false, error: 'self-change' };
  if (next === target.role) return { ok: true, next, changed: false };
  if ((next === 'super_god' || target.role === 'super_god') && actor.via !== 'password') return { ok: false, error: 'password-required' };
  if (next !== 'player' && !target.registered) return { ok: false, error: 'not-registered' };
  if (target.role === 'super_god' && input.confirmSuperGod !== true) return { ok: false, error: 'confirm-required' };
  return { ok: true, next, changed: true };
}

/** Structural D1 shape so this file typechecks with the app tsconfig (no Workers types). */
interface RoleStatement {
  bind(...args: unknown[]): RoleStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ meta: { changes?: number } }>;
}
export interface RoleDb {
  prepare(query: string): RoleStatement;
}

/** Same SQL as worker/schema.sql and worker/migrations/004_roles.sql. SQLite has no ADD COLUMN IF NOT EXISTS. */
export const ROLE_COLUMNS_SQL = [
  "ALTER TABLE players ADD COLUMN role TEXT NOT NULL DEFAULT 'player'",
  'ALTER TABLE players ADD COLUMN role_updated_at INTEGER',
  'ALTER TABLE players ADD COLUMN role_updated_by TEXT',
];

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Adds the role columns when a database predates them. Safe to run any number of times. */
export async function ensureRoleColumns(db: RoleDb): Promise<void> {
  for (const sql of ROLE_COLUMNS_SQL) {
    try { await db.prepare(sql).run(); } catch (e) { if (!/duplicate column/i.test(message(e))) throw e; }
  }
}

/**
 * Run `work`; if the database has no role columns yet, add them once and retry.
 * The happy path costs nothing, and a Worker deployed before the migration heals itself.
 */
export async function withRoleColumns<T>(db: RoleDb, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    if (!/no such column/i.test(message(e)) || !/role/i.test(message(e))) throw e;
    await ensureRoleColumns(db);
    return work();
  }
}

/** The player behind a bearer token hash, with a normalized role. Null when the token matches nobody. */
export async function playerRoleByTokenHash(db: RoleDb, tokenHash: string): Promise<{ playerId: string; role: Role } | null> {
  const row = await withRoleColumns(db, () => db.prepare('SELECT playerId, role FROM players WHERE token_hash=?').bind(tokenHash).first<{ playerId: string; role: unknown }>());
  return row ? { playerId: row.playerId, role: normalizeRole(row.role) } : null;
}
