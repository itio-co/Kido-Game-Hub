import type { LayoutData, ModuleDef, ModuleId } from './types';
import { BUILTIN_AFFORDANCES } from './affordances';

/**
 * Equipment catalog. Sizes are true-to-scale estimates in metres; mass and power are
 * ASSUMPTIONS for planning only. Front of every module = local +Z (access zone side).
 */
export const CATALOG: ModuleDef[] = [
	{
		id: 'bunk', name: 'Sleep Bunk', icon: '🛏️', shape: 'rect', w: 2.0, d: 0.9, height: 1.2,
		access: 0.75, mass: 45, power: 15, cost: 2500,
		description: 'Single bunk with mattress, reading light and curtain frame.'
	},
	{
		id: 'crewpod', keepout: { d: 0.75, label: 'door swing' }, name: 'Crew Quarters Pod', icon: '🚪', shape: 'rect', w: 1.0, d: 1.0, height: 2.1,
		access: 0.9, mass: 250, power: 80, cost: 40000,
		description: 'Private enclosed quarters, 2.1 m³ like the ISS CQ.',
		source: 'ISS CQ 2.1 m³ – NASA NTRS 20130011142'
	},
	{
		id: 'galley', name: 'Galley Counter (combined)', icon: '🍳', shape: 'rect', w: 1.8, d: 0.65, height: 2.0,
		access: 0.9, mass: 180, power: 1500, cost: 18000,
		description: 'Counter (0.95 m), food warmer, water dispenser, upper cabinets.'
	},
	{
		id: 'table', name: 'Table + 4 Seats', icon: '🍽️', shape: 'rect', w: 1.2, d: 1.8, height: 0.95,
		access: 0.6, mass: 60, power: 0, cost: 3000, stowable: true, launch: { w: 1.2, d: 0.5, height: 0.95 },
		description: 'Mess table 1.2 × 0.8 m with two benches. Folds flat against a rail for launch/landing (ESTIMATE).'
	},
	{
		id: 'workstation', name: 'Workstation', icon: '🖥️', shape: 'rect', w: 1.4, d: 0.9, height: 1.4,
		access: 0.6, mass: 70, power: 300, cost: 12000,
		description: 'Desk with two displays and a chair.'
	},
	{
		id: 'workstation2', name: 'Dual Workstation', icon: '🖥️', shape: 'rect', w: 2.4, d: 0.9, height: 1.4,
		access: 0.6, mass: 120, power: 550, cost: 22000, estimate: true,
		description: 'Two-seat console desk (shared work area), 2 × two displays.'
	},
	{
		id: 'locker', keepout: { d: 0.6, label: 'door swing' }, name: 'Storage Locker', icon: '🗄️', shape: 'rect', w: 0.6, d: 0.6, height: 2.0,
		access: 0.75, mass: 40, power: 0, cost: 1500,
		description: 'Tall two-door stowage locker.'
	},
	{
		id: 'hydroponics', name: 'Hydroponics Rack', icon: '🌱', shape: 'rect', w: 1.2, d: 0.6, height: 2.0,
		access: 0.75, mass: 120, power: 450, cost: 15000,
		description: 'Four shelves with LED grow lights.'
	},
	{
		id: 'hygiene', keepout: { d: 0.75, label: 'door swing' }, name: 'Hygiene / Toilet', icon: '🚽', shape: 'rect', w: 1.0, d: 1.0, height: 2.1,
		access: 0.9, mass: 200, power: 250, cost: 60000,
		description: 'Enclosed toilet and hygiene station.'
	},
	{
		id: 'treadmill', name: 'Exercise Treadmill', icon: '🏃', shape: 'rect', w: 2.0, d: 0.9, height: 1.4,
		access: 0.6, mass: 300, power: 600, cost: 25000,
		stowable: true, launch: { w: 2.0, d: 0.9, height: 0.45 },
		description: 'Treadmill with handrails and harness posts.'
	},
	{
		id: 'eclss', name: 'Life Support (ECLSS) Rack', icon: '🫁', shape: 'rect', w: 1.05, d: 0.9, height: 2.0,
		access: 0.9, mass: 600, power: 1500, cost: 250000,
		description: 'Air revitalization / water processing rack (ISS-rack-sized envelope).'
	},
	{
		id: 'partition', name: 'Partition Wall', icon: '🧱', shape: 'rect', w: 1.5, d: 0.08, height: 0,
		fullHeight: true, access: 0, mass: 25, power: 0, cost: 800,
		description: 'Floor-to-ceiling panel for rooms.'
	},
	// ---- crew launch/landing seating: OUR DESIGN (no public crewed-Starship seat data) ----
	// Semi-supine +Gx couch: thrust/landing load is along the ship axis = perpendicular to the decks,
	// so the crew lie back-down on the deck (torso ~horizontal, hips and knees ~90°). Analogs: Soyuz
	// Kazbek couch with custom liner, Crew Dragon seats; NASA-STD-3001 Vol 2 §6.5 (acceleration).
	// Front/access (+Z) = foot end. Surface/cruise dims = folded; launch dims = deployed.
	{
		id: 'couch', name: 'Launch Couch', icon: '💺', shape: 'rect', w: 0.8, d: 0.6, height: 0.5,
		launch: { w: 0.8, d: 2.0, height: 1.0 }, seats: 1, access: 0.6, mass: 55, power: 10, cost: 60000,
		category: 'Crew seating', estimate: true,
		description: 'Semi-supine +Gx couch with custom liner, 5-point harness and stroking attenuators. Folds to 0.6 × 0.8 × 0.5 m.'
	},
	{
		id: 'pilotcouch', name: 'Pilot Couch', icon: '🧑‍✈️', shape: 'rect', w: 0.9, d: 0.6, height: 0.5,
		launch: { w: 0.9, d: 2.0, height: 1.35 }, seats: 1, access: 0.6, mass: 75, power: 120, cost: 120000,
		category: 'Crew seating', estimate: true,
		description: 'Flight-crew couch: launch couch + armrest controls and swing-in display arm.'
	},
	{
		id: 'couchrow3', name: 'Couch Row ×3', icon: '💺', shape: 'rect', w: 2.4, d: 0.6, height: 0.5,
		launch: { w: 2.4, d: 2.0, height: 1.0 }, seats: 3, access: 0.6, mass: 150, power: 30, cost: 170000,
		category: 'Crew seating', estimate: true,
		description: 'Three couches on one stroking pallet (0.8 m pitch).'
	},
	{
		id: 'couchrow4', name: 'Couch Row ×4', icon: '💺', shape: 'rect', w: 3.2, d: 0.6, height: 0.5,
		launch: { w: 3.2, d: 2.0, height: 1.0 }, seats: 4, access: 0.6, mass: 195, power: 40, cost: 220000,
		category: 'Crew seating', estimate: true,
		description: 'Four couches on one stroking pallet (0.8 m pitch).'
	},
	// ---- micro-g (cruise) outfitting: ESTIMATE sizes based on ISS hardware ----
	{
		id: 'handrail', name: 'Handrail', icon: '➖', shape: 'rect', w: 0.8, d: 0.1, height: 0.1,
		access: 0, mass: 1.5, power: 0, cost: 300, mount: 'any', restraint: true, category: 'Micro-g', estimate: true,
		description: 'ISS-style handrail segment (0.8 m). Mount on the floor, hull wall or ceiling. Crew push off and grab here; enables restraint-dependent use within 1.5 m.',
		source: 'ISS handrails – NASA SSP 50005'
	},
	{
		id: 'footrestraint', name: 'Foot Restraint', icon: '🦶', shape: 'rect', w: 0.5, d: 0.35, height: 0.08,
		walkable: true, access: 0, mass: 2, power: 0, cost: 400, mount: 'any', restraint: true, category: 'Micro-g', estimate: true,
		description: 'Foot-loop restraint plate: crew hook their feet to work, eat or exercise in micro-g.'
	},
	{
		id: 'sleepingbag', name: 'Sleeping Bag (wall)', icon: '🛌', shape: 'rect', w: 0.8, d: 0.2, height: 2.0,
		access: 0.6, mass: 6, power: 0, cost: 1500, mount: 'wall', category: 'Micro-g', estimate: true,
		description: 'Wall-mounted sleeping bag 2.0 × 0.8 × 0.2 m with restraint straps. Usable in cruise only.'
	},
	{
		id: 'zerogtoilet', name: 'Zero-g Toilet', icon: '🌀', shape: 'rect', w: 0.9, d: 0.8, height: 2.0,
		access: 0.9, mass: 220, power: 400, cost: 23000000, category: 'Micro-g', estimate: true,
		description: 'Air-flow toilet (UWMS-like) in a rack enclosure with thigh bars, urine funnel hose and privacy curtain. Works in micro-g and gravity.',
		source: 'NASA UWMS (2020)'
	},
	{
		id: 'ared', name: 'Resistive Exercise (ARED-style)', icon: '🏋️', shape: 'rect', w: 1.6, d: 1.0, height: 1.9,
		access: 0.8, mass: 320, power: 50, cost: 1500000, category: 'Micro-g', estimate: true,
		description: 'Vacuum-cylinder resistive exercise device with lift bar and foot platform. Works in micro-g and gravity.',
		source: 'ISS ARED'
	},
	// ---- galley set (true-to-scale procedural; ISS galley analogs where public, otherwise ESTIMATE) ----
	{
		id: 'foodwarmer', name: 'Food Warmer / Convection Oven', icon: '♨️', shape: 'rect', w: 0.6, d: 0.55, height: 1.5,
		access: 0.8, mass: 38, power: 650, cost: 45000, category: 'Galley', estimate: true,
		description: 'Pedestal cabinet with a convection food warmer at counter height (heats pouches and cans; holds food trays with clips). Micro-g: pouches held by clips, needs a foot restraint for the cook.',
		source: 'ISS Galley Food Warmer (~0.5 × 0.4 × 0.3 m, ~120 W) as analog; oven power ESTIMATE'
	},
	{
		id: 'waterdispenser', name: 'Water Dispenser (hot / ambient)', icon: '🚰', shape: 'rect', w: 0.45, d: 0.4, height: 1.5,
		access: 0.7, mass: 30, power: 420, cost: 60000, category: 'Galley', estimate: true,
		description: 'Potable water dispenser: needle port rehydrates sealed food and drink bags with hot (~75 °C) or ambient water, metered in 30 ml steps. Works in micro-g (sealed bags).',
		source: 'ISS Potable Water Dispenser (PWD) – NASA; size/power ESTIMATE'
	},
	{
		id: 'fridge', keepout: { d: 0.6, label: 'door swing' }, name: 'Galley Refrigerator / Freezer', icon: '🧊', shape: 'rect', w: 0.6, d: 0.65, height: 1.8,
		access: 0.8, mass: 95, power: 250, cost: 80000, foodDays: 20, category: 'Galley', estimate: true,
		description: 'Fridge (top) and freezer (bottom) for fresh food and drinks; ~20 crew-days of fresh items. Latched doors and nets keep items in place in micro-g.',
		source: 'ISS Galley refrigerator / MELFI analogs; ESTIMATE'
	},
	{
		id: 'pantry', keepout: { d: 0.55, label: 'locker doors' }, name: 'Food Storage Lockers (pantry)', icon: '🥫', shape: 'rect', w: 1.2, d: 0.6, height: 2.0,
		access: 0.8, mass: 85, power: 0, cost: 6000, foodDays: 150, category: 'Galley', estimate: true,
		description: 'Bulk pantry: 8 soft-goods bays of ISS-style food containers; ~150 crew-days (≈1.8 kg / 0.005 m³ packaged food per crew-day).',
		source: 'ISS food system ~1.8 kg/crew-day incl. packaging (NASA); volume ESTIMATE'
	},
	{
		id: 'prepcounter', name: 'Prep Counter (restraint clips)', icon: '🔪', shape: 'rect', w: 1.2, d: 0.65, height: 0.95,
		access: 0.8, mass: 55, power: 0, cost: 5000, restraint: true, category: 'Galley', estimate: true,
		description: 'Work counter with spring clips, Velcro and bungee cords holding pouches, trays and utensils, integrated foot-restraint rail – usable in micro-g and gravity.'
	},
	{
		id: 'trash', name: 'Trash Compactor / Waste Station', icon: '🗑️', shape: 'rect', w: 0.5, d: 0.55, height: 1.0,
		access: 0.7, mass: 60, power: 300, cost: 30000, category: 'Galley', estimate: true,
		description: 'Packaging waste bags with a heat-melt compactor (dries and tiles trash). Wet-trash bags sealed for micro-g.',
		source: 'NASA Heat Melt Compactor (HMC) analog; ESTIMATE'
	},
	{
		id: 'foodstation', name: 'Zero-g Food Station', icon: '🥄', shape: 'rect', w: 1.0, d: 0.7, height: 1.05,
		access: 0.6, mass: 40, power: 0, cost: 4000, restraint: true, group: true, category: 'Galley', estimate: true,
		description: 'Standing-height galley table with tray clips / Velcro pads and integrated foot-restraint rails: 2 built-in standing places, more with chairs or foot restraints at its edge.'
	},
	{
		id: 'galleytable', name: 'Galley Table (group)', icon: '🍽️', shape: 'rect', w: 1.2, d: 0.8, height: 0.74,
		access: 0, mass: 35, power: 0, cost: 2500, group: true, category: 'Galley', estimate: true,
		description: 'Mess / meeting table. Capacity = chairs placed at its edges (in micro-g also foot restraints). Use "Add seats" to auto-place chairs.'
	},
	{
		id: 'chair', name: 'Chair (seat)', icon: '🪑', shape: 'rect', w: 0.45, d: 0.45, height: 0.85,
		access: 0, mass: 6, power: 0, cost: 900, seat: true, category: 'Galley', estimate: true,
		description: 'Lightweight chair with lap belt and floor-lock pins; snaps to table sides facing the table (Alt to place freely). Belongs to the nearest table it faces.'
	},
	{
		id: 'hatch', name: 'Ladder + Hatch (deck link)', icon: '🪜', shape: 'circle', w: 1.1, d: 1.1, r: 0.55,
		height: 0, fullHeight: true, walkable: true, access: 0, mass: 40, power: 20, cost: 9000,
		description: 'Ladder on this deck rising to a 0.8 m hatch opening (with guard rail) in the deck above, always aligned. Snaps to the ladder below/above.',
		source: '800 mm passageway – IDSS'
	}
];

for (const m of CATALOG) if (BUILTIN_AFFORDANCES[m.id]) m.affords = BUILTIN_AFFORDANCES[m.id];

const BUILTIN_BY_ID = Object.fromEntries(CATALOG.map((m) => [m.id, m])) as Record<string, ModuleDef>;
/** custom (Equipment Designer) definitions are looked up through this hook (set by the equipment store) */
let customLookup: (id: string) => ModuleDef | undefined = () => undefined;
export function setCustomLookup(fn: (id: string) => ModuleDef | undefined) {
	customLookup = fn;
}
export const isBuiltin = (id: string) => id in BUILTIN_BY_ID;
/** built-in + custom equipment by id (custom entries are reactive through the store) */
export const CATALOG_BY_ID = new Proxy(BUILTIN_BY_ID, {
	get: (t, k: string) => t[k] ?? (k.startsWith('custom:') ? customLookup(k) : undefined),
	has: (t, k: string) => k in t || (typeof k === 'string' && k.startsWith('custom:') && !!customLookup(k))
}) as Record<ModuleId, ModuleDef>;

export function footprintArea(def: ModuleDef): number {
	return def.shape === 'circle' ? Math.PI * (def.r ?? def.w / 2) ** 2 : def.w * def.d;
}

export function sizeLabel(def: ModuleDef, deckHeight?: number): string {
	const h = def.fullHeight ? (deckHeight ?? 0) : def.height;
	const hs = def.fullHeight && deckHeight === undefined ? 'full' : h.toFixed(2);
	return def.shape === 'circle'
		? `Ø${((def.r ?? def.w / 2) * 2).toFixed(2)} × ${hs} m`
		: `${def.w.toFixed(2)} × ${def.d.toFixed(2)} × ${hs} m`;
}

/** Ladder mass per metre (ASSUMPTION) — used for shaft mass in the BOM. */
export const SHAFT_MASS_PER_M = 25;
/** Ladder extends this far above the top deck floor as grab rails. */
export const LADDER_EXTENSION = 1.0;

/** Starter layout: three decks; L1-2 at the centre, L2-3 at a different spot on deck 2 (invalid entries are skipped). */
export function starterLayout(): LayoutData {
	return {
		// L1-2 rises at the centre; L2-3 is elsewhere on deck 2 (walk across deck 2 to it)
		shafts: [
			{ x: 0, z: 0, angle: 0, from: 0, to: 1 },
			{ x: -1.0, z: -1.4, angle: 0, from: 1, to: 2 }
		],
		decks: [
		{
			height: 2.4,
			modules: [
				{ type: 'eclss', x: -2.9, z: -2.4, angle: 50 },
				// compact galley cluster (valid in Surface and Cruise)
				{ type: 'pantry', x: 2.64, z: 3.14, angle: -140 },
				{ type: 'fridge', x: 3.44, z: 2.24, angle: -123 },
				{ type: 'waterdispenser', x: 3.90, z: 1.65, angle: -113 },
				{ type: 'foodwarmer', x: 4.03, z: 1.01, angle: -104 },
				{ type: 'prepcounter', x: 4.07, z: -0.07, angle: -89 },
				{ type: 'trash', x: 4.03, z: -1.01, angle: -76 },
				{ type: 'foodstation', x: 1.87, z: -3.25, angle: -30 },
				{ type: 'galleytable', x: 1.9, z: -1.0, angle: 0 },
				{ type: 'chair', x: 1.6, z: -0.325, angle: 180 },
				{ type: 'chair', x: 2.2, z: -0.325, angle: 180 },
				{ type: 'chair', x: 1.6, z: -1.675, angle: 0 },
				{ type: 'chair', x: 2.2, z: -1.675, angle: 0 },
				{ type: 'footrestraint', x: 3.2, z: 0.0, angle: -90 },
				{ type: 'hygiene', x: -2.7, z: 2.5, angle: 135 },
				{ type: 'hydroponics', x: 0.9, z: 3.65, angle: 180 },
				{ type: 'locker', x: -0.6, z: 3.85, angle: 180 }
			]
		},
		{
			height: 2.4,
			modules: [
				{ type: 'workstation', x: 0, z: -3.6, angle: 0 },
				{ type: 'bunk', x: 2.9, z: 1.9, angle: 210 },
				{ type: 'crewpod', x: -2.6, z: 2.6, angle: 135 },
				{ type: 'crewpod', x: 2.6, z: -2.6, angle: -45 },
				{ type: 'treadmill', x: -2.9, z: -1.0, angle: 90 },
				{ type: 'locker', x: 0.6, z: 3.9, angle: 180 }
			]
		},
		{
			height: 2.4,
			modules: [
				{ type: 'bunk', x: 0, z: -3.4, angle: 0 },
				{ type: 'bunk', x: 0.9, z: 3.4, angle: 180 },
				{ type: 'locker', x: 3.6, z: 0.6, angle: -90 },
				{ type: 'hygiene', x: -3.0, z: 1.0, angle: 90 },
				{ type: 'table', x: 2.2, z: -1.3, angle: 90 }
			]
		}
	]};
}
