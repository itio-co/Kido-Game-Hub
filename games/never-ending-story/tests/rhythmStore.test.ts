// Per-difficulty local bests for a rhythm pack store.
import { applyPackBest, bestFor, parsePackBests, starsFor } from '../src/modules/rhythm/packBest.ts';

declare const process: { exitCode?: number };
let failed = 0;
let passed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    console.error(`FAIL ${name}: ${(e as Error).message}`);
  }
}
function ok(c: boolean, msg: string): void {
  if (!c) throw new Error(msg);
}

test('starsFor needs progress for three stars', () => {
  ok(starsFor(800, 50) === 1, 'low score and incomplete progress is one star');
  ok(starsFor(800, 100) === 2, 'full progress is at least two stars');
  ok(starsFor(900, 50) === 2, 'score threshold gives two even mid-progress');
  ok(starsFor(1400, 99) === 2, 'high score without full progress is two');
  ok(starsFor(1400, 100) === 3, 'full progress and threshold is three');
});

test('applyPackBest keeps a first finish and compares only the same difficulty', () => {
  const first = applyPackBest({}, 'easy', 900, 2);
  ok(first.isNewRecord && first.bestScore === 900 && first.bestStars === 2, 'first easy record');
  const lower = applyPackBest(first.bests, 'easy', 800, 3);
  ok(!lower.isNewRecord && lower.bestScore === 900 && lower.bestStars === 3, 'keeps score, max stars');
  const hard = applyPackBest(lower.bests, 'hard', 400, 1);
  ok(hard.isNewRecord && hard.bests.easy?.bestScore === 900 && hard.bests.hard?.bestScore === 400, 'hard is separate');
  ok(bestFor(hard.bests, 'normal').bestScore === 0, 'missing difficulty is empty');
});

test('parsePackBests ignores junk and unscoped scores', () => {
  const parsed = parsePackBests({
    easy: { bestScore: 1200, bestStars: 3 },
    normal: { bestScore: -5, bestStars: 9 },
    hard: { bestScore: 'nope' },
    leftover: { bestScore: 999, bestStars: 3 },
  });
  ok(parsed.easy?.bestScore === 1200 && parsed.easy.bestStars === 3, 'easy kept');
  ok(parsed.normal?.bestScore === 0 && parsed.normal.bestStars === 0, 'clamped score, invalid stars dropped');
  ok(!parsed.hard, 'bad score ignored');
});

console.log(`rhythmStore: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
