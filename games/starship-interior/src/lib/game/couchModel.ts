/**
 * Procedural launch/landing couch (ESTIMATE design, see docs "Crew seating design rationale").
 *
 * Semi-supine +Gx posture: thrust acts along the ship axis (up), so the crew lies with the back
 * towards the floor, hips/knees flexed ≈ 90°/90° (Soyuz Kazbek / Dragon style). Local space as
 * every module: footprint centred, X = width, Z = depth with the FEET / access side at +Z.
 *
 * Every part has a deployed (Launch/Landing, 0.8 × 2.0 × 1.0 m) and a stowed (Surface/Cruise,
 * 0.8 × 0.6 × 0.5 m) transform with the same part list, so a part's "stowed transform" is just
 * its second pose – the same data model the Equipment Designer uses.
 */
import type { MatName } from '$lib/three/materials';

export type PartShape = 'box' | 'rbox' | 'cyl' | 'sphere' | 'capsule' | 'plane' | 'torus';
export interface Pose {
	pos: [number, number, number];
	rot: [number, number, number];
	scale?: [number, number, number];
}
export interface PartSpec extends Pose {
	shape: PartShape;
	/** box/rbox/plane: [w, h, d]; cyl: [rTop, rBottom, h]; sphere: [r]; capsule: [r, len]; torus: [R, tube] */
	args: number[];
	m: MatName;
	name?: string;
	/** optional stowed pose (Surface/Cruise for couches, Launch/Landing stow for tables …) */
	stowed?: Pose;
}

type V2 = [number, number]; // (z, y)
/** unit normal of segment a→b in the YZ plane, on the occupant side (the perpendicular with +y) */
function normalOf(a: V2, b: V2): V2 {
	const dz = b[0] - a[0];
	const dy = b[1] - a[1];
	const L = Math.hypot(dz, dy);
	let nz = -dy / L, ny = dz / L;
	if (ny < 0 || (ny === 0 && nz > 0)) (nz = -nz), (ny = -ny);
	return [nz, ny];
}
/** box spanning two points in the YZ plane (length along Z before rotation) */
function beam(a: V2, b: V2, x: number, w: number, t: number, lift = 0) {
	const dz = b[0] - a[0];
	const dy = b[1] - a[1];
	const L = Math.hypot(dz, dy);
	const ang = Math.atan2(-dy, dz);
	// offset along the panel normal (towards the occupant)
	const [nz, ny] = normalOf(a, b);
	return {
		args: [w, t, L],
		pos: [x, (a[1] + b[1]) / 2 + ny * lift, (a[0] + b[0]) / 2 + nz * lift] as [number, number, number],
		rot: [ang, 0, 0] as [number, number, number]
	};
}
/** cylinder (axis Y) between two YZ points */
function rod(a: V2, b: V2, x: number, r: number) {
	const dz = b[0] - a[0];
	const dy = b[1] - a[1];
	const L = Math.hypot(dz, dy);
	return {
		args: [r, r, L],
		pos: [x, (a[1] + b[1]) / 2, (a[0] + b[0]) / 2] as [number, number, number],
		rot: [Math.atan2(dz, dy), 0, 0] as [number, number, number]
	};
}

/*
 * Deployed SHELL line (z, y), the classic Soyuz/Dragon "knees-up" +Gx couch:
 *   back pan  P→H  reclined to 16° head-up (torso near horizontal, back towards the floor),
 *   thigh pan P→K  raised to ~78° (thighs near vertical, hips flexed ~90°),
 *   leg rest  K→F  horizontal (knees bent ~90°, lower legs level).
 * Lengths fit a 1.75 m occupant (hip→knee 0.43 m, knee→heel 0.46 m, hip→head top 0.95 m).
 */
const BACK_DEG = 16;
const THIGH_DEG = 78;
const P: V2 = [0.12, 0.3];
const H: V2 = [P[0] - 0.95 * Math.cos((BACK_DEG * Math.PI) / 180), P[1] + 0.95 * Math.sin((BACK_DEG * Math.PI) / 180)];
const S: V2 = [P[0] - 0.48 * Math.cos((BACK_DEG * Math.PI) / 180), P[1] + 0.48 * Math.sin((BACK_DEG * Math.PI) / 180)];
const K: V2 = [P[0] + 0.4 * Math.cos((THIGH_DEG * Math.PI) / 180), P[1] + 0.4 * Math.sin((THIGH_DEG * Math.PI) / 180)];
const F: V2 = [K[0] + 0.5, K[1]];

/**
 * Occupant posture for a deployed couch (local space of one couch, x = 0): hip joint (z, y) and the
 * segment angles used by the crew avatar (world angles in the YZ plane, 0 = +Z, 90° = up).
 */
export function couchOccupant() {
	const nb = normalOf(P, H);
	const nt = normalOf(P, K);
	const nl = normalOf(K, F);
	const hip: V2 = [P[0] + nb[0] * 0.13 + nt[0] * 0.02, P[1] + nb[1] * 0.13];
	const knee: V2 = [K[0] + nt[0] * 0.08 + nl[0] * 0.02, K[1] + nl[1] * 0.1];
	const torso = 180 - BACK_DEG; // head towards −Z, 16° up
	const thigh = (Math.atan2(knee[1] - hip[1], knee[0] - hip[0]) * 180) / Math.PI;
	return { hip, torsoDeg: torso, thighDeg: thigh, shinDeg: 0 };
}

/** one couch centred at x0; `pilot` adds the display arm */
export function couchParts(x0 = 0, pilot = false, seatW = 0.8): PartSpec[] {
	const out: PartSpec[] = [];
	const add = (name: string, shape: PartShape, m: MatName, dep: { args: number[]; pos: [number, number, number]; rot: [number, number, number] }, st: Pose) =>
		out.push({ name, shape, m, args: dep.args, pos: dep.pos, rot: dep.rot, stowed: st });
	const sw = Math.min(0.66, seatW - 0.12); // shell width
	const flat = (y: number, z: number, sz = 1, x = x0): Pose => ({ pos: [x, y, z], rot: [0, 0, 0], scale: [1, 1, sz] });

	// floor rails (seat track) + cross ties
	for (const s of [-1, 1]) {
		add('rail', 'box', 'steelDark', { args: [0.05, 0.04, 1.9], pos: [x0 + s * (sw / 2 - 0.04), 0.02, 0], rot: [0, 0, 0] }, flat(0.02, 0, 0.3, x0 + s * (sw / 2 - 0.04)));
	}
	// composite shell: back pan, seat/thigh pan, leg rest
	const back = beam(P, H, x0, sw, 0.05);
	const thigh = beam(P, K, x0, sw, 0.05);
	const leg = beam(K, F, x0, sw, 0.05);
	add('back shell', 'rbox', 'white', back, flat(0.21, 0, 0.55));
	add('thigh shell', 'rbox', 'white', thigh, flat(0.09, 0, 0.9));
	add('leg rest', 'rbox', 'white', leg, flat(0.33, 0, 1.05));
	// moulded liner (individually fitted foam in a real couch)
	add('back liner', 'rbox', 'fabric', beam(P, H, x0, sw - 0.12, 0.05, 0.05), flat(0.255, 0, 0.55));
	add('thigh liner', 'rbox', 'fabric', beam(P, K, x0, sw - 0.12, 0.05, 0.05), flat(0.135, 0, 0.9));
	add('calf liner', 'rbox', 'fabric', beam(K, F, x0, sw - 0.12, 0.04, 0.045), flat(0.37, 0, 1.05));
	// side bolsters along the torso (lateral support)
	for (const s of [-1, 1]) {
		const b = beam(P, S, x0 + s * (sw / 2 - 0.03), 0.06, 0.18, 0.08);
		add('bolster', 'rbox', 'white', b, flat(0.27, -0.02, 0.9, x0 + s * (sw / 2 - 0.03)));
	}
	// headrest with cheek pads
	add('headrest', 'rbox', 'fabric', { args: [0.3, 0.08, 0.3], pos: [x0, H[1] + 0.06, H[0] + 0.1], rot: [Math.atan2(-(H[1] - P[1]), H[0] - P[0]) + Math.PI, 0, 0] }, flat(0.43, -0.12, 1));
	for (const s of [-1, 1])
		add('head cheek', 'rbox', 'white', { args: [0.05, 0.2, 0.26], pos: [x0 + s * 0.18, H[1] + 0.12, H[0] + 0.1], rot: [0, 0, 0] }, { pos: [x0 + s * 0.18, 0.43, -0.12], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.5] });
	// 5-point harness: shoulder straps, lap belts, crotch strap, rotary buckle
	for (const s of [-1, 1]) {
		const sh = beam([S[0] - 0.05, S[1] + 0.06], [P[0] - 0.12, P[1] + 0.11], x0 + s * 0.11, 0.05, 0.012, 0.0);
		add('shoulder strap', 'box', 'yellow', sh, flat(0.4, -0.05 + s * 0.0, 0.6, x0 + s * 0.11));
		add('lap belt', 'box', 'yellow', { args: [0.2, 0.012, 0.05], pos: [x0 + s * 0.13, P[1] + 0.12, P[0] - 0.04], rot: [0, 0, 0] }, flat(0.4, 0.12, 1, x0 + s * 0.13));
	}
	add('crotch strap', 'box', 'yellow', beam([P[0] + 0.12, P[1] + 0.13], [P[0] - 0.06, P[1] + 0.12], x0, 0.05, 0.012), flat(0.4, 0.2, 1));
	add('buckle', 'cyl', 'steel', { args: [0.05, 0.05, 0.02], pos: [x0, P[1] + 0.135, P[0] - 0.08], rot: [0.25, 0, 0] }, { pos: [x0, 0.415, 0.05], rot: [0, 0, 0] });
	// struts with stroking energy attenuators (landing loads)
	const strutPts: { z: number; top: number }[] = [
		{ z: H[0] + 0.1, top: H[1] - 0.06 },
		{ z: K[0] - 0.02, top: K[1] - 0.05 },
		{ z: F[0] - 0.06, top: F[1] - 0.05 }
	];
	for (const s of [-1, 1])
		for (const p of strutPts) {
			const x = x0 + s * (sw / 2 - 0.08);
			add('strut rod', 'cyl', 'steel', rod([p.z, 0.04], [p.z, p.top], x, 0.014), { pos: [x, 0.06, p.z * 0.3], rot: [0, 0, 0], scale: [1, 0.12 / p.top, 1] });
			add('attenuator', 'cyl', 'steelDark', rod([p.z, 0.08], [p.z, p.top * 0.55], x, 0.032), { pos: [x, 0.07, p.z * 0.3], rot: [0, 0, 0], scale: [1, 0.1 / (p.top * 0.47), 1] });
		}
	// diagonal attenuator under the hips (main +Gx load path)
	add('hip attenuator', 'cyl', 'steelDark', rod([-0.45, 0.04], [P[0] - 0.02, P[1] - 0.04], x0, 0.035), { pos: [x0, 0.06, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 0.55, 1] });
	// armrests + controls (left keypad, right hand controller)
	for (const s of [-1, 1]) {
		const x = x0 + s * (sw / 2 + 0.035);
		add('armrest', 'rbox', 'grey', { args: [0.07, 0.05, 0.42], pos: [x, P[1] + 0.2, P[0] - 0.12], rot: [0.12, 0, 0] }, flat(0.3, 0, 1, x));
		add('arm post', 'cyl', 'steelDark', rod([P[0] - 0.12, 0.04], [P[0] - 0.12, P[1] + 0.17], x, 0.018), { pos: [x, 0.13, -0.1], rot: [0, 0, 0], scale: [1, 0.4, 1] });
	}
	const xl = x0 - (sw / 2 + 0.035);
	const xr = x0 + (sw / 2 + 0.035);
	add('keypad', 'box', 'dark', { args: [0.08, 0.03, 0.12], pos: [xl, P[1] + 0.24, P[0] + 0.0], rot: [0.12, 0, 0] }, flat(0.34, 0.12, 1, xl));
	add('hand controller', 'capsule', 'dark', { args: [0.022, 0.07], pos: [xr, P[1] + 0.29, P[0] + 0.02], rot: [0.12, 0, 0] }, { pos: [xr, 0.35, 0.14], rot: [Math.PI / 2, 0, 0] });
	add('controller base', 'cyl', 'grey', { args: [0.04, 0.045, 0.03], pos: [xr, P[1] + 0.235, P[0] + 0.02], rot: [0.12, 0, 0] }, flat(0.335, 0.14, 1, xr));
	if (pilot) {
		// display arm swings over the knees; screen faces the occupant (looking "up")
		// display arm swings over the chest; screen tilted towards the occupant's face (looking "up")
		add('display post', 'cyl', 'steelDark', rod([-0.4, 0.04], [-0.4, 1.2], x0 + sw / 2 + 0.09, 0.025), { pos: [x0 + sw / 2 - 0.0, 0.46, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 0.45, 1] });
		add('display arm', 'box', 'steelDark', { args: [sw / 2 + 0.09, 0.04, 0.05], pos: [x0 + (sw / 2 + 0.09) / 2, 1.2, -0.4], rot: [0, 0, 0] }, flat(0.46, 0.25, 1, x0 + 0.1));
		add('display', 'rbox', 'dark', { args: [0.5, 0.03, 0.34], pos: [x0, 1.15, -0.5], rot: [0.3, 0, 0] }, flat(0.475, -0.05));
		add('screen', 'plane', 'screen', { args: [0.46, 0.3, 1], pos: [x0, 1.132, -0.5], rot: [Math.PI / 2 + 0.3, 0, 0] }, { pos: [x0, 0.492, -0.05], rot: [-Math.PI / 2, 0, 0] });
	}
	return out;
}

export function couchRowParts(n: number): PartSpec[] {
	const out: PartSpec[] = [];
	for (let i = 0; i < n; i++) out.push(...couchParts((i - (n - 1) / 2) * 0.8));
	return out;
}
