import type { Identity } from '../types';

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
  | 'level-map';

export type FlowAction =
  | { type: 'go'; screen: ScreenId }
  | { type: 'toast'; text: string }
  | { type: 'evidence'; evidence: string; who: string; text: string }
  | { type: 'dialogue'; dialogue: string }
  | { type: 'lines'; who: string; lines: string[] }
  | { type: 'clock' }
  | { type: 'calendar' }
  | { type: 'minigame'; screen: 'crossword' | 'jigsaw' | 'slide' }
  | { type: 'box-lock' }
  | { type: 'home' };

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
};

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
  unlockBy: string | null;
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
  game: 'cross' | 'jig' | 'slide' | 'ex';
  icon: string;
  group: 'คำ' | 'ภาพ' | 'ตรรกะ';
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
};

export type CaseFlow = Identity & {
  kind: 'story-flow';
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

export type { FlowProgress } from '../types';
