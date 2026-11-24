import {
  isEventRunActive,
  isLeaveDestination,
  restoreEventScroll,
  resumeEventScreen,
  shouldConfirmLeave,
  snapshotEventScroll,
} from '../src/modules/event-core/leaveEvent.ts';

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

const mid = { context: 'event' as const, practice: false, practiceRun: false, caseDone: false, screen: 'living-room' };

test('mid-event run is active; hub, practice, and a finished case are not', () => {
  ok(isEventRunActive(mid), 'living room mid-run');
  ok(isEventRunActive({ ...mid, screen: 'cutscene' }), 'opening cutscene is already an active event');
  ok(isEventRunActive({ ...mid, screen: 'difficulty' }), 'difficulty is still the event');
  ok(!isEventRunActive({ ...mid, context: 'hub' }), 'hub');
  ok(!isEventRunActive({ ...mid, practice: true }), 'practice flag');
  ok(!isEventRunActive({ ...mid, practiceRun: true, context: 'practice' }), 'practice run');
  ok(!isEventRunActive({ ...mid, caseDone: true }), 'finished this run');
});

test('leave destinations are the hub and practice screens only', () => {
  ok(isLeaveDestination('player-room'), 'player room');
  ok(isLeaveDestination('event-select'), 'event list');
  ok(isLeaveDestination('practice'), 'practice corner');
  ok(isLeaveDestination('level-map'), 'practice map');
  ok(!isLeaveDestination('house-map'), 'house map stays in the event');
  ok(!isLeaveDestination('notebook'), 'notebook stays in the event');
  ok(!isLeaveDestination('cutscene'), 'cutscene stays in the event');
});

test('confirm when leaving an active event; not when staying or when the event is finished', () => {
  ok(shouldConfirmLeave(mid, 'event-select'), 'back to the event list');
  ok(shouldConfirmLeave(mid, 'player-room'), 'back to the player room');
  ok(shouldConfirmLeave({ ...mid, screen: 'cutscene' }, 'event-select'), 'swipe/back off the first cutscene page');
  ok(!shouldConfirmLeave(mid, 'kitchen'), 'move between rooms');
  ok(!shouldConfirmLeave(mid, 'house-map'), 'open the house map');
  ok(!shouldConfirmLeave(mid, 'living-room'), 'same screen');
  ok(!shouldConfirmLeave({ ...mid, caseDone: true }, 'event-select'), 'finished run needs no confirm');
  ok(!shouldConfirmLeave({ ...mid, context: 'hub', screen: 'player-room' }, 'event-select'), 'no active event');
  ok(!shouldConfirmLeave(mid, 'player-room', { isCompletion: true }), 'ending-comic home path');
});

test('reload snaps back to the active event screen, even if nav landed on the hub', () => {
  eq(resumeEventScreen({ ...mid, screen: 'kitchen' }), 'kitchen', 'already on an event screen');
  eq(
    resumeEventScreen({
      ...mid,
      screen: 'player-room',
      history: ['event-select', 'living-room', 'kitchen'],
    }),
    'kitchen',
    'hub screen + history',
  );
  eq(resumeEventScreen({ ...mid, screen: 'event-select', history: [] }), 'living-room', 'fallback');
});

test('scroll snapshot restores the same offsets', () => {
  const a = { scrollTop: 120, scrollLeft: 0 };
  const b = { scrollTop: 0, scrollLeft: 0 };
  const c = { scrollTop: 0, scrollLeft: 40 };
  const root = { querySelectorAll: () => [a, b, c] } as unknown as ParentNode;
  const shots = snapshotEventScroll(root);
  eq(shots, [{ index: 0, top: 120, left: 0 }, { index: 2, top: 0, left: 40 }], 'skips zero offsets');
  a.scrollTop = 0;
  c.scrollLeft = 0;
  restoreEventScroll(root, shots);
  eq({ a: a.scrollTop, c: c.scrollLeft }, { a: 120, c: 40 }, 'restored');
});

if (failed) process.exitCode = 1;
else console.log('leaveEvent: all tests passed');
