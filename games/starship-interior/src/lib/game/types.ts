export type BuiltinId =
	| 'bunk'
	| 'crewpod'
	| 'galley'
	| 'table'
	| 'workstation'
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
	| 'couchrow4';
/** built-in equipment or a user design from the Equipment Designer (`custom:…`) */
export type ModuleId = BuiltinId | `custom:${string}`;

export type Phase = 'surface' | 'launch';

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
}

export interface PlacedModule {
	uid: number;
	type: ModuleId;
	x: number;
	z: number;
	/** yaw in degrees (Three.js rotation.y) */
	angle: number;
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
	decks: SaveDeck[];
	shafts: Omit<Shaft, 'uid'>[];
	equipment?: unknown[];
}

export interface LayoutData {
	decks: SaveDeck[];
	shafts: Omit<Shaft, 'uid'>[];
}
