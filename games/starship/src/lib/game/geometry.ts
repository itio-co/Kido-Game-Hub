/** 2D footprint geometry on the deck plane (x, z). Angles in degrees = Three.js rotation.y. */
import { CATALOG_BY_ID } from './catalog';
import { MAX_FOOTPRINT_RADIUS as MAX_RADIUS } from './specs';
import type { ModuleDef, ModuleId, Phase } from './types';

export type Vec2 = [number, number];

export type Footprint =
	| { kind: 'rect'; cx: number; cz: number; hw: number; hd: number; angle: number }
	| { kind: 'circle'; cx: number; cz: number; r: number };

const EPS = 1e-3;
const DEG = Math.PI / 180;

/**
 * Mission phase used for footprints: couches deploy and stowables fold in 'launch'.
 * Set by GameState before any check/analysis (synchronous), so all geometry agrees on the phase.
 */
export const PHASE: { v: Phase } = { v: 'surface' };
export function dimsOf(def: ModuleDef, phase: Phase = PHASE.v): { w: number; d: number; height: number } {
	return phase === 'launch' && def.launch ? def.launch : { w: def.w, d: def.d, height: def.height };
}

export function footprintOf(type: ModuleId, x: number, z: number, angle: number, pad = 0): Footprint {
	const def = CATALOG_BY_ID[type];
	if (def.shape === 'circle') return { kind: 'circle', cx: x, cz: z, r: (def.r ?? def.w / 2) + pad };
	const { w, d } = dimsOf(def);
	return { kind: 'rect', cx: x, cz: z, hw: w / 2 + pad, hd: d / 2 + pad, angle };
}

/** Local (lx, lz) → world, matching Three.js rotation.y = angle. */
export function localToWorld(cx: number, cz: number, angleDeg: number, lx: number, lz: number): Vec2 {
	const a = angleDeg * DEG;
	const c = Math.cos(a);
	const s = Math.sin(a);
	return [cx + lx * c + lz * s, cz - lx * s + lz * c];
}

export function worldToLocal(cx: number, cz: number, angleDeg: number, x: number, z: number): Vec2 {
	const a = angleDeg * DEG;
	const c = Math.cos(a);
	const s = Math.sin(a);
	const dx = x - cx;
	const dz = z - cz;
	return [dx * c - dz * s, dx * s + dz * c];
}

export function corners(f: Extract<Footprint, { kind: 'rect' }>): Vec2[] {
	return [
		localToWorld(f.cx, f.cz, f.angle, -f.hw, -f.hd),
		localToWorld(f.cx, f.cz, f.angle, f.hw, -f.hd),
		localToWorld(f.cx, f.cz, f.angle, f.hw, f.hd),
		localToWorld(f.cx, f.cz, f.angle, -f.hw, f.hd)
	];
}

/** Whole footprint inside the circular deck (minus wall margin)? */
export function insideDeck(f: Footprint, maxR = MAX_RADIUS): boolean {
	if (f.kind === 'circle') return Math.hypot(f.cx, f.cz) + f.r <= maxR + 1e-9;
	return corners(f).every(([x, z]) => Math.hypot(x, z) <= maxR + 1e-9);
}

function project(pts: Vec2[], ax: Vec2): [number, number] {
	let min = Infinity;
	let max = -Infinity;
	for (const [x, z] of pts) {
		const p = x * ax[0] + z * ax[1];
		if (p < min) min = p;
		if (p > max) max = p;
	}
	return [min, max];
}

function rectRect(a: Extract<Footprint, { kind: 'rect' }>, b: Extract<Footprint, { kind: 'rect' }>) {
	const pa = corners(a);
	const pb = corners(b);
	const axes: Vec2[] = [];
	for (const f of [a, b]) {
		const r = f.angle * DEG;
		axes.push([Math.cos(r), -Math.sin(r)], [Math.sin(r), Math.cos(r)]);
	}
	for (const ax of axes) {
		const [a0, a1] = project(pa, ax);
		const [b0, b1] = project(pb, ax);
		if (a1 - b0 <= EPS || b1 - a0 <= EPS) return false; // separating axis (touching is ok)
	}
	return true;
}

function circleRect(c: Extract<Footprint, { kind: 'circle' }>, r: Extract<Footprint, { kind: 'rect' }>) {
	const [lx, lz] = worldToLocal(r.cx, r.cz, r.angle, c.cx, c.cz);
	const qx = Math.max(-r.hw, Math.min(r.hw, lx));
	const qz = Math.max(-r.hd, Math.min(r.hd, lz));
	return Math.hypot(lx - qx, lz - qz) < c.r - EPS;
}

export function overlaps(a: Footprint, b: Footprint): boolean {
	if (a.kind === 'circle' && b.kind === 'circle')
		return Math.hypot(a.cx - b.cx, a.cz - b.cz) < a.r + b.r - EPS;
	if (a.kind === 'circle' && b.kind === 'rect') return circleRect(a, b);
	if (a.kind === 'rect' && b.kind === 'circle') return circleRect(b, a);
	return rectRect(a as Extract<Footprint, { kind: 'rect' }>, b as Extract<Footprint, { kind: 'rect' }>);
}

export function containsPoint(f: Footprint, x: number, z: number): boolean {
	if (f.kind === 'circle') return Math.hypot(x - f.cx, z - f.cz) <= f.r;
	const [lx, lz] = worldToLocal(f.cx, f.cz, f.angle, x, z);
	return Math.abs(lx) <= f.hw && Math.abs(lz) <= f.hd;
}

/**
 * Ray vs. module bounding box (local box [-hw,hw]×[0,h]×[-hd,hd]); returns distance or null.
 * Used for picking modules by clicking anywhere on their visible body.
 */
export function rayHitModule(
	origin: [number, number, number],
	dir: [number, number, number],
	type: ModuleId,
	x: number,
	z: number,
	angle: number,
	deckHeight: number
): number | null {
	const def = CATALOG_BY_ID[type];
	const dm = dimsOf(def);
	const hw = dm.w / 2;
	const hd = dm.d / 2;
	const [ox, oz] = worldToLocal(x, z, angle, origin[0], origin[2]);
	// rotate the direction only (no translation)
	const [dx, dz] = worldToLocal(0, 0, angle, dir[0], dir[2]);
	const o = [ox, origin[1], oz];
	const d = [dx, dir[1], dz];
	const lo = [-hw, 0, -hd];
	const hi = [hw, Math.max(def.fullHeight ? deckHeight : dm.height, 0.3), hd];
	let tmin = -Infinity;
	let tmax = Infinity;
	for (let k = 0; k < 3; k++) {
		if (Math.abs(d[k]) < 1e-9) {
			if (o[k] < lo[k] || o[k] > hi[k]) return null;
		} else {
			let t1 = (lo[k] - o[k]) / d[k];
			let t2 = (hi[k] - o[k]) / d[k];
			if (t1 > t2) [t1, t2] = [t2, t1];
			tmin = Math.max(tmin, t1);
			tmax = Math.min(tmax, t2);
			if (tmin > tmax) return null;
		}
	}
	return tmax < 0 ? null : Math.max(tmin, 0);
}

export const snapTo = (v: number, step: number) => Math.round(v / step) * step;
export const normAngle = (a: number) => ((Math.round(a * 1000) / 1000) % 360 + 360) % 360;

/** Front access zone (local +Z side) as a rect footprint, or null if the module has none. */
export function accessFootprint(type: ModuleId, x: number, z: number, angle: number): Footprint | null {
	const def = CATALOG_BY_ID[type];
	if (!def.access || def.shape !== 'rect') return null;
	const dm = dimsOf(def);
	const [cx, cz] = localToWorld(x, z, angle, 0, dm.d / 2 + def.access / 2);
	return { kind: 'rect', cx, cz, hw: dm.w / 2, hd: def.access / 2, angle };
}

/** Max distance of any footprint point from the deck centre. */
export function maxRadius(f: Footprint): number {
	if (f.kind === 'circle') return Math.hypot(f.cx, f.cz) + f.r;
	return Math.max(...corners(f).map(([x, z]) => Math.hypot(x, z)));
}

/** Footprint outline as a polygon (circles approximated). */
export function outline(f: Footprint, segs = 32): Vec2[] {
	if (f.kind === 'rect') return corners(f);
	const pts: Vec2[] = [];
	for (let k = 0; k < segs; k++) {
		const a = (k / segs) * Math.PI * 2;
		pts.push([f.cx + Math.cos(a) * f.r, f.cz + Math.sin(a) * f.r]);
	}
	return pts;
}

/** Shaft footprint (circle, same on every deck it touches). */
export function shaftFootprint(x: number, z: number, angle: number): Footprint {
	return footprintOf('hatch', x, z, angle);
}

/** Shaft access zone: 0.8 m wide × 0.6 m deep in front (+Z local) of the opening / ladder. */
export function shaftAccess(x: number, z: number, angle: number): Footprint {
	const r = CATALOG_BY_ID.hatch.r ?? 0.55;
	const [cx, cz] = localToWorld(x, z, angle, 0, r + 0.3);
	return { kind: 'rect', cx, cz, hw: 0.4, hd: 0.3, angle };
}
