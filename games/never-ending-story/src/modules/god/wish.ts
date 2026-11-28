/**
 * God Mode "Wish": a feature request written inside the game by a signed-in God user.
 * Storage is D1 (`god_wishes`). The screenshot is a size-capped base64 column that list queries never select.
 * Rules, validation and the read API live here; `server.ts` only routes to them after the God session check.
 */
import { bangkokDay, dayLabel } from '../../lib/streak';
import { redactSnapshot } from './snapshot';
import type { Principal } from '../../lib/roles';

export const WISH_MAX_TEXT = 2000;
/** Decoded screenshot cap. The client compresses to about 150 KB; this is the hard server limit. */
export const WISH_MAX_SHOT_BYTES = 400_000;
export const WISH_MAX_STATE_BYTES = 200_000;
export const WISH_MAX_BODY_BYTES = 900_000;
/** At most this many wishes inside the window, so a stuck client cannot fill D1. */
export const WISH_RATE_MAX = 10;
export const WISH_RATE_WINDOW_MS = 10 * 60 * 1000;
export const WISH_LIST_DEFAULT = 50;
export const WISH_LIST_MAX = 200;
export const WISH_MARK_MAX = 100;
const BANGKOK_OFFSET_MS = 7 * 3600 * 1000;
const ID_RE = /^[A-Za-z0-9_-]{16,64}$/;

export const WISH_TABLE_SQL = `CREATE TABLE IF NOT EXISTS god_wishes (
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
)`;
export const WISH_INDEX_SQL = 'CREATE INDEX IF NOT EXISTS god_wishes_created ON god_wishes (created_at)';

/** Structural D1 shape so this file typechecks without Workers types. */
interface WishStatement {
  bind(...args: unknown[]): WishStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes?: number } }>;
}
export interface WishDb {
  prepare(query: string): WishStatement;
}

let ensured: WishDb | null = null;
/** Databases created before this release get the table on first use (same SQL as schema.sql and migrations/004_wishes.sql). */
export async function ensureWishTable(db: WishDb): Promise<void> {
  if (ensured === db) return;
  await db.prepare(WISH_TABLE_SQL).run();
  await db.prepare(WISH_INDEX_SQL).run();
  ensured = db;
}

export type WishResult = { status: number; body: Record<string, unknown> };
const bad = (status: number, error: string, extra: Record<string, unknown> = {}): WishResult => ({ status, body: { ok: false, error, ...extra } });

/** `YYYY-MM-DD` (Bangkok midnight) or a full ISO timestamp. Returns epoch ms, or null when it cannot be read. */
export function parseSince(raw: string | null): number | null {
  if (raw == null || raw.trim() === '') return 0;
  const text = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const ms = Date.parse(`${text}T00:00:00.000Z`);
    return Number.isFinite(ms) ? ms - BANGKOK_OFFSET_MS : null;
  }
  if (!/^\d{4}-\d{2}-\d{2}[T ]/.test(text)) return null;
  const ms = Date.parse(text.replace(' ', 'T'));
  return Number.isFinite(ms) ? ms : null;
}

export function wishDay(ms: number): string {
  return dayLabel(bangkokDay(ms));
}

export function wishId(bytes: Uint8Array = crypto.getRandomValues(new Uint8Array(18))): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const MIMES: Record<string, (b: Uint8Array) => boolean> = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/webp': (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
};

/** Accepts a `data:image/...;base64,` URL. The magic bytes must match the claimed type. */
export function readShot(raw: unknown): { mime: string; b64: string; bytes: number } | null | 'bad' | 'too-large' {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'string') return 'bad';
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(raw);
  if (!m) return 'bad';
  const b64 = m[2];
  const bytes = Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
  if (bytes > WISH_MAX_SHOT_BYTES) return 'too-large';
  let head: Uint8Array;
  try { head = Uint8Array.from(atob(b64.slice(0, 24)), (c) => c.charCodeAt(0)); } catch { return 'bad'; }
  if (!MIMES[m[1]](head)) return 'bad';
  return { mime: m[1], b64, bytes };
}

const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, max) : '');

export type WishInput = {
  id: string;
  now: number;
  text: string;
  route: string;
  screen: string;
  title: string;
  appVersion: string;
  modulesJson: string;
  userAgent: string;
  stateJson: string | null;
  shot: { mime: string; b64: string; bytes: number } | null;
  document: unknown;
};

/** Validate the client payload. State is redacted again here before it is stored or linked. */
export function parseWish(input: unknown, userAgent: string, now: number): WishInput | WishResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return bad(400, 'bad-json');
  const b = input as Record<string, unknown>;
  const text = typeof b.text === 'string' ? b.text.replace(/\r\n/g, '\n').trim() : '';
  if (!text) return bad(400, 'empty-text');
  if (text.length > WISH_MAX_TEXT) return bad(413, 'text-too-long');
  const shot = readShot(b.screenshot);
  if (shot === 'bad') return bad(400, 'bad-screenshot');
  if (shot === 'too-large') return bad(413, 'screenshot-too-large');
  let stateJson: string | null = null;
  let document: unknown = null;
  if (b.state != null) {
    if (typeof b.state !== 'object') return bad(400, 'bad-state');
    document = redactSnapshot(b.state);
    stateJson = JSON.stringify(document);
    if (new TextEncoder().encode(stateJson).length > WISH_MAX_STATE_BYTES) return bad(413, 'state-too-large');
  }
  const doc = (document ?? {}) as { page?: { route?: unknown; screen?: unknown; title?: unknown }; versions?: { app?: unknown; modules?: unknown } };
  const modules = doc.versions && typeof doc.versions.modules === 'object' ? doc.versions.modules : {};
  return {
    id: wishId(),
    now,
    text,
    route: clip(b.route ?? doc.page?.route, 200),
    screen: clip(doc.page?.screen, 80),
    title: clip(doc.page?.title, 120),
    appVersion: clip(b.appVersion ?? doc.versions?.app, 32),
    modulesJson: JSON.stringify(modules).slice(0, 2000),
    userAgent: clip(userAgent, 300),
    stateJson,
    shot: shot ?? null,
    document,
  };
}

type Row = Record<string, unknown>;
const LIST_COLUMNS = 'id, created_at, created_iso, day_bkk, text, route, screen, title, app_version, modules_json, user_agent, player_id, player_role, inspect_url, inspect_exp, shot_mime, shot_bytes, read_at';

/** Public JSON of one stored wish (never the image bytes). `base` is `<origin><app base>/api/god`. */
export function wishView(row: Row, base: string): Row {
  let modules: unknown = {};
  try { modules = JSON.parse(String(row.modules_json ?? '{}')); } catch { /* keep {} */ }
  const id = String(row.id);
  const hasShot = Number(row.shot_bytes ?? 0) > 0;
  return {
    id,
    createdAt: row.created_iso,
    createdMs: row.created_at,
    dayBangkok: row.day_bkk,
    text: row.text,
    route: row.route || null,
    screen: row.screen || null,
    title: row.title || null,
    appVersion: row.app_version || null,
    modules,
    userAgent: row.user_agent || null,
    playerId: row.player_id || null,
    role: row.player_role || null,
    inspectUrl: row.inspect_url || null,
    inspectExpiresAt: typeof row.inspect_exp === 'number' ? new Date(row.inspect_exp).toISOString() : null,
    screenshotUrl: hasShot ? `${base}/wishes/${id}/screenshot` : null,
    screenshotMime: hasShot ? row.shot_mime : null,
    stateUrl: `${base}/wishes/${id}`,
    readAt: typeof row.read_at === 'number' ? new Date(row.read_at).toISOString() : null,
  };
}

export type CreateOpts = {
  db: WishDb;
  /** Makes the signed inspect link for the redacted state. Null when no link can be made. */
  inspect: (document: unknown) => Promise<{ url: string; expiresAt: number } | null>;
  base: string;
  /** Who is sending: a bearer-token player stores playerId + role; a password session stores role only. */
  who: Principal;
};

export async function createWish(opts: CreateOpts, input: WishInput): Promise<WishResult> {
  await ensureWishTable(opts.db);
  const recent = await opts.db.prepare('SELECT count(*) AS n FROM god_wishes WHERE created_at>=?').bind(input.now - WISH_RATE_WINDOW_MS).first<{ n: number }>();
  if ((recent?.n ?? 0) >= WISH_RATE_MAX) return bad(429, 'rate-limited', { retryAfterSec: Math.ceil(WISH_RATE_WINDOW_MS / 1000) });
  let link: { url: string; expiresAt: number } | null = null;
  if (input.document != null) {
    try { link = await opts.inspect(input.document); } catch { link = null; }
  }
  const playerId = opts.who.via === 'token' ? opts.who.playerId : null;
  const playerRole = opts.who.role;
  await opts.db.prepare(
    `INSERT INTO god_wishes (id, created_at, created_iso, day_bkk, text, route, screen, title, app_version, modules_json, user_agent,
       player_id, player_role, inspect_url, inspect_exp, state_json, shot_mime, shot_b64, shot_bytes, read_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)`,
  ).bind(
    input.id, input.now, new Date(input.now).toISOString(), wishDay(input.now), input.text, input.route, input.screen, input.title,
    input.appVersion, input.modulesJson, input.userAgent, playerId, playerRole, link?.url ?? null, link?.expiresAt ?? null, input.stateJson,
    input.shot?.mime ?? null, input.shot?.b64 ?? null, input.shot?.bytes ?? 0,
  ).run();
  const row = await opts.db.prepare(`SELECT ${LIST_COLUMNS} FROM god_wishes WHERE id=?`).bind(input.id).first<Row>();
  return { status: 200, body: { ok: true, wish: wishView(row ?? {}, opts.base) } };
}

/** `since` is inclusive (created_at >= since). Oldest first so a puller works in order; `order=desc` is for the in-game list and the admin page. `page` is 1-based (default 1). */
export async function listWishes(db: WishDb, query: URLSearchParams, base: string): Promise<WishResult> {
  const since = parseSince(query.get('since'));
  if (since == null) return bad(400, 'bad-since');
  const unread = ['1', 'true', 'yes'].includes((query.get('unread') ?? '').toLowerCase());
  const limit = Math.min(WISH_LIST_MAX, Math.max(1, Number(query.get('limit')) || WISH_LIST_DEFAULT));
  const page = Math.max(1, Math.floor(Number(query.get('page')) || 1) || 1);
  const dir = query.get('order') === 'desc' ? 'DESC' : 'ASC';
  const offset = (page - 1) * limit;
  await ensureWishTable(db);
  const { results } = await db.prepare(
    `SELECT ${LIST_COLUMNS} FROM god_wishes WHERE created_at>=? ${unread ? 'AND read_at IS NULL' : ''} ORDER BY created_at ${dir}, id ${dir} LIMIT ? OFFSET ?`,
  ).bind(since, limit, offset).all<Row>();
  const total = await db.prepare(`SELECT count(*) AS n FROM god_wishes WHERE created_at>=? ${unread ? 'AND read_at IS NULL' : ''}`).bind(since).first<{ n: number }>();
  return { status: 200, body: { ok: true, since: since ? new Date(since).toISOString() : null, unread, count: results.length, total: total?.n ?? results.length, page, pageSize: limit, wishes: results.map((r) => wishView(r, base)) } };
}

export async function readWish(db: WishDb, id: string, base: string): Promise<WishResult> {
  if (!ID_RE.test(id)) return bad(400, 'bad-id');
  await ensureWishTable(db);
  const row = await db.prepare(`SELECT ${LIST_COLUMNS}, state_json FROM god_wishes WHERE id=?`).bind(id).first<Row>();
  if (!row) return bad(404, 'not-found');
  let state: unknown = null;
  try { state = row.state_json ? JSON.parse(String(row.state_json)) : null; } catch { state = null; }
  return { status: 200, body: { ok: true, wish: wishView(row, base), state } };
}

export async function readWishShot(db: WishDb, id: string): Promise<{ mime: string; bytes: Uint8Array } | null> {
  if (!ID_RE.test(id)) return null;
  await ensureWishTable(db);
  const row = await db.prepare('SELECT shot_mime, shot_b64 FROM god_wishes WHERE id=?').bind(id).first<{ shot_mime: string | null; shot_b64: string | null }>();
  if (!row?.shot_b64 || !row.shot_mime) return null;
  const bin = atob(row.shot_b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { mime: row.shot_mime, bytes };
}

export async function markWishesRead(db: WishDb, input: unknown, now: number): Promise<WishResult> {
  const ids = input && typeof input === 'object' ? (input as { ids?: unknown }).ids : null;
  if (!Array.isArray(ids) || ids.length === 0) return bad(400, 'bad-ids');
  if (ids.length > WISH_MARK_MAX) return bad(413, 'too-many-ids');
  if (!ids.every((id) => typeof id === 'string' && ID_RE.test(id))) return bad(400, 'bad-ids');
  await ensureWishTable(db);
  let marked = 0;
  for (const id of ids as string[]) {
    const res = await db.prepare('UPDATE god_wishes SET read_at=? WHERE id=? AND read_at IS NULL').bind(now, id).run();
    marked += res.meta.changes ?? 0;
  }
  return { status: 200, body: { ok: true, marked, requested: ids.length } };
}
