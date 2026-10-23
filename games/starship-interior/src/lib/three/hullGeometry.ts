import { BufferGeometry, ExtrudeGeometry, Path, Shape, ShapeGeometry, Vector3, Float32BufferAttribute } from 'three';
import { AIRLOCK_ANGLE, AIRLOCK_WIDTH, HULL_INNER_RADIUS, HULL_WALL_THICKNESS } from '$lib/game/specs';

const RI = HULL_INNER_RADIUS;
const RO = HULL_INNER_RADIUS + HULL_WALL_THICKNESS;

function extrude(shape: Shape) {
	const g = new ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, curveSegments: 96 });
	g.rotateX(-Math.PI / 2); // extrusion along +Y, height 0..1
	g.computeVertexNormals();
	return g;
}

let ring: ExtrudeGeometry | undefined;
let ringGap: ExtrudeGeometry | undefined;

/** Unit-height hull wall (inner radius 4.5 m, outside thickness), optionally with airlock gap. */
export function hullWall(withAirlock: boolean) {
	if (!withAirlock) {
		if (!ring) {
			const s = new Shape();
			s.absarc(0, 0, RO, 0, Math.PI * 2, false);
			const hole = new Path();
			hole.absarc(0, 0, RI, 0, Math.PI * 2, true);
			s.holes.push(hole);
			ring = extrude(s);
		}
		return ring;
	}
	if (!ringGap) {
		// shape angle θ maps to world angle −θ after rotateX(−π/2)
		const half = AIRLOCK_WIDTH / 2 / RI;
		const c = -AIRLOCK_ANGLE;
		const a0 = c + half;
		const a1 = c - half + Math.PI * 2;
		const s = new Shape();
		s.moveTo(Math.cos(a0) * RO, Math.sin(a0) * RO);
		s.absarc(0, 0, RO, a0, a1, false);
		s.lineTo(Math.cos(a1) * RI, Math.sin(a1) * RI);
		s.absarc(0, 0, RI, a1, a0, true);
		s.closePath();
		ringGap = extrude(s);
	}
	return ringGap;
}

let guide: BufferGeometry | undefined;
/** Radial guide: rings every 1 m + hull ring + 12 spokes (line segments, y = 0). */
export function radialGuide() {
	if (guide) return guide;
	const pts: number[] = [];
	const radii = [1, 2, 3, 4, RI];
	for (const r of radii) {
		const n = 96;
		for (let k = 0; k < n; k++) {
			const a0 = (k / n) * Math.PI * 2;
			const a1 = ((k + 1) / n) * Math.PI * 2;
			pts.push(Math.cos(a0) * r, 0, Math.sin(a0) * r, Math.cos(a1) * r, 0, Math.sin(a1) * r);
		}
	}
	for (let k = 0; k < 12; k++) {
		const a = (k / 12) * Math.PI * 2;
		pts.push(0, 0, 0, Math.cos(a) * RI, 0, Math.sin(a) * RI);
	}
	guide = new BufferGeometry();
	guide.setAttribute('position', new Float32BufferAttribute(pts, 3));
	return guide;
}

export function loop(points: [number, number][], y: number) {
	const g = new BufferGeometry().setFromPoints(points.map(([x, z]) => new Vector3(x, y, z)));
	return g;
}

/** Clear radius of a hatch opening cut through the floor slab (0.8 m clear). */
export const OPENING_R = 0.4;

function deckShape(holes: [number, number][], r = RI) {
	const s = new Shape();
	s.absarc(0, 0, r, 0, Math.PI * 2, false);
	for (const [x, z] of holes) {
		const h = new Path();
		// shape (x, y) maps to world (x, −y) after rotateX(−π/2)
		h.absarc(x, -z, OPENING_R, 0, Math.PI * 2, true);
		s.holes.push(h);
	}
	return s;
}

/** Floor slab (0..slab height in +Y) with real openings for hatches. UVs in metres. */
export function slabGeometry(holes: [number, number][], thickness: number, r = RI) {
	const g = new ExtrudeGeometry(deckShape(holes, r), { depth: thickness, bevelEnabled: false, curveSegments: 64 });
	g.rotateX(-Math.PI / 2);
	g.computeVertexNormals();
	return g;
}

/** Top floor surface with openings (y = 0), UVs in metres. */
export function floorGeometry(holes: [number, number][], r = RI) {
	const g = new ShapeGeometry(deckShape(holes, r), 64);
	g.rotateX(-Math.PI / 2);
	return g;
}
