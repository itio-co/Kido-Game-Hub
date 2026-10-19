export type BuiltinId =
	| 'bunk'
	| 'crewpod'
	| 'galley'
	| 'table'
	| 'workstation'
	| 'workstation2'
	| 'locker'
	| 'hydroponics'
	| 'hygiene'
	| 'treadmill'
	| 'eclss'
	| 'partition'
	| 'hatch'
	| 'couch'
	| 'pilotcouch'
	| 'couchrow3'
	| 'couchrow4'
	| 'handrail'
	| 'footrestraint'
	| 'sleepingbag'
	| 'zerogtoilet'
	| 'ared'
	| 'foodwarmer'
	| 'waterdispenser'
	| 'fridge'
	| 'pantry'
	| 'prepcounter'
	| 'trash'
	| 'foodstation'
	| 'galleytable'
	| 'chair';
/** built-in equipment or a user design from the Equipment Designer (`custom:…`) */
export type ModuleId = BuiltinId | `custom:${string}`;

export type Phase = 'surface' | 'launch';
/** mission phase: Launch → Cruise (micro-g) → Landing → Surface. Launch/Landing use the couch geometry. */
export type Mission = 'launch' | 'cruise' | 'landing' | 'surface';
/** where an item can be mounted: deck floor (default), hull wall, under the ceiling, or any */
export type Mount = 'floor' | 'wall' | 'ceiling' | 'any';

export interface ModuleDef {
	id: ModuleId;
	name: string;
	icon: string;
	/** 'rect' uses w (local X) × d (local Z) in metres; 'circle' uses r */
	shape: 'rect' | 'circle';
	w: number;
	d: number;
	r?: number;
	/** height in metres; must fit the deck's clear height */
	height: number;
	/** spans floor-to-ceiling whatever the deck height (partition, ladder) */
	fullHeight?: boolean;
	/** player can stand on it in walk mode */
	walkable?: boolean;
	/** depth of the front access zone on the local +Z side (0 = none) */
	access: number;
	/** estimated mass, kg (ASSUMPTION) */
	mass: number;
	/** electrical load, W (ASSUMPTION) */
	power: number;
	cost: number;
	description: string;
	source?: string;
	/** footprint/height in the Launch/Landing phase if different (deployed couch, stowed table…) */
	launch?: { w: number; d: number; height: number };
	/** couch seats provided */
	seats?: number;
	/** folds away for launch/landing (shown stowed in that phase) */
	stowable?: boolean;
	category?: string;
	/** values are design estimates (ESTIMATE badge) */
	estimate?: boolean;
	/** data-driven model (custom equipment from the Equipment Designer) */
	parts?: import('./equipment').EquipPart[];
	/** phase in which parts use their stowed pose ('launch' for tables, 'surface' for couches) */
	stowPhase?: Phase;
	custom?: boolean;
	/** crew-sim affordances (what the crew can do with it) */
	affords?: import('./affordances').Affordance[];
	/** mounting options (default 'floor') */
	mount?: Mount;
	/** micro-g restraint (handrail / foot restraint): enables 'restraint' affordances within 1.5 m */
	restraint?: boolean;
	/** keep-out zone in front (door swing / fold-down): depth m, width m (default = item width) */
	keepout?: { d: number; w?: number; label?: string };
	/** group equipment (tables): capacity = seat objects (chairs; foot restraints in micro-g) placed at its edge */
	group?: boolean;
	/** a seat object that can join a group table */
	seat?: boolean;
	/** concurrent users (overrides the slot count; custom equipment) */
	capacity?: number;
	/** food storage, crew-days of meals it holds (ESTIMATE) */
	foodDays?: number;
	/** works in micro-g without extra restraints (built-in clips / foot rails) – informational */
	microNote?: string;
	/** life-cycle overrides (service life, MTBF, maintenance interval, repair time, spares) */
	life?: Partial<import('$lib/sim/lifecycle').LifeSpec>;
	/** noisy: crew within r metres get a Comfort debuff while it runs (always = even when idle) */
	noise?: { r: number; always?: boolean };
}

export interface PlacedModule {
	uid: number;
	type: ModuleId;
	x: number;
	z: number;
	/** yaw in degrees (Three.js rotation.y) */
	angle: number;
	/** base elevation above the deck floor (wall / ceiling mounts), metres */
	y?: number;
	/** mounted on the hull wall or under the ceiling (default: floor) */
	mount?: 'wall' | 'ceiling';
}

/**
 * Ladder connection between two ADJACENT decks: a ladder standing on deck `from` rising to a hatch
 * opening in deck `to` = from + 1, at the same XY/rotation. Reserves the ladder + climbing zone on the
 * lower deck and the opening + guard rail + access zone on the upper deck.
 */
export interface Shaft {
	uid: number;
	x: number;
	z: number;
	angle: number;
	from: number;
	to: number;
}

export interface Deck {
	id: number;
	height: number;
	modules: PlacedModule[];
	/** habitat mode: which hull section the deck sits in (cabin mode: always 'crew') */
	section: 'lox' | 'ch4' | 'crew';
}

export type Tool = 'select' | 'module' | 'measure' | 'camera';
export type Mode = 'build' | 'walk';
export type Quality = 'high' | 'low';

export interface SaveDeck {
	height: number;
	modules: Omit<PlacedModule, 'uid'>[];
	section?: 'lox' | 'ch4' | 'crew';
}
export interface SaveData {
	version: 5;
	specs: { innerRadius: number; volumeLimit: number; slab: number };
	shipMode: 'cabin' | 'habitat';
	habitat: unknown;
	crew: number;
	phase: Phase;
	mission?: Mission;
	decks: SaveDeck[];
	shafts: Omit<Shaft, 'uid'>[];
	equipment?: unknown[];
	/** crew-sim roster and settings (optional) */
	crewSim?: unknown;
}

export interface LayoutData {
	decks: SaveDeck[];
	shafts: Omit<Shaft, 'uid'>[];
}
