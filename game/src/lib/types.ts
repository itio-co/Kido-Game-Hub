import type { EntityKind } from './catalog';

export type Vec3 = [number, number, number];

export type ShadowMode = 'cast' | 'receive' | 'both' | 'none';

export type Identity = {
  id: string;
  kind: EntityKind;
  title: string;
  titleEn?: string;
  slug: string;
};

export type CameraShot = { position: Vec3; target: Vec3; fov: number };

type Placed = { position: Vec3; rotation?: Vec3 };

export type BoxEntity = Identity &
  Placed & {
    kind: 'box';
    size: Vec3;
    color: string;
    shadow?: ShadowMode;
  };

export type FloorEntity = Identity & {
  kind: 'floor';
  position: Vec3;
  size: Vec3;
  colors: string[];
};

export type WindowEntity = Identity &
  Placed & {
    kind: 'window';
    size: [number, number];
    colors: {
      frame: string;
      glass: string;
      curtain: string;
      rod: string;
      sky: string;
      tree: string;
      sun: string;
    };
  };

export type DoorEntity = Identity &
  Placed & {
    kind: 'door';
    size: [number, number];
    colors: { frame: string; slab: string; panel: string; knob: string };
  };

export type BedEntity = Identity &
  Placed & {
    kind: 'bed';
    size: [number, number, number];
    colors: { wood: string; sheet: string; pillow: string; quilt: string[] };
  };

export type NightstandEntity = Identity &
  Placed & {
    kind: 'nightstand';
    size: [number, number, number];
    colors: { wood: string; top: string; knob: string };
  };

export type DeskEntity = Identity &
  Placed & {
    kind: 'desk';
    size: [number, number, number];
    colors: { top: string; leg: string; bezel: string; screen: string; key: string };
  };

export type BookEntity = Identity & {
  kind: 'book';
  color: string;
  width: number;
  height: number;
  depth: number;
  tilt?: number;
  pose?: 'upright' | 'flat';
  stackOn?: string;
};

export type ShelfRowEntity = Identity & {
  kind: 'shelf-row';
  y: number;
  gapEnd?: number;
  books: BookEntity[];
};

export type BookshelfEntity = Identity &
  Placed & {
    kind: 'bookshelf';
    size: [number, number, number];
    color: string;
    rows: ShelfRowEntity[];
  };

export type CalendarThemeEntity = Identity & {
  kind: 'calendar-theme';
  paper: string;
  ink: string;
  head: string;
  frame: string;
  art: string;
  unlock: { afterCase: string } | null;
  lockedHint?: string;
};

export type CalendarEntryEntity = Identity & {
  kind: 'calendar-entry';
  date: string;
  icon: string;
  type?: string;
  eventRef?: string;
};

export type CalendarEntity = Identity &
  Placed & {
    kind: 'calendar';
    size: [number, number];
    colors: { paper: string; head: string; ink: string };
    purpose: 'upcoming';
    theme: string;
    themeSwitch: boolean;
    month: string;
    monthLabel: string;
    today: string;
    entries: CalendarEntryEntity[];
    themes: CalendarThemeEntity[];
  };

export type RugEntity = Identity & {
  kind: 'rug';
  position: Vec3;
  size: [number, number];
  colors: { edge: string; fill: string; patches: string[] };
};

export type PlantEntity = Identity &
  Placed & {
    kind: 'plant';
    colors: { pot: string; soil: string; leaf: string };
  };

export type LampEntity = Identity &
  Placed & {
    kind: 'lamp';
    colors: { wood: string; shade: string };
  };

export type SceneObject =
  | BoxEntity
  | FloorEntity
  | WindowEntity
  | DoorEntity
  | BedEntity
  | NightstandEntity
  | DeskEntity
  | BookshelfEntity
  | CalendarEntity
  | RugEntity
  | PlantEntity
  | LampEntity;

export type Buildable = SceneObject | ShelfRowEntity | BookEntity;

export type HotspotAction = 'event-select' | 'practice' | 'calendar' | 'case-board';

export type HitBox = { position: Vec3; size: Vec3 };

export type HotspotEntity = Identity & {
  kind: 'hotspot';
  action: HotspotAction;
  targetId: string;
  anchor: Vec3;
  hit: HitBox;
};

export type DecorSlotEntity = Identity & {
  kind: 'decor-slot';
  action: 'decor';
  targetId: string;
  emptyHint: string;
  anchor: Vec3;
  hit: HitBox;
};

export type PlayerRoom = Identity & {
  kind: 'room';
  camera: CameraShot;
  shots?: Record<string, CameraShot>;
  lighting: {
    ambient: { color: string; intensity: number };
    hemisphere: { sky: string; ground: string; intensity: number };
    sun: { color: string; intensity: number; position: Vec3 };
    fill: { color: string; intensity: number; position: Vec3 };
  };
  background: string;
  objects: SceneObject[];
  hotspots: Array<HotspotEntity | DecorSlotEntity>;
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
