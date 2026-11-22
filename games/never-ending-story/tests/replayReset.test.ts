import { REPLAY_KEEP_FIELDS, REPLAY_RESET_FIELDS, freshEventRun, replayEventRun, type EventRunState, type PuzzleBlanks } from '../src/modules/event-core/replay.ts';

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
function eq(a: unknown, b: unknown, msg: string): void {
  const left = JSON.stringify(a);
  const right = JSON.stringify(b);
  if (left !== right) throw new Error(`${msg}: ${left} !== ${right}`);
}

/** Same defaults as freshCross / freshJig / freshSlide, inlined so this file stays a Node test. */
const blanks: PuzzleBlanks = {
  cross: { fill: { '0,0': 'ด', '0,1': 'า', '0,2': 'ว', '1,2': 'า' }, sel: '2,3' },
  jig: { placed: [0, 1, 2, 3, 5, 6, 9], sel: null },
  slide: {
    A: { r: 0, c: 2, len: 2, v: 1, col: '#e0574f', label: 'A' },
    B: { r: 2, c: 0, len: 2, v: 0, col: '#4f8fe0', label: 'B' },
    K: { r: 1, c: 0, len: 2, v: 0, col: '#f2b632', key: true, label: '🗝 K' },
  },
};

const midRun: EventRunState = {
  evidence: ['E01', 'E02', 'E04'],
  bag: ['case-key'],
  solved: true,
  deduced: true,
  reward: true,
  poster: true,
  caseDone: true,
  cleared: true,
  difficulty: 'ยาก',
  played: ['flow/practice/cross'],
  seen: ['flow/practice/cross', 'flow/practice/jig'],
  levels: { cross: [3, 2], jig: [1], slide: [3, 3, 2] },
  page: 2,
  slot: 'afternoon',
  hints: 4,
  hintTier: 2,
  hintGoal: 1,
  cross: { fill: { '2,2': 'ก' }, sel: '2,3' },
  jig: { placed: [0, 1, 2], sel: 4 },
  slide: { ...blanks.slide, K: { ...blanks.slide.K, r: 2, c: 2 } },
  snap: { cross: blanks.cross, jig: blanks.jig, slide: blanks.slide },
  picks: ['a', 'b', 'c'],
  proof: ['E01', 'E02', 'E03'],
  marks: [1, -1, 1],
  talk: { who: 'ย่ามะลิ', text: 'leftover' },
  talkSlug: 'flow/dialogue/grandma-win',
  overlay: 'bag',
  selected: 'spot-1',
  hintSpot: 'spot-2',
  toastText: 'ได้หลักฐาน E01',
  eggReveal: true,
  mapUnlockPulse: true,
  bagPulse: true,
};

test('replay after playing partway equals a fresh start, plus kept unlocks', () => {
  const next = replayEventRun(midRun, blanks);
  const fresh = freshEventRun(blanks);
  for (const key of REPLAY_RESET_FIELDS) {
    eq(next[key], fresh[key], `reset ${key}`);
  }
  ok(next.cleared === true, 'cleared stays true so skip-intro and the badge still work');
  eq(next.played, midRun.played, 'played unlocks kept');
  eq(next.seen, midRun.seen, 'seen unlocks kept');
  eq(next.levels, midRun.levels, 'high scores kept');
  ok(next.page === 0, 'cutscene starts on page 1');
  eq(next.evidence, [], 'evidence wiped');
  eq(next.bag, [], 'case bag items wiped');
  ok(next.solved === false && next.deduced === false && next.poster === false && next.caseDone === false, 'this-run flags wiped');
});

test('replaying a completed case that had not yet stored cleared still keeps the badge', () => {
  const next = replayEventRun({ ...midRun, cleared: false, caseDone: true }, blanks);
  ok(next.cleared === true, 'caseDone migrates into cleared');
  ok(next.caseDone === false, 'this run is not finished');
});

test('first play (nothing cleared) stays uncleared', () => {
  const start: EventRunState = {
    ...freshEventRun(blanks),
    cleared: false,
    played: [],
    seen: [],
    levels: { cross: [], jig: [], slide: [] },
    page: 1,
    evidence: ['E01'],
    hints: 1,
  };
  const next = replayEventRun(start, blanks);
  ok(next.cleared === false, 'a case that was never finished is not marked cleared');
  eq(next.evidence, [], 'partial evidence still wiped');
  eq(next.page, 0, 'page reset');
});

test('keep/reset lists do not overlap and cover the snapshot', () => {
  const keys = Object.keys(midRun);
  const listed = [...REPLAY_RESET_FIELDS, ...REPLAY_KEEP_FIELDS];
  eq([...listed].sort(), [...keys].sort(), 'every field is either reset or kept');
  ok(REPLAY_RESET_FIELDS.every((k) => !REPLAY_KEEP_FIELDS.includes(k as typeof REPLAY_KEEP_FIELDS[number])), 'no overlap');
});

if (failed) process.exitCode = 1;
else console.log('replayReset: all tests passed');
