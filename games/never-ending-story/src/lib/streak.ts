/**
 * Daily streak rules, shared by the Worker (authoritative) and the client (display only).
 * A day is a Bangkok calendar day (UTC+7, no DST). A day counts when the player wins one minigame.
 * Each missed day uses one battery; with too few batteries the streak resets.
 * Every 7th streak day gives back one battery, up to MAX_BATTERIES. See docs/gdd/core.md §9.3.
 */

export const MAX_BATTERIES = 2;
export const REFILL_EVERY = 7;
/** Wins per day that still raise the total-wins card (the streak itself counts once a day). */
export const MAX_WINS_PER_DAY = 100;
/** Day entries kept for the week row. */
export const HISTORY_DAYS = 14;

const BANGKOK_OFFSET_MS = 7 * 3600 * 1000;
const DAY_MS = 86_400_000;

export type DayKind = 'win' | 'saved';
export type DayMark = { day: number; kind: DayKind };

/** Server-side record. `lastDay` is the last day covered (won, or saved by a battery); null = no live streak. */
export type StreakRecord = {
  count: number;
  best: number;
  batteries: number;
  lastDay: number | null;
  totalWins: number;
  winsDay: number | null;
  winsToday: number;
  days: DayMark[];
};

export type StreakState = 'new' | 'done' | 'open' | 'reset';

/** What the board shows. Dates are Bangkok `YYYY-MM-DD`. */
export type StreakView = {
  count: number;
  best: number;
  batteries: number;
  maxBatteries: number;
  totalWins: number;
  today: string;
  state: StreakState;
  /** Streak days still needed before the next battery comes back; 0 when batteries are full. */
  refillIn: number;
  days: { date: string; kind: DayKind }[];
};

export function emptyRecord(): StreakRecord {
  return { count: 0, best: 0, batteries: MAX_BATTERIES, lastDay: null, totalWins: 0, winsDay: null, winsToday: 0, days: [] };
}

/** Bangkok calendar day number (days since 1970-01-01 in UTC+7). */
export function bangkokDay(ms: number): number {
  return Math.floor((ms + BANGKOK_OFFSET_MS) / DAY_MS);
}

export function dayLabel(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

export function parseDayLabel(label: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(label)) return null;
  const ms = Date.parse(`${label}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.round(ms / DAY_MS) : null;
}

/** 0 = Monday … 6 = Sunday. Day 0 (1970-01-01) was a Thursday. */
export function mondayIndex(day: number): number {
  return (((day + 3) % 7) + 7) % 7;
}

function trimDays(days: DayMark[], today: number): DayMark[] {
  const seen = new Set<number>();
  const out: DayMark[] = [];
  for (const mark of [...days].sort((a, b) => a.day - b.day)) {
    if (mark.day <= today - HISTORY_DAYS || mark.day > today || seen.has(mark.day)) continue;
    seen.add(mark.day);
    out.push(mark);
  }
  return out;
}

/**
 * Apply the days missed before `today`: spend one battery per missed day, or reset when there are
 * not enough. Pure and idempotent for the same `today`.
 */
export function settle(rec: StreakRecord, today: number): StreakRecord {
  if (rec.lastDay == null || rec.count <= 0) return rec;
  const missed = today - rec.lastDay - 1;
  if (missed <= 0) return rec;
  if (missed <= rec.batteries) {
    const saved: DayMark[] = [];
    for (let d = rec.lastDay + 1; d < today; d++) saved.push({ day: d, kind: 'saved' });
    return { ...rec, batteries: rec.batteries - missed, lastDay: today - 1, days: trimDays([...rec.days, ...saved], today) };
  }
  return { ...rec, count: 0, batteries: 0, lastDay: null, days: trimDays(rec.days, today) };
}

export type WinOutcome = { record: StreakRecord; counted: boolean; refilled: boolean; restarted: boolean };

/** Record one win on `today`. The streak moves at most once per day; total wins move on every win (capped per day). */
export function applyWin(rec: StreakRecord, today: number): WinOutcome {
  const base = settle(rec, today);
  const winsToday = base.winsDay === today ? base.winsToday : 0;
  const countsTotal = winsToday < MAX_WINS_PER_DAY;
  const next: StreakRecord = {
    ...base,
    totalWins: base.totalWins + (countsTotal ? 1 : 0),
    winsDay: today,
    winsToday: winsToday + 1,
  };
  if (base.lastDay === today) return { record: next, counted: false, refilled: false, restarted: false };
  const restarted = base.count <= 0;
  const count = restarted ? 1 : base.count + 1;
  let batteries = restarted ? MAX_BATTERIES : base.batteries;
  let refilled = false;
  if (!restarted && count % REFILL_EVERY === 0 && batteries < MAX_BATTERIES) {
    batteries += 1;
    refilled = true;
  }
  return {
    record: {
      ...next,
      count,
      best: Math.max(base.best, count),
      batteries,
      lastDay: today,
      days: trimDays([...base.days, { day: today, kind: 'win' }], today),
    },
    counted: true,
    refilled,
    restarted,
  };
}

/** Board view for `today` without writing anything: missed days are projected the same way a win would settle them. */
export function viewOf(rec: StreakRecord, today: number): StreakView {
  const s = settle(rec, today);
  const broke = rec.count > 0 && s.count === 0;
  const state: StreakState = s.lastDay === today ? 'done' : broke ? 'reset' : s.count > 0 ? 'open' : rec.best > 0 || rec.totalWins > 0 ? 'reset' : 'new';
  const refillIn = s.batteries >= MAX_BATTERIES || s.count <= 0 ? 0 : REFILL_EVERY - (s.count % REFILL_EVERY);
  return {
    count: s.count,
    best: s.best,
    batteries: s.batteries,
    maxBatteries: MAX_BATTERIES,
    totalWins: s.totalWins,
    today: dayLabel(today),
    state,
    refillIn,
    days: s.days.map((m) => ({ date: dayLabel(m.day), kind: m.kind })),
  };
}

/** The token payload the server seals: the stored streak count and its last covered day. */
export function tokenClaim(rec: StreakRecord): { streakCount: number; date: string } {
  return { streakCount: rec.count, date: rec.lastDay == null ? '' : dayLabel(rec.lastDay) };
}

/** Parse a stored record defensively (D1 JSON or a fresh row). */
export function readRecord(raw: unknown): StreakRecord {
  const base = emptyRecord();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  const int = (v: unknown, min: number, max: number, d: number) => (typeof v === 'number' && Number.isInteger(v) ? Math.min(max, Math.max(min, v)) : d);
  const days = Array.isArray(r.days)
    ? (r.days as unknown[]).flatMap((m) => {
        if (!m || typeof m !== 'object') return [];
        const x = m as Record<string, unknown>;
        return typeof x.day === 'number' && Number.isInteger(x.day) && (x.kind === 'win' || x.kind === 'saved') ? [{ day: x.day, kind: x.kind as DayKind }] : [];
      })
    : [];
  return {
    count: int(r.count, 0, 1e6, 0),
    best: int(r.best, 0, 1e6, 0),
    batteries: int(r.batteries, 0, MAX_BATTERIES, MAX_BATTERIES),
    lastDay: typeof r.lastDay === 'number' && Number.isInteger(r.lastDay) ? r.lastDay : null,
    totalWins: int(r.totalWins, 0, 1e9, 0),
    winsDay: typeof r.winsDay === 'number' && Number.isInteger(r.winsDay) ? r.winsDay : null,
    winsToday: int(r.winsToday, 0, 1e6, 0),
    days,
  };
}

/** The current Monday-to-Sunday week for the board row. */
export function weekRow(view: StreakView): { date: string; kind: DayKind | null; today: boolean; future: boolean }[] {
  const today = parseDayLabel(view.today) ?? 0;
  const monday = today - mondayIndex(today);
  const marks = new Map(view.days.map((d) => [d.date, d.kind]));
  return Array.from({ length: 7 }, (_, i) => {
    const day = monday + i;
    const date = dayLabel(day);
    return { date, kind: marks.get(date) ?? null, today: day === today, future: day > today };
  });
}
