import type { RhythmParams } from './types';
import { rhythmRuleset, RHYTHM_VERSION, type RhythmTuning } from './ruleset';
import { RULESET_SRC, seededPath, withChallenger } from '../minigame-core/framework';

/** Deterministic charts: same pack + difficulty + seed + ruleset => same cue sequence for every player. */
export type RhythmDifficulty = 'easy' | 'normal' | 'hard';
export const RHYTHM_DIFFICULTIES: RhythmDifficulty[] = ['easy', 'normal', 'hard'];
export const isRhythmDifficulty = (v: unknown): v is RhythmDifficulty => typeof v === 'string' && (RHYTHM_DIFFICULTIES as string[]).includes(v);

type Tuning = Record<RhythmDifficulty, RhythmTuning>;
/** Current engine tuning. Callers playing an older ruleset pass that version's tuning instead. */
const TUNING: Tuning = rhythmRuleset(RHYTHM_VERSION)!.tuning;

export function paramsFor(base: RhythmParams, diff: RhythmDifficulty, tuning: Tuning = TUNING): RhythmParams {
  const k = tuning[diff];
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

/** FNV-1a 32-bit, used to mix pack id + difficulty + seed into one PRNG seed. */
function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

export const newChartSeed = (): number => Math.floor(Math.random() * 900000) + 100000;
export const isChartSeed = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0 && n < 2 ** 31;

/** Cue times (ms from run start) for the "extra" lane over the whole run. */
export function buildChart(packId: string, diff: RhythmDifficulty, seed: number, p: RhythmParams): number[] {
  const rand = rng(fnv(`${packId}|${diff}|${seed}`));
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

/**
 * Hash routes:
 *   <route>
 *   <route>/<diff>/<seed>[/<ruleset>]
 *   <route>/<diff>/<seed>[/<ruleset>]/vs/<nick>?score=&time=
 * `ruleset` is `rhythm@1.1.0+stirfry@1.2.0` (engine + pack). Missing ruleset = v0.6.10.
 */
export type RhythmLink = {
  difficulty: RhythmDifficulty | null;
  seed: number | null;
  ruleset: string | null;
  from: { nick: string; score: number; time: number } | null;
};
export function parseRhythmHash(route: string, hash: string): RhythmLink {
  const esc = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`^${esc}(?:/([a-z]+)/(\\d+))?(?:/(${RULESET_SRC}))?(?:/vs/([^?/]+))?(?:\\?(.*))?$`).exec(hash);
  if (!m) return { difficulty: null, seed: null, ruleset: null, from: null };
  const seed = Number(m[2]);
  const q = new URLSearchParams(m[5] ?? '');
  let nick = '';
  try { nick = m[4] ? decodeURIComponent(m[4]).slice(0, 24) : ''; } catch { nick = ''; }
  const score = Number(q.get('score'));
  const time = Number(q.get('time'));
  return {
    difficulty: isRhythmDifficulty(m[1]) ? m[1] : null,
    seed: isChartSeed(seed) ? seed : null,
    ruleset: m[3] ?? null,
    from: nick && Number.isFinite(score) ? { nick, score: Math.max(0, Math.floor(score)), time: Number.isFinite(time) ? Math.max(0, Math.floor(time)) : 0 } : null,
  };
}
export function rhythmHash(route: string, diff: RhythmDifficulty, seed: number, from?: { nick: string; score: number; time: number }, ruleset?: string | null): string {
  const path = seededPath(route, diff, seed, ruleset);
  if (!from) return path;
  return withChallenger(path, from.nick, { score: String(from.score), time: String(from.time) });
}
