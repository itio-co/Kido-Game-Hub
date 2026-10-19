/**
 * Crew-sim "affordances": what each piece of equipment offers the crew (Sims-style advertising).
 * Rates are need points per SIM HOUR while the interaction runs (needs are 0–100).
 * Slots are local positions [lx, lz, y, yawDeg] (yaw 0 = avatar faces local +Z, the access side).
 * Values are gameplay ESTIMATES tuned for plausible daily routines, not physiology.
 */
import type { PoseName } from '$lib/sim/avatarPose';
import { sanitizeAfter, type AfterEffect } from '$lib/sim/effects';

export type NeedId = 'energy' | 'hunger' | 'hygiene' | 'bladder' | 'fitness' | 'fun' | 'work' | 'comfort';
export const NEEDS: { id: NeedId; label: string; icon: string; color: string }[] = [
	{ id: 'energy', label: 'Energy', icon: '⚡', color: '#ffd23f' },
	{ id: 'hunger', label: 'Hunger', icon: '🍲', color: '#ff9f43' },
	{ id: 'hygiene', label: 'Hygiene', icon: '🧼', color: '#4fc3f7' },
	{ id: 'bladder', label: 'Bladder', icon: '🚻', color: '#a29bfe' },
	{ id: 'fitness', label: 'Fitness', icon: '💪', color: '#55efc4' },
	{ id: 'fun', label: 'Fun/Social', icon: '💬', color: '#fd79a8' },
	{ id: 'work', label: 'Work/Purpose', icon: '🛠️', color: '#74b9ff' },
	{ id: 'comfort', label: 'Comfort', icon: '🛋️', color: '#e17055' }
];
export const NEED_IDS = NEEDS.map((n) => n.id);

/** decay per sim hour while awake (sleeping uses SLEEP_DECAY) */
export const DECAY: Record<NeedId, number> = { energy: 5.5, hunger: 7, hygiene: 3.5, bladder: 11, fitness: 2.2, fun: 4, work: 4, comfort: 4 };
export const SLEEP_DECAY: Partial<Record<NeedId, number>> = { hunger: 2.5, bladder: 4, hygiene: 1.5, fun: 0.5, work: 0.5, fitness: 0.5 };

export type Slot = [number, number, number, number];
export interface Affordance {
	id: string;
	label: string;
	needs: Partial<Record<NeedId, number>>;
	minutes: number;
	pose: PoseName;
	/** avatar hidden while inside (enclosed pods / toilet) */
	hidden?: boolean;
	/** extra Fun/Social for every other crew member doing a social action on the same item */
	social?: boolean;
	/** stop early once this need is satisfied (≥ 97) */
	until?: NeedId;
	slots?: Slot[];
	/** in micro-g (cruise): 'ok', 'restraint' (needs a handrail / foot restraint within 1.5 m) or 'no'. Default 'restraint'. */
	micro?: 'ok' | 'restraint' | 'no';
	/** usable under gravity (launch/landing/surface)? Default true. */
	gravity?: boolean;
	/** crew roles this task suits (they prefer it; others pick it less often) */
	roles?: string[];
	/** only the listed roles may do it (e.g. medical check-ups) */
	roleOnly?: boolean;
	/** meal-flow step(s) this task provides: get food, rehydrate, heat, dispose of trash */
	step?: MealStep[];
	/** steps a crew member does before this (meal) – food & water required, heat & trash optional */
	requires?: MealStep[];
	/** max gain per session per need (diminishing returns apply too) */
	cap?: Partial<Record<NeedId, number>>;
	/** status effects granted when the session ends (scaled by the fraction completed) */
	after?: AfterEffect[];
}
export type MealStep = 'food' | 'water' | 'heat' | 'trash';
export const STEP_LABEL: Record<MealStep, string> = { food: 'get food', water: 'rehydrate', heat: 'heat food', trash: 'dispose of packaging' };
export const MICRO_LABEL = { ok: 'works in micro-g', restraint: 'needs a restraint in micro-g', no: 'unusable in micro-g' } as const;
export const POSES: PoseName[] = ['stand', 'work', 'sit', 'sitwork', 'eat', 'sleep', 'exercise', 'wash'];

const front = (d: number, xs: number[] = [0], y = 0, off = 0.32): Slot[] => xs.map((x) => [x, d / 2 + off, y, 180]);

export const BUILTIN_AFFORDANCES: Record<string, Affordance[]> = {
	bunk: [{ id: 'sleep', label: 'Sleep', needs: { energy: 14, comfort: 8 }, minutes: 480, pose: 'sleep', until: 'energy', slots: [[0.12, 0, 0.56, 90]] }],
	crewpod: [
		{ id: 'sleep', label: 'Sleep (private)', needs: { energy: 15, comfort: 10, fun: 1 }, minutes: 480, pose: 'sleep', hidden: true, until: 'energy', slots: [[0, 0, 0, 180]], micro: 'ok' },
		{ id: 'privacy', label: 'Private time', needs: { fun: 25, comfort: 25 }, minutes: 40, pose: 'sit', hidden: true, slots: [[0, 0, 0, 180]], micro: 'ok' }
	],
	galley: [
		{ id: 'cook', label: 'Prepare & eat', needs: { hunger: 160, fun: 4 }, minutes: 20, pose: 'work', until: 'hunger', slots: front(0.65, [-0.45, 0.45]) },
		{ id: 'cookcrew', label: 'Cook for the crew', needs: { work: 36, fun: 8, hunger: 20 }, minutes: 40, pose: 'work', slots: front(0.65, [-0.45, 0.45]), roles: ['Specialist', 'Medic'] },
		{ id: 'prep', label: 'Collect & heat meal', needs: {}, minutes: 6, pose: 'work', step: ['food', 'water', 'heat'], slots: front(0.65, [-0.45, 0.45]) }
	],
	table: [
		{ id: 'meal', label: 'Meal at table', needs: { hunger: 130, comfort: 30, fun: 18 }, minutes: 30, pose: 'eat', social: true, until: 'hunger', requires: ['food', 'water', 'heat', 'trash'], slots: [[-0.3, 0.68, 0.46, 180], [0.3, 0.68, 0.46, 180], [-0.3, -0.68, 0.46, 0], [0.3, -0.68, 0.46, 0]] },
		{ id: 'checkup', label: 'Medical check-up', needs: { work: 40, fun: 10 }, minutes: 25, pose: 'sit', social: true, slots: [[-0.3, 0.68, 0.46, 180], [0.3, 0.68, 0.46, 180]], roles: ['Medic'], roleOnly: true },
		{ id: 'chat', label: 'Chat at table', needs: { fun: 40, comfort: 25 }, minutes: 30, pose: 'sit', social: true, slots: [[-0.3, 0.68, 0.46, 180], [0.3, 0.68, 0.46, 180], [-0.3, -0.68, 0.46, 0], [0.3, -0.68, 0.46, 0]] }
	],
	workstation: [{ id: 'work', label: 'Work at console', needs: { work: 40, comfort: 6, fun: 2 }, minutes: 120, pose: 'sitwork', slots: [[0, 0.24, 0.47, 180]], roles: ['Commander', 'Pilot', 'Scientist'] }],
	workstation2: [{ id: 'work', label: 'Work at console', needs: { work: 40, comfort: 6, fun: 4 }, minutes: 120, pose: 'sitwork', social: true, slots: [[-0.6, 0.24, 0.47, 180], [0.6, 0.24, 0.47, 180]], roles: ['Commander', 'Pilot', 'Scientist', 'Engineer'] }],
	hydroponics: [{ id: 'tend', label: 'Gardening', needs: { work: 34, fun: 12 }, minutes: 50, pose: 'work', slots: front(0.6, [-0.33, 0.33]), roles: ['Scientist'] }],
	hygiene: [
		{ id: 'toilet', label: 'Use toilet', needs: { bladder: 1000 }, minutes: 6, pose: 'sit', hidden: true, until: 'bladder', slots: [[0, 0, 0, 180]], micro: 'no' },
		{ id: 'wash', label: 'Wash up', needs: { hygiene: 320, comfort: 10 }, minutes: 15, pose: 'wash', hidden: true, until: 'hygiene', slots: [[0, 0, 0, 180]] }
	],
	treadmill: [{ id: 'exercise', label: 'Exercise', needs: { fitness: 48, fun: 8, hygiene: -14, energy: -6, comfort: -4 }, minutes: 45, pose: 'exercise', slots: [[0.1, 0, 0.26, -90]], micro: 'ok' }],
	eclss: [{ id: 'maintain', label: 'Maintain ECLSS', needs: { work: 36 }, minutes: 40, pose: 'work', slots: front(0.9), roles: ['Engineer'] }],
	locker: [
		{ id: 'supplies', label: 'Get supplies', needs: { work: 10, comfort: 12 }, minutes: 6, pose: 'work', slots: front(0.6) },
		{ id: 'inventory', label: 'Inventory & stowage', needs: { work: 30, comfort: 2 }, minutes: 30, pose: 'work', slots: front(0.6), roles: ['Specialist', 'Medic'] }
	],
	couch: [{ id: 'relax', label: 'Relax', needs: { comfort: 40, fun: 8 }, minutes: 30, pose: 'sit', slots: [[0, 0.12, 0.5, 0]], micro: 'ok' }],
	pilotcouch: [{ id: 'relax', label: 'Relax', needs: { comfort: 40, fun: 8 }, minutes: 30, pose: 'sit', slots: [[0, 0.12, 0.5, 0]], micro: 'ok' }],
	couchrow3: [{ id: 'relax', label: 'Relax', needs: { comfort: 40, fun: 10 }, minutes: 30, pose: 'sit', social: true, slots: [-0.8, 0, 0.8].map((x) => [x, 0.12, 0.5, 0] as Slot), micro: 'ok' }],
	couchrow4: [{ id: 'relax', label: 'Relax', needs: { comfort: 40, fun: 10 }, minutes: 30, pose: 'sit', social: true, slots: [-1.2, -0.4, 0.4, 1.2].map((x) => [x, 0.12, 0.5, 0] as Slot), micro: 'ok' }],
	// galley set: multi-step meal flow
	foodwarmer: [
		{ id: 'heat', label: 'Heat food', needs: {}, minutes: 4, pose: 'work', step: ['heat'], slots: front(0.55) },
		{ id: 'cookcrew', label: 'Bake for the crew', needs: { work: 38, fun: 8 }, minutes: 18, pose: 'work', slots: front(0.55), roles: ['Specialist', 'Medic'] }
	],
	waterdispenser: [{ id: 'water', label: 'Rehydrate food', needs: {}, minutes: 3, pose: 'work', step: ['water'], slots: front(0.4), micro: 'ok' }],
	fridge: [{ id: 'food', label: 'Get fresh food', needs: { comfort: 4 }, minutes: 2, pose: 'work', step: ['food'], slots: front(0.65), micro: 'ok' }],
	pantry: [
		{ id: 'food', label: 'Get meal packs', needs: {}, minutes: 2, pose: 'work', step: ['food'], slots: front(0.6, [-0.3, 0.3]), micro: 'ok' },
		{ id: 'inventory', label: 'Food inventory', needs: { work: 30 }, minutes: 30, pose: 'work', slots: front(0.6, [-0.3, 0.3]), roles: ['Specialist', 'Medic'], micro: 'ok' }
	],
	prepcounter: [{ id: 'cookcrew', label: 'Prepare food for the crew', needs: { work: 34, fun: 8 }, minutes: 35, pose: 'work', slots: front(0.65, [-0.3, 0.3]), roles: ['Specialist', 'Medic'], micro: 'ok' }],
	trash: [{ id: 'trash', label: 'Dispose of packaging', needs: { comfort: 2 }, minutes: 1, pose: 'work', step: ['trash'], slots: front(0.55), micro: 'ok' }],
	foodstation: [
		{ id: 'meal', label: 'Meal at food station', needs: { hunger: 130, comfort: 18, fun: 14 }, minutes: 25, pose: 'work', social: true, until: 'hunger', requires: ['food', 'water', 'heat', 'trash'], micro: 'ok', slots: [[-0.25, 0.62, 0, 180], [0.25, -0.62, 0, 0]] },
		{ id: 'chat', label: 'Coffee & chat', needs: { fun: 34, comfort: 15 }, minutes: 20, pose: 'work', social: true, micro: 'ok', slots: [[-0.25, 0.62, 0, 180], [0.25, -0.62, 0, 0]] }
	],
	galleytable: [
		{ id: 'meal', label: 'Meal at table', needs: { hunger: 130, comfort: 30, fun: 18 }, minutes: 30, pose: 'eat', social: true, until: 'hunger', requires: ['food', 'water', 'heat', 'trash'] },
		{ id: 'checkup', label: 'Medical check-up', needs: { work: 40, fun: 10 }, minutes: 25, pose: 'sit', social: true, roles: ['Medic'], roleOnly: true },
		{ id: 'chat', label: 'Chat at table', needs: { fun: 40, comfort: 25 }, minutes: 30, pose: 'sit', social: true }
	],
	// micro-g outfitting
	sleepingbag: [{ id: 'sleep', label: 'Sleep in bag', needs: { energy: 15, comfort: 8 }, minutes: 480, pose: 'sleep', until: 'energy', slots: [[0, 0.14, 0.05, 180]], micro: 'ok', gravity: false }],
	zerogtoilet: [
		{ id: 'toilet', label: 'Use zero-g toilet', needs: { bladder: 1000 }, minutes: 7, pose: 'sit', hidden: true, until: 'bladder', slots: [[0, 0, 0, 180]], micro: 'ok' },
		{ id: 'wash', label: 'Wipe-wash', needs: { hygiene: 260, comfort: 6 }, minutes: 15, pose: 'wash', hidden: true, until: 'hygiene', slots: [[0, 0, 0, 180]], micro: 'ok' }
	],
	ared: [{ id: 'exercise', label: 'Resistive exercise', needs: { fitness: 55, fun: 6, hygiene: -12, energy: -5, comfort: -3 }, minutes: 45, pose: 'exercise', slots: [[0, 0.1, 0.12, 180]], micro: 'ok' }]
};

/**
 * Realistic timescales (ESTIMATE): sleep restores Energy over ~7.5 h; a meal (20–30 min) fills Hunger
 * partially (cap) and digestion keeps it up for ~3.5 h; a wash takes ~12 min; exercise ~75 min with an
 * afterglow but a hygiene penalty until the next wash; work raises Work/Purpose gradually over multi-hour blocks.
 * Rates = need points per sim hour at full condition, before diminishing returns near 100.
 */
const TUNE: Record<string, Partial<Affordance>> = {
	'bunk.sleep': { needs: { energy: 13, comfort: 5 }, minutes: 450, after: [{ id: 'rested' }] },
	'crewpod.sleep': { needs: { energy: 13.5, comfort: 7, fun: 1 }, minutes: 450, after: [{ id: 'rested' }] },
	'sleepingbag.sleep': { needs: { energy: 13, comfort: 5 }, minutes: 450, after: [{ id: 'rested' }] },
	'crewpod.privacy': { needs: { fun: 20, comfort: 22 }, minutes: 45 },
	'galley.cook': { needs: { hunger: 110, fun: 4 }, minutes: 22, cap: { hunger: 40 }, after: [{ id: 'digest', k: 0.8 }] },
	'galley.cookcrew': { needs: { work: 18, fun: 6, hunger: 10 }, minutes: 45, after: [{ id: 'accomplished', k: 0.5 }] },
	'table.meal': { needs: { hunger: 120, comfort: 14, fun: 12 }, minutes: 28, cap: { hunger: 50 }, after: [{ id: 'digest' }] },
	'galleytable.meal': { needs: { hunger: 120, comfort: 14, fun: 12 }, minutes: 28, cap: { hunger: 50 }, after: [{ id: 'digest' }] },
	'foodstation.meal': { needs: { hunger: 125, comfort: 8, fun: 10 }, minutes: 22, cap: { hunger: 48 }, after: [{ id: 'digest' }] },
	'table.checkup': { needs: { work: 20, fun: 6 }, minutes: 30 },
	'galleytable.checkup': { needs: { work: 20, fun: 6 }, minutes: 30 },
	'table.chat': { needs: { fun: 30, comfort: 14 }, minutes: 30 },
	'galleytable.chat': { needs: { fun: 30, comfort: 14 }, minutes: 30 },
	'foodstation.chat': { needs: { fun: 26, comfort: 10 }, minutes: 15, label: 'Coffee & chat', after: [{ id: 'caffeine' }] },
	'workstation.work': { needs: { work: 16, comfort: 2, fun: 1 }, minutes: 180, after: [{ id: 'accomplished', k: 0.6 }] },
	'workstation2.work': { needs: { work: 16, comfort: 2, fun: 2 }, minutes: 180, after: [{ id: 'accomplished', k: 0.6 }] },
	'hydroponics.tend': { needs: { work: 18, fun: 6 }, minutes: 90, after: [{ id: 'accomplished', k: 0.5 }] },
	'eclss.maintain': { needs: { work: 18 }, minutes: 90, after: [{ id: 'accomplished', k: 0.5 }] },
	'locker.inventory': { needs: { work: 16, comfort: 2 }, minutes: 60 },
	'pantry.inventory': { needs: { work: 16 }, minutes: 50 },
	'locker.supplies': { needs: { work: 6, comfort: 10 }, minutes: 6 },
	'foodwarmer.cookcrew': { needs: { work: 18, fun: 5 }, minutes: 30 },
	'prepcounter.cookcrew': { needs: { work: 18, fun: 6 }, minutes: 40, after: [{ id: 'accomplished', k: 0.4 }] },
	'hygiene.toilet': { needs: { bladder: 900 }, minutes: 6, after: [{ id: 'relieved' }] },
	'zerogtoilet.toilet': { needs: { bladder: 800 }, minutes: 7, after: [{ id: 'relieved' }] },
	'hygiene.wash': { needs: { hygiene: 300, comfort: 8 }, minutes: 12, cap: { hygiene: 70 }, after: [{ id: 'refreshed' }] },
	'zerogtoilet.wash': { needs: { hygiene: 240, comfort: 5 }, minutes: 15, cap: { hygiene: 60 }, after: [{ id: 'refreshed', k: 0.7 }] },
	'treadmill.exercise': { needs: { fitness: 34, fun: 5, hygiene: -8, energy: -4, comfort: -3 }, minutes: 75, after: [{ id: 'exercised' }, { id: 'sweaty' }, { id: 'tired' }] },
	'ared.exercise': { needs: { fitness: 38, fun: 4, hygiene: -7, energy: -4, comfort: -2 }, minutes: 70, after: [{ id: 'exercised' }, { id: 'sweaty' }, { id: 'tired' }] },
	'couch.relax': { needs: { comfort: 30, fun: 6 }, minutes: 30 },
	'pilotcouch.relax': { needs: { comfort: 30, fun: 6 }, minutes: 30 },
	'couchrow3.relax': { needs: { comfort: 30, fun: 8 }, minutes: 30 },
	'couchrow4.relax': { needs: { comfort: 30, fun: 8 }, minutes: 30 }
};
for (const [k, t] of Object.entries(TUNE)) {
	const [m, a] = k.split('.');
	for (const af of BUILTIN_AFFORDANCES[m] ?? []) if (af.id === a) Object.assign(af, t);
}
// coffee at the water dispenser (short boost, then a crash)
BUILTIN_AFFORDANCES.waterdispenser.push({ id: 'coffee', label: 'Coffee break', needs: { fun: 12, comfort: 10 }, minutes: 8, pose: 'work', slots: front(0.4), micro: 'ok', after: [{ id: 'caffeine' }] });

/** dynamic task added to equipment that needs servicing (engineers prefer it) */
export const SERVICE_AF: Affordance = { id: 'service', label: 'Maintenance', needs: { work: 22 }, minutes: 45, pose: 'work', roles: ['Engineer'], micro: 'ok', after: [{ id: 'accomplished', k: 0.6 }] };
/** dynamic task on broken equipment: repair with spare kits from the lockers (engineers) */
export const REPAIR_AF: Affordance = { id: 'repair', label: 'Repair', needs: { work: 24 }, minutes: 90, pose: 'work', roles: ['Engineer'], micro: 'ok', after: [{ id: 'accomplished' }] };
/** virtual "anywhere" work: housekeeping spots on each deck (specialists prefer it) */
export const HOUSEKEEPING_AF: Affordance = { id: 'clean', label: 'Clean & organise', needs: { work: 15, comfort: 3 }, minutes: 45, pose: 'work', roles: ['Specialist'], micro: 'ok' };

/** couch seat x offsets (launch: crew strapped in, deployed couch) */
export function seatOffsets(seats: number): number[] {
	return Array.from({ length: seats }, (_, i) => (i - (seats - 1) / 2) * 0.8);
}

/** slots for an affordance without explicit ones (custom equipment): spread `capacity` along the width */
export function defaultSlots(a: { pose: PoseName }, w: number, d: number, height: number, capacity = 1): Slot[] {
	const xs = Array.from({ length: Math.max(1, capacity) }, (_, i) => (i - (capacity - 1) / 2) * (w / Math.max(1, capacity)));
	if (a.pose === 'sleep') return xs.map((x) => [x, 0, Math.min(height, 0.6), 90]);
	if (a.pose === 'exercise') return xs.map((x) => [x, 0, Math.min(height, 0.3), 180]);
	if (a.pose === 'sit' || a.pose === 'eat' || a.pose === 'sitwork') return xs.map((x) => [x, d / 2 + 0.05, 0.46, 0]);
	return front(d, xs);
}

/** sanitise affordances from JSON (custom equipment) */
export function sanitizeAffordances(raw: unknown): Affordance[] | undefined {
	if (!Array.isArray(raw)) return undefined;
	const out: Affordance[] = [];
	for (const r of raw.slice(0, 6)) {
		if (!r || typeof r !== 'object') continue;
		const o = r as Record<string, unknown>;
		const needs: Partial<Record<NeedId, number>> = {};
		if (o.needs && typeof o.needs === 'object')
			for (const [k, v] of Object.entries(o.needs as Record<string, unknown>))
				if (NEED_IDS.includes(k as NeedId) && typeof v === 'number' && isFinite(v)) needs[k as NeedId] = Math.max(-200, Math.min(2000, v));
		const pose = POSES.includes(o.pose as PoseName) ? (o.pose as PoseName) : 'stand';
		const slots = Array.isArray(o.slots)
			? (o.slots as unknown[]).filter((s) => Array.isArray(s) && s.length === 4 && s.every((v) => typeof v === 'number' && isFinite(v))).slice(0, 8).map((s) => (s as number[]).map((v, i) => (i === 3 ? v : Math.max(-3, Math.min(3, v)))) as Slot)
			: undefined;
		out.push({
			id: String(o.id ?? `a${out.length + 1}`).slice(0, 24),
			label: String(o.label ?? 'Use').slice(0, 40),
			needs,
			minutes: Math.max(1, Math.min(720, Number(o.minutes) || 15)),
			pose,
			hidden: !!o.hidden,
			social: !!o.social,
			until: NEED_IDS.includes(o.until as NeedId) ? (o.until as NeedId) : undefined,
			micro: o.micro === 'ok' || o.micro === 'no' || o.micro === 'restraint' ? o.micro : undefined,
			gravity: o.gravity === false ? false : undefined,
			roles: Array.isArray(o.roles) ? (o.roles as unknown[]).filter((r) => typeof r === 'string').map((r) => String(r).slice(0, 16)).slice(0, 6) : undefined,
			roleOnly: o.roleOnly === true ? true : undefined,
			step: Array.isArray(o.step) ? (o.step as unknown[]).filter((x): x is MealStep => ['food', 'water', 'heat', 'trash'].includes(x as string)) : undefined,
			requires: Array.isArray(o.requires) ? (o.requires as unknown[]).filter((x): x is MealStep => ['food', 'water', 'heat', 'trash'].includes(x as string)) : undefined,
			cap: o.cap && typeof o.cap === 'object' ? Object.fromEntries(Object.entries(o.cap as Record<string, unknown>).filter(([k, v]) => NEED_IDS.includes(k as NeedId) && typeof v === 'number' && v > 0).map(([k, v]) => [k, Math.min(100, v as number)])) : undefined,
			after: sanitizeAfter(o.after),
			slots: slots?.length ? slots : undefined
		});
	}
	return out;
}
