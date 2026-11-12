import { eventProgressBody, houseMapGate, houseMapUnlocked } from '../src/modules/event-core/progress.ts';

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

const pack = { games: [{ game: 'jigsaw', unlocksHouseMap: 'E04' }, { game: 'crossword' }] };

test('a gated pack hides the map until that evidence is saved', () => {
  ok(houseMapGate(pack) === 'E04', 'gate');
  ok(houseMapUnlocked(pack, []) === false, 'before');
  ok(houseMapUnlocked(pack, ['E01', 'E04']) === true, 'after');
  ok(houseMapUnlocked({ games: [{ game: 'jigsaw' }] }, []) === true, 'no gate stays open');
});

test('progress sync carries the unlocked flag from the save', () => {
  const body = eventProgressBody({ evidence: ['E04'], mapUnlocked: true, caseDone: false });
  ok(body?.progress.mapUnlocked === true, JSON.stringify(body));
  const locked = eventProgressBody({ evidence: ['E01'], mapUnlocked: false });
  ok(locked?.progress.mapUnlocked === false, JSON.stringify(locked));
});

if (failed) process.exitCode = 1;
