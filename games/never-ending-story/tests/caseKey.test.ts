import {
  CASE_KEY_ID,
  canSolveCase,
  catalogCodes,
  countedEvidence,
  migrateCaseBag,
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

const catalog = ['E01', 'E02', 'E03', 'E04'];

test('the notebook is four clues and E05 does not count', () => {
  ok(catalogCodes({ evidence: catalog.map((code) => ({ code })) }).length === 4, 'catalog');
  const held = countedEvidence(catalog, ['E01', 'E02', 'E05', 'E04']);
  ok(held.length === 3 && !held.includes('E05'), held.join(','));
  ok(canSolveCase(catalog, ['E01', 'E02', 'E04']) === false, 'missing E03');
  ok(canSolveCase(catalog, ['E01', 'E02', 'E03', 'E04', 'E05']) === true, 'all four');
});

test('the key stays in the bag only until the box opens', () => {
  const fromE05 = migrateCaseBag({ evidence: ['E01', 'E05'], bag: [CASE_KEY_ID] }, catalog);
  ok(!fromE05.evidence.includes('E05') && !fromE05.bag.includes(CASE_KEY_ID) && fromE05.changed, JSON.stringify(fromE05));
  const solved = migrateCaseBag({ evidence: ['E01', 'E02', 'E03', 'E04'], solved: true, bag: [CASE_KEY_ID] }, catalog);
  ok(solved.evidence.length === 4 && !solved.bag.includes(CASE_KEY_ID), JSON.stringify(solved));
  const deduced = migrateCaseBag({ evidence: ['E01', 'E02', 'E03', 'E04'], deduced: true, bag: [] }, catalog);
  ok(deduced.bag.length === 1 && deduced.bag[0] === CASE_KEY_ID, JSON.stringify(deduced));
  const kept = migrateCaseBag({ evidence: ['E01'], deduced: true, bag: [CASE_KEY_ID] }, catalog);
  ok(kept.bag.length === 1 && kept.changed === false, 'no duplicate key');
  const fresh = migrateCaseBag({ evidence: ['E01', 'E02'], bag: [] }, catalog);
  ok(fresh.bag.length === 0 && fresh.changed === false, JSON.stringify(fresh));
  const done = migrateCaseBag({ evidence: [], caseDone: true, bag: [CASE_KEY_ID] }, catalog);
  ok(!done.bag.includes(CASE_KEY_ID), 'finished case consumed the key');
});

if (failed) process.exitCode = 1;
