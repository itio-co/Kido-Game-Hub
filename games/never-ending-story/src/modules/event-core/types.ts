import type { Identity } from '../../lib/types';
import type { FaceMask } from './bubbleLayout';

export type ScreenStatus = 'demo' | 'real';

export type ScreenId =
  | 'player-room'
  | 'event-select'
  | 'cutscene'
  | 'difficulty'
  | 'house-map'
  | 'living-room'
  | 'study'
  | 'kitchen'
  | 'kitchen-close'
  | 'table'
  | 'tray'
  | 'grandma'
  | 'uncle'
  | 'star-box'
  | 'crossword'
  | 'jigsaw'
  | 'slide'
  | 'notebook'
  | 'case-board'
  | 'album'
  | 'practice'
  | 'level-map'
  | 'ending-comic';

export type FlowAction =
  | { type: 'go'; screen: ScreenId }
  | { type: 'toast'; text: string }
  /** Locked room: a short message in the bottom message area. */
  | { type: 'locked'; text: string }
  /** Switch the house map to another floor (stairs). */
  | { type: 'floor'; floor: 1 | 2 }
  | { type: 'evidence'; evidence: string; who: string; text: string }
  | { type: 'dialogue'; dialogue: string }
  | { type: 'lines'; who: string; lines: string[]; evidence?: string }
  | { type: 'inspect-note'; evidence?: string; front: string; back?: string }
  | { type: 'clock' }
  | { type: 'calendar' }
  | { type: 'minigame'; screen: 'crossword' | 'jigsaw' | 'slide' }
  | { type: 'box-lock' }
  | { type: 'home' }
  | { type: 'take-poster' }
  | { type: 'show-photo' }
  | { type: 'ending-comic' }
  | { type: 'egg-fan' };

export type ScreenDef = Identity & {
  kind: 'screen';
  screen: ScreenId | 'return-home';
  status: ScreenStatus;
};

export type ScreenRegistry = Identity & {
  kind: 'screen-registry';
  screens: ScreenDef[];
};

export type SpotWhen = 'always' | 'now' | 'afternoon' | 'yesterday';

export type FlowSpot = Identity & {
  kind: 'hotspot';
  x: number;
  y: number;
  when: SpotWhen;
  action: FlowAction;
  doneEvidence?: string | null;
  /** On a multi-floor map: the floor this spot sits on. */
  floor?: 1 | 2;
};

/** One floor of a multi-floor house map. */
export type MapFloor = { floor: 1 | 2; title: string; image: string; hud?: string };

export type FlowScene = Identity & {
  kind: 'scene';
  screen: ScreenId;
  image: string;
  images?: Record<string, string>;
  contain?: boolean;
  map?: boolean;
  hud: string;
  timed?: boolean;
  enter?: string;
  enterWhenSolved?: string;
  /** House map floors; spots with a `floor` show only on that floor. */
  floors?: MapFloor[];
  spots: FlowSpot[];
};

export type FlowEvent = Identity & {
  kind: 'event';
  eventId: string;
  subtitle: string;
  cover: string;
  unlockAfter: string | null;
  lockedHint: string | null;
};

export type SpeechLine = Identity & {
  kind: 'speech-line';
  who: string;
  text: string;
  x: number;
  y: number;
  w: number;
};

export type CutscenePage = Identity & {
  kind: 'cutscene-page';
  eventId: string;
  image: string;
  caption: string;
  lines: SpeechLine[];
  /** Face/head masks in % of the source art. Used at runtime to keep bubbles off faces. */
  faces?: FaceMask[];
};

export type EvidenceItem = Identity & {
  kind: 'evidence';
  code: string;
  text: string;
};

export type TimeSlot = Identity & {
  kind: 'time-slot';
  slot: 'yesterday' | 'afternoon' | 'now';
  part: 'day' | 'hour';
  image: string;
  unlockBy: string | string[] | null;
  hint: string | null;
};

export type Choice = Identity & {
  kind: 'choice';
  value?: string;
  image?: string;
  next?: string;
  action?: FlowAction;
};

export type Dialogue = Identity & {
  kind: 'dialogue';
  who: string;
  text: string;
  choices: Choice[];
};

export type PracticeGame = Identity & {
  kind: 'practice-game';
  game: 'cross' | 'jig' | 'slide' | 'ex' | 'stirfry' | 'piano' | 'typing' | 'fan' | 'photobox';
  route?: string;
  icon: string;
  group: 'คำ' | 'ภาพ' | 'ตรรกะ' | 'ฝีมือ';
  caseNo: string;
  future: boolean;
};

export type Question = Identity & {
  kind: 'question';
  prompt: string;
  right: string;
  evidence: string[];
  hint: string;
  mode: 'portrait' | 'chips' | 'map';
  answers: Choice[];
};

export type Goal = Identity & {
  kind: 'goal';
  code: 'table' | 'tray' | 'mek' | 'deduce' | 'box' | 'home';
  room: string;
  at: ScreenId | null;
  object: string;
};

export type MiniGame = Identity & {
  kind: 'minigame';
  game: 'crossword' | 'jigsaw' | 'slide';
  hud: string;
  /** Evidence code granted by winning this jigsaw. While it is missing, the house-map button stays hidden. */
  unlocksHouseMap?: string;
};

export type CaseFlow = Identity & {
  kind: 'story-flow';
  /** When false or omitted, day-rewind via the calendar stays locked. */
  calendarTravel?: boolean;
  events: FlowEvent[];
  pages: CutscenePage[];
  evidence: EvidenceItem[];
  slots: TimeSlot[];
  scenes: FlowScene[];
  dialogues: Dialogue[];
  games: MiniGame[];
  practice: PracticeGame[];
  questions: Question[];
  goals: Goal[];
  difficulties: string[];
};

export type PuzzleKey = 'cross' | 'jig' | 'slide';

export type { FlowProgress } from '../../lib/types';
