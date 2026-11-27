// Win-result time formatting and local best-time records.
import { applyBest, bestKey, formatTime, parseBests } from '../src/modules/minigame-core/result.ts';

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

test('bestKey uses difficulty, or practice level when set', () => {
  ok(bestKey('jig', 'ง่าย') === 'jig:ง่าย', 'story');
  ok(bestKey('jig', 'ง่าย', 3) === 'jig:practice:3', 'practice');
  ok(bestKey('cross', 'ปานกลาง', 0) === 'cross:ปานกลาง', 'zero level is story');
});

test('parseBests ignores junk and clamps stars', () => {
  eq(parseBests(null), {}, 'null');
  eq(parseBests('not-json'), {}, 'invalid json');
  eq(parseBests('{"jig:ง่าย":{"timeMs":35000,"stars":3}}'), { 'jig:ง่าย': { timeMs: 35000, stars: 3 } }, 'ok row');
  eq(parseBests('{"bad":1,"ok":{"timeMs":10,"stars":9}}'), { ok: { timeMs: 10, stars: 3 } }, 'clamp');
});

test('applyBest treats the first finish as a record and keeps the lower time', () => {
  const first = applyBest({}, 'jig:ง่าย', 42_000, 3);
  ok(first.isNewRecord && first.previous === null, 'first record');
  ok(first.current.timeMs === 42_000 && first.current.stars === 3, 'first current');

  const slower = applyBest(first.store, 'jig:ง่าย', 50_000, 2);
  ok(!slower.isNewRecord, 'slower is not a record');
  ok(slower.current.timeMs === 42_000 && slower.current.stars === 3, 'keeps best time and max stars');

  const faster = applyBest(first.store, 'jig:ง่าย', 35_000, 2);
  ok(faster.isNewRecord && faster.previous?.timeMs === 42_000, 'faster record');
  ok(faster.current.timeMs === 35_000 && faster.current.stars === 3, 'keeps higher stars');
});

console.log(`winResult: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
