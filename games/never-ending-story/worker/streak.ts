/**
 * Daily streak storage for the Worker. Rules live in src/lib/streak.ts; this file loads/saves
 * the per-player record in D1 and seals the client token. See docs/online-leaderboard.md.
 */
import { applyWin, bangkokDay, readRecord, tokenClaim, viewOf, type StreakRecord, type StreakView } from '../src/lib/streak';
import { checkStreak, sealStreak, type TokenCheck } from './streakToken';

export interface StreakEnv {
  DB: D1Database;
  STREAK_TOKEN_KEY?: string;
}

export type StreakReply = { view: StreakView; token: string | null; check: TokenCheck; counted: boolean; refilled: boolean };

export const STREAK_TABLE_SQL = `CREATE TABLE IF NOT EXISTS player_streak (
  playerId     TEXT PRIMARY KEY,
  record_json  TEXT NOT NULL,
  streak_count INTEGER NOT NULL DEFAULT 0,
  best         INTEGER NOT NULL DEFAULT 0,
  last_day     TEXT,
  rev          INTEGER NOT NULL DEFAULT 0,
  updated_at   INTEGER NOT NULL
)`;

let ensured = false;
/** Databases created before 0.6.39 get the table on first use (same SQL as schema.sql / migrations/003_streak.sql). */
async function ensureTable(env: StreakEnv): Promise<void> {
  if (ensured) return;
  await env.DB.prepare(STREAK_TABLE_SQL).run();
  ensured = true;
}

async function load(env: StreakEnv, pid: string): Promise<{ rec: StreakRecord; rev: number }> {
  await ensureTable(env);
  const row = await env.DB.prepare('SELECT record_json, rev FROM player_streak WHERE playerId=?').bind(pid).first<{ record_json: string; rev: number }>();
  if (!row) return { rec: readRecord(null), rev: 0 };
  let parsed: unknown = null;
  try { parsed = JSON.parse(row.record_json); } catch { parsed = null; }
  return { rec: readRecord(parsed), rev: row.rev };
}

async function seal(env: StreakEnv, pid: string, rec: StreakRecord): Promise<string | null> {
  if (!env.STREAK_TOKEN_KEY) return null;
  return sealStreak(env.STREAK_TOKEN_KEY, { pid, ...tokenClaim(rec) });
}

/** Board view plus a fresh token for the stored record. Writes nothing. */
export async function streakRead(env: StreakEnv, pid: string, clientToken: unknown, now = Date.now()): Promise<StreakReply> {
  const { rec } = await load(env, pid);
  const check = await checkStreak(env.STREAK_TOKEN_KEY, clientToken, { pid, ...tokenClaim(rec) });
  return { view: viewOf(rec, bangkokDay(now)), token: await seal(env, pid, rec), check, counted: false, refilled: false };
}

/**
 * Record a win for `pid` at server time `now`. The client token is checked against the stored record
 * and only reported: the server record is always the one that counts. Optimistic rev, retried twice.
 */
export async function streakWin(env: StreakEnv, pid: string, clientToken: unknown, now = Date.now()): Promise<StreakReply> {
  const today = bangkokDay(now);
  for (let attempt = 0; attempt < 3; attempt++) {
    const { rec, rev } = await load(env, pid);
    const check = await checkStreak(env.STREAK_TOKEN_KEY, clientToken, { pid, ...tokenClaim(rec) });
    const out = applyWin(rec, today);
    const next = out.record;
    const claim = tokenClaim(next);
    const res = await env.DB.prepare(
      `INSERT INTO player_streak (playerId, record_json, streak_count, best, last_day, rev, updated_at) VALUES (?,?,?,?,?,1,?)
       ON CONFLICT(playerId) DO UPDATE SET record_json=excluded.record_json, streak_count=excluded.streak_count, best=excluded.best,
         last_day=excluded.last_day, rev=player_streak.rev+1, updated_at=excluded.updated_at
       WHERE player_streak.rev=?`,
    ).bind(pid, JSON.stringify(next), next.count, next.best, claim.date || null, now, rev).run();
    if ((res.meta?.changes ?? 0) === 0) continue;
    return { view: viewOf(next, today), token: await seal(env, pid, next), check, counted: out.counted, refilled: out.refilled };
  }
  throw new Error('streak busy');
}
