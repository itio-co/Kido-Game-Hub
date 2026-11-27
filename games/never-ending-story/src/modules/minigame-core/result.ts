/** Shared minigame win-result helpers: time formatting and local best-time records. */

export const BEST_STORAGE_KEY = 'nesg.minigame-best.v1';

export type BestEntry = { timeMs: number; stars: number };
export type BestStore = Record<string, BestEntry>;

export type WinResult = {
  game: string;
  gameLabel: string;
  difficulty: string;
  stars: number;
  timeMs: number;
  /** Best after this run is applied (the record just written, or the standing best). */
  bestMs: number | null;
  previousBestMs: number | null;
  isNewRecord: boolean;
  hints: number;
};

export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** `jig:ง่าย` or `jig:practice:3`. */
export function bestKey(game: string, difficulty: string, practiceLevel?: number): string {
  if (practiceLevel && practiceLevel > 0) return `${game}:practice:${practiceLevel}`;
  return `${game}:${difficulty}`;
}

export function parseBests(raw: string | null | undefined): BestStore {
  if (!raw) return {};
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    const out: BestStore = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const row = value as Record<string, unknown>;
      if (typeof row.timeMs !== 'number' || !Number.isFinite(row.timeMs)) continue;
      const stars = typeof row.stars === 'number' && Number.isFinite(row.stars) ? row.stars : 0;
      out[key] = { timeMs: Math.max(0, row.timeMs), stars: Math.max(0, Math.min(3, Math.round(stars))) };
    }
    return out;
  } catch {
    return {};
  }
}

/** Lower time wins. The first finish is a new record. */
export function applyBest(store: BestStore, key: string, timeMs: number, stars: number): {
  store: BestStore;
  previous: BestEntry | null;
  current: BestEntry;
  isNewRecord: boolean;
} {
  const previous = store[key] ?? null;
  const safeTime = Math.max(0, timeMs);
  const safeStars = Math.max(0, Math.min(3, Math.round(stars)));
  const isNewRecord = previous === null || safeTime < previous.timeMs;
  const current: BestEntry = isNewRecord
    ? { timeMs: safeTime, stars: Math.max(safeStars, previous?.stars ?? 0) }
    : { timeMs: previous.timeMs, stars: Math.max(safeStars, previous.stars) };
  return { store: { ...store, [key]: current }, previous, current, isNewRecord };
}

function storage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function readBests(): BestStore {
  return parseBests(storage()?.getItem(BEST_STORAGE_KEY) ?? null);
}

export function readBest(key: string): BestEntry | null {
  return readBests()[key] ?? null;
}

export function recordBest(key: string, timeMs: number, stars: number): {
  previous: BestEntry | null;
  current: BestEntry;
  isNewRecord: boolean;
} {
  const applied = applyBest(readBests(), key, timeMs, stars);
  try {
    storage()?.setItem(BEST_STORAGE_KEY, JSON.stringify(applied.store));
  } catch {
    // Quota or private-mode failures should not block the win dialog.
  }
  return { previous: applied.previous, current: applied.current, isNewRecord: applied.isNewRecord };
}
