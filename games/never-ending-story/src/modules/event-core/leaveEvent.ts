/** Rules for leaving an in-progress event: confirm first, because a leave resets the run. */
import type { NavContext } from '../../lib/types';
import type { ScreenId } from './types';

/** Screens that belong to an event run (including intro, difficulty, and the ending comic). */
export const EVENT_RUN_SCREENS = new Set<ScreenId>([
  'cutscene',
  'difficulty',
  'ending-comic',
  'house-map',
  'living-room',
  'study',
  'kitchen',
  'kitchen-close',
  'table',
  'tray',
  'grandma',
  'uncle',
  'star-box',
  'crossword',
  'jigsaw',
  'slide',
  'notebook',
  'case-board',
  'album',
]);

/** Destinations that leave the event and would reset the run. */
export const LEAVE_EVENT_SCREENS = new Set<ScreenId>([
  'player-room',
  'event-select',
  'practice',
  'level-map',
]);

export const EVENT_SCROLL_SELECTOR =
  '.evlist, .pgrid, .note-list, .deduce, .lvwrap, .time-sheet, [data-event-scroll]';

export type EventLeaveState = {
  context: NavContext;
  practice?: boolean;
  practiceRun?: boolean;
  caseDone?: boolean;
  screen?: ScreenId | string;
};

export type EventLeaveOptions = {
  /** Intended completion (ending comic → home). Never confirm. */
  isCompletion?: boolean;
};

export type ScrollShot = { index: number; top: number; left: number };

/** True while a case run is in progress and leaving it would reset that run. */
export function isEventRunActive(state: EventLeaveState): boolean {
  if (state.practice || state.practiceRun) return false;
  if (state.caseDone) return false;
  return state.context === 'event';
}

export function isLeaveDestination(screen: ScreenId | string): boolean {
  return LEAVE_EVENT_SCREENS.has(screen as ScreenId);
}

export function isEventRunScreen(screen: ScreenId | string): boolean {
  return EVENT_RUN_SCREENS.has(screen as ScreenId);
}

/** Confirm before navigating from an active event to a hub / practice screen. */
export function shouldConfirmLeave(
  state: EventLeaveState,
  dest: ScreenId | string,
  opts: EventLeaveOptions = {},
): boolean {
  if (opts.isCompletion) return false;
  if (!isEventRunActive(state)) return false;
  if (dest === state.screen) return false;
  return isLeaveDestination(dest);
}

/** If a mid-event save landed on a hub screen, pick the scene to snap back to. */
export function resumeEventScreen(
  state: EventLeaveState & { history?: string[] },
  fallback: ScreenId = 'living-room',
): ScreenId {
  if (state.screen && isEventRunScreen(state.screen)) return state.screen as ScreenId;
  const history = state.history ?? [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const item = history[i];
    if (item && isEventRunScreen(item)) return item as ScreenId;
  }
  return fallback;
}

export function snapshotEventScroll(root: ParentNode): ScrollShot[] {
  const nodes = root.querySelectorAll<HTMLElement>(EVENT_SCROLL_SELECTOR);
  const shots: ScrollShot[] = [];
  nodes.forEach((el, index) => {
    if (el.scrollTop || el.scrollLeft) {
      shots.push({ index, top: el.scrollTop, left: el.scrollLeft });
    }
  });
  return shots;
}

export function restoreEventScroll(root: ParentNode, shots: ScrollShot[]): void {
  const nodes = root.querySelectorAll<HTMLElement>(EVENT_SCROLL_SELECTOR);
  for (const shot of shots) {
    const el = nodes[shot.index];
    if (!el) continue;
    el.scrollTop = shot.top;
    el.scrollLeft = shot.left;
  }
}
