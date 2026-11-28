/** Song-mode rules: chart, judging, combo, score, stars. Pure and time-driven (ms since the song clock started). */
import { degreeSemitones, type Song } from './songs.ts';
import type { PianoScoring, PianoTiming } from './ruleset.ts';

export type Judge = 'perfect' | 'good' | 'miss';
export type ChartNote = { id: number; at: number; midi: number; beats: number };
export type Chart = { notes: ChartNote[]; endMs: number };

/** Notes of `song` placed on the clock. `baseMidi` is the C the song's scale starts on. */
export function buildChart(song: Song, timing: Pick<PianoTiming, 'beatMs'>, leadInBeats: number, baseMidi: number): Chart {
  let beat = leadInBeats;
  const notes: ChartNote[] = song.notes.map(([degree, beats], id) => {
    const note = { id, at: Math.round(beat * timing.beatMs), midi: baseMidi + degreeSemitones(degree), beats };
    beat += beats;
    return note;
  });
  return { notes, endMs: Math.round(beat * timing.beatMs) };
}

export type Run = {
  chart: Chart;
  status: (Judge | null)[];
  combo: number;
  maxCombo: number;
  score: number;
  perfect: number;
  good: number;
  miss: number;
  wrong: number;
};

export function createRun(chart: Chart): Run {
  return { chart, status: chart.notes.map(() => null), combo: 0, maxCombo: 0, score: 0, perfect: 0, good: 0, miss: 0, wrong: 0 };
}

export type PressResult = { kind: 'perfect' | 'good' | 'wrong' | 'stray'; index: number };

const comboBonus = (combo: number, sc: PianoScoring): number => Math.min(combo, sc.comboCap) * sc.comboBonus;

/**
 * A key went down at time `t`. It hits the nearest waiting note of that pitch inside the good window.
 * A different waiting note in the window makes it a wrong key (combo resets). Anything else is a free stray press.
 */
export function press(run: Run, midi: number, t: number, timing: Pick<PianoTiming, 'perfectMs' | 'goodMs'>, sc: PianoScoring): PressResult {
  let best = -1;
  let bestDelta = Infinity;
  let anyNear = false;
  run.chart.notes.forEach((note, i) => {
    if (run.status[i] !== null) return;
    const delta = Math.abs(note.at - t);
    if (delta > timing.goodMs) return;
    anyNear = true;
    if (note.midi === midi && delta < bestDelta) {
      best = i;
      bestDelta = delta;
    }
  });
  if (best < 0) {
    if (!anyNear) return { kind: 'stray', index: -1 };
    run.combo = 0;
    run.wrong += 1;
    return { kind: 'wrong', index: -1 };
  }
  const kind = bestDelta <= timing.perfectMs ? 'perfect' : 'good';
  run.status[best] = kind;
  run[kind] += 1;
  run.score += (kind === 'perfect' ? sc.perfect : sc.good) + comboBonus(run.combo, sc);
  run.combo += 1;
  run.maxCombo = Math.max(run.maxCombo, run.combo);
  return { kind, index: best };
}

/** Mark notes that slid past the good window as missed. Returns how many were newly missed. */
export function sweep(run: Run, t: number, timing: Pick<PianoTiming, 'goodMs'>): number {
  let count = 0;
  run.chart.notes.forEach((note, i) => {
    if (run.status[i] === null && t - note.at > timing.goodMs) {
      run.status[i] = 'miss';
      run.miss += 1;
      run.combo = 0;
      count += 1;
    }
  });
  return count;
}

export const isFinished = (run: Run): boolean => run.status.every((s) => s !== null);

/** Best possible score if every note is perfect in a row. */
export function maxScore(count: number, sc: PianoScoring): number {
  let total = 0;
  for (let i = 0; i < count; i++) total += sc.perfect + comboBonus(i, sc);
  return total;
}

/** 0..1 share of notes played, a good hit counting `goodWeight`. */
export function accuracy(run: Run, sc: Pick<PianoScoring, 'goodWeight'>): number {
  const n = run.chart.notes.length;
  return n === 0 ? 0 : (run.perfect + run.good * sc.goodWeight) / n;
}

export function starsFor(acc: number, thresholds: readonly number[]): number {
  return thresholds.reduce((stars, need) => (acc >= need ? stars + 1 : stars), 0);
}
