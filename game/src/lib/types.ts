export type Vec3 = [number, number, number];

export type ShadowMode = 'cast' | 'receive' | 'both' | 'none';

export type HotspotAction = 'event-select' | 'practice' | 'calendar' | 'case-board' | 'decor';

export type BoxObject = {
  id: string;
  kind: 'box';
  position: Vec3;
  size: Vec3;
  rotation?: Vec3;
  color: string;
  shadow?: ShadowMode;
};

export type FloorObject = {
  id: string;
  kind: 'floor';
  position: Vec3;
  size: Vec3;
  colors: string[];
};

export type WindowObject = {
  id: string;
  kind: 'window';
  position: Vec3;
  rotation?: Vec3;
  size: [number, number];
  colors: {
    frame: string;
    glass: string;
    curtain: string;
    rod: string;
    sill: string;
    sun: string;
  };
};

export type DoorObject = {
  id: string;
  kind: 'door';
  position: Vec3;
  rotation?: Vec3;
  size: [number, number];
  colors: { frame: string; slab: string; panel: string; knob: string };
};

export type BedObject = {
  id: string;
  kind: 'bed';
  position: Vec3;
  rotation?: Vec3;
  size: [number, number, number];
  colors: { frame: string; head: string; sheet: string; blanket: string; pillow: string };
};

export type DeskObject = {
  id: string;
  kind: 'desk';
  position: Vec3;
  rotation?: Vec3;
  size: [number, number, number];
  colors: { top: string; leg: string; bezel: string; screen: string; key: string };
};

export type BookSpec = { color: string; h: number };

export type ShelfObject = {
  id: string;
  kind: 'shelf';
  position: Vec3;
  rotation?: Vec3;
  size: [number, number, number];
  color: string;
  books: BookSpec[];
};

export type CalendarMesh = {
  id: string;
  kind: 'calendar';
  position: Vec3;
  rotation?: Vec3;
  size: [number, number];
  colors: { paper: string; head: string; ink: string };
};

export type BoardObject = {
  id: string;
  kind: 'board';
  position: Vec3;
  rotation?: Vec3;
  size: [number, number];
  colors: { cork: string; frame: string; note: string; photoA: string; photoB: string };
};

export type RugObject = {
  id: string;
  kind: 'rug';
  position: Vec3;
  size: [number, number];
  colors: { edge: string; fill: string };
};

export type PlantObject = {
  id: string;
  kind: 'plant';
  position: Vec3;
  colors: { pot: string; soil: string; leaf: string };
};

export type LampObject = {
  id: string;
  kind: 'lamp';
  position: Vec3;
  colors: { base: string; pole: string; shade: string };
};

export type PosterObject = {
  id: string;
  kind: 'poster';
  position: Vec3;
  rotation?: Vec3;
  size: [number, number];
  colors: { paper: string; star: string };
};

export type BallObject = {
  id: string;
  kind: 'ball';
  position: Vec3;
  radius: number;
  color: string;
};

export type RoomObject =
  | BoxObject
  | FloorObject
  | WindowObject
  | DoorObject
  | BedObject
  | DeskObject
  | ShelfObject
  | CalendarMesh
  | BoardObject
  | RugObject
  | PlantObject
  | LampObject
  | PosterObject
  | BallObject;

export type Hotspot = {
  id: string;
  label: string;
  action: HotspotAction;
  slotId?: string;
  emptyHint?: string;
  anchor: Vec3;
  hit: { position: Vec3; size: Vec3 };
};

export type CalendarTheme = {
  id: string;
  name: string;
  paper: string;
  ink: string;
  head: string;
  frame: string;
  art: string;
  unlock: { afterCase: string } | null;
  lockedHint?: string;
};

export type CalendarEntry = {
  date: string;
  icon: string;
  label: string;
  type?: string;
  eventRef?: string;
};

export type PlayerRoom = {
  id: string;
  name: string;
  camera: { position: Vec3; target: Vec3; fov: number };
  lighting: {
    ambient: { color: string; intensity: number };
    hemisphere: { sky: string; ground: string; intensity: number };
    sun: { color: string; intensity: number; position: Vec3 };
    fill: { color: string; intensity: number; position: Vec3 };
  };
  objects: RoomObject[];
  hotspots: Hotspot[];
  calendar: {
    purpose: 'upcoming';
    theme: string;
    themeSwitch: boolean;
    title: string;
    month: string;
    monthLabel: string;
    today: string;
    entries: CalendarEntry[];
    themes: CalendarTheme[];
  };
  hud: {
    backLabel: string;
    caseLabel: string;
    hintLabel: string;
    settingsLabel: string;
    hereToast: string;
    hintTarget: string;
    hintLines: [string, string];
  };
  onboarding: { title: string; body: string }[];
  screens: {
    eventSelect: { title: string; body: string; cardTitle: string; cardBody: string };
    practice: { title: string; body: string };
    caseBoard: { title: string; body: string };
  };
};

export type TextSize = 'sm' | 'md' | 'lg';

/** Player perception and preferences. Kept apart from shared case facts. */
export type PlayerProfile = {
  onboardingComplete: boolean;
  textSize: TextSize;
  soundEnabled: boolean;
  calendarTheme: string | null;
  decor: Record<string, string | null>;
};

/** What this player has learned. Not the case's objective facts. */
export type PlayerKnowledge = {
  evidence: string[];
  solvedCaseIds: string[];
  exploreHints: number;
};

/** Objective case facts. Empty on the hub; filled in later by story packs. */
export type CaseState = {
  facts: Record<string, boolean>;
};

export type SaveV1 = {
  version: 1;
  player: PlayerProfile;
  knowledge: PlayerKnowledge;
  caseState: CaseState;
};
