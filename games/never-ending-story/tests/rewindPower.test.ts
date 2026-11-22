import { canSolveCase, catalogCodes, countedEvidence } from '../src/modules/event-core/progress.ts';
import { hasClockRewind, slotUnlocked, unlockCodes } from '../src/modules/event-core/rewindPower.ts';

declare const process: { exitCode?: number };
let failed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL ${name}: ${(e as Error).message}`);
  }
}
function ok(c: boolean, msg: string): void {
  if (!c) throw new Error(msg);
}

const slots = [
  { part: 'day', unlockBy: 'E02' },
  { part: 'hour', unlockBy: ['E01', 'E06'] },
  { part: 'hour', unlockBy: null },
];

test('catalog helpers still drop a retired E05 and require every listed clue', () => {
  const catalog = catalogCodes({ evidence: ['E01', 'E02', 'E03', 'E04', 'E06'].map((code) => ({ code })) });
  ok(catalog.join(',') === 'E01,E02,E03,E04,E06', catalog.join(','));
  const held = countedEvidence(catalog, ['E01', 'E02', 'E05', 'E04', 'E06']);
  ok(held.length === 4 && !held.includes('E05'), held.join(','));
  ok(canSolveCase(catalog, ['E01', 'E03', 'E04', 'E06']) === false, 'summary stays locked without E02');
  ok(canSolveCase(catalog, ['E01', 'E02', 'E03', 'E04', 'E06']) === true, 'all five');
});

test('clock power appears only after E01 or E06, never from E02 alone', () => {
  ok(hasClockRewind(slots, []) === false, 'no clues');
  ok(hasClockRewind(slots, ['E03', 'E04']) === false, 'unrelated clues');
  ok(hasClockRewind(slots, ['E02']) === false, 'E02 is the rewind result, not the key');
  ok(hasClockRewind(slots, ['E01']) === true, 'Rin note');
  ok(hasClockRewind(slots, ['E06']) === true, 'kitchen cloth and vase');
});

test('afternoon unlock is OR of E01 and E06', () => {
  const unlockBy = ['E01', 'E06'];
  ok(unlockCodes(unlockBy).sort().join(',') === 'E01,E06', String(unlockBy));
  ok(slotUnlocked(unlockBy, []) === false, 'locked at start');
  ok(slotUnlocked(unlockBy, ['E02']) === false, 'E02 does not unlock afternoon');
  ok(slotUnlocked(unlockBy, ['E01']) === true, 'note');
  ok(slotUnlocked(unlockBy, ['E06']) === true, 'kitchen');
});

if (failed) process.exitCode = 1;
