/**
 * Cloudflare Worker for games.itio.space/never.
 * - Static files live in Workers KV (binding ASSETS_KV, key = path under /never, e.g. "/index.html").
 * - Leaderboard API under /never/api backed by D1 (binding DB). See docs/online-leaderboard.md.
 */
import { normalizeAppBase } from '../src/lib/deployment';
import { godApi } from '../src/modules/god/server';
import { decodeRun, tagFor, unb64url, type ChallengeRunPb } from '../src/modules/challenge/proto';
import { acceptRuleset, legacyRuleset, rhythmFor, scoringFor, versionIn, resolveGame } from '../src/lib/rulesetCatalog';

interface Env {
  ASSETS_KV: KVNamespace;
  DB: D1Database;
  GOD_ADMIN_PASSWORD?: string;
  APP_BASE?: string;
}

const GAMES = ['cross', 'jig', 'slide'];
const DIFFS = ['easy', 'medium', 'hard'];
const MULT: Record<string, number> = { easy: 1, medium: 1.5, hard: 2 };
const PAR: Record<string, Record<string, number>> = {
  cross: { easy: 45, medium: 75, hard: 110 },
  jig: { easy: 30, medium: 50, hard: 90 },
  slide: { easy: 40, medium: 70, hard: 150 },
};
const ID_RE = /^[A-Za-z0-9-]{8,64}$/;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const err = (status: number, error: string) => json({ ok: false, error }, status);

async function sha256Hex(s: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function newToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function bearer(req: Request): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '');
  return m ? m[1] : null;
}
const cleanNick = (s: unknown) => String(s ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 24);

/** Reject cross-site browser writes (same-origin only). Non-browser callers send no Origin. */
function sameOrigin(req: Request): boolean {
  const o = req.headers.get('origin');
  return !o || o === new URL(req.url).origin;
}

async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    const t = await req.text();
    if (!t) return {};
    try { return JSON.parse(t); } catch { return { token: t.trim() }; }
  } catch { return {}; }
}

async function tokenOk(env: Env, playerId: string, token: string | null): Promise<boolean> {
  if (!token) return false;
  const row = await env.DB.prepare('SELECT token_hash FROM players WHERE playerId=?').bind(playerId).first<{ token_hash: string | null }>();
  return !!row?.token_hash && row.token_hash === (await sha256Hex(token));
}

/** Stir-fry (rhythm minigame): one 60 s round, no seed/difficulty ("normal"). Generous cap above the best possible play. */
const STIRFRY = { difficulties: ['easy', 'normal', 'hard'], maxMs: 65_000, maxScore: 25_000 };
export const BOARD_GAMES: Record<string, string[]> = { cross: DIFFS, jig: DIFFS, slide: DIFFS, stirfry: STIRFRY.difficulties };

/** Empty ruleset (pre-0.6.11 tokens) is the v0.6.10 legacy ruleset. Anything else must be on the allowlist. */
function rulesetFor(r: ChallengeRunPb): string | null {
  return acceptRuleset(r.game, r.ruleset || null);
}

function plausible(r: ChallengeRunPb): string | null {
  const ruleset = rulesetFor(r);
  if (!ruleset) return 'unsupported ruleset';
  const resolved = resolveGame(r.game, ruleset);
  if (!resolved.ok) return 'unsupported ruleset';
  if (r.game === 'stirfry') {
    if (!STIRFRY.difficulties.includes(r.difficulty)) return 'bad game/difficulty';
    // Seeded chart: the seed picks the cue sequence, so it must be a real chart seed.
    if (!Number.isInteger(r.seed) || r.seed < 1 || r.seed >= 2 ** 31) return 'bad seed';
    if (!ID_RE.test(r.sessionId) || !ID_RE.test(r.playerId)) return 'bad ids';
    const engine = rhythmFor(versionIn(resolved, 'rhythm'));
    const minMs = engine?.submit.minMs ?? 3000;
    const maxMs = ((engine?.params.durationSec ?? 60) + (engine?.submit.slackSec ?? 5)) * 1000;
    const maxScore = engine?.submit.maxScore ?? STIRFRY.maxScore;
    if (r.timeMs < minMs || r.timeMs > maxMs) return 'implausible time';
    if (r.score < 0 || r.score > maxScore) return 'implausible score';
    if (r.timestampMs && r.timestampMs > Date.now() + 86_400_000) return 'future timestamp';
    return null;
  }
  if (!GAMES.includes(r.game) || !DIFFS.includes(r.difficulty)) return 'bad game/difficulty';
  if (!ID_RE.test(r.sessionId) || !ID_RE.test(r.playerId)) return 'bad ids';
  const scoring = scoringFor(versionIn(resolved, 'challenge'));
  const minMs = scoring?.minMs ?? 3000;
  const maxMs = scoring?.maxMs ?? 3_600_000;
  if (r.timeMs < minMs || r.timeMs > maxMs) return 'implausible time';
  const secs = r.timeMs / 1000;
  const par = scoring?.par[r.game as 'cross']?.[r.difficulty as 'easy'] ?? PAR[r.game][r.difficulty];
  const bonus = scoring?.timeBonus ?? 10;
  const base = scoring?.maxBase ?? 3000;
  const mult = scoring?.mult[r.difficulty as 'easy'] ?? MULT[r.difficulty];
  const max = Math.round((base + Math.max(0, par - secs) * bonus) * mult);
  if (r.score < 0 || r.score > max) return 'implausible score';
  if (r.timestampMs && r.timestampMs > Date.now() + 86_400_000) return 'future timestamp';
  return null;
}

async function playerFromToken(env: Env, req: Request): Promise<string | null> {
  const t = bearer(req);
  if (!t) return null;
  const row = await env.DB.prepare('SELECT playerId FROM players WHERE token_hash=?').bind(await sha256Hex(t)).first<{ playerId: string }>();
  return row?.playerId ?? null;
}

const MAX_JSON = 200_000;

/** GET/PUT a rev-versioned JSON document (player_state / player_home). PUT needs body {rev, data, schema_version?}. */
async function revDoc(req: Request, env: Env, pid: string, table: 'player_state' | 'player_home', col: 'state_json' | 'room_json'): Promise<Response> {
  const cur = await env.DB.prepare(`SELECT schema_version, ${col} AS data, rev, updated_at FROM ${table} WHERE playerId=?`).bind(pid)
    .first<{ schema_version: number; data: string; rev: number; updated_at: number }>();
  const view = (r: typeof cur) => (r ? { schema_version: r.schema_version, data: JSON.parse(r.data), rev: r.rev, updated_at: r.updated_at } : { schema_version: 1, data: null, rev: 0, updated_at: 0 });
  if (req.method === 'GET') return json({ ok: true, ...view(cur) });
  if (req.method !== 'PUT') return err(405, 'method');
  const b = await body(req);
  const text = JSON.stringify(b.data ?? null);
  if (b.data == null || typeof b.data !== 'object' || text.length > MAX_JSON) return err(400, 'bad data');
  if (/token/i.test(Object.keys(b.data as object).join(','))) return err(400, 'token not allowed in state');
  const rev = Number(b.rev ?? 0);
  if ((cur?.rev ?? 0) !== rev) return json({ ok: false, error: 'rev conflict', current: view(cur) }, 409);
  const now = Date.now();
  const sv = Number(b.schema_version ?? 1) || 1;
  const res = await env.DB.prepare(
    `INSERT INTO ${table} (playerId, schema_version, ${col}, rev, updated_at) VALUES (?,?,?,1,?)
     ON CONFLICT(playerId) DO UPDATE SET schema_version=excluded.schema_version, ${col}=excluded.${col}, rev=${table}.rev+1, updated_at=excluded.updated_at
     WHERE ${table}.rev=?`,
  ).bind(pid, sv, text, now, rev).run();
  if ((res.meta?.changes ?? 0) === 0) return err(409, 'rev conflict');
  await env.DB.prepare('UPDATE players SET last_seen=? WHERE playerId=?').bind(now, pid).run();
  return json({ ok: true, rev: rev + 1, updated_at: now });
}

async function meApi(req: Request, env: Env, path: string): Promise<Response> {
  const pid = await playerFromToken(env, req);
  if (!pid) return err(401, 'unauthorized');
  if (path === '/state') return revDoc(req, env, pid, 'player_state', 'state_json');
  if (path === '/home') return revDoc(req, env, pid, 'player_home', 'room_json');
  if (path === '/events' && req.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT eventId,status,progress_json,started_at,completed_at,updated_at FROM player_events WHERE playerId=?').bind(pid).all<Record<string, unknown>>();
    return json({ ok: true, events: results.map((r) => ({ ...r, progress: JSON.parse(String(r.progress_json)), progress_json: undefined })) });
  }
  const m = /^\/events\/([A-Za-z0-9_-]{1,64})$/.exec(path);
  if (m && req.method === 'PUT') {
    const b = await body(req);
    const status = b.status === 'completed' ? 'completed' : 'started';
    const progress = JSON.stringify(b.progress ?? {});
    if (progress.length > MAX_JSON) return err(400, 'too large');
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO player_events (playerId,eventId,status,progress_json,started_at,completed_at,updated_at) VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(playerId,eventId) DO UPDATE SET status=CASE WHEN player_events.status='completed' THEN 'completed' ELSE excluded.status END,
         progress_json=excluded.progress_json, completed_at=COALESCE(player_events.completed_at, excluded.completed_at), updated_at=excluded.updated_at`,
    ).bind(pid, m[1], status, progress, now, status === 'completed' ? now : null, now).run();
    return json({ ok: true, eventId: m[1], status });
  }
  return err(404, 'no such endpoint');
}

async function api(req: Request, env: Env, path: string): Promise<Response> {
  if (req.method !== 'GET' && !sameOrigin(req)) return err(403, 'cross-origin');
  if (path.startsWith('/god/')) return godApi(req, env, path.slice(4));
  const now = Date.now();

  if (path === '/players/register' && req.method === 'POST') {
    const b = await body(req);
    const playerId = String(b.playerId ?? '');
    if (!ID_RE.test(playerId)) return err(400, 'bad playerId');
    const nick = cleanNick(b.nickname);
    const row = await env.DB.prepare('SELECT token_hash FROM players WHERE playerId=?').bind(playerId).first<{ token_hash: string | null }>();
    if (row?.token_hash) return err(409, 'already registered');
    const token = newToken();
    const h = await sha256Hex(token);
    await env.DB.prepare(
      `INSERT INTO players (playerId,nickname,token_hash,created_at,last_seen) VALUES (?,?,?,?,?)
       ON CONFLICT(playerId) DO UPDATE SET token_hash=excluded.token_hash, nickname=CASE WHEN excluded.nickname<>'' THEN excluded.nickname ELSE players.nickname END, last_seen=excluded.last_seen
       WHERE players.token_hash IS NULL`,
    ).bind(playerId, nick, h, now, now).run();
    if (!(await tokenOk(env, playerId, token))) return err(409, 'already registered');
    return json({ ok: true, playerId, token });
  }

  if (path.startsWith('/players/me/')) return meApi(req, env, path.slice('/players/me'.length));

  let m = /^\/players\/([^/]+)(\/rotate)?$/.exec(path);
  if (m) {
    const id = decodeURIComponent(m[1]);
    if (!ID_RE.test(id)) return err(400, 'bad playerId');
    if (req.method === 'GET' && !m[2]) {
      const p = await env.DB.prepare('SELECT playerId,nickname,created_at,last_seen, token_hash IS NOT NULL AS registered FROM players WHERE playerId=?').bind(id).first();
      if (!p) return err(404, 'not found');
      const { results } = await env.DB.prepare(
        'SELECT game,difficulty,MAX(score) AS best,COUNT(*) AS runs FROM runs WHERE playerId=? AND verified=1 GROUP BY game,difficulty',
      ).bind(id).all();
      return json({ ok: true, player: p, bests: results });
    }
    if (!(await tokenOk(env, id, bearer(req)))) return err(401, 'unauthorized');
    if (req.method === 'PATCH' && !m[2]) {
      const nick = cleanNick((await body(req)).nickname);
      if (!nick) return err(400, 'bad nickname');
      await env.DB.prepare('UPDATE players SET nickname=?, last_seen=? WHERE playerId=?').bind(nick, now, id).run();
      return json({ ok: true, nickname: nick });
    }
    if (req.method === 'POST' && m[2]) {
      const token = newToken();
      await env.DB.prepare('UPDATE players SET token_hash=?, last_seen=? WHERE playerId=?').bind(await sha256Hex(token), now, id).run();
      return json({ ok: true, token });
    }
    return err(405, 'method');
  }

  if (path === '/runs' && req.method === 'POST') {
    const b = await body(req);
    const tok = String(b.token ?? b.run ?? '');
    const [enc, tag] = tok.split('.');
    if (!enc || !tag || tok.length > 2048) return err(400, 'bad token');
    let run: ChallengeRunPb;
    let bytes: Uint8Array;
    try { bytes = unb64url(enc); run = decodeRun(bytes); } catch { return err(400, 'undecodable'); }
    if ((await tagFor(bytes)) !== tag) return err(400, 'integrity tag mismatch');
    const bad = plausible(run);
    if (bad) return err(400, bad);
    const auth = bearer(req);
    let verified = 0;
    if (auth) {
      if (!(await tokenOk(env, run.playerId, auth))) return err(401, 'unauthorized');
      verified = 1;
    }
    const nick = cleanNick(run.nickname);
    const ruleset = rulesetFor(run) ?? legacyRuleset(run.game);
    // Unverified (challenger) runs only create an unclaimed player row; they never change a claimed one.
    await env.DB.prepare(
      `INSERT INTO players (playerId,nickname,token_hash,created_at,last_seen) VALUES (?,?,NULL,?,?)
       ON CONFLICT(playerId) DO UPDATE SET last_seen=CASE WHEN ?=1 THEN excluded.last_seen ELSE players.last_seen END,
         nickname=CASE WHEN players.nickname='' THEN excluded.nickname ELSE players.nickname END`,
    ).bind(run.playerId, nick, now, now, verified).run();
    // Idempotent by sessionId; a later verified submit upgrades an earlier unverified copy.
    const res = await env.DB.prepare(
      `INSERT INTO runs (sessionId,playerId,nickname,game,difficulty,seed,score,timeMs,version,ruleset,ts,challenger_session,integrity_ok,verified,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)
       ON CONFLICT(sessionId) DO UPDATE SET verified=1 WHERE excluded.verified=1 AND runs.playerId=excluded.playerId`,
    ).bind(run.sessionId, run.playerId, nick, run.game, run.difficulty, run.seed, run.score, run.timeMs, run.version, ruleset, run.timestampMs || now,
      run.challengerSessionId || null, verified, now).run();
    return json({ ok: true, sessionId: run.sessionId, verified: !!verified, stored: (res.meta?.changes ?? 0) > 0 });
  }

  if (path === '/leaderboard' && req.method === 'GET') {
    const u = new URL(req.url);
    const game = u.searchParams.get('game') ?? 'cross';
    const diff = u.searchParams.get('difficulty') ?? 'easy';
    if (!BOARD_GAMES[game]?.includes(diff)) return err(400, 'bad game/difficulty');
    const requested = u.searchParams.get('ruleset');
    const ruleset = acceptRuleset(game, requested);
    if (!ruleset) return err(400, 'unsupported ruleset');
    const limit = Math.min(100, Math.max(1, Number(u.searchParams.get('limit')) || 20));
    const { results } = await env.DB.prepare(
      `SELECT x.playerId, COALESCE(NULLIF(p.nickname,''), x.nickname) AS nickname, x.score, x.timeMs, x.seed, x.ts
       FROM (SELECT r.*, ROW_NUMBER() OVER (PARTITION BY r.playerId ORDER BY r.score DESC, r.timeMs ASC) AS rn
             FROM runs r WHERE r.game=? AND r.difficulty=? AND r.ruleset=? AND r.verified=1) x
       LEFT JOIN players p ON p.playerId=x.playerId
       WHERE x.rn=1 ORDER BY x.score DESC, x.timeMs ASC LIMIT ?`,
    ).bind(game, diff, ruleset, limit).all();
    return json({ ok: true, game, difficulty: diff, ruleset, rows: results });
  }

  return err(404, 'no such endpoint');
}

async function asset(req: Request, env: Env, path: string): Promise<Response> {
  let key = path === '' || path.endsWith('/') ? `${path}index.html` : path;
  let hit = await env.ASSETS_KV.getWithMetadata<{ ct: string; h: string }>(key, 'arrayBuffer');
  if (!hit.value && !/\.[a-z0-9]+$/i.test(key)) {
    key = '/index.html';
    hit = await env.ASSETS_KV.getWithMetadata<{ ct: string; h: string }>(key, 'arrayBuffer');
  }
  if (!hit.value) return new Response('Not found', { status: 404 });
  const etag = `"${hit.metadata?.h ?? ''}"`;
  const moduleChunk = /^\/modules\/[a-z0-9-]+\/\d+\.\d+\.\d+\/[a-f0-9]+\.js$/.test(key);
  const manifest = key === '/modules/manifest.json';
  const immutable = key.startsWith('/assets/') || moduleChunk;
  const headers = {
    'content-type': hit.metadata?.ct ?? 'application/octet-stream',
    etag,
    'cache-control': manifest || key.endsWith('.html') || key.endsWith('sw.js') ? 'no-cache' : immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
    'x-content-type-options': 'nosniff',
  };
  if (req.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });
  return new Response(req.method === 'HEAD' ? null : hit.value, { headers });
}

function injectBase(html: string, base: string): string {
  return html.replace('<head>', `<head><meta name="nes-app-base" content="${base}"><base href="${base}/">`);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    let BASE: string;
    try { BASE = normalizeAppBase(env.APP_BASE); } catch { return err(500, 'invalid deployment base'); }
    if (url.pathname === BASE) return Response.redirect(`${url.origin}${BASE}/${url.search}`, 301);
    if (!url.pathname.startsWith(`${BASE}/`)) return new Response('Not found', { status: 404 });
    const path = url.pathname.slice(BASE.length);
    try {
      // A scoped network-only worker prevents the parent production SW owning this partition.
      if (path === '/sw.js' && BASE !== '/never') return new Response(
        `self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));`,
        { headers: { 'content-type': 'application/javascript', 'cache-control': 'no-store' } });
      if (path.startsWith('/api/')) return await api(req, env, path.slice(4));
      if (req.method !== 'GET' && req.method !== 'HEAD') return err(405, 'method');
      // Admin SPA: /never/god and deep links /never/god/<section>/<id>. Relative asset URLs are rewritten to absolute /never/ paths.
      if (path === '/god' || path.startsWith('/god/')) {
        const res = await asset(req, env, '/god.html');
        const headers = new Headers(res.headers);
        headers.set('x-robots-tag', 'noindex, nofollow');
        headers.set('x-frame-options', 'DENY');
        headers.set('referrer-policy', 'no-referrer');
        headers.delete('etag');
        if (res.status !== 200) return new Response(res.body, { status: res.status, headers });
        const html = injectBase(await res.text(), BASE).replace(/(src|href)="\.\//g, `$1="${BASE}/`);
        return new Response(req.method === 'HEAD' ? null : html, { status: 200, headers });
      }
      if (path === '/modules.json') return new Response('Not found', { status: 404 }); // admin-only via /api/god/modules
      const res = await asset(req, env, path);
      if (res.status === 200 && res.headers.get('content-type')?.includes('text/html')) {
        const headers = new Headers(res.headers); headers.delete('etag');
        return new Response(req.method === 'HEAD' ? null : injectBase(await res.text(), BASE), { headers });
      }
      return res;
    } catch {
      return err(500, 'internal');
    }
  },
};
