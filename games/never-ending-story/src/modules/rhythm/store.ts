import { appStorage } from '../../lib/deployment';
/** Generic run/best-score store for a rhythm pack (one localStorage key per pack). */
export type RhythmRun = {
  phase: 'ready' | 'play' | 'result';
  timeLeft: number;
  score: number;
  combo: number;
  heat: number;
  progress: number;
  stirBeat: number;
  ingredientDue: number | null;
  ingredientHits: number;
  ingredientMiss: number;
  startedAt: number | null;
  bestScore: number;
  bestStars: 0 | 1 | 2 | 3;
  endReason: 'done' | 'time' | null;
  /** Chart identity: same difficulty + seed => same cue sequence. */
  difficulty: 'easy' | 'normal' | 'hard';
  seed: number;
  /** Next chart cue index. */
  cue: number;
};

export function defaultRun(): RhythmRun {
  return {
    phase: 'ready',
    timeLeft: 60,
    score: 0,
    combo: 0,
    heat: 50,
    progress: 0,
    stirBeat: 0,
    ingredientDue: null,
    ingredientHits: 0,
    ingredientMiss: 0,
    startedAt: null,
    bestScore: 0,
    bestStars: 0,
    endReason: null,
    difficulty: 'normal',
    seed: 0,
    cue: 0,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function readRun(KEY: string): RhythmRun {
  try {
    const raw = appStorage.getItem(KEY);
    if (!raw) return defaultRun();
    const data: unknown = JSON.parse(raw);
    if (!isRecord(data)) return defaultRun();
    return {
      ...defaultRun(),
      phase: data.phase === 'play' || data.phase === 'result' || data.phase === 'ready' ? data.phase : 'ready',
      timeLeft: typeof data.timeLeft === 'number' ? data.timeLeft : 60,
      score: typeof data.score === 'number' ? data.score : 0,
      combo: typeof data.combo === 'number' ? data.combo : 0,
      heat: typeof data.heat === 'number' ? data.heat : 50,
      progress: typeof data.progress === 'number' ? data.progress : 0,
      stirBeat: typeof data.stirBeat === 'number' ? data.stirBeat : 0,
      ingredientDue: typeof data.ingredientDue === 'number' ? data.ingredientDue : null,
      ingredientHits: typeof data.ingredientHits === 'number' ? data.ingredientHits : 0,
      ingredientMiss: typeof data.ingredientMiss === 'number' ? data.ingredientMiss : 0,
      startedAt: typeof data.startedAt === 'number' ? data.startedAt : null,
      bestScore: typeof data.bestScore === 'number' ? data.bestScore : 0,
      bestStars: data.bestStars === 1 || data.bestStars === 2 || data.bestStars === 3 ? data.bestStars : 0,
      endReason: data.endReason === 'done' || data.endReason === 'time' ? data.endReason : null,
      difficulty: data.difficulty === 'easy' || data.difficulty === 'hard' ? data.difficulty : 'normal',
      seed: typeof data.seed === 'number' && Number.isInteger(data.seed) && data.seed > 0 ? data.seed : 0,
      cue: typeof data.cue === 'number' ? data.cue : 0,
    };
  } catch {
    return defaultRun();
  }
}

export function writeRun(KEY: string, run: RhythmRun): void {
  appStorage.setItem(KEY, JSON.stringify(run));
}

export function clearRun(KEY: string): void {
  const cur = readRun(KEY);
  writeRun(KEY, { ...defaultRun(), bestScore: cur.bestScore, bestStars: cur.bestStars });
}

/** Stars from score + progress; thresholds come from the pack params. */
export function starsFor(score: number, progress: number, stars: { two: number; three: number } = { two: 900, three: 1400 }): 1 | 2 | 3 {
  if (progress >= 100 && score >= stars.three) return 3;
  if (progress >= 100 || score >= stars.two) return 2;
  return 1;
}

export function recordBest(KEY: string, score: number, progress: number, thresholds?: { two: number; three: number }): { bestScore: number; bestStars: 0 | 1 | 2 | 3 } {
  const cur = readRun(KEY);
  const stars = starsFor(score, progress, thresholds);
  const bestScore = Math.max(cur.bestScore || 0, score);
  const bestStars = Math.max(cur.bestStars || 0, stars) as 0 | 1 | 2 | 3;
  writeRun(KEY, { ...cur, phase: 'result', score, progress, bestScore, bestStars });
  return { bestScore, bestStars };
}
