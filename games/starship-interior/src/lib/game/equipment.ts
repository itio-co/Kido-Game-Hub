/**
 * Data-driven equipment (Equipment Designer).
 *
 * A part is a UNIT primitive scaled by `size` (metres), so the 3D gizmo's scale = size:
 *  box / rbox: unit cube · cyl: Ø1 × 1 cylinder · sphere: Ø1 · capsule: Ø1 × 1 overall ·
 *  plane: 1 × 1 (XY) · torus: ring in XY, size = [outer Ø, outer Ø, tube Ø] · glb: imported mesh
 *  normalised into the unit cube.
 * Positions in metres in module space (footprint centred, floor y = 0, front/access = +Z),
 * rotations in DEGREES (XYZ Euler). `stowed` is the optional second pose.
 */
import { Box3, Euler, Matrix4, Mesh, Quaternion, Vector3, type BufferGeometry, type Material, type Object3D } from 'three';
import type { MatName } from '$lib/three/materials';
import type { ModuleDef, Phase } from './types';

export type EquipShape = 'box' | 'rbox' | 'cyl' | 'sphere' | 'capsule' | 'plane' | 'torus' | 'glb';
export const SHAPES: EquipShape[] = ['box', 'rbox', 'cyl', 'sphere', 'capsule', 'plane', 'torus'];
export const MATERIALS: MatName[] = ['white', 'grey', 'steel', 'steelDark', 'dark', 'fabric', 'mattress', 'screen', 'led', 'glass', 'rubber', 'yellow', 'green', 'amber', 'blue', 'grow', 'plant'];

export interface EquipPose {
	pos: [number, number, number];
	rot: [number, number, number];
	size?: [number, number, number];
}
export interface EquipPart {
	id: string;
	name: string;
	shape: EquipShape;
	pos: [number, number, number];
	rot: [number, number, number];
	size: [number, number, number];
	m: MatName;
	stowed?: EquipPose;
	/** imported GLB (data URL), only for shape 'glb' */
	glb?: string;
}
/** the editable equipment definition (also the JSON export format) */
export interface EquipDef {
	id: string;
	name: string;
	icon: string;
	category: string;
	description: string;
	w: number;
	d: number;
	height: number;
	access: number;
	mass: number;
	power: number;
	cost: number;
	seats?: number;
	stowable?: boolean;
	estimate?: boolean;
	/** phase that uses the stowed pose (default 'launch') */
	stowPhase?: Phase;
	/** launch/landing footprint if different */
	launch?: { w: number; d: number; height: number };
	/** keep the footprint fitted to the parts automatically */
	autoFit?: boolean;
	parts: EquipPart[];
	builtin?: boolean;
	/** built-in this was duplicated from */
	base?: string;
}
export const EQUIP_FORMAT = 'starship-equipment';
export const EQUIP_VERSION = 1;
const DEG = Math.PI / 180;
export const uidPart = () => Math.random().toString(36).slice(2, 9);

export function toModuleDef(e: EquipDef): ModuleDef {
	return {
		id: e.id as ModuleDef['id'],
		name: e.name,
		icon: e.icon || '🧩',
		shape: 'rect',
		w: e.w,
		d: e.d,
		height: e.height,
		access: e.access,
		mass: e.mass,
		power: e.power,
		cost: e.cost,
		description: e.description,
		category: e.category,
		seats: e.seats || undefined,
		stowable: e.stowable,
		estimate: e.estimate,
		launch: e.launch,
		parts: e.parts,
		stowPhase: e.stowPhase ?? 'launch',
		custom: true
	};
}

/** pose of a part for a phase */
export function poseOf(p: EquipPart, stowed: boolean): { pos: [number, number, number]; rot: [number, number, number]; size: [number, number, number] } {
	if (stowed && p.stowed) return { pos: p.stowed.pos, rot: p.stowed.rot, size: p.stowed.size ?? p.size };
	return { pos: p.pos, rot: p.rot, size: p.size };
}

/** axis-aligned bounds of the parts in one pose (unit primitives approximated by their boxes) */
export function partsBounds(parts: EquipPart[], stowed: boolean) {
	const b = new Box3();
	const m = new Matrix4();
	const v = new Vector3();
	for (const p of parts) {
		const { pos, rot, size } = poseOf(p, stowed);
		m.compose(new Vector3(...pos), new Quaternion().setFromEuler(new Euler(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG)), new Vector3(...size));
		const flat = p.shape === 'plane' ? 0 : 0.5;
		for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) for (const z of [-flat, flat]) b.expandByPoint(v.set(x, y, z).applyMatrix4(m));
	}
	return b;
}
/** symmetric footprint around the module origin + height, for the deployed and the stowed pose */
export function fitFootprint(e: EquipDef): Pick<EquipDef, 'w' | 'd' | 'height' | 'launch'> {
	const r2 = (n: number) => Math.max(0.05, Math.ceil(n * 100 - 1e-6) / 100);
	const dims = (stowed: boolean) => {
		const b = partsBounds(e.parts, stowed);
		if (b.isEmpty()) return { w: 0.5, d: 0.5, height: 0.5 };
		return { w: r2(2 * Math.max(-b.min.x, b.max.x)), d: r2(2 * Math.max(-b.min.z, b.max.z)), height: r2(Math.max(b.max.y, 0.05)) };
	};
	const dep = dims(false);
	const hasStow = e.parts.some((p) => p.stowed);
	if (!hasStow) return { ...dep, launch: undefined };
	const sto = dims(true);
	// surface footprint = w/d/height; launch footprint = launch
	return (e.stowPhase ?? 'launch') === 'launch' ? { ...dep, launch: sto } : { ...sto, launch: dep };
}

/** mirror a part across the YZ plane (x → −x) */
export function mirrorPart(p: EquipPart): EquipPart {
	const mp = (q: EquipPose): EquipPose => ({ ...q, pos: [-q.pos[0], q.pos[1], q.pos[2]], rot: [q.rot[0], -q.rot[1], -q.rot[2]] });
	return { ...p, id: uidPart(), name: p.name + ' (mirror)', pos: [-p.pos[0], p.pos[1], p.pos[2]], rot: [p.rot[0], -p.rot[1], -p.rot[2]], stowed: p.stowed ? mp(p.stowed) : undefined };
}

// ---------- extraction of built-in procedural models (rendered once into a hidden group) ----------
function shapeOf(g: BufferGeometry): { shape: EquipShape; size: [number, number, number]; pre?: Quaternion } | null {
	const t = g.type;
	const pr = (g as BufferGeometry & { parameters?: Record<string, number> }).parameters ?? {};
	if (t === 'BoxGeometry') return { shape: 'box', size: [pr.width, pr.height, pr.depth] };
	if (t === 'CylinderGeometry') {
		const r = Math.max(pr.radiusTop, pr.radiusBottom);
		return { shape: 'cyl', size: [2 * r, pr.height, 2 * r] };
	}
	if (t === 'SphereGeometry') return { shape: 'sphere', size: [2 * pr.radius, 2 * pr.radius, 2 * pr.radius] };
	if (t === 'CapsuleGeometry') return { shape: 'capsule', size: [2 * pr.radius, pr.height + 2 * pr.radius, 2 * pr.radius] };
	if (t === 'PlaneGeometry') return { shape: 'plane', size: [pr.width, pr.height, 1] };
	if (t === 'TorusGeometry') return { shape: 'torus', size: [2 * (pr.radius + pr.tube), 2 * (pr.radius + pr.tube), 2 * pr.tube] };
	if (t === 'CircleGeometry') return { shape: 'cyl', size: [2 * pr.radius, 0.004, 2 * pr.radius], pre: new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2) };
	// RoundedBoxGeometry keeps no parameters: use its bounds
	g.computeBoundingBox();
	const bb = g.boundingBox!;
	return { shape: 'rbox', size: [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z] };
}
export function extractParts(root: Object3D, matName: (m: Material) => string | undefined): EquipPart[] {
	root.updateMatrixWorld(true);
	const inv = new Matrix4().copy(root.matrixWorld).invert();
	const out: EquipPart[] = [];
	root.traverse((o) => {
		const mesh = o as Mesh;
		if (!mesh.isMesh) return;
		const s = shapeOf(mesh.geometry);
		if (!s) return;
		const m = new Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
		const pos = new Vector3();
		const q = new Quaternion();
		const sc = new Vector3();
		m.decompose(pos, q, sc);
		if (s.pre) q.multiply(s.pre);
		const e = new Euler().setFromQuaternion(q, 'XYZ');
		const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
		const r = (n: number) => Math.round(n * 10000) / 10000;
		const mn = matName(mat);
		out.push({
			id: uidPart(),
			name: mesh.name || `${out.length + 1} · ${mn ?? ''} ${s.shape}`.replace(/\s+/g, ' '),
			shape: s.shape,
			pos: [r(pos.x), r(pos.y), r(pos.z)],
			rot: [r(e.x / DEG), r(e.y / DEG), r(e.z / DEG)],
			size: [r(s.size[0] * sc.x), r(s.size[1] * sc.y), r(s.size[2] * sc.z)],
			m: (mn as MatName) ?? 'grey'
		});
	});
	return out;
}

// ---------- validation for imported JSON ----------
const num = (v: unknown, d: number, lo = -50, hi = 50) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const v3 = (v: unknown, d: [number, number, number], lo = -50, hi = 50): [number, number, number] =>
	Array.isArray(v) && v.length === 3 ? [num(v[0], d[0], lo, hi), num(v[1], d[1], lo, hi), num(v[2], d[2], lo, hi)] : d;
export function sanitizeEquip(raw: unknown): EquipDef | null {
	if (!raw || typeof raw !== 'object') return null;
	const r = raw as Partial<EquipDef>;
	if (!Array.isArray(r.parts)) return null;
	const parts: EquipPart[] = r.parts.slice(0, 400).flatMap((p): EquipPart[] => {
		if (!p || typeof p !== 'object') return [];
		const shape = (SHAPES as string[]).includes(p.shape) || p.shape === 'glb' ? p.shape : 'box';
		const part: EquipPart = {
			id: typeof p.id === 'string' ? p.id.slice(0, 20) : uidPart(),
			name: String(p.name ?? shape).slice(0, 60),
			shape,
			pos: v3(p.pos, [0, 0.5, 0]),
			rot: v3(p.rot, [0, 0, 0], -720, 720),
			size: v3(p.size, [0.2, 0.2, 0.2], 0.001, 20),
			m: (MATERIALS as string[]).includes(p.m) ? p.m : 'grey'
		};
		if (p.stowed && typeof p.stowed === 'object') part.stowed = { pos: v3(p.stowed.pos, part.pos), rot: v3(p.stowed.rot, part.rot, -720, 720), size: p.stowed.size ? v3(p.stowed.size, part.size, 0.001, 20) : undefined };
		if (shape === 'glb' && typeof p.glb === 'string' && p.glb.startsWith('data:')) part.glb = p.glb;
		return [part];
	});
	const id = typeof r.id === 'string' && r.id.startsWith('custom:') ? r.id.slice(0, 80) : `custom:${uidPart()}`;
	const e: EquipDef = {
		id,
		name: String(r.name ?? 'Custom equipment').slice(0, 60),
		icon: String(r.icon ?? '🧩').slice(0, 4),
		category: String(r.category ?? 'Custom').slice(0, 40),
		description: String(r.description ?? '').slice(0, 400),
		w: num(r.w, 1, 0.05, 9),
		d: num(r.d, 1, 0.05, 9),
		height: num(r.height, 1, 0.05, 4),
		access: num(r.access, 0.6, 0, 2),
		mass: num(r.mass, 50, 0, 1e5),
		power: num(r.power, 0, 0, 1e5),
		cost: num(r.cost, 0, 0, 1e9),
		seats: r.seats ? Math.round(num(r.seats, 0, 0, 20)) : undefined,
		stowable: !!r.stowable,
		estimate: r.estimate !== false,
		stowPhase: r.stowPhase === 'surface' ? 'surface' : 'launch',
		launch: r.launch ? { w: num(r.launch.w, 1, 0.05, 9), d: num(r.launch.d, 1, 0.05, 9), height: num(r.launch.height, 1, 0.05, 4) } : undefined,
		autoFit: r.autoFit !== false,
		parts,
		base: typeof r.base === 'string' ? r.base.slice(0, 40) : undefined
	};
	return e;
}
