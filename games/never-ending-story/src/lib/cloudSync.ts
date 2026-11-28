import { appStorage, appBase } from './deployment';
/**
 * Online sync with the Cloudflare Worker API (games.itio.space/never/api).
 * Everything is best-effort: offline, cross-origin previews or API errors fall back to local data silently.
 * See docs/online-leaderboard.md.
 */
import { readPlayerId } from './playerId';
import { bangkokDay, dayLabel, type StreakView } from './streak';

const TOKEN_KEY = 'nesg.playerToken.v1';
const RUNQ_KEY = 'nesg.runQueue.v1';
const META_KEY = 'nesg.sync.v1';
/** Sealed streak token from the server plus the last board view. Not part of the cloud save. */
const STREAK_KEY = 'nesg.streak.v1';
/** A story/practice win made offline today, sent when the API is reachable again the same Bangkok day. */
const STREAK_PENDING_KEY = 'nesg.streakPending.v1';
export const STREAK_EVENT = 'nes-streak';
const STATE_KEYS = ['nesg.player.v1', 'nesg.stirfry.v1', 'nesg.eggs.v1'] as const;
import { EVENT_ID } from '../modules/event-01';
import { eventProgressBody } from '../modules/event-core/progress';

type Meta = { stateRev: number; homeRev: number; localAt: number; dirty: boolean };
type QueuedRun = { token: string; mine: boolean };

const API = (() => {
  try {
    return new URL('api/', `${location.origin}${appBase()}/`).href;
  } catch {
    return '';
  }
})();

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = appStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
const writeJson = (key: string, v: unknown) => appStorage.setItem(key, JSON.stringify(v));
const meta = (): Meta => ({ stateRev: 0, homeRev: 0, localAt: 0, dirty: false, ...readJson<Partial<Meta>>(META_KEY, {}) });
const setMeta = (patch: Partial<Meta>) => writeJson(META_KEY, { ...meta(), ...patch });

async function call(path: string, init: RequestInit = {}, auth = true): Promise<Response | null> {
  if (!API) return null;
  const headers = new Headers(init.headers);
  if (init.body) headers.set('content-type', 'application/json');
  const token = appStorage.getItem(TOKEN_KEY);
  if (auth && token) headers.set('authorization', `Bearer ${token}`);
  try {
    const res = await fetch(API + path, { ...init, headers, credentials: 'omit' });
    // A static host (preview) answers with HTML or 404: treat as offline.
    if (!(res.headers.get('content-type') ?? '').includes('application/json')) return null;
    return res;
  } catch {
    return null;
  }
}

/** Register this device's player once; the server returns a secret token shown only once. */
export async function ensureToken(): Promise<string | null> {
  const have = appStorage.getItem(TOKEN_KEY);
  if (have) return have;
  const me = readPlayerId();
  const res = await call('players/register', { method: 'POST', body: JSON.stringify({ playerId: me.playerId, nickname: me.nickname ?? '' }) }, false);
  if (!res?.ok) return null;
  const data = (await res.json()) as { token?: string };
  if (data.token) appStorage.setItem(TOKEN_KEY, data.token);
  return data.token ?? null;
}

/** Queue a run token. `mine` runs are sent with the bearer token (ranked); challenger runs are sent unverified. */
export function submitRun(token: string, mine: boolean): void {
  if (!token) return;
  const q = readJson<QueuedRun[]>(RUNQ_KEY, []);
  if (!q.some((r) => r.token === token)) q.push({ token, mine });
  writeJson(RUNQ_KEY, q.slice(-100));
  void flushRuns();
}

let flushing = false;
export async function flushRuns(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    for (const item of readJson<QueuedRun[]>(RUNQ_KEY, [])) {
      if (item.mine && !(await ensureToken())) break;
      const runBody = item.mine ? { token: item.token, streakToken: streakToken() } : { token: item.token };
      const res = await call('runs', { method: 'POST', body: JSON.stringify(runBody) }, item.mine);
      if (!res || res.status >= 500 || res.status === 429) break; // offline: keep for later
      if (res.ok && item.mine) await keepStreakFrom(res);
      // 2xx done; 4xx is permanent (tampered, implausible, unauthorized) — drop it.
      writeJson(RUNQ_KEY, readJson<QueuedRun[]>(RUNQ_KEY, []).filter((r) => r.token !== item.token));
    }
  } finally {
    flushing = false;
  }
}

export type StreakCache = { token: string | null; view: StreakView; at: number };
type StreakReply = { view: StreakView; token: string | null; counted?: boolean; refilled?: boolean };

/** Last streak the server sent, for showing the board offline. */
export function readStreak(): StreakCache | null {
  const c = readJson<StreakCache | null>(STREAK_KEY, null);
  return c && c.view && typeof c.view.count === 'number' ? c : null;
}

function streakToken(): string | null {
  return readStreak()?.token ?? null;
}

function keepStreak(reply: StreakReply | undefined): StreakReply | null {
  if (!reply?.view) return null;
  // Keep the previous token when the server has no key configured (token null): the record is still the server's.
  writeJson(STREAK_KEY, { token: reply.token ?? streakToken(), view: reply.view, at: Date.now() } satisfies StreakCache);
  try { window.dispatchEvent(new CustomEvent(STREAK_EVENT, { detail: { counted: !!reply.counted, refilled: !!reply.refilled } })); } catch { /* no window in tests */ }
  return reply;
}

async function keepStreakFrom(res: Response): Promise<void> {
  try {
    keepStreak(((await res.json()) as { streak?: StreakReply }).streak);
  } catch {
    /* body already consumed or not JSON */
  }
}

/** Fetch the board from the server (needs this device's player token). Falls back to the cached view. */
export async function refreshStreak(): Promise<StreakCache | null> {
  if (!appStorage.getItem(TOKEN_KEY)) return readStreak();
  const tok = streakToken();
  const res = await call('players/me/streak', tok ? { headers: { 'x-streak-token': tok } } : {});
  if (res?.ok) keepStreak(((await res.json()) as { streak?: StreakReply }).streak);
  return readStreak();
}

/**
 * A story or practice minigame was won. The server counts the streak at most once per Bangkok day;
 * ranked runs count through POST /runs instead. Offline wins retry later the same day only.
 */
export async function reportStreakWin(game: string): Promise<void> {
  writeJson(STREAK_PENDING_KEY, { day: dayLabel(bangkokDay(Date.now())), game });
  await flushStreakWin();
}

async function flushStreakWin(): Promise<void> {
  const pending = readJson<{ day: string; game: string } | null>(STREAK_PENDING_KEY, null);
  if (!pending) return;
  if (pending.day !== dayLabel(bangkokDay(Date.now()))) {
    appStorage.removeItem(STREAK_PENDING_KEY);
    return;
  }
  if (!(await ensureToken())) return;
  const res = await call('players/me/streak/win', { method: 'POST', body: JSON.stringify({ game: pending.game, streakToken: streakToken() }) });
  if (!res || res.status >= 500 || res.status === 429) return;
  appStorage.removeItem(STREAK_PENDING_KEY);
  if (res.ok) keepStreak(((await res.json()) as { streak?: StreakReply }).streak);
}

export type OnlineRow = { playerId: string; nickname: string; score: number; timeMs: number };
export async function onlineTop(game: string, difficulty: string, limit = 20, ruleset?: string): Promise<OnlineRow[] | null> {
  const q = new URLSearchParams({ game, difficulty, limit: String(limit) });
  if (ruleset) q.set('ruleset', ruleset);
  const res = await call(`leaderboard?${q}`, {}, false);
  if (!res?.ok) return null;
  return ((await res.json()) as { rows: OnlineRow[] }).rows;
}

export async function pushNickname(nickname: string): Promise<void> {
  if (!(await ensureToken())) return;
  await call(`players/${encodeURIComponent(readPlayerId().playerId)}`, { method: 'PATCH', body: JSON.stringify({ nickname }) });
}

function snapshot(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of STATE_KEYS) out[k] = readJson<unknown>(k, null);
  return out;
}

type SaveLike = { player?: { decor?: unknown; calendarTheme?: unknown; room?: { calendar?: unknown; grandpaPhoto?: unknown } }; flow?: Record<string, unknown> };

/** Home room document: what "my room" holds today, with room for future items. */
function homeDoc(save: SaveLike): Record<string, unknown> {
  return { roomId: 'player-room', decor: save.player?.decor ?? {}, calendarTheme: save.player?.calendarTheme ?? null, calendar: save.player?.room?.calendar ?? 'original', grandpaPhoto: save.player?.room?.grandpaPhoto ?? 'shelf', placed: [], unlocked: [] };
}

function eventDoc(save: SaveLike) {
  return eventProgressBody(save.flow);
}

async function putRev(path: 'state' | 'home', data: unknown, revKey: 'stateRev' | 'homeRev'): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await call(`players/me/${path}`, { method: 'PUT', body: JSON.stringify({ rev: meta()[revKey], schema_version: 1, data }) });
    if (!res) return false;
    if (res.ok) {
      setMeta({ [revKey]: ((await res.json()) as { rev: number }).rev });
      return true;
    }
    if (res.status !== 409) return false;
    // Conflict: this push is the newest local edit, so last write wins — retry on the server's rev.
    const cur = (await res.json()) as { current?: { rev: number } };
    setMeta({ [revKey]: cur.current?.rev ?? 0 });
  }
  return false;
}

let timer = 0;
let lastEvent = '';
/** Called after every local save; debounced upload of state, home and event progress. */
export function markDirty(): void {
  setMeta({ dirty: true, localAt: Date.now() });
  clearTimeout(timer);
  timer = window.setTimeout(() => void pushAll(), 2500);
}

export async function pushAll(): Promise<void> {
  if (!meta().dirty || !(await ensureToken())) return;
  const snap = snapshot();
  const save = (snap['nesg.player.v1'] ?? {}) as SaveLike;
  const okState = await putRev('state', snap, 'stateRev');
  const okHome = await putRev('home', homeDoc(save), 'homeRev');
  const ev = eventDoc(save);
  if (ev && JSON.stringify(ev) !== lastEvent) {
    const res = await call(`players/me/events/${EVENT_ID}`, { method: 'PUT', body: JSON.stringify(ev) });
    if (res?.ok) lastEvent = JSON.stringify(ev);
  }
  if (okState && okHome) setMeta({ dirty: false });
}

/**
 * Startup: pull the server copy and adopt it when it is newer than the last local edit
 * (keeps local if the server is empty). Runs before the app mounts; bounded by a timeout.
 */
export async function pullOnStartup(timeoutMs = 1500): Promise<void> {
  if (!appStorage.getItem(TOKEN_KEY)) return;
  const work = (async () => {
    const res = await call('players/me/state');
    if (!res?.ok) return;
    const doc = (await res.json()) as { data: Record<string, unknown> | null; rev: number; updated_at: number };
    const m = meta();
    if (!doc.data || doc.updated_at <= m.localAt) {
      setMeta({ stateRev: doc.rev });
      return;
    }
    for (const k of STATE_KEYS) {
      const v = doc.data[k];
      if (v != null) writeJson(k, v);
    }
    // Existing readSave()/nav migrations (nav.schema) run on the adopted data as usual.
    setMeta({ stateRev: doc.rev, localAt: doc.updated_at, dirty: false });
    const home = await call('players/me/home');
    if (home?.ok) setMeta({ homeRev: ((await home.json()) as { rev: number }).rev });
  })();
  await Promise.race([work.catch(() => undefined), new Promise((r) => setTimeout(r, timeoutMs))]);
}

export function startBackgroundSync(): void {
  void flushRuns();
  void flushStreakWin();
  if (meta().dirty) void pushAll();
  window.addEventListener('online', () => {
    void flushRuns();
    void flushStreakWin();
    void pushAll();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void pushAll();
  });
}
