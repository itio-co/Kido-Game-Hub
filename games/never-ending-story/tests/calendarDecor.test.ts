import {
  CALENDAR_STATES,
  DEFAULT_CALENDAR,
  WALL_PATCH,
  calendarLayers,
  designForTheme,
  isDesignLocked,
  normalizeCalendar,
  normalizeRoomDecor,
  themeForDesign,
} from '../src/lib/calendarDecor.ts';

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

const KID = 'cb8d64cc-6760-41a0-8595-837d6403af3b';
const WOOD = 'cfe3efe9-05a8-4528-a0f0-7319e32ddf0f';
const NIGHT = '5abeab1b-cd53-46ec-a629-a1213a7524c8';
const GARDEN = '16b9004f-d830-4339-ae35-3eed2fe9d564';
const THEMES = [
  { id: KID, wall: 'original' },
  { id: WOOD, wall: 'wooden-home' },
  { id: NIGHT, wall: 'night-sky' },
  { id: GARDEN, wall: 'garden' },
];

test('five states, default is the painted original', () => {
  ok(CALENDAR_STATES.join(',') === 'original,none,wooden-home,night-sky,garden', CALENDAR_STATES.join(','));
  ok(DEFAULT_CALENDAR === 'original', 'default');
});

test('normalizer: missing, junk, and unknown values fall back to original', () => {
  ok(normalizeCalendar(undefined, []) === 'original', 'undefined');
  ok(normalizeCalendar(null, []) === 'original', 'null');
  ok(normalizeCalendar(3, []) === 'original', 'number');
  ok(normalizeCalendar('disco', []) === 'original', 'unknown');
  ok(normalizeRoomDecor(undefined, []).calendar === 'original', 'no room');
  ok(normalizeRoomDecor([], []).calendar === 'original', 'array room');
  ok(normalizeRoomDecor({}, []).calendar === 'original', 'empty room');
});

test('normalizer keeps take-down and unlocked designs', () => {
  for (const value of ['original', 'none', 'wooden-home', 'garden'] as const) {
    ok(normalizeCalendar(value, []) === value, value);
  }
  ok(normalizeRoomDecor({ calendar: 'none' }, []).calendar === 'none', 'room none');
});

test('night-sky needs case-01 (same rule as the night-sky theme)', () => {
  ok(isDesignLocked('night-sky', []), 'locked');
  ok(!isDesignLocked('night-sky', ['case-01']), 'unlocked');
  ok(normalizeCalendar('night-sky', []) === 'original', 'locked falls back');
  ok(normalizeCalendar('night-sky', ['case-01']) === 'night-sky', 'kept after case');
  ok(!isDesignLocked('none', []) && !isDesignLocked('garden', []), 'others open');
});

test('render layers: original is the backdrop, others add the wall patch, designs stack on top', () => {
  const orig = calendarLayers('original');
  ok(orig.patch === null && orig.design === null, 'original');
  const none = calendarLayers('none');
  ok(none.patch === WALL_PATCH && none.design === null, 'none');
  for (const design of ['wooden-home', 'night-sky', 'garden'] as const) {
    const layers = calendarLayers(design);
    ok(layers.patch === WALL_PATCH && layers.design === `calendar-${design}.png`, design);
  }
});

test('designs link to the matching panel skin and back', () => {
  ok(themeForDesign(THEMES, 'original') === KID, 'original → kid room');
  ok(themeForDesign(THEMES, 'wooden-home') === WOOD, 'wood');
  ok(themeForDesign(THEMES, 'night-sky') === NIGHT, 'night');
  ok(themeForDesign(THEMES, 'garden') === GARDEN, 'garden');
  ok(themeForDesign(THEMES, 'none') === null, 'take-down keeps the skin');
  ok(designForTheme(THEMES, WOOD) === 'wooden-home', 'hang back wood');
  ok(designForTheme(THEMES, GARDEN) === 'garden', 'hang back garden');
  ok(designForTheme(THEMES, 'missing') === 'original', 'unknown skin hangs original');
  ok(designForTheme([{ id: 'x' }], 'x') === 'original', 'skin without wall');
});

console.log(failed ? `calendarDecor: ${failed} failed` : 'calendarDecor: all passed');
if (failed) process.exitCode = 1;
