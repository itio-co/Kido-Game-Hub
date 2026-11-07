/**
 * Online sync with the Cloudflare Worker API (games.itio.space/never/api).
 * Everything is best-effort: offline, cross-origin previews or API errors fall back to local data silently.
 * See docs/online-leaderboard.md.
 */
import { readPlayerId } from './playerId';

const TOKEN_KEY = 'nesg.playerToken.v1';
const RUNQ_KEY = 'nesg.runQueue.v1';
const META_KEY = 'nesg.sync.v1';
const STATE_KEYS = ['nesg.player.v1', 'nesg.stirfry.v1', 'nesg.eggs.v1'] as const;
import { EVENT_ID } from '../modules/event-01';

type Meta = { stateRev: number; homeRev: number; localAt: number; dirty: boolean };
type QueuedRun = { token: string; mine: boolean };

const API = (() => {
  try {
    return new URL('api/', `${location.origin}${location.pathname}`).href;
  } catch {
    return '';
  }
})();

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
const writeJson = (key: string, v: unknown) => localStorage.setItem(key, JSON.stringify(v));
const meta = (): Meta => ({ stateRev: 0, homeRev: 0, localAt: 0, dirty: false, ...readJson<Partial<Meta>>(META_KEY, {}) });
const setMeta = (patch: Partial<Meta>) => writeJson(META_KEY, { ...meta(), ...patch });

async function call(path: string, init: RequestInit = {}, auth = true): Promise<Response | null> {
  if (!API) return null;
  const headers = new Headers(init.headers);
  if (init.body) headers.set('content-type', 'application/json');
  const token = localStorage.getItem(TOKEN_KEY);
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
  const have = localStorage.getItem(TOKEN_KEY);
  if (have) return have;
  const me = readPlayerId();
  const res = await call('players/register', { method: 'POST', body: JSON.stringify({ playerId: me.playerId, nickname: me.nickname ?? '' }) }, false);
  if (!res?.ok) return null;
  const data = (await res.json()) as { token?: string };
  if (data.token) localStorage.setItem(TOKEN_KEY, data.token);
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
      const res = await call('runs', { method: 'POST', body: JSON.stringify({ token: item.token }) }, item.mine);
      if (!res || res.status >= 500 || res.status === 429) break; // offline: keep for later
      // 2xx done; 4xx is permanent (tampered, implausible, unauthorized) — drop it.
      writeJson(RUNQ_KEY, readJson<QueuedRun[]>(RUNQ_KEY, []).filter((r) => r.token !== item.token));
    }
  } finally {
    flushing = false;
  }
}

export type OnlineRow = { playerId: string; nickname: string; score: number; timeMs: number };
export async function onlineTop(game: string, difficulty: string, limit = 20): Promise<OnlineRow[] | null> {
  const res = await call(`leaderboard?game=${game}&difficulty=${difficulty}&limit=${limit}`, {}, false);
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

type SaveLike = { player?: { decor?: unknown; calendarTheme?: unknown }; flow?: Record<string, unknown> };

/** Home room document: what "my room" holds today, with room for future items. */
function homeDoc(save: SaveLike): Record<string, unknown> {
  return { roomId: 'player-room', decor: save.player?.decor ?? {}, calendarTheme: save.player?.calendarTheme ?? null, placed: [], unlocked: [] };
}

function eventDoc(save: SaveLike): { status: 'started' | 'completed'; progress: Record<string, unknown> } | null {
  const f = save.flow ?? {};
  const started = (Array.isArray(f.evidence) && f.evidence.length > 0) || f.poster || f.caseDone || f.solved;
  if (!started) return null;
  return {
    status: f.caseDone ? 'completed' : 'started',
    progress: { evidence: f.evidence, solved: f.solved, deduced: f.deduced, reward: f.reward, posterShown: f.poster, endingSeen: f.caseDone, seen: f.seen },
  };
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
  if (!localStorage.getItem(TOKEN_KEY)) return;
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
  if (meta().dirty) void pushAll();
  window.addEventListener('online', () => {
    void flushRuns();
    void pushAll();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void pushAll();
  });
}
