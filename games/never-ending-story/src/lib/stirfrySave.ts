const KEY = 'nesg.stirfry.v1';

export type StirFryRun = {
  phase: 'ready' | 'play' | 'result';
  timeLeft: number;
  score: number;
  combo: number;
  heat: number;
  stirBeat: number;
  ingredientDue: number | null;
  ingredientHits: number;
  ingredientMiss: number;
  startedAt: number | null;
};

export function defaultRun(): StirFryRun {
  return {
    phase: 'ready',
    timeLeft: 60,
    score: 0,
    combo: 0,
    heat: 50,
    stirBeat: 0,
    ingredientDue: null,
    ingredientHits: 0,
    ingredientMiss: 0,
    startedAt: null,
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
      stirBeat: typeof data.stirBeat === 'number' ? data.stirBeat : 0,
      ingredientDue: typeof data.ingredientDue === 'number' ? data.ingredientDue : null,
      ingredientHits: typeof data.ingredientHits === 'number' ? data.ingredientHits : 0,
      ingredientMiss: typeof data.ingredientMiss === 'number' ? data.ingredientMiss : 0,
      startedAt: typeof data.startedAt === 'number' ? data.startedAt : null,
    };
  } catch {
    return defaultRun();
  }
}

export function writeStirFry(run: StirFryRun): void {
  localStorage.setItem(KEY, JSON.stringify(run));
}

export function clearStirFry(): void {
  localStorage.removeItem(KEY);
}

export function starsFor(score: number): 1 | 2 | 3 {
  if (score >= 1800) return 3;
  if (score >= 1000) return 2;
  return 1;
}
