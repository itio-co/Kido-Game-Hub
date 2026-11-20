import { CASE_KEY_ID, CASE_PHOTO_ID, showHouseMapButton } from '../src/modules/event-core/progress.ts';
import {
  GRANDMA_FOUND,
  GRANDMA_HAS_KEY,
  GRANDMA_OPEN,
  GRANDMA_WIN,
  grandmaDialogueSlug,
  normalizeCaseState,
  openBoxBag,
  showPhotoBag,
} from '../src/modules/event-core/caseState.ts';

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
function codes(report: { violations: { code: string }[] }): string[] {
  return report.violations.map((item) => item.code);
}

const catalog = ['E01', 'E02', 'E03', 'E04'];
const clues = ['E01', 'E02', 'E03', 'E04'];

test('an opened box consumes the key and asks Grandma for the poster', () => {
  const report = normalizeCaseState({
    evidence: clues,
    bag: [CASE_KEY_ID],
    solved: true,
    deduced: true,
    mapUnlocked: true,
    talkSlug: GRANDMA_OPEN,
  }, catalog, 'E04');
  ok(!report.bag.includes(CASE_KEY_ID) && report.bag.includes(CASE_PHOTO_ID), JSON.stringify(report.bag));
  ok(codes(report).includes('missing-photo'), codes(report).join(','));
  ok(report.stage === 'opened', report.stage);
  ok(report.talkSlug === GRANDMA_FOUND, report.talkSlug ?? '');
  ok(grandmaDialogueSlug(report.stage) === GRANDMA_FOUND, 'found line');
  ok(codes(report).includes('key-after-open'), codes(report).join(','));
  ok(codes(report).includes('dialogue-stage'), codes(report).join(','));
  ok(report.mapUnlocked === true, 'four clues include the jigsaw');
  ok(!codes(report).includes('map-flag'), 'E04 keeps the map');
});

test('a deduced case keeps the key and Grandma points at the box', () => {
  const report = normalizeCaseState({
    evidence: clues,
    bag: [],
    deduced: true,
    solved: false,
    talkSlug: GRANDMA_OPEN,
  }, catalog, 'E04');
  ok(report.bag.includes(CASE_KEY_ID), JSON.stringify(report.bag));
  ok(report.stage === 'deduced', report.stage);
  ok(report.talkSlug === GRANDMA_HAS_KEY, report.talkSlug ?? '');
  ok(report.solved === false, 'box still closed');
  ok(!report.bag.includes(CASE_PHOTO_ID), 'no photo before the box opens');
});

test('opening the box puts the album photo in the bag and showing Grandma takes it out', () => {
  const opened = openBoxBag([CASE_KEY_ID, 'other']);
  ok(!opened.includes(CASE_KEY_ID) && opened.includes(CASE_PHOTO_ID) && opened.includes('other'), opened.join(','));
  ok(openBoxBag(opened).filter((id) => id === CASE_PHOTO_ID).length === 1, 'no duplicate photo');
  const given = showPhotoBag(opened);
  ok(given.shown && !given.bag.includes(CASE_PHOTO_ID), given.bag.join(','));
  const missing = showPhotoBag(['other']);
  ok(!missing.shown && missing.bag.length === 1, 'cannot show a photo that is not there');
  const migrated = normalizeCaseState({
    evidence: clues,
    bag: [],
    solved: true,
    deduced: true,
    poster: false,
    mapUnlocked: true,
  }, catalog, 'E04');
  ok(migrated.bag.includes(CASE_PHOTO_ID) && codes(migrated).includes('missing-photo'), JSON.stringify(migrated));
  const shown = normalizeCaseState({
    evidence: clues,
    bag: [CASE_PHOTO_ID],
    solved: true,
    deduced: true,
    poster: true,
    mapUnlocked: true,
  }, catalog, 'E04');
  ok(!shown.bag.includes(CASE_PHOTO_ID) && shown.stage === 'poster', JSON.stringify(shown));
  ok(codes(shown).includes('photo-after-show'), codes(shown).join(','));
});

test('the house map stays locked without the jigsaw evidence', () => {
  const report = normalizeCaseState({
    evidence: ['E01', 'E02'],
    bag: [],
    mapUnlocked: true,
  }, catalog, 'E04');
  ok(report.mapUnlocked === false, 'flag cleared');
  ok(codes(report).includes('map-flag'), codes(report).join(','));
  ok(showHouseMapButton({
    context: 'event',
    sceneHasMap: true,
    flow: { games: [{ game: 'jigsaw', unlocksHouseMap: 'E04' }] },
    evidence: report.evidence,
  }) === false, 'button hidden');
});

test('the house map shows when the jigsaw evidence is in the save', () => {
  const report = normalizeCaseState({
    evidence: clues,
    mapUnlocked: true,
  }, catalog, 'E04');
  ok(report.mapUnlocked === true && !codes(report).includes('map-flag'), codes(report).join(','));
  ok(showHouseMapButton({
    context: 'event',
    sceneHasMap: true,
    flow: { slug: 'flow/case-01', games: [{ game: 'jigsaw', unlocksHouseMap: 'E04' }] },
    evidence: report.evidence,
  }) === true, 'button shown');
});

test('a poster already shown uses the win line and does not put the key back', () => {
  const report = normalizeCaseState({
    evidence: clues,
    bag: [CASE_KEY_ID],
    solved: true,
    deduced: true,
    poster: true,
    talkSlug: GRANDMA_FOUND,
  }, catalog, 'E04');
  ok(report.stage === 'poster', report.stage);
  ok(report.talkSlug === GRANDMA_WIN, report.talkSlug ?? '');
  ok(!report.bag.includes(CASE_KEY_ID), 'key stays used');
});

test('a clean investigation is left alone', () => {
  const report = normalizeCaseState({ evidence: ['E01'], bag: [], mapUnlocked: false }, catalog, 'E04');
  ok(report.changed === false && report.violations.length === 0, JSON.stringify(report));
  ok(report.stage === 'investigate' && report.talkSlug === null, report.stage);
});

if (failed) process.exitCode = 1;
