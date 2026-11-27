// Daily streak rules (src/lib/streak.ts) and the sealed token (worker/streakToken.ts). Run by `npm test`.
import {
  MAX_BATTERIES,
  MAX_WINS_PER_DAY,
  applyWin,
  bangkokDay,
  dayLabel,
  emptyRecord,
  mondayIndex,
  parseDayLabel,
  readRecord,
  settle,
  tokenClaim,
  viewOf,
  weekRow,
  type StreakRecord,
} from '../src/lib/streak.ts';
import { checkStreak, openStreak, sealStreak } from '../worker/streakToken.ts';

declare const process: { exitCode?: number };
let failed = 0;
async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`ok ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL ${name}: ${(e as Error).message}`);
  }
}
function eq(a: unknown, b: unknown, msg: string): void {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
}

const D = parseDayLabel('2026-11-23') as number; // a Monday
function winOn(rec: StreakRecord, ...days: number[]): StreakRecord {
  let r = rec;
  for (const d of days) r = applyWin(r, d).record;
  return r;
}

await test('Bangkok midnight is 17:00 UTC', () => {
  const before = Date.parse('2026-11-27T16:59:59.999Z');
  const after = Date.parse('2026-11-27T17:00:00.000Z');
  eq(dayLabel(bangkokDay(before)), '2026-11-27', 'one ms before Bangkok midnight');
  eq(dayLabel(bangkokDay(after)), '2026-11-28', 'Bangkok midnight');
  eq(bangkokDay(after) - bangkokDay(before), 1, 'next day');
  eq(mondayIndex(D), 0, '2026-11-23 is Monday');
  eq(mondayIndex(D + 6), 6, 'Sunday');
});

await test('first win starts a streak of 1 with full batteries', () => {
  const out = applyWin(emptyRecord(), D);
  eq([out.record.count, out.record.best, out.record.batteries, out.record.totalWins, out.counted], [1, 1, MAX_BATTERIES, 1, true], 'first win');
  eq(tokenClaim(out.record), { streakCount: 1, date: '2026-11-23' }, 'claim');
});

await test('consecutive days add one each', () => {
  const r = winOn(emptyRecord(), D, D + 1, D + 2);
  eq([r.count, r.best, r.batteries], [3, 3, 2], 'three days');
  eq(r.days.map((m) => m.kind), ['win', 'win', 'win'], 'marks');
});

await test('the streak counts once per day; total wins count every win', () => {
  const first = applyWin(emptyRecord(), D);
  const second = applyWin(first.record, D);
  eq(second.counted, false, 'second win same day not counted');
  eq([second.record.count, second.record.totalWins], [1, 2], 'count stays, wins grow');
});

await test('total wins stop growing after the daily cap', () => {
  let r = emptyRecord();
  for (let i = 0; i < MAX_WINS_PER_DAY + 5; i++) r = applyWin(r, D).record;
  eq(r.totalWins, MAX_WINS_PER_DAY, 'capped');
  r = applyWin(r, D + 1).record;
  eq(r.totalWins, MAX_WINS_PER_DAY + 1, 'cap resets next day');
});

await test('one missed day uses one battery and keeps the streak', () => {
  const r = winOn(emptyRecord(), D, D + 1);
  const out = applyWin(r, D + 3);
  eq([out.record.count, out.record.batteries], [3, 1], 'battery used');
  eq(out.record.days.map((m) => `${m.day - D}:${m.kind}`), ['0:win', '1:win', '2:saved', '3:win'], 'saved day');
});

await test('two missed days use both batteries', () => {
  const out = applyWin(winOn(emptyRecord(), D), D + 3);
  eq([out.record.count, out.record.batteries], [2, 0], 'both used');
});

await test('three missed days with two batteries reset the streak', () => {
  const r = winOn(emptyRecord(), D, D + 1, D + 2);
  const out = applyWin(r, D + 6);
  eq([out.record.count, out.record.best, out.record.batteries, out.restarted], [1, 3, MAX_BATTERIES, true], 'reset then restart');
});

await test('with no batteries a single missed day resets', () => {
  const r = winOn(emptyRecord(), D, D + 3); // both batteries used
  eq(r.batteries, 0, 'empty');
  const out = applyWin(r, D + 5);
  eq([out.record.count, out.restarted], [1, true], 'reset');
});

await test('every 7th streak day gives back one battery, up to the max', () => {
  let r = winOn(emptyRecord(), D, D + 2); // count 2, batteries 1
  eq(r.batteries, 1, 'one used');
  for (let d = D + 3; d <= D + 7; d++) r = applyWin(r, d).record;
  eq([r.count, r.batteries], [7, 2], 'refilled on day 7');
  for (let d = D + 8; d <= D + 14; d++) r = applyWin(r, d).record;
  eq([r.count, r.batteries], [14, 2], 'stays at max');
});

await test('settle is idempotent and the view projects missed days without writing', () => {
  const r = winOn(emptyRecord(), D, D + 1);
  const s1 = settle(r, D + 3);
  eq(settle(s1, D + 3), s1, 'idempotent');
  const v = viewOf(r, D + 3);
  eq([v.count, v.batteries, v.state], [2, 1, 'open'], 'projected battery');
  eq(v.days.filter((d) => d.kind === 'saved').map((d) => d.date), ['2026-11-25'], 'projected saved day');
  eq(r.batteries, 2, 'record untouched');
});

await test('view states: new, done, open, reset', () => {
  eq(viewOf(emptyRecord(), D).state, 'new', 'new');
  const r = winOn(emptyRecord(), D);
  eq(viewOf(r, D).state, 'done', 'done');
  eq(viewOf(r, D + 1).state, 'open', 'open');
  const reset = viewOf(r, D + 4);
  eq([reset.state, reset.count, reset.batteries, reset.best], ['reset', 0, 0, 1], 'reset');
});

await test('week row runs Monday to Sunday with today and future days', () => {
  const r = winOn(emptyRecord(), D, D + 2);
  const row = weekRow(viewOf(r, D + 3));
  eq(row.map((d) => d.kind), ['win', 'saved', 'win', null, null, null, null], 'kinds');
  eq(row.findIndex((d) => d.today), 3, 'today Thursday');
  eq(row.map((d) => d.future), [false, false, false, false, true, true, true], 'future');
});

await test('readRecord clamps junk', () => {
  const r = readRecord({ count: -4, batteries: 9, days: [{ day: 3, kind: 'x' }, { day: 4, kind: 'win' }], lastDay: 'no' });
  eq([r.count, r.batteries, r.lastDay, r.days.length], [0, MAX_BATTERIES, null, 1], 'clamped');
  eq(readRecord('garbage'), emptyRecord(), 'garbage');
});

const KEY = 'test-only-streak-key';
await test('sealed token round-trips and hides the claim', async () => {
  const tok = await sealStreak(KEY, { pid: 'player-1234', streakCount: 5, date: '2026-11-27' });
  eq(tok.startsWith('st1.'), true, 'prefix');
  eq(tok.includes('2026'), false, 'not plain');
  eq(await openStreak(KEY, tok), { pid: 'player-1234', streakCount: 5, date: '2026-11-27' }, 'opened');
  eq(await checkStreak(KEY, tok, { pid: 'player-1234', streakCount: 5, date: '2026-11-27' }), 'ok', 'matches');
});

await test('tampered, foreign, stale and missing tokens are reported', async () => {
  const claim = { pid: 'player-1234', streakCount: 5, date: '2026-11-27' };
  const tok = await sealStreak(KEY, claim);
  const [v, iv, ct] = tok.split('.');
  const flipped = `${v}.${iv}.${(ct[0] === 'A' ? 'B' : 'A') + ct.slice(1)}`;
  eq(await openStreak(KEY, flipped), null, 'edited bytes fail');
  eq(await checkStreak(KEY, flipped, claim), 'invalid', 'tampered');
  eq(await checkStreak('another-key', tok, claim), 'invalid', 'wrong key');
  eq(await checkStreak(KEY, tok, { ...claim, pid: 'player-9999' }), 'invalid', 'other player');
  eq(await checkStreak(KEY, tok, { ...claim, streakCount: 6 }), 'stale', 'server moved on');
  eq(await checkStreak(KEY, '', claim), 'missing', 'missing');
  eq(await checkStreak(undefined, tok, claim), 'nokey', 'no key');
  eq(await openStreak(KEY, 'st1.!!.??'), null, 'junk');
});

if (failed) process.exitCode = 1;
else console.log('streak: all tests passed');
