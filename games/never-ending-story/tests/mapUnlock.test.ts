import '../src/modules/event-01/houseMap.ts';
import {
  eventProgressBody,
  houseMapGate,
  houseMapUnlocked,
  mapUnlockNeedsPersist,
  showHouseMapButton,
} from '../src/modules/event-core/progress.ts';

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
/** Case 01 story file from before unlocksHouseMap, still identifiable as this case. */
const staleCase01 = {
  slug: 'flow/case-01',
  events: [{ eventId: 'case-01', unlockAfter: null }, { eventId: 'case-02', unlockAfter: 'case-01' }],
  games: [{ game: 'jigsaw' }, { game: 'crossword' }],
};
/** Scenes whose `map` flag is true share this one button rule, including the living room. */
const MAP_SCENES = ['living-room', 'study', 'kitchen', 'kitchen-close', 'table', 'tray', 'grandma', 'uncle', 'star-box'];

test('a gated pack hides the map until that evidence is saved', () => {
  ok(houseMapGate(pack) === 'E04', 'gate');
  ok(houseMapUnlocked(pack, []) === false, 'before');
  ok(houseMapUnlocked(pack, ['E01', 'E04']) === true, 'after');
  ok(houseMapUnlocked({ games: [{ game: 'jigsaw' }] }, []) === true, 'no gate stays open');
});

test('case 01 stays locked when the story file omitted unlocksHouseMap', () => {
  ok(houseMapGate(staleCase01) === 'E04', 'registered gate');
  ok(houseMapUnlocked(staleCase01, ['E01', 'E02']) === false, 'two other clues');
  ok(houseMapUnlocked(staleCase01, []) === false, 'empty');
  ok(houseMapUnlocked(staleCase01, ['E04']) === true, 'real win');
  ok(houseMapUnlocked(staleCase01, ['E01', 'E04']) === true, 'win plus another clue');
  const byEventOnly = { events: [{ eventId: 'case-01', unlockAfter: null }], games: [{ game: 'jigsaw' }] };
  ok(houseMapGate(byEventOnly) === 'E04', 'event id');
});

test('the living room and every other map scene use the same button rule', () => {
  const evidence = ['E01', 'E02'];
  for (const screen of MAP_SCENES) {
    ok(
      showHouseMapButton({ context: 'event', sceneHasMap: true, flow: staleCase01, evidence }) === false,
      screen,
    );
  }
  ok(
    showHouseMapButton({ context: 'event', sceneHasMap: true, flow: staleCase01, evidence: ['E01', 'E04'] }) === true,
    'shown after the jigsaw evidence',
  );
  ok(
    showHouseMapButton({ context: 'event', sceneHasMap: false, flow: staleCase01, evidence: ['E04'] }) === false,
    'house-map and album have no map flag',
  );
  ok(
    showHouseMapButton({ context: 'hub', sceneHasMap: true, flow: staleCase01, evidence: ['E04'] }) === false,
    'hub',
  );
});

test('a saved unlock flag, a visit, or other evidence does not open the button', () => {
  ok(mapUnlockNeedsPersist(true, false) === true, 'clear a true flag that has no jigsaw evidence');
  ok(mapUnlockNeedsPersist(undefined, true) === true, 'write the flag after a real win');
  ok(mapUnlockNeedsPersist(true, true) === false, 'keep a matching win');
  ok(mapUnlockNeedsPersist(false, false) === false, 'keep locked');
  ok(mapUnlockNeedsPersist(undefined, false) === false, 'missing flag while locked');
  ok(houseMapUnlocked(staleCase01, ['E01', 'E02', 'E03', 'E05']) === false, 'other evidence');
});

test('progress sync carries the unlocked flag from the save', () => {
  const body = eventProgressBody({ evidence: ['E04'], mapUnlocked: true, caseDone: false });
  ok(body?.progress.mapUnlocked === true, JSON.stringify(body));
  const locked = eventProgressBody({ evidence: ['E01'], mapUnlocked: false });
  ok(locked?.progress.mapUnlocked === false, JSON.stringify(locked));
  const staleFlag = eventProgressBody({ evidence: ['E01', 'E02'], mapUnlocked: true });
  ok(staleFlag?.progress.mapUnlocked === true, 'the document still reports the stored flag');
});

if (failed) process.exitCode = 1;
