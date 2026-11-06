const KEY = 'nesg.stirfry.v1';

export type StirFryRun = {
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
};

export function defaultRun(): StirFryRun {
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
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function readStirFry(): StirFryRun {
  try {
    const raw = localStorage.getItem(KEY);
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
    };
  } catch {
    return defaultRun();
  }
}

export function writeStirFry(run: StirFryRun): void {
  localStorage.setItem(KEY, JSON.stringify(run));
}

export function clearStirFry(): void {
  const cur = readStirFry();
  writeStirFry({ ...defaultRun(), bestScore: cur.bestScore, bestStars: cur.bestStars });
}

export function starsFor(score: number, progress: number): 1 | 2 | 3 {
  if (progress >= 100 && score >= 1400) return 3;
  if (progress >= 100 || score >= 900) return 2;
  return 1;
}

export function recordBest(score: number, progress: number): { bestScore: number; bestStars: 0 | 1 | 2 | 3 } {
  const cur = readStirFry();
  const stars = starsFor(score, progress);
  const bestScore = Math.max(cur.bestScore || 0, score);
  const bestStars = Math.max(cur.bestStars || 0, stars) as 0 | 1 | 2 | 3;
  writeStirFry({ ...cur, phase: 'result', score, progress, bestScore, bestStars });
  return { bestScore, bestStars };
}
