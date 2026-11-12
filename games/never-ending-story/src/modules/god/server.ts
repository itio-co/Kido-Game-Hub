import { normalizeAppBase } from '../../lib/deployment';
/**
 * "Game of Dev" admin API under /never/api/god/*.
 * Auth: Worker secret GOD_ADMIN_PASSWORD (SHA-256 hex of the password, or the plain password) -> HMAC-signed session cookie (12h).
 * Token hashes are never selected or returned.
 */
/** Structural D1/KV shapes so this module typechecks with the app tsconfig (no Workers types). */
interface GodStatement {
  bind(...args: unknown[]): GodStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes?: number } }>;
}
interface GodDb {
  prepare(query: string): GodStatement;
  batch(statements: GodStatement[]): Promise<{ meta: { changes?: number } }[]>;
}
interface GodKv {
  get(key: string, type: 'json'): Promise<unknown>;
}
export interface GodEnv {
  DB: GodDb;
  ASSETS_KV: GodKv;
  GOD_ADMIN_PASSWORD?: string;
  APP_BASE?: string;
}

const cookieName = (env: GodEnv) => env.APP_BASE && env.APP_BASE !== '/never' ? `nes_god_${normalizeAppBase(env.APP_BASE).slice(1).replaceAll('/', '_')}` : 'nes_god';
const SESSION_MS = 12 * 3600 * 1000;
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
const ID_RE = /^[A-Za-z0-9-]{8,64}$/;
const GAMES = ['cross', 'jig', 'slide', 'stirfry'];
const GAME_DIFFS: Record<string, string[]> = { cross: ['easy', 'medium', 'hard'], jig: ['easy', 'medium', 'hard'], slide: ['easy', 'medium', 'hard'], stirfry: ['easy', 'normal', 'hard'] };
const DIFFS = ['easy', 'medium', 'hard'];
const DAY = 86400000;

const enc = new TextEncoder();
const json = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow', ...extra },
  });
const fail = (status: number, error: string) => json({ ok: false, error }, status);

async function digest(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
/** Rate-limit key: IPv6 rotates within a /64, so lock the /64 prefix. */
function clientKey(req: Request): string {
  const ip = req.headers.get('cf-connecting-ip') ?? 'unknown';
  return ip.includes(':') ? ip.split(':').slice(0, 4).join(':') + '::/64' : ip;
}
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}
async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(`nes-god-session:${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.get('cookie') ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}
async function sessionOk(req: Request, secret: string, env: GodEnv): Promise<boolean> {
  const raw = readCookie(req, cookieName(env));
  if (!raw) return false;
  const [exp, sig] = raw.split('.');
  if (!exp || !sig || !(Number(exp) > Date.now())) return false;
  const want = await hmac(secret, exp);
  return sameBytes(enc.encode(sig), enc.encode(want));
}
const cookie = (value: string, maxAge: number, env: GodEnv) =>
  `${cookieName(env)}=${value}; Path=${normalizeAppBase(env.APP_BASE)}; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

async function ensureTables(env: GodEnv): Promise<void> {
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS god_login (ip TEXT PRIMARY KEY, fails INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)').run();
}

async function login(req: Request, env: GodEnv): Promise<Response> {
  const secret = env.GOD_ADMIN_PASSWORD;
  if (!secret) return fail(503, 'not-configured');
  await ensureTables(env);
  const ip = clientKey(req);
  const now = Date.now();
  const row = await env.DB.prepare('SELECT fails, locked_until FROM god_login WHERE ip=?').bind(ip).first<{ fails: number; locked_until: number }>();
  if (row && row.locked_until > now) return json({ ok: false, error: 'locked', retryAfterSec: Math.ceil((row.locked_until - now) / 1000) }, 429);
  let password = '';
  try { password = String(((await req.json()) as { password?: unknown }).password ?? ''); } catch { /* empty */ }
  // The secret may hold the SHA-256 hex of the password (preferred) or the plain password.
  const given = await digest(password);
  const good = /^[0-9a-f]{64}$/i.test(secret)
    ? sameBytes(enc.encode(hex(given)), enc.encode(secret.toLowerCase()))
    : sameBytes(given, await digest(secret));
  if (!good) {
    const fails = (row && row.locked_until <= now && row.fails >= MAX_FAILS ? 0 : row?.fails ?? 0) + 1;
    const lockedUntil = fails >= MAX_FAILS ? now + LOCK_MS : 0;
    await env.DB.prepare('INSERT INTO god_login (ip,fails,locked_until,updated_at) VALUES (?,?,?,?) ON CONFLICT(ip) DO UPDATE SET fails=excluded.fails, locked_until=excluded.locked_until, updated_at=excluded.updated_at')
      .bind(ip, fails, lockedUntil, now).run();
    return json({ ok: false, error: lockedUntil ? 'locked' : 'bad-password', attemptsLeft: Math.max(0, MAX_FAILS - fails) }, lockedUntil ? 429 : 401);
  }
  await env.DB.prepare('DELETE FROM god_login WHERE ip=?').bind(ip).run();
  const exp = String(now + SESSION_MS);
  return json({ ok: true, expiresAt: Number(exp) }, 200, { 'set-cookie': cookie(`${exp}.${await hmac(secret, exp)}`, SESSION_MS / 1000, env) });
}

const safeJson = (s: unknown) => { try { return JSON.parse(String(s ?? 'null')); } catch { return null; } };

/** Funnel steps derived from progress_json written by the game client (src/lib/cloudSync.ts eventDoc). */
const STEPS: { id: string; test: (p: Record<string, unknown>, status: string) => boolean }[] = [
  { id: 'started', test: () => true },
  { id: 'evidence1', test: (p) => Array.isArray(p.evidence) && p.evidence.length >= 1 },
  { id: 'evidenceAll', test: (p) => Array.isArray(p.evidence) && p.evidence.length >= 5 },
  { id: 'poster', test: (p) => p.posterShown === true },
  { id: 'deduced', test: (p) => p.deduced === true },
  { id: 'solved', test: (p) => p.solved === true },
  { id: 'reward', test: (p) => p.reward === true },
  { id: 'completed', test: (_p, s) => s === 'completed' },
];

async function dashboard(env: GodEnv): Promise<Response> {
  const now = Date.now();
  const one = async (sql: string, ...args: unknown[]) => (await env.DB.prepare(sql).bind(...args).first<{ n: number }>())?.n ?? 0;
  const [players, runs, active24, active7, new7] = await Promise.all([
    one('SELECT count(*) n FROM players'),
    one('SELECT count(*) n FROM runs'),
    one('SELECT count(*) n FROM players WHERE last_seen>=?', now - DAY),
    one('SELECT count(*) n FROM players WHERE last_seen>=?', now - 7 * DAY),
    one('SELECT count(*) n FROM players WHERE created_at>=?', now - 7 * DAY),
  ]);
  const byGame = (await env.DB.prepare('SELECT game, difficulty, count(*) n, max(score) best FROM runs GROUP BY game, difficulty ORDER BY game, difficulty').all()).results;
  const recentRuns = (await env.DB.prepare(
    `SELECT r.sessionId, r.playerId, COALESCE(NULLIF(p.nickname,''), r.nickname) nickname, r.game, r.difficulty, r.score, r.timeMs, r.verified, r.ts
     FROM runs r LEFT JOIN players p ON p.playerId=r.playerId ORDER BY r.ts DESC LIMIT 10`).all()).results;
  const recentPlayers = (await env.DB.prepare('SELECT playerId, nickname, created_at, last_seen FROM players ORDER BY created_at DESC LIMIT 10').all()).results;
  return json({ ok: true, now, counts: { players, runs, active24, active7, new7 }, byGame, recentRuns, recentPlayers });
}

async function playerList(env: GodEnv, q: string): Promise<Response> {
  const like = `%${q.replace(/[%_]/g, '')}%`;
  const { results } = await env.DB.prepare(
    `SELECT p.playerId, p.nickname, p.created_at, p.last_seen, (p.token_hash IS NOT NULL) AS registered,
       (SELECT count(*) FROM runs r WHERE r.playerId=p.playerId) AS runs,
       (SELECT max(score) FROM runs r WHERE r.playerId=p.playerId) AS best,
       (SELECT group_concat(e.eventId || ':' || e.status) FROM player_events e WHERE e.playerId=p.playerId) AS events,
       EXISTS(SELECT 1 FROM player_state s WHERE s.playerId=p.playerId) AS hasState,
       EXISTS(SELECT 1 FROM player_home h WHERE h.playerId=p.playerId) AS hasHome
     FROM players p WHERE (?='' OR p.nickname LIKE ? OR p.playerId LIKE ?) ORDER BY p.last_seen DESC LIMIT 200`,
  ).bind(q, like, like).all();
  return json({ ok: true, players: results });
}

function summarizeState(doc: unknown): Record<string, unknown> | null {
  const data = (doc as { data?: unknown })?.data ?? doc;
  const save = (data as Record<string, unknown>)?.['nesg.player.v1'] as Record<string, Record<string, unknown>> | undefined;
  if (!save) return null;
  const flow = save.flow ?? {};
  return {
    onboardingComplete: save.player?.onboardingComplete === true,
    prologueSeen: save.player?.prologueSeen === true,
    textSize: save.player?.textSize ?? null,
    difficulty: flow.difficulty ?? null,
    evidence: Array.isArray(flow.evidence) ? flow.evidence.length : 0,
    solved: flow.solved === true,
    caseDone: flow.caseDone === true,
    levels: flow.levels ?? null,
    solvedCaseIds: (save.knowledge as Record<string, unknown> | undefined)?.solvedCaseIds ?? [],
    keys: Object.keys(data as object).length,
  };
}

async function playerDetail(env: GodEnv, id: string): Promise<Response> {
  const player = await env.DB.prepare('SELECT playerId, nickname, created_at, last_seen, (token_hash IS NOT NULL) AS registered FROM players WHERE playerId=?').bind(id).first();
  if (!player) return fail(404, 'not-found');
  const runs = (await env.DB.prepare('SELECT sessionId, game, difficulty, score, timeMs, verified, integrity_ok, version, ts FROM runs WHERE playerId=? ORDER BY ts DESC LIMIT 100').bind(id).all()).results;
  const events = (await env.DB.prepare('SELECT eventId, status, progress_json, started_at, completed_at, updated_at FROM player_events WHERE playerId=?').bind(id).all<Record<string, unknown>>()).results
    .map((e) => ({ ...e, progress: safeJson(e.progress_json), progress_json: undefined }));
  const st = await env.DB.prepare('SELECT schema_version, state_json, rev, updated_at FROM player_state WHERE playerId=?').bind(id).first<Record<string, unknown>>();
  const home = await env.DB.prepare('SELECT schema_version, room_json, rev, updated_at FROM player_home WHERE playerId=?').bind(id).first<Record<string, unknown>>();
  return json({
    ok: true, player, runs, events,
    state: st ? { rev: st.rev, updated_at: st.updated_at, bytes: String(st.state_json).length, summary: summarizeState(safeJson(st.state_json)) } : null,
    home: home ? { rev: home.rev, updated_at: home.updated_at, bytes: String(home.room_json).length, data: safeJson(home.room_json) } : null,
  });
}

async function games(env: GodEnv): Promise<Response> {
  const stats = (await env.DB.prepare(
    `SELECT game, difficulty, count(*) runs, count(DISTINCT playerId) players, max(score) best, min(timeMs) fastest, avg(score) avg, sum(verified) verified
     FROM runs GROUP BY game, difficulty`).all()).results;
  const byRuleset = (await env.DB.prepare(
    `SELECT game, ruleset, count(*) runs, count(DISTINCT playerId) players, max(score) best
     FROM runs GROUP BY game, ruleset ORDER BY game, ruleset`).all()).results;
  return json({ ok: true, games: GAMES, difficulties: DIFFS, gameDiffs: GAME_DIFFS, stats, byRuleset });
}

async function board(env: GodEnv, game: string, diff: string, ruleset: string): Promise<Response> {
  if (!GAME_DIFFS[game]?.includes(diff)) return fail(400, 'bad-game');
  const filter = ruleset ? ' AND r.ruleset=?' : '';
  const stmt = env.DB.prepare(
    `SELECT r.sessionId, r.playerId, COALESCE(NULLIF(p.nickname,''), r.nickname) nickname, r.score, r.timeMs, r.seed, r.verified, r.integrity_ok, r.version, r.ruleset, r.ts
     FROM runs r LEFT JOIN players p ON p.playerId=r.playerId WHERE r.game=? AND r.difficulty=?${filter} ORDER BY r.score DESC, r.timeMs ASC LIMIT 200`,
  );
  const { results } = ruleset ? await stmt.bind(game, diff, ruleset).all() : await stmt.bind(game, diff).all();
  return json({ ok: true, game, difficulty: diff, ruleset: ruleset || null, rows: results });
}

async function events(env: GodEnv): Promise<Response> {
  const rows = (await env.DB.prepare('SELECT eventId, status, progress_json FROM player_events').all<{ eventId: string; status: string; progress_json: string }>()).results;
  const out: Record<string, { eventId: string; started: number; completed: number; funnel: Record<string, number> }> = {};
  for (const r of rows) {
    const e = (out[r.eventId] ??= { eventId: r.eventId, started: 0, completed: 0, funnel: Object.fromEntries(STEPS.map((s) => [s.id, 0])) });
    const p = (safeJson(r.progress_json) ?? {}) as Record<string, unknown>;
    e.started += 1;
    if (r.status === 'completed') e.completed += 1;
    for (const s of STEPS) if (s.test(p, r.status)) e.funnel[s.id] += 1;
  }
  return json({ ok: true, steps: STEPS.map((s) => s.id), events: Object.values(out) });
}

export async function godApi(req: Request, env: GodEnv, path: string): Promise<Response> {
  if (path === '/login' && req.method === 'POST') return login(req, env);
  if (path === '/logout' && req.method === 'POST') return json({ ok: true }, 200, { 'set-cookie': cookie('', 0, env) });
  const secret = env.GOD_ADMIN_PASSWORD;
  if (!secret) return fail(503, 'not-configured');
  if (!(await sessionOk(req, secret, env))) return fail(401, 'unauthorized');

  if (path === '/me' && req.method === 'GET') return json({ ok: true });
  if (path === '/dashboard' && req.method === 'GET') return dashboard(env);
  if (path === '/players' && req.method === 'GET') return playerList(env, (new URL(req.url).searchParams.get('q') ?? '').slice(0, 64));
  let m = /^\/players\/([^/]+)$/.exec(path);
  if (m) {
    const id = decodeURIComponent(m[1]);
    if (!ID_RE.test(id)) return fail(400, 'bad-id');
    if (req.method === 'GET') return playerDetail(env, id);
    if (req.method === 'PATCH') {
      let nick = '';
      try { nick = String(((await req.json()) as { nickname?: unknown }).nickname ?? ''); } catch { /* empty */ }
      nick = nick.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 24);
      if (!nick) return fail(400, 'bad-nickname');
      const r = await env.DB.prepare('UPDATE players SET nickname=? WHERE playerId=?').bind(nick, id).run();
      if (!r.meta.changes) return fail(404, 'not-found');
      return json({ ok: true, nickname: nick });
    }
    if (req.method === 'DELETE') {
      const res = await env.DB.batch(['runs', 'player_state', 'player_events', 'player_home', 'players'].map((t) => env.DB.prepare(`DELETE FROM ${t} WHERE playerId=?`).bind(id)));
      return json({ ok: true, deleted: res.map((r) => r.meta.changes) });
    }
  }
  if (path === '/games' && req.method === 'GET') return games(env);
  m = /^\/games\/([a-z]+)\/board$/.exec(path);
  if (m && req.method === 'GET') return board(env, m[1], new URL(req.url).searchParams.get('difficulty') ?? 'easy', new URL(req.url).searchParams.get('ruleset') ?? '');
  m = /^\/runs\/([^/]{8,80})$/.exec(path);
  if (m && req.method === 'DELETE') {
    const r = await env.DB.prepare('DELETE FROM runs WHERE sessionId=?').bind(decodeURIComponent(m[1])).run();
    return r.meta.changes ? json({ ok: true }) : fail(404, 'not-found');
  }
  if (path === '/events' && req.method === 'GET') return events(env);
  if (path === '/modules' && req.method === 'GET') {
    const reg = await env.ASSETS_KV.get('/modules.json', 'json');
    return reg ? json({ ok: true, registry: reg }) : fail(404, 'no-registry');
  }
  return fail(404, 'no-such-endpoint');
}
