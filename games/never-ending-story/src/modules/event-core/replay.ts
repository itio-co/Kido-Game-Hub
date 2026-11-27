/**
 * Reset the in-progress event (or minigame run fields the event owns) back to
 * a fresh start, while keeping permanent progress: a cleared case, practice
 * unlocks, and high scores.
 */
import type { CrossState, JigState, SlideState } from './puzzles';
import type { FlowProgress } from './types';

export type EventRunState = {
  evidence: string[];
  bag: string[];
  solved: boolean;
  deduced: boolean;
  reward: boolean;
  poster: boolean;
  caseDone: boolean;
  cleared: boolean;
  difficulty: string;
  played: string[];
  seen: string[];
  levels: FlowProgress['levels'];
  page: number;
  slot: 'yesterday' | 'afternoon' | 'now';
  hints: number;
  hintTier: number;
  hintGoal: number;
  cross: CrossState;
  jig: JigState;
  slide: SlideState;
  snap: { cross: CrossState; jig: JigState; slide: SlideState } | null;
  picks: (string | null)[];
  proof: (string | null)[];
  marks: number[];
  talk: unknown | null;
  talkSlug: string | null;
  overlay: null | 'calendar' | 'clock' | 'day' | 'bag' | 'trip-summary' | 'storage';
  selected: string | null;
  hintSpot: string | null;
  toastText: string | null;
  eggReveal: boolean;
  mapUnlockPulse: boolean;
  bagPulse: boolean;
};

/** Per-run fields that a replay wipes. Permanent unlocks are not in this list. */
export const REPLAY_RESET_FIELDS = [
  'evidence',
  'bag',
  'solved',
  'deduced',
  'reward',
  'poster',
  'caseDone',
  'difficulty',
  'page',
  'slot',
  'hints',
  'hintTier',
  'hintGoal',
  'cross',
  'jig',
  'slide',
  'snap',
  'picks',
  'proof',
  'marks',
  'talk',
  'talkSlug',
  'overlay',
  'selected',
  'hintSpot',
  'toastText',
  'eggReveal',
  'mapUnlockPulse',
  'bagPulse',
] as const;

/** Permanent progress kept across a replay (not a full restart). */
export const REPLAY_KEEP_FIELDS = ['cleared', 'played', 'seen', 'levels'] as const;

export type PuzzleBlanks = { cross: CrossState; jig: JigState; slide: SlideState };

export function freshEventRun(blanks: PuzzleBlanks): Omit<EventRunState, 'cleared' | 'played' | 'seen' | 'levels'> {
  return {
    evidence: [],
    bag: [],
    solved: false,
    deduced: false,
    reward: false,
    poster: false,
    caseDone: false,
    difficulty: 'ปานกลาง',
    page: 0,
    slot: 'now',
    hints: 0,
    hintTier: 0,
    hintGoal: -1,
    cross: blanks.cross,
    jig: blanks.jig,
    slide: blanks.slide,
    snap: null,
    picks: [null, null, null],
    proof: [null, null, null],
    marks: [0, 0, 0],
    talk: null,
    talkSlug: null,
    overlay: null,
    selected: null,
    hintSpot: null,
    toastText: null,
    eggReveal: false,
    mapUnlockPulse: false,
    bagPulse: false,
  };
}

/**
 * Replay of a case: wipe this-run state, keep unlocks and scores, and remember
 * that the case was cleared so skip-intro and the "solved" badge still work.
 */
export function replayEventRun(current: EventRunState, blanks: PuzzleBlanks): EventRunState {
  return {
    ...freshEventRun(blanks),
    cleared: current.cleared || current.caseDone,
    played: [...current.played],
    seen: [...current.seen],
    levels: {
      cross: [...current.levels.cross],
      jig: [...current.levels.jig],
      slide: [...current.levels.slide],
    },
  };
}
