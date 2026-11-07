import type { RhythmParams } from './types';

/** Deterministic charts: same edition + difficulty + seed => same cue sequence for every player. */
export type RhythmDifficulty = 'easy' | 'normal' | 'hard';
export const RHYTHM_DIFFICULTIES: RhythmDifficulty[] = ['easy', 'normal', 'hard'];
export const isRhythmDifficulty = (v: unknown): v is RhythmDifficulty => typeof v === 'string' && (RHYTHM_DIFFICULTIES as string[]).includes(v);

/** Per-difficulty multipliers applied on top of an edition's params. */
const TUNING: Record<RhythmDifficulty, { beat: number; window: number; gap: number; rise: number }> = {
  easy: { beat: 1.15, window: 1.25, gap: 1.2, rise: 0.8 },
  normal: { beat: 1, window: 1, gap: 1, rise: 1 },
  hard: { beat: 0.85, window: 0.8, gap: 0.8, rise: 1.25 },
};

export function paramsFor(base: RhythmParams, diff: RhythmDifficulty): RhythmParams {
  const k = TUNING[diff];
  return {
    ...base,
    beatMs: Math.round(base.beatMs * k.beat),
    perfectMs: Math.round(base.perfectMs * k.window),
    goodMs: Math.round(base.goodMs * k.window),
    extraWindowMs: Math.round(base.extraWindowMs * k.window),
    extraGapMs: [Math.round(base.extraGapMs[0] * k.gap), Math.round(base.extraGapMs[1] * k.gap)],
    pressureRise: base.pressureRise * k.rise,
  };
}

/** mulberry32 PRNG. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32-bit, used to mix edition id + difficulty + seed into one PRNG seed. */
function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

export const newChartSeed = (): number => Math.floor(Math.random() * 900000) + 100000;
export const isChartSeed = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0 && n < 2 ** 31;

/** Cue times (ms from run start) for the "extra" lane over the whole run. */
export function buildChart(editionId: string, diff: RhythmDifficulty, seed: number, p: RhythmParams): number[] {
  const rand = rng(fnv(`${editionId}|${diff}|${seed}`));
  const end = p.durationSec * 1000;
  const cues: number[] = [];
  let at = p.extraFirstMs + Math.round(rand() * 600);
  while (at < end - p.extraLeadMs) {
    cues.push(at);
    at += p.extraGapMs[0] + Math.round(rand() * (p.extraGapMs[1] - p.extraGapMs[0]));
  }
  return cues;
}

/** Short fingerprint of a chart (shown as data-chart for tests / god). */
export const chartId = (cues: number[]): string => fnv(cues.join(',')).toString(16).padStart(8, '0');

/** Hash routes: <route>, <route>/<diff>/<seed>, <route>/<diff>/<seed>/vs/<nick>?score=&time=&run= */
export type RhythmLink = { difficulty: RhythmDifficulty | null; seed: number | null; from: { nick: string; score: number; time: number } | null };
export function parseRhythmHash(route: string, hash: string): RhythmLink {
  const esc = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`^${esc}(?:/([a-z]+)/(\\d+))?(?:/vs/([^?/]+))?(?:\\?(.*))?$`).exec(hash);
  if (!m) return { difficulty: null, seed: null, from: null };
  const seed = Number(m[2]);
  const q = new URLSearchParams(m[4] ?? '');
  let nick = '';
  try { nick = m[3] ? decodeURIComponent(m[3]).slice(0, 24) : ''; } catch { nick = ''; }
  const score = Number(q.get('score'));
  const time = Number(q.get('time'));
  return {
    difficulty: isRhythmDifficulty(m[1]) ? m[1] : null,
    seed: isChartSeed(seed) ? seed : null,
    from: nick && Number.isFinite(score) ? { nick, score: Math.max(0, Math.floor(score)), time: Number.isFinite(time) ? Math.max(0, Math.floor(time)) : 0 } : null,
  };
}
export function rhythmHash(route: string, diff: RhythmDifficulty, seed: number, from?: { nick: string; score: number; time: number }): string {
  const path = `${route}/${diff}/${seed}`;
  if (!from) return path;
  return `${path}/vs/${encodeURIComponent(from.nick)}?${new URLSearchParams({ score: String(from.score), time: String(from.time) })}`;
}
