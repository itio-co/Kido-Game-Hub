// Win-result time formatting and per-difficulty local best-time records.
import { applyBest, applyBestScore, bestKey, canonicalBestKey, difficultyId, formatScore, formatTime, migrateBests, parseBests, starsFromHints } from '../src/modules/minigame-core/result.ts';

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
function eq<T>(a: T, b: T, msg: string): void {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
}

test('formatTime pads mm:ss and floors milliseconds', () => {
  ok(formatTime(0) === '00:00', 'zero');
  ok(formatTime(999) === '00:00', 'subsecond');
  ok(formatTime(1000) === '00:01', 'one second');
  ok(formatTime(42_000) === '00:42', '42s');
  ok(formatTime(90_000) === '01:30', '90s');
  ok(formatTime(-5) === '00:00', 'negative');
});

test('difficultyId maps Thai and English labels', () => {
  ok(difficultyId('ง่าย') === 'easy', 'ง่าย');
  ok(difficultyId('ปานกลาง') === 'medium', 'ปานกลาง');
  ok(difficultyId('ยาก') === 'hard', 'ยาก');
  ok(difficultyId('easy') === 'easy', 'easy');
  ok(difficultyId('NORMAL') === 'medium', 'normal alias');
  ok(difficultyId('nope') === null, 'unknown');
  ok(difficultyId('') === null, 'empty');
});

test('bestKey is canonical per difficulty, or practice level when set', () => {
  ok(bestKey('jig', 'ง่าย') === 'jig:easy', 'thai easy');
  ok(bestKey('jig', 'easy') === 'jig:easy', 'english easy');
  ok(bestKey('jig', 'ยาก') === 'jig:hard', 'thai hard');
  ok(bestKey('jig', 'ง่าย', 3) === 'jig:practice:3', 'practice');
  ok(bestKey('cross', 'ปานกลาง', 0) === 'cross:medium', 'zero level is story');
  ok(bestKey('jig', 'unknown') === '', 'unresolved difficulty is not a shared key');
});

test('canonicalBestKey keeps per-difficulty keys and drops bare ones', () => {
  ok(canonicalBestKey('jig:ง่าย') === 'jig:easy', 'migrate thai');
  ok(canonicalBestKey('jig:easy') === 'jig:easy', 'canonical');
  ok(canonicalBestKey('jig:practice:3') === 'jig:practice:3', 'practice');
  ok(canonicalBestKey('jig') === null, 'bare game key');
  ok(canonicalBestKey('jig:') === null, 'empty difficulty');
  ok(canonicalBestKey('ok') === null, 'junk');
});

test('parseBests ignores junk and clamps stars', () => {
  eq(parseBests(null), {}, 'null');
  eq(parseBests('not-json'), {}, 'invalid json');
  eq(parseBests('{"jig:ง่าย":{"timeMs":35000,"stars":3}}'), { 'jig:ง่าย': { timeMs: 35000, stars: 3 } }, 'raw thai key kept until migrate');
  eq(parseBests('{"bad":1,"ok":{"timeMs":10,"stars":9}}'), { ok: { timeMs: 10, stars: 3 } }, 'clamp raw');
});

test('migrateBests remaps Thai keys and ignores entries with no difficulty', () => {
  const migrated = migrateBests({
    jig: { timeMs: 1, stars: 3 },
    'jig:ง่าย': { timeMs: 5000, stars: 2 },
    'jig:easy': { timeMs: 4000, stars: 1 },
    'jig:ยาก': { timeMs: 12000, stars: 3 },
    'cross:medium': { timeMs: 8000, stars: 2 },
  });
  ok(migrated.changed, 'keys changed');
  ok(!('jig' in migrated.store), 'bare key dropped');
  eq(migrated.store['jig:easy'], { timeMs: 4000, stars: 2 }, 'same difficulty merged: lower time, max stars');
  eq(migrated.store['jig:hard'], { timeMs: 12000, stars: 3 }, 'hard stays separate');
  eq(migrated.store['cross:medium'], { timeMs: 8000, stars: 2 }, 'other game untouched');
  ok(!('jig:ง่าย' in migrated.store) && !('jig:ยาก' in migrated.store), 'aliases removed');
});

test('applyBest treats the first finish as a record and keeps the lower time', () => {
  const first = applyBest({}, 'jig:ง่าย', 42_000, 3);
  ok(first.isNewRecord && first.previous === null, 'first record');
  ok(first.current.timeMs === 42_000 && first.current.stars === 3, 'first current');
  ok('jig:easy' in first.store && !('jig:ง่าย' in first.store), 'stored under canonical key');

  const slower = applyBest(first.store, 'jig:easy', 50_000, 2);
  ok(!slower.isNewRecord, 'slower is not a record');
  ok(slower.current.timeMs === 42_000 && slower.current.stars === 3, 'keeps best time and max stars');

  const faster = applyBest(first.store, 'jig:easy', 35_000, 2);
  ok(faster.isNewRecord && faster.previous?.timeMs === 42_000, 'faster record');
  ok(faster.current.timeMs === 35_000 && faster.current.stars === 3, 'keeps higher stars');
});

test('applyBest compares only the same difficulty', () => {
  const easy = applyBest({}, 'jig:easy', 5_000, 3);
  const hard = applyBest(easy.store, 'jig:hard', 40_000, 1);
  ok(hard.isNewRecord, 'first hard finish is a record even if easy is faster');
  ok(hard.store['jig:easy'].timeMs === 5_000, 'easy record unchanged');
  ok(hard.store['jig:hard'].timeMs === 40_000, 'hard has its own time');
  const skipped = applyBest(hard.store, 'jig', 1, 3);
  ok(!skipped.isNewRecord, 'bare key is not recorded');
  ok(skipped.store['jig:easy'].timeMs === 5_000 && skipped.store['jig:hard'].timeMs === 40_000, 'bare key does not overwrite');
});

test('formatScore rounds and floors negatives at zero', () => {
  ok(formatScore(0) === '0', 'zero');
  ok(formatScore(1420.6) === '1421', 'round');
  ok(formatScore(-3) === '0', 'negative');
});

test('starsFromHints is 3 / 2 / 1', () => {
  ok(starsFromHints(0) === 3, 'none');
  ok(starsFromHints(1) === 2, 'one');
  ok(starsFromHints(2) === 1, 'two');
  ok(starsFromHints(9) === 1, 'many');
});

test('applyBestScore treats the first finish as a record and keeps the higher score', () => {
  const first = applyBestScore({}, 'stirfry:easy', 900, 2, 50_000);
  ok(first.isNewRecord && first.previous === null, 'first record');
  ok(first.current.score === 900 && first.current.stars === 2 && first.current.timeMs === 50_000, 'first current');
  ok('stirfry:easy' in first.store, 'canonical key');

  const lower = applyBestScore(first.store, 'stirfry:easy', 800, 3, 40_000);
  ok(!lower.isNewRecord, 'lower score is not a record');
  ok(lower.current.score === 900 && lower.current.stars === 3 && lower.current.timeMs === 50_000, 'keeps best score, max stars, and the record run time');

  const higher = applyBestScore(first.store, 'stirfry:normal', 1200, 3, 55_000);
  ok(higher.isNewRecord, 'first normal finish is a record');
  ok(higher.store['stirfry:easy'].score === 900, 'easy unchanged');
  ok(higher.store['stirfry:medium'].score === 1200, 'normal aliases to medium');

  const skipped = applyBestScore(higher.store, 'stirfry', 9999, 3);
  ok(!skipped.isNewRecord, 'bare key is not recorded');
  ok(skipped.store['stirfry:easy'].score === 900, 'bare key does not overwrite');
});

test('parseBests keeps an optional score and migrateBests merges the higher one', () => {
  eq(parseBests('{"stirfry:easy":{"timeMs":1000,"stars":2,"score":800}}'), { 'stirfry:easy': { timeMs: 1000, stars: 2, score: 800 } }, 'score kept');
  const migrated = migrateBests({
    'stirfry:ง่าย': { timeMs: 2000, stars: 1, score: 700 },
    'stirfry:easy': { timeMs: 1500, stars: 3, score: 900 },
  });
  eq(migrated.store['stirfry:easy'], { timeMs: 1500, stars: 3, score: 900 }, 'merged: lower time, max stars, higher score');
});

console.log(`winResult: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
