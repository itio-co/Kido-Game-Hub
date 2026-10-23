/**
 * Radial cut-face profiles (u ≥ 0 from the ship axis, y up) for the section-view caps.
 * Each profile is a closed polygon; CutCaps extrudes nothing — it draws flat ShapeGeometry
 * rotated onto each cut face.
 */
import { Shape, Vector2 } from 'three';
import { BERM_WIDTH, DOME_RISE, HULL_OUTER, bermToe, hullRadiusAt, terrainHeight, type HabitatConfig, type ShipGeo } from '$lib/game/ship';
import { HULL_INNER_RADIUS, HULL_WALL_THICKNESS, SLAB_THICKNESS } from '$lib/game/specs';

export type CapKind = 'steel' | 'slab' | 'soil' | 'backfill' | 'dome';
export interface CapProfile {
	kind: CapKind;
	pts: Vector2[];
}
export const TERRAIN_R = 60;
export const SOIL_DEPTH = 6;

const rect = (u0: number, u1: number, y0: number, y1: number) => [new Vector2(u0, y0), new Vector2(u1, y0), new Vector2(u1, y1), new Vector2(u0, y1)];

export function cabinProfiles(floorY: number[], heights: number[], stackTop: number): CapProfile[] {
	const R = HULL_INNER_RADIUS;
	const out: CapProfile[] = [{ kind: 'steel', pts: rect(R, R + HULL_WALL_THICKNESS, -SLAB_THICKNESS, stackTop + SLAB_THICKNESS) }];
	floorY.forEach((y) => out.push({ kind: 'slab', pts: rect(0, R, y - SLAB_THICKNESS, y) }));
	if (heights.length) out.push({ kind: 'slab', pts: rect(0, R, stackTop, stackTop + SLAB_THICKNESS) });
	return out;
}

/** inner hull profile from the base to the tip (ogive sampled) */
export function hullPolyline(g: ShipGeo, n = 40): [number, number][] {
	const p: [number, number][] = [[HULL_INNER_RADIUS, 0], [HULL_INNER_RADIUS, g.noseBase]];
	for (let i = 1; i <= n; i++) {
		const y = g.noseBase + ((g.tip - g.noseBase) * i) / n;
		p.push([hullRadiusAt(g, y), y]);
	}
	return p;
}

export function domeCurve(yd: number, dir: number, u0 = 0, n = 32): [number, number][] {
	const R = HULL_INNER_RADIUS;
	const p: [number, number][] = [];
	for (let i = 0; i <= n; i++) {
		const u = u0 + ((R - u0) * i) / n;
		p.push([u, yd + dir * DOME_RISE * Math.sqrt(Math.max(0, 1 - (u / R) ** 2))]);
	}
	return p;
}

export function habitatProfiles(g: ShipGeo, h: HabitatConfig, floorY: number[], floorR: number[]): CapProfile[] {
	const out: CapProfile[] = [];
	const t = HULL_WALL_THICKNESS;
	// hull wall: inner line up, outer line down (thickness shrinks to 0 at the tip)
	const inner = hullPolyline(g);
	const outer = inner.map(([u, y]) => [Math.max(u, 0) + t * Math.min(1, u / 1.0), y] as [number, number]).reverse();
	out.push({ kind: 'steel', pts: [...inner, ...outer].map(([u, y]) => new Vector2(u, y)) });
	// domes
	for (const d of g.domes) {
		if (d.state === 'cut') {
			out.push({ kind: 'steel', pts: rect(HULL_INNER_RADIUS - 0.6, HULL_INNER_RADIUS, d.y - 0.06, d.y + 0.06) });
			continue;
		}
		const c = domeCurve(d.y, d.dir, d.state === 'hatch' ? 0.5 : 0);
		const th = 0.08;
		const top = c.map(([u, y]) => new Vector2(u, y + th / 2));
		const bot = c.map(([u, y]) => new Vector2(u, y - th / 2)).reverse();
		out.push({ kind: 'dome', pts: [...top, ...bot] });
	}
	// deck slabs
	floorY.forEach((y, k) => out.push({ kind: 'slab', pts: rect(0, floorR[k] ?? HULL_INNER_RADIUS, y - SLAB_THICKNESS, y) }));
	// regolith: native ground (outside the berm toe) and backfill (pit + berm)
	const toe = bermToe(h);
	const pitEdge = Math.min(toe, HULL_OUTER + 1.5 + h.burial); // 45° pit wall from the pit floor edge
	const soil: Vector2[] = [new Vector2(0, -SOIL_DEPTH), new Vector2(TERRAIN_R, -SOIL_DEPTH), new Vector2(TERRAIN_R, h.burial), new Vector2(Math.max(toe, pitEdge), h.burial)];
	soil.push(new Vector2(pitEdge, h.burial), new Vector2(HULL_OUTER + 1.5, 0), new Vector2(HULL_OUTER, 0), new Vector2(0, 0));
	out.push({ kind: 'soil', pts: soil });
	const fill: Vector2[] = [new Vector2(HULL_OUTER, 0), new Vector2(HULL_OUTER + 1.5, 0), new Vector2(pitEdge, h.burial)];
	if (toe > pitEdge + 1e-3) fill.push(new Vector2(toe, h.burial));
	for (const u of terrainSamples(h).reverse()) fill.push(new Vector2(u, terrainHeight(h, u) + 0.001));
	if (h.burial + h.berm > 0.01) out.push({ kind: 'backfill', pts: fill });
	return out;
}

export function toShape(pts: Vector2[]) {
	return new Shape(pts);
}

/** u samples along the terrain surface from the hull to the berm toe (inclusive) */
export function terrainSamples(h: HabitatConfig): number[] {
	const toe = bermToe(h);
	const crestEnd = HULL_OUTER + BERM_WIDTH;
	const us = [HULL_OUTER, crestEnd];
	const n = 8;
	for (let i = 1; i <= n; i++) us.push(crestEnd + ((toe - crestEnd) * i) / n);
	return us.filter((u, i) => i === 0 || u > us[i - 1] + 1e-4);
}
