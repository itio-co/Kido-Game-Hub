/** Shared minigame win-result helpers: time formatting and local best-time records. */

export const BEST_STORAGE_KEY = 'nesg.minigame-best.v1';

export const DIFFICULTY_IDS = ['easy', 'medium', 'hard'] as const;
export type DifficultyId = (typeof DIFFICULTY_IDS)[number];

const DIFF_ALIASES: Record<string, DifficultyId> = {
  easy: 'easy',
  medium: 'medium',
  hard: 'hard',
  normal: 'medium',
  'ง่าย': 'easy',
  'ปานกลาง': 'medium',
  'ยาก': 'hard',
};

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

/** Map a Thai or English difficulty label to `easy` / `medium` / `hard`. */
export function difficultyId(label: string | null | undefined): DifficultyId | null {
  if (!label) return null;
  const trimmed = label.trim();
  return DIFF_ALIASES[trimmed] ?? DIFF_ALIASES[trimmed.toLowerCase()] ?? null;
}

/**
 * Storage key for one game at one difficulty (`jig:easy`) or one practice level
 * (`jig:practice:3`). Returns an empty string when the difficulty cannot be resolved,
 * so the caller must not write a shared key that would mix difficulties.
 */
export function bestKey(game: string, difficulty: string, practiceLevel?: number): string {
  if (practiceLevel && practiceLevel > 0) return `${game}:practice:${practiceLevel}`;
  const id = difficultyId(difficulty);
  return id ? `${game}:${id}` : '';
}

/** Canonicalize a stored key, or null if it is not a per-difficulty / practice record. */
export function canonicalBestKey(key: string): string | null {
  const parts = key.split(':');
  if (parts.length === 2 && parts[0]) {
    const id = difficultyId(parts[1]);
    return id ? `${parts[0]}:${id}` : null;
  }
  if (parts.length === 3 && parts[0] && parts[1] === 'practice') {
    const level = Number(parts[2]);
    if (Number.isInteger(level) && level > 0) return `${parts[0]}:practice:${level}`;
  }
  return null;
}

function clampEntry(timeMs: number, stars: number): BestEntry {
  return {
    timeMs: Math.max(0, timeMs),
    stars: Math.max(0, Math.min(3, Math.round(stars))),
  };
}

function mergeEntry(a: BestEntry | undefined, b: BestEntry): BestEntry {
  if (!a) return b;
  return { timeMs: Math.min(a.timeMs, b.timeMs), stars: Math.max(a.stars, b.stars) };
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
      out[key] = clampEntry(row.timeMs, stars);
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Keep only per-difficulty (or practice-level) keys. Thai aliases such as `jig:ง่าย`
 * move to `jig:easy`. Bare keys like `jig` are dropped, not applied to every difficulty.
 */
export function migrateBests(store: BestStore): { store: BestStore; changed: boolean } {
  const out: BestStore = {};
  for (const [key, entry] of Object.entries(store)) {
    const next = canonicalBestKey(key);
    if (!next) continue;
    out[next] = mergeEntry(out[next], entry);
  }
  const before = Object.keys(store).sort();
  const after = Object.keys(out).sort();
  const changed =
    before.length !== after.length
    || before.some((key, index) => key !== after[index])
    || after.some((key) => {
      const prev = store[key];
      const cur = out[key];
      return !prev || prev.timeMs !== cur.timeMs || prev.stars !== cur.stars;
    });
  return { store: out, changed };
}

/** Lower time wins. The first finish is a new record. */
export function applyBest(store: BestStore, key: string, timeMs: number, stars: number): {
  store: BestStore;
  previous: BestEntry | null;
  current: BestEntry;
  isNewRecord: boolean;
} {
  const safeKey = canonicalBestKey(key) ?? '';
  const entry = clampEntry(timeMs, stars);
  if (!safeKey) {
    return { store, previous: null, current: entry, isNewRecord: false };
  }
  const previous = store[safeKey] ?? null;
  const isNewRecord = previous === null || entry.timeMs < previous.timeMs;
  const current: BestEntry = isNewRecord
    ? { timeMs: entry.timeMs, stars: Math.max(entry.stars, previous?.stars ?? 0) }
    : { timeMs: previous.timeMs, stars: Math.max(entry.stars, previous.stars) };
  return { store: { ...store, [safeKey]: current }, previous, current, isNewRecord };
}

function storage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function persist(store: BestStore): void {
  try {
    storage()?.setItem(BEST_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Quota or private-mode failures should not block the win dialog.
  }
}

export function readBests(): BestStore {
  const migrated = migrateBests(parseBests(storage()?.getItem(BEST_STORAGE_KEY) ?? null));
  if (migrated.changed) persist(migrated.store);
  return migrated.store;
}

export function readBest(key: string): BestEntry | null {
  const safeKey = canonicalBestKey(key);
  if (!safeKey) return null;
  return readBests()[safeKey] ?? null;
}

export function recordBest(key: string, timeMs: number, stars: number): {
  previous: BestEntry | null;
  current: BestEntry;
  isNewRecord: boolean;
} {
  const applied = applyBest(readBests(), key, timeMs, stars);
  if (canonicalBestKey(key)) persist(applied.store);
  return { previous: applied.previous, current: applied.current, isNewRecord: applied.isNewRecord };
}
