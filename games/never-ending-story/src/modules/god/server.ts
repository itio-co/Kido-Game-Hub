import { normalizeAppBase } from '../../lib/deployment';
import { atLeast, checkRoleChange, normalizeRole, playerRoleByTokenHash, withRoleColumns, type Principal, type Role, type RoleChangeError } from '../../lib/roles';
import { playerPageParams } from './playerQuery';
import { createSnapshot, listSnapshots, readSnapshot, revokeSnapshot, snapshotPath, type SnapshotStore } from './snapshot';
import { WISH_MAX_BODY_BYTES, createWish, listWishes, markWishesRead, parseWish, readWish, readWishShot } from './wish';
/**
 * "Game of Dev" admin API under /never/api/god/*.
 * Auth: Worker secret GOD_ADMIN_PASSWORD (SHA-256 hex of the password, or the plain password) -> HMAC-signed session cookie (12h).
 * Token hashes are never selected or returned.
 * Roles (player < god < super_god, see src/lib/roles.ts): the password session acts as super_god; a player's bearer token acts as
 * the role stored in D1 `players.role`. `requireRole` is the one gate for every god-only endpoint, here and in the Worker.
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
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
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

/** Who is calling: the God admin password session (super_god, no player) or a player's bearer token (role from D1). Null = nobody. */
async function principalOf(req: Request, env: GodEnv): Promise<Principal | null> {
  const secret = env.GOD_ADMIN_PASSWORD;
  if (secret && (await sessionOk(req, secret, env))) return { role: 'super_god', via: 'password', playerId: null };
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '');
  if (!m) return null;
  const found = await playerRoleByTokenHash(env.DB, hex(await digest(m[1])));
  return found ? { role: found.role, via: 'token', playerId: found.playerId } : null;
}

/**
 * Gate an endpoint on a minimum role. Returns the caller, or a ready 401 (no valid session or token) / 403 (valid, role too low) Response.
 *   const who = await requireRole(req, env, 'god');
 *   if (who instanceof Response) return who;
 * The role always comes from the server (password session cookie or D1), never from anything the client sends.
 */
export async function requireRole(req: Request, env: GodEnv, min: Role = 'god'): Promise<Principal | Response> {
  const who = await principalOf(req, env);
  if (!who) return fail(401, 'unauthorized');
  return atLeast(who.role, min) ? who : fail(403, 'forbidden');
}

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
  { id: 'evidenceAll', test: (p) => Array.isArray(p.evidence) && p.evidence.length >= 4 },
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

async function playerList(env: GodEnv, url: URL): Promise<Response> {
  const { q, page, pageSize } = playerPageParams(url);
  const like = `%${q.replace(/[%_]/g, '')}%`;
  const where = `(?='' OR p.nickname LIKE ? OR p.playerId LIKE ?)`;
  const totalRow = await env.DB.prepare(`SELECT count(*) AS n FROM players p WHERE ${where}`).bind(q, like, like).first<{ n: number }>();
  const total = Number(totalRow?.n ?? 0);
  const offset = (page - 1) * pageSize;
  const { results } = await withRoleColumns(env.DB, () => env.DB.prepare(
    `SELECT p.playerId, p.nickname, p.created_at, p.last_seen, (p.token_hash IS NOT NULL) AS registered, p.role, p.role_updated_at,
       (SELECT count(*) FROM runs r WHERE r.playerId=p.playerId) AS runs,
       (SELECT max(score) FROM runs r WHERE r.playerId=p.playerId) AS best,
       (SELECT group_concat(e.eventId || ':' || e.status) FROM player_events e WHERE e.playerId=p.playerId) AS events,
       EXISTS(SELECT 1 FROM player_state s WHERE s.playerId=p.playerId) AS hasState,
       EXISTS(SELECT 1 FROM player_home h WHERE h.playerId=p.playerId) AS hasHome
     FROM players p WHERE ${where} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
  ).bind(q, like, like, pageSize, offset).all());
  return json({ ok: true, players: results.map((p) => ({ ...p, role: normalizeRole(p.role) })), total, page, pageSize });
}

const ROLE_STATUS: Record<RoleChangeError, number> = {
  'bad-role': 400,
  'not-allowed': 403,
  'password-required': 403,
  'self-change': 403,
  'not-registered': 409,
  'confirm-required': 409,
};

/** POST /players/:id/role {role, confirmSuperGod?}. Caller is already a super god; the policy lives in src/lib/roles.ts. */
async function setRole(req: Request, env: GodEnv, who: Principal, id: string): Promise<Response> {
  let body: { role?: unknown; confirmSuperGod?: unknown } = {};
  try { body = (await req.json()) as typeof body; } catch { return fail(400, 'bad-json'); }
  const row = await withRoleColumns(env.DB, () => env.DB.prepare('SELECT role, (token_hash IS NOT NULL) AS registered FROM players WHERE playerId=?').bind(id).first<{ role: unknown; registered: number }>());
  if (!row) return fail(404, 'not-found');
  const current = normalizeRole(row.role);
  const verdict = checkRoleChange({ actor: who, target: { playerId: id, role: current, registered: !!row.registered }, next: body.role, confirmSuperGod: body.confirmSuperGod === true });
  if (!verdict.ok) return fail(ROLE_STATUS[verdict.error], verdict.error);
  if (!verdict.changed) return json({ ok: true, playerId: id, role: current, changed: false });
  const now = Date.now();
  // Compare-and-swap on the role we just read, so two admins cannot overwrite each other unseen.
  const res = await env.DB.prepare('UPDATE players SET role=?, role_updated_at=?, role_updated_by=? WHERE playerId=? AND role=?')
    .bind(verdict.next, now, who.via === 'password' ? 'password' : who.playerId, id, current).run();
  if (!res.meta.changes) return fail(409, 'conflict');
  return json({ ok: true, playerId: id, role: verdict.next, previous: current, changed: true, role_updated_at: now });
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
  const found = await withRoleColumns(env.DB, () => env.DB.prepare('SELECT playerId, nickname, created_at, last_seen, (token_hash IS NOT NULL) AS registered, role, role_updated_at, role_updated_by FROM players WHERE playerId=?').bind(id).first());
  if (!found) return fail(404, 'not-found');
  const player = { ...found, role: normalizeRole(found.role) };
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

function snapStore(kv: GodKv): SnapshotStore {
  return {
    get: (key, type) => (type === 'json' ? kv.get(key, 'json') : kv.get(key)),
    put: (key, value, options) => kv.put(key, value, options),
    delete: (key) => kv.delete(key),
  };
}


/** Store a Wish. The caller already passed `requireRole(..., 'god')`. */
async function postWish(req: Request, env: GodEnv, secret: string, who: Principal): Promise<Response> {
  const origin = new URL(req.url).origin;
  const appBase = normalizeAppBase(env.APP_BASE);
  const base = `${origin}${appBase}/api/god`;
  const length = Number(req.headers.get('content-length') ?? 0);
  if (length > WISH_MAX_BODY_BYTES) return fail(413, 'too-large');
  let text = '';
  try { text = await req.text(); } catch { return fail(400, 'bad-json'); }
  if (new TextEncoder().encode(text).length > WISH_MAX_BODY_BYTES) return fail(413, 'too-large');
  let input: unknown = null;
  try { input = JSON.parse(text); } catch { return fail(400, 'bad-json'); }
  const parsed = parseWish(input, req.headers.get('user-agent') ?? '', Date.now());
  if (!('id' in parsed)) return json(parsed.body, parsed.status);
  const result = await createWish({
    db: env.DB,
    base,
    who,
    inspect: async (document) => {
      const made = await createSnapshot(snapStore(env.ASSETS_KV), secret, document, '7d');
      if ('error' in made) return null;
      return { url: new URL(snapshotPath(appBase, made.id, made.token), req.url).href, expiresAt: made.expiresAt };
    },
  }, parsed);
  return json(result.body, result.status);
}

/** Read or mark wishes. The caller already passed the super_god gate. */
async function readWishes(req: Request, env: GodEnv, path: string): Promise<Response> {
  const origin = new URL(req.url).origin;
  const appBase = normalizeAppBase(env.APP_BASE);
  const base = `${origin}${appBase}/api/god`;
  const send = (r: { status: number; body: Record<string, unknown> }) => json(r.body, r.status);
  if (path === '/wishes' && req.method === 'GET') return send(await listWishes(env.DB, new URL(req.url).searchParams, base));
  if (path === '/wishes/mark-read' && req.method === 'POST') {
    let input: unknown = null;
    try { input = await req.json(); } catch { return fail(400, 'bad-json'); }
    return send(await markWishesRead(env.DB, input, Date.now()));
  }
  const shot = /^\/wishes\/([^/]+)\/screenshot$/.exec(path);
  if (shot && req.method === 'GET') {
    const found = await readWishShot(env.DB, decodeURIComponent(shot[1]));
    if (!found) return fail(404, 'not-found');
    return new Response(found.bytes.buffer as ArrayBuffer, { headers: { 'content-type': found.mime, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex, nofollow' } });
  }
  const one = /^\/wishes\/([^/]+)$/.exec(path);
  if (one && req.method === 'GET') return send(await readWish(env.DB, decodeURIComponent(one[1]), base));
  return fail(404, 'no-such-endpoint');
}

export async function godApi(req: Request, env: GodEnv, path: string): Promise<Response> {
  if (path === '/login' && req.method === 'POST') return login(req, env);
  if (path === '/logout' && req.method === 'POST') return json({ ok: true }, 200, { 'set-cookie': cookie('', 0, env) });
  const secret = env.GOD_ADMIN_PASSWORD;
  if (!secret) return fail(503, 'not-configured');
  const snap = /^\/snapshots\/([A-Za-z0-9_-]{32,80})$/.exec(path);
  if (snap && req.method === 'GET') {
    const token = new URL(req.url).searchParams.get('t') ?? '';
    const result = await readSnapshot(snapStore(env.ASSETS_KV), secret, snap[1], token);
    if (!result.ok) return fail(result.error === 'bad-token' ? 401 : 410, result.error);
    return json({ ok: true, title: result.title, expiresAt: result.expiresAt, document: result.document });
  }
  // Every endpoint below needs at least `god`. A god caller may also POST /wishes and POST /snapshots; reading wishes and every other route is super god only.
  const who = await requireRole(req, env, 'god');
  if (who instanceof Response) return who;
  if (path === '/me' && req.method === 'GET') return json({ ok: true, role: who.role, via: who.via });
  if (path === '/snapshots' && req.method === 'POST') {
    let body: { ttl?: unknown; document?: unknown } = {};
    try { body = await req.json() as { ttl?: unknown; document?: unknown }; } catch { return fail(400, 'bad-json'); }
    const made = await createSnapshot(snapStore(env.ASSETS_KV), secret, body.document, typeof body.ttl === 'string' ? body.ttl : '');
    if ('error' in made) return fail(made.error === 'too-large' ? 413 : 400, made.error);
    const url = new URL(snapshotPath(normalizeAppBase(env.APP_BASE), made.id, made.token), req.url).href;
    return json({ ok: true, id: made.id, expiresAt: made.expiresAt, url });
  }
  if (path === '/wishes' && req.method === 'POST') return postWish(req, env, secret, who);
  if (!atLeast(who.role, 'super_god')) return fail(403, 'forbidden');
  if (path === '/wishes' || path.startsWith('/wishes/')) return readWishes(req, env, path);
  if (path === '/dashboard' && req.method === 'GET') return dashboard(env);
  if (path === '/players' && req.method === 'GET') return playerList(env, new URL(req.url));
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
  m = /^\/players\/([^/]+)\/role$/.exec(path);
  if (m && req.method === 'POST') {
    const id = decodeURIComponent(m[1]);
    if (!ID_RE.test(id)) return fail(400, 'bad-id');
    return setRole(req, env, who, id);
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
  if (path === '/snapshots' && req.method === 'GET') {
    return json({ ok: true, snapshots: await listSnapshots(snapStore(env.ASSETS_KV)) });
  }
  if (snap && req.method === 'DELETE') {
    return (await revokeSnapshot(snapStore(env.ASSETS_KV), snap[1])) ? json({ ok: true }) : fail(404, 'not-found');
  }
  if (path === '/modules' && req.method === 'GET') {
    const reg = await env.ASSETS_KV.get('/modules.json', 'json');
    return reg ? json({ ok: true, registry: reg }) : fail(404, 'no-registry');
  }
  return fail(404, 'no-such-endpoint');
}
