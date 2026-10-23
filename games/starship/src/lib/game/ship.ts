/**
 * Whole-ship model for the Surface Habitat mode (V3-class ship, 2026).
 * Sources and confidence for every number: docs/starship-reference.md.
 * Tags: OFFICIAL / REPORTED / DERIVED / ESTIMATE (ESTIMATE values show a badge in the UI).
 * Coordinates: y = metres above the ship base (bottom of the aft skirt); ground level = burial depth.
 */
import { HULL_INNER_RADIUS, HULL_WALL_THICKNESS, SLAB_THICKNESS } from './specs';

/** OFFICIAL: spacex.com technical specifications (ship 52 m, Ø 9 m, 1,600 t propellant). */
export const SHIP_HEIGHT = 52.0;
export const SHIP_PROPELLANT_T = 1600;
/** REPORTED: Wikipedia "SpaceX Starship (spacecraft)" – rings 1.83 m tall, 3.97–4 mm thick. */
export const RING_HEIGHT = 1.83;
export const WALL_THICKNESS_STEEL = 0.004;
/** REPORTED: O/F ≈ 3.6 (DLR HiSST 2022). Densities at normal boiling point. */
export const MIXTURE_RATIO = 3.6;
export const RHO_LOX = 1141; // kg/m³
export const RHO_LCH4 = 422; // kg/m³
/** ESTIMATE: "flatter" Block 2+ elliptical domes, 2.0 m rise. */
export const DOME_RISE = 2.0;
/** ESTIMATE: tangent-ogive nose length (52 m − 22 rings × 1.83 m). */
export const NOSE_LENGTH = SHIP_HEIGHT - 22 * RING_HEIGHT; // 11.74 m
/** ESTIMATE: decks must end this far below the nose tip (LOX header tank). */
export const NOSE_TOP_CLEAR = 4.5;
/** ESTIMATE: a deck whose usable radius is below this is refused. */
export const MIN_DECK_RADIUS = 1.2;
/** REPORTED: 614 m³ payload-bay volume, kept as the reference for the original cabin. */
export const ORIGINAL_CABIN_VOLUME = 614;

/** REPORTED/standard values */
export const LOCATIONS = {
	moon: { name: 'Moon', g: 1.62, rho: 1.6, rhoNote: 'lunar highland regolith 1.6 g/cm³ (MDPI Appl. Sci. 11:3853)' },
	mars: { name: 'Mars', g: 3.71, rho: 1.75, rhoNote: 'Martian regolith 1.7–1.8 g/cm³ (JGR Planets 2020/2021)' }
} as const;
export type LocationId = keyof typeof LOCATIONS;
export const BURIAL_DEFAULT = 2.5;
export const BURIAL_MAX = 4.0;
/** REPORTED shielding thresholds (g/cm²) */
export const SHIELD_REFS: { loc: LocationId; gcm2: number; text: string }[] = [
	{ loc: 'moon', gcm2: 160, text: '<150 mSv per 180 d (MDPI Appl. Sci. 11:3853)' },
	{ loc: 'moon', gcm2: 405, text: 'SPE storm shelter (MDPI Appl. Sci. 11:3853)' },
	{ loc: 'mars', gcm2: 175, text: '≈1.0 m: <100 mSv/yr lower bound (JGR Planets 2020/2021)' },
	{ loc: 'mars', gcm2: 280, text: '≈1.6 m: <100 mSv/yr upper bound (JGR Planets 2020/2021)' },
	{ loc: 'mars', gcm2: 525, text: '≈3 m: GCR dose negligible (Nature Astronomy 2024)' }
];
/** ESTIMATE: berm and excavation geometry */
export const BERM_HEIGHT = 0.6;
export const BERM_WIDTH = 3.0;
/** ESTIMATE: backfilled berm against the hull above grade (0 … 8 m), angle of repose ~35° outside the crest */
export const BERM_MAX = 8.0;
export const REPOSE_DEG = 35;

/** ESTIMATE: hull-modification planning rules (docs §7) */
export const OPENING_MAX_W = 2.0;
export const WELD_CLEAR = 0.1;
export const OPENING_MAX_H = RING_HEIGHT - 2 * WELD_CLEAR; // 1.63
export const OPENING_MAX_H_SPAN = 2 * RING_HEIGHT - 2 * WELD_CLEAR; // 3.46
export const STRINGER_COUNT = 24; // REPORTED (Block 1 LOX tank)
export const TUNNEL_DIAMETER = 2.0;
export const RING_INSERT_MAX = 6;
export const DOME_HATCH_D = 1.0;

export type SectionId = 'aft' | 'lox' | 'ch4' | 'crew' | 'nose';
export type DeckSection = 'lox' | 'ch4' | 'crew';
export type DomeId = 'aft' | 'common' | 'forward';
export type DomeState = 'intact' | 'hatch' | 'cut';

/** ESTIMATE ring counts (docs §3): volumes match 1,600 t with ~6 % ullage, 22 barrel rings. */
export const BASE_RINGS: Record<'aft' | 'lox' | 'ch4' | 'crew', number> = { aft: 3, lox: 10, ch4: 6, crew: 3 };

export interface RingInsert {
	section: 'lox' | 'ch4' | 'crew';
	/** joint index inside the section (1 … rings−1, counted from the section bottom) */
	joint: number;
	count: number;
}
export interface Opening {
	uid: number;
	/** global ring index from the bottom (0 = lowest skirt ring) */
	ring: number;
	/** azimuth in degrees (0 = +Z, 90 = +X, like the deck plan) */
	angle: number;
	w: number;
	h: number;
	spanWeld: boolean;
	tunnel: boolean;
	tunnelLen: number;
}
export interface HabitatConfig {
	location: LocationId;
	burial: number;
	/** height of the regolith berm against the hull above grade (m) */
	berm: number;
	domes: Record<DomeId, DomeState>;
	converted: { lox: boolean; ch4: boolean };
	inserts: RingInsert[];
	openings: Opening[];
}
export const defaultHabitat = (): HabitatConfig => ({
	location: 'moon',
	burial: BURIAL_DEFAULT,
	berm: BERM_HEIGHT,
	domes: { aft: 'intact', common: 'intact', forward: 'intact' },
	converted: { lox: false, ch4: false },
	inserts: [],
	openings: []
});

export interface SectionGeo {
	id: SectionId;
	name: string;
	short: string;
	kind: 'engine' | 'tank' | 'cabin' | 'nose';
	y0: number;
	y1: number;
	rings: number;
	/** geometric internal volume (m³) */
	volume: number;
}
export interface DomeGeo {
	id: DomeId;
	name: string;
	/** equator height */
	y: number;
	/** +1 bulges up, −1 bulges down */
	dir: 1 | -1;
	state: DomeState;
	below: SectionId;
	above: SectionId;
}
export interface ShipGeo {
	sections: SectionGeo[];
	domes: DomeGeo[];
	/** y of every circumferential weld (ring joints) on the barrel */
	joints: number[];
	/** ring i spans ringY[i] … ringY[i] + RING_HEIGHT */
	ringY: number[];
	ringSection: SectionId[];
	noseBase: number;
	tip: number;
	/** where decks may be stacked, per deck section */
	spans: Record<DeckSection, { y0: number; y1: number }>;
	/** cut & reweld markers from ring inserts */
	welds: { y: number; section: SectionId }[];
}

const R = HULL_INNER_RADIUS;
const AREA = Math.PI * R * R;
export const domeCap = (h = DOME_RISE) => (2 / 3) * Math.PI * R * R * h;

/** tangent ogive radius at height y above the nose base (ESTIMATE shape) */
export function noseRadius(y: number, L = NOSE_LENGTH): number {
	if (y <= 0) return R;
	if (y >= L) return 0;
	const rho = (R * R + L * L) / (2 * R);
	return Math.sqrt(rho * rho - y * y) - (rho - R);
}
export function noseVolume(L = NOSE_LENGTH, n = 400): number {
	let v = 0;
	for (let i = 0; i < n; i++) {
		const r = noseRadius(((i + 0.5) / n) * L, L);
		v += Math.PI * r * r * (L / n);
	}
	return v;
}
const NOSE_VOL = noseVolume();

export function sectionRings(h: HabitatConfig, id: 'aft' | 'lox' | 'ch4' | 'crew') {
	return BASE_RINGS[id] + h.inserts.filter((i) => i.section === id).reduce((s, i) => s + i.count, 0);
}

export function buildShip(h: HabitatConfig): ShipGeo {
	const rings = { aft: sectionRings(h, 'aft'), lox: sectionRings(h, 'lox'), ch4: sectionRings(h, 'ch4'), crew: sectionRings(h, 'crew') };
	const cap = domeCap();
	let y = 0;
	const sec = (id: SectionId, name: string, short: string, kind: SectionGeo['kind'], n: number, volume: number): SectionGeo => {
		const s = { id, name, short, kind, y0: y, y1: y + n * RING_HEIGHT, rings: n, volume };
		y = s.y1;
		return s;
	};
	const sections: SectionGeo[] = [
		sec('aft', 'Engine bay / aft skirt', 'AFT', 'engine', rings.aft, rings.aft * RING_HEIGHT * AREA - cap),
		sec('lox', 'LOX main tank', 'LOX', 'tank', rings.lox, rings.lox * RING_HEIGHT * AREA),
		sec('ch4', 'CH4 main tank', 'CH4', 'tank', rings.ch4, rings.ch4 * RING_HEIGHT * AREA + 2 * cap),
		sec('crew', 'Payload / crew bay', 'Cabin', 'cabin', rings.crew, rings.crew * RING_HEIGHT * AREA - cap)
	];
	const noseBase = y;
	const tip = noseBase + NOSE_LENGTH;
	sections.push({ id: 'nose', name: 'Nose cone (ogive)', short: 'Nose', kind: 'nose', y0: noseBase, y1: tip, rings: 0, volume: NOSE_VOL });
	const S = Object.fromEntries(sections.map((s) => [s.id, s])) as Record<SectionId, SectionGeo>;
	const domes: DomeGeo[] = [
		{ id: 'aft', name: 'Aft dome', y: S.aft.y1, dir: -1, state: h.domes.aft, below: 'aft', above: 'lox' },
		{ id: 'common', name: 'Common dome', y: S.lox.y1, dir: -1, state: h.domes.common, below: 'lox', above: 'ch4' },
		{ id: 'forward', name: 'Forward dome', y: S.ch4.y1, dir: 1, state: h.domes.forward, below: 'ch4', above: 'crew' }
	];
	const ringY: number[] = [];
	const ringSection: SectionId[] = [];
	for (const s of sections)
		for (let i = 0; i < s.rings; i++) {
			ringY.push(s.y0 + i * RING_HEIGHT);
			ringSection.push(s.id);
		}
	const joints = ringY.slice(1).concat([noseBase]);
	const welds: ShipGeo['welds'] = [];
	for (const ins of h.inserts) {
		const s = S[ins.section];
		// inserts are applied in order; markers at the cut joint and at the top of the inserted rings
		const before = h.inserts.filter((o) => o.section === ins.section && h.inserts.indexOf(o) < h.inserts.indexOf(ins) && o.joint <= ins.joint).reduce((a, o) => a + o.count, 0);
		const yc = s.y0 + (ins.joint + before) * RING_HEIGHT;
		welds.push({ y: yc, section: ins.section }, { y: yc + ins.count * RING_HEIGHT, section: ins.section });
	}
	const intact = (d: DomeId) => h.domes[d] !== 'cut';
	const spans: ShipGeo['spans'] = {
		lox: { y0: S.lox.y0, y1: S.lox.y1 - (intact('common') ? DOME_RISE : 0) },
		ch4: { y0: S.ch4.y0, y1: S.ch4.y1 },
		crew: { y0: S.crew.y0 + (intact('forward') ? DOME_RISE : 0), y1: tip - NOSE_TOP_CLEAR }
	};
	return { sections, domes, joints, ringY, ringSection, noseBase, tip, spans, welds };
}

/** inner hull radius at height y (barrel or ogive) */
export function hullRadiusAt(g: ShipGeo, y: number): number {
	return y <= g.noseBase ? R : noseRadius(y - g.noseBase);
}
export const HULL_OUTER = R + HULL_WALL_THICKNESS;
export { SLAB_THICKNESS };

/** areal density of a regolith layer: m × g/cm³ → g/cm² */
export const arealDensity = (depthM: number, rho: number) => depthM * 100 * rho;

/** regolith surface height (y, ship base = 0) at horizontal distance u from the ship axis */
export function terrainHeight(h: HabitatConfig, u: number): number {
	const g = h.burial;
	const crest = g + h.berm;
	const u0 = HULL_OUTER;
	if (u <= u0 + BERM_WIDTH) return crest;
	const run = h.berm / Math.tan((REPOSE_DEG * Math.PI) / 180);
	if (u <= u0 + BERM_WIDTH + run) return crest - (u - u0 - BERM_WIDTH) * (h.berm / Math.max(run, 1e-6));
	return g;
}
/** distance from the axis where the berm toe meets grade (start of undisturbed ground) */
export const bermToe = (h: HabitatConfig) => HULL_OUTER + BERM_WIDTH + h.berm / Math.tan((REPOSE_DEG * Math.PI) / 180);
