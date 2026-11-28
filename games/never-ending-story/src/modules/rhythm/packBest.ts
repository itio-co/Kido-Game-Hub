/** Pure per-difficulty best-score helpers for a rhythm pack. No storage access. */

export type RhythmDifficultyName = 'easy' | 'normal' | 'hard';
export type RhythmDifficultyBest = { bestScore: number; bestStars: 0 | 1 | 2 | 3 };
export type RhythmBests = Partial<Record<RhythmDifficultyName, RhythmDifficultyBest>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function parsePackBests(value: unknown): RhythmBests {
  if (!isRecord(value)) return {};
  const out: RhythmBests = {};
  for (const difficulty of ['easy', 'normal', 'hard'] as const) {
    const row = value[difficulty];
    if (!isRecord(row) || typeof row.bestScore !== 'number' || !Number.isFinite(row.bestScore)) continue;
    const bestStars = row.bestStars === 1 || row.bestStars === 2 || row.bestStars === 3 ? row.bestStars : 0;
    out[difficulty] = { bestScore: Math.max(0, row.bestScore), bestStars };
  }
  return out;
}

export function bestFor(bests: RhythmBests | undefined, difficulty: RhythmDifficultyName): RhythmDifficultyBest {
  return bests?.[difficulty] ?? { bestScore: 0, bestStars: 0 };
}

/** Higher score wins. The first finish of a difficulty is a new record. */
export function applyPackBest(
  bests: RhythmBests | undefined,
  difficulty: RhythmDifficultyName,
  score: number,
  stars: 0 | 1 | 2 | 3,
): { bests: RhythmBests; bestScore: number; bestStars: 0 | 1 | 2 | 3; isNewRecord: boolean } {
  const previous = bests?.[difficulty];
  const isNewRecord = !previous || score > previous.bestScore;
  const bestScore = Math.max(previous?.bestScore ?? 0, score);
  const bestStars = Math.max(previous?.bestStars ?? 0, stars) as 0 | 1 | 2 | 3;
  return { bests: { ...bests, [difficulty]: { bestScore, bestStars } }, bestScore, bestStars, isNewRecord };
}

/** Stars from score + progress; thresholds come from the pack params. */
export function starsFor(score: number, progress: number, stars: { two: number; three: number } = { two: 900, three: 1400 }): 1 | 2 | 3 {
  if (progress >= 100 && score >= stars.three) return 3;
  if (progress >= 100 || score >= stars.two) return 2;
  return 1;
}
