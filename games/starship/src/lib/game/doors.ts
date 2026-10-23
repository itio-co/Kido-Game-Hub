/**
 * Equipment doors: every item with a door / curtain animates it and the crew sim sequences it.
 *
 * Module space (footprint centred, floor y = 0, front = +Z). A leaf is a set of parts that moves
 * about a pivot: a hinge rotates `angle`° about `axis` through the pivot, a slide translates by
 * `slide`, a curtain folds (scales along X towards the pivot) to `fold`.
 *
 * Sequence (crew sim): walk to the approach point → reach + door OPEN → (enter) move inside to the
 * use point → door CLOSES behind them (private) → use → open → step out → close.
 * Non-enter items (fridge, oven, lockers): open → take/put → close.
 */
import { CATALOG_BY_ID } from './catalog';
import type { EquipPart } from './equipment';
import type { ModuleId } from './types';

export interface DoorLeaf {
	pivot: [number, number, number];
	/** hinge: rotation axis + signed open angle (deg) */
	axis?: 'x' | 'y' | 'z';
	angle?: number;
	/** slide: translation when open (m) */
	slide?: [number, number, number];
	/** curtain: X scale when open (folds towards the pivot) */
	fold?: number;
	/** leaf width (swing radius), m */
	w?: number;
}
export interface DoorSpec {
	kind: 'hinge' | 'slide' | 'curtain';
	label: string;
	leaves: DoorLeaf[];
	/** open / close time, s */
	dur: number;
	/** closes behind the user while in use (quarters, hygiene, sleep) */
	private: boolean;
	/** the user moves inside the item (use point within the footprint) */
	enter: boolean;
	/** resting state when nobody uses it (curtains rest open) */
	restOpen?: boolean;
	/** needs power to open (motorised / latched doors) */
	powered?: boolean;
}

const POD_LEAF: DoorLeaf = { pivot: [-0.37, 0, 0.465], axis: 'y', angle: -100, w: 0.74 };

export const DOORS: Partial<Record<ModuleId, DoorSpec>> = {
	crewpod: { kind: 'hinge', label: 'door', leaves: [POD_LEAF], dur: 0.9, private: true, enter: true },
	hygiene: { kind: 'hinge', label: 'door', leaves: [POD_LEAF], dur: 0.9, private: true, enter: true },
	bunk: { kind: 'curtain', label: 'curtain', leaves: [{ pivot: [0.95, 0, 0.43], fold: 0.26, w: 1.9 }], dur: 0.9, private: true, enter: true, restOpen: true },
	zerogtoilet: { kind: 'curtain', label: 'curtain', leaves: [{ pivot: [-0.43, 0, 0.4], fold: 0.08, w: 0.86 }], dur: 0.8, private: true, enter: true, restOpen: true },
	locker: {
		kind: 'hinge',
		label: 'doors',
		leaves: [
			{ pivot: [-0.29, 0, 0.3], axis: 'y', angle: -110, w: 0.29 },
			{ pivot: [0.29, 0, 0.3], axis: 'y', angle: 110, w: 0.29 }
		],
		dur: 0.6,
		private: false,
		enter: false
	},
	fridge: { kind: 'hinge', label: 'door', leaves: [{ pivot: [-0.28, 0, 0.335], axis: 'y', angle: -105, w: 0.56 }], dur: 0.6, private: false, enter: false, powered: true },
	foodwarmer: { kind: 'hinge', label: 'oven door', leaves: [{ pivot: [-0.05, 0.99, 0.255], axis: 'x', angle: 80, w: 0.3 }], dur: 0.5, private: false, enter: false, powered: true },
	pantry: {
		kind: 'hinge',
		label: 'locker doors',
		leaves: [
			{ pivot: [-0.3, 1.48, 0.3], axis: 'x', angle: -100, w: 0.44 },
			{ pivot: [0.3, 1.48, 0.3], axis: 'x', angle: -100, w: 0.44 }
		],
		dur: 0.6,
		private: false,
		enter: false
	}
};

/** designer: a part marked as a door */
export interface PartDoor {
	kind: 'hinge' | 'slide';
	/** hinge point in module space */
	pivot: [number, number, number];
	axis?: 'x' | 'y' | 'z';
	angle?: number;
	slide?: [number, number, number];
	dur?: number;
	private?: boolean;
	enter?: boolean;
}

export function partDoorLeaf(d: PartDoor, p?: EquipPart): DoorLeaf {
	if (d.kind === 'slide') return { pivot: d.pivot, slide: d.slide ?? [0.6, 0, 0], w: p ? Math.max(p.size[0], p.size[2]) : 0.6 };
	return { pivot: d.pivot, axis: d.axis ?? 'y', angle: d.angle ?? -100, w: p ? Math.max(p.size[0], p.size[2]) : 0.6 };
}

/** door spec of a module type (built-in table or designer parts marked as door) */
export function doorSpecOf(type: ModuleId): DoorSpec | null {
	const def = CATALOG_BY_ID[type];
	if (!def) return null;
	if (def.parts) {
		const ds = def.parts.filter((p) => p.door);
		let spec: DoorSpec | null = null;
		if (ds.length) {
			const f = ds[0].door!;
			spec = {
				kind: f.kind,
				label: ds.length > 1 ? 'doors' : 'door',
				leaves: ds.map((p) => partDoorLeaf(p.door!, p)),
				dur: Math.max(0.2, Math.min(4, f.dur ?? 0.8)),
				private: !!f.private,
				enter: !!f.enter
			};
		}
		return spec;
	}
	return DOORS[type] ?? null;
}

/** sanitise a designer door property */
export function sanitizePartDoor(raw: unknown): PartDoor | undefined {
	if (!raw || typeof raw !== 'object') return undefined;
	const r = raw as Partial<PartDoor>;
	const n = (v: unknown, d: number, lo = -20, hi = 20) => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
	const v3 = (v: unknown, d: [number, number, number]): [number, number, number] => (Array.isArray(v) && v.length === 3 ? [n(v[0], d[0]), n(v[1], d[1]), n(v[2], d[2])] : d);
	const kind = r.kind === 'slide' ? 'slide' : 'hinge';
	const out: PartDoor = { kind, pivot: v3(r.pivot, [0, 0, 0]) };
	if (kind === 'hinge') {
		out.axis = r.axis === 'x' || r.axis === 'z' ? r.axis : 'y';
		out.angle = n(r.angle, -100, -180, 180);
	} else out.slide = v3(r.slide, [0.6, 0, 0]);
	out.dur = n(r.dur, 0.8, 0.2, 4);
	if (r.private) out.private = true;
	if (r.enter) out.enter = true;
	return out;
}

/** smooth ease used by both the renderer and the swing reservation */
export const doorEase = (t: number) => t * t * (3 - 2 * t);
