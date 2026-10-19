/**
 * Group equipment: tables whose capacity comes from separate seat objects (chairs; in micro-g also
 * foot restraints) placed at their edge. A seat belongs to at most one table: the nearest table it
 * faces with its front edge within 0.5 m of the table edge.
 */
import { CATALOG_BY_ID } from './catalog';
import { localToWorld, worldToLocal } from './geometry';
import type { PlacedModule } from './types';

export const SEAT_REACH = 0.5;
const CHAIR_HALF = 0.225;

/** candidate chair poses around a table, facing it (edge + 5 cm gap) */
export function seatSpots(t: PlacedModule): { x: number; z: number; angle: number }[] {
	const def = CATALOG_BY_ID[t.type];
	if (!def?.group) return [];
	const out: { x: number; z: number; angle: number }[] = [];
	const off = 0.05 + CHAIR_HALF;
	const along = (len: number) => {
		const n = Math.max(1, Math.floor((len + 0.1) / 0.6));
		return Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * 0.6);
	};
	for (const s of [1, -1]) {
		for (const lx of along(def.w)) {
			const [x, z] = localToWorld(t.x, t.z, t.angle, lx, s * (def.d / 2 + off));
			out.push({ x, z, angle: norm(t.angle + (s > 0 ? 180 : 0)) });
		}
	}
	for (const s of [1, -1]) {
		for (const lz of def.d >= 0.75 ? along(def.d - 0.2) : []) {
			const [x, z] = localToWorld(t.x, t.z, t.angle, s * (def.w / 2 + off), lz);
			out.push({ x, z, angle: norm(t.angle + (s > 0 ? -90 : 90)) });
		}
	}
	return out;
}
const norm = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;

/** distance from a point to a table's rectangle edge (0 inside) */
function edgeDist(t: PlacedModule, x: number, z: number) {
	const def = CATALOG_BY_ID[t.type];
	const [lx, lz] = worldToLocal(t.x, t.z, t.angle, x, z);
	return Math.hypot(Math.max(0, Math.abs(lx) - def.w / 2), Math.max(0, Math.abs(lz) - def.d / 2));
}

/** table uid → seat objects (chairs; foot restraints too when `micro`) */
export function groupSeats(modules: PlacedModule[], micro: boolean): Map<number, PlacedModule[]> {
	const tables = modules.filter((m) => CATALOG_BY_ID[m.type]?.group);
	const res = new Map<number, PlacedModule[]>(tables.map((t) => [t.uid, []]));
	if (!tables.length) return res;
	for (const m of modules) {
		const def = CATALOG_BY_ID[m.type];
		const chair = !!def?.seat;
		const foot = micro && m.type === 'footrestraint' && !m.mount;
		if (!chair && !foot) continue;
		const a = (m.angle * Math.PI) / 180;
		const fx = Math.sin(a), fz = Math.cos(a);
		const px = chair ? m.x + fx * CHAIR_HALF : m.x, pz = chair ? m.z + fz * CHAIR_HALF : m.z;
		let best: PlacedModule | null = null, bd = SEAT_REACH;
		for (const t of tables) {
			const d = edgeDist(t, px, pz);
			if (d > bd) continue;
			if (chair) {
				const vx = t.x - m.x, vz = t.z - m.z, L = Math.hypot(vx, vz) || 1;
				if ((vx * fx + vz * fz) / L < 0.5) continue; // must face the table (±60°)
			}
			bd = d;
			best = t;
		}
		if (best) res.get(best.uid)!.push(m);
	}
	return res;
}
