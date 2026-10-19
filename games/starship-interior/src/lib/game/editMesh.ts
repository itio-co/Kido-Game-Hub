/**
 * Editable polygon meshes for designer parts (Blender-style component editing).
 * A mesh lives in PART-LOCAL metres (the part's size is baked in): flat xyz positions + polygon faces
 * (index lists, counter-clockwise seen from outside, quads where possible) + optional per-face material.
 * Primitives stay primitives until the first component edit converts them (primitiveToMesh).
 */
import { BufferGeometry, Float32BufferAttribute, Matrix4, Vector3 } from 'three';
import type { MatName } from '$lib/three/materials';

export interface EditMesh {
	/** flat positions x,y,z (part-local metres) */
	v: number[];
	/** polygons as vertex index lists (CCW from outside) */
	f: number[][];
	/** per-face material (null / missing = the part material) */
	fm?: (MatName | null)[];
	/** smooth shading (averaged vertex normals); default flat */
	sm?: boolean;
}
export type CompMode = 'vertex' | 'edge' | 'face';
export interface CompSel {
	v: number[];
	e: string[];
	f: number[];
}
export const emptySel = (): CompSel => ({ v: [], e: [], f: [] });
export const ekey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
export const eparse = (k: string): [number, number] => k.split('-').map(Number) as [number, number];
export const cloneMesh = (m: EditMesh): EditMesh => ({ v: m.v.slice(), f: m.f.map((x) => x.slice()), fm: m.fm ? m.fm.slice() : undefined, ...(m.sm ? { sm: true } : {}) });
export const vcount = (m: EditMesh) => m.v.length / 3;
export const vget = (m: EditMesh, i: number, out = new Vector3()) => out.set(m.v[3 * i], m.v[3 * i + 1], m.v[3 * i + 2]);
const vset = (m: EditMesh, i: number, p: Vector3) => ((m.v[3 * i] = r5(p.x)), (m.v[3 * i + 1] = r5(p.y)), (m.v[3 * i + 2] = r5(p.z)));
const r5 = (n: number) => Math.round(n * 1e5) / 1e5;
function addV(m: EditMesh, p: Vector3): number {
	m.v.push(r5(p.x), r5(p.y), r5(p.z));
	return m.v.length / 3 - 1;
}
const matOf = (m: EditMesh, fi: number) => m.fm?.[fi] ?? null;
function pushFace(m: EditMesh, f: number[], mat: MatName | null) {
	m.f.push(f);
	if (m.fm || mat) {
		m.fm ??= Array(m.f.length - 1).fill(null);
		m.fm.push(mat);
	}
}

// ---------------------------------------------------------------- primitives → mesh
type Shape = 'box' | 'rbox' | 'cyl' | 'sphere' | 'capsule' | 'plane' | 'torus' | 'glb' | 'mesh';
/** rings of (radius factor 0..1, y) from top to bottom, swept around Y; poles (r = 0) become single vertices */
function lathe(rings: [number, number][], segs: number, rx: number, rz: number, caps: boolean): EditMesh {
	const m: EditMesh = { v: [], f: [] };
	const idx: number[][] = [];
	for (const [r, y] of rings) {
		if (r === 0) {
			idx.push([addV(m, new Vector3(0, y, 0))]);
			continue;
		}
		const row: number[] = [];
		for (let i = 0; i < segs; i++) {
			const t = (i / segs) * Math.PI * 2;
			row.push(addV(m, new Vector3(r * rx * Math.cos(t), y, -r * rz * Math.sin(t))));
		}
		idx.push(row);
	}
	for (let j = 0; j < idx.length - 1; j++) {
		const t = idx[j], b = idx[j + 1];
		for (let i = 0; i < segs; i++) {
			const i1 = (i + 1) % segs;
			if (t.length === 1) m.f.push([b[i], b[i1], t[0]]);
			else if (b.length === 1) m.f.push([b[0], t[i1], t[i]]);
			else m.f.push([b[i], b[i1], t[i1], t[i]]);
		}
	}
	if (caps) {
		if (idx[0].length > 1) m.f.push(idx[0].slice());
		const last = idx[idx.length - 1];
		if (last.length > 1) m.f.push(last.slice().reverse());
	}
	return m;
}
export function boxMesh(x: number, y: number, z: number): EditMesh {
	const h = [x / 2, y / 2, z / 2];
	const v: number[] = [];
	for (const [a, b, c] of [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]) v.push(r5(a * h[0]), r5(b * h[1]), r5(c * h[2]));
	return { v, f: [[4, 5, 6, 7], [1, 0, 3, 2], [5, 1, 2, 6], [0, 4, 7, 3], [7, 6, 2, 3], [0, 1, 5, 4]] };
}
/** editable mesh for a part's current primitive (part-local metres) */
export function primitiveToMesh(shape: Shape, size: [number, number, number], existing?: EditMesh): EditMesh {
	const [x, y, z] = size;
	switch (shape) {
		case 'mesh':
			return existing ? cloneMesh(existing) : boxMesh(x, y, z);
		case 'plane':
			return { v: [-x / 2, -y / 2, 0, x / 2, -y / 2, 0, x / 2, y / 2, 0, -x / 2, y / 2, 0].map(r5), f: [[0, 1, 2, 3]] };
		case 'cyl':
			return lathe([[1, y / 2], [1, -y / 2]], 16, x / 2, z / 2, true);
		case 'sphere': {
			const R = 8;
			const rings: [number, number][] = [];
			for (let j = 0; j <= R; j++) {
				const p = (Math.PI * j) / R;
				rings.push([j === 0 || j === R ? 0 : Math.sin(p), (y / 2) * Math.cos(p)]);
			}
			return lathe(rings, 16, x / 2, z / 2, false);
		}
		case 'capsule': {
			const r = Math.min(x, z) / 2;
			const h = Math.max(0, y / 2 - r);
			const rings: [number, number][] = [];
			for (let j = 0; j <= 4; j++) rings.push([j === 0 ? 0 : Math.sin((Math.PI / 2) * (j / 4)), h + r * Math.cos((Math.PI / 2) * (j / 4))]);
			for (let j = 0; j <= 4; j++) rings.push([j === 4 ? 0 : Math.cos((Math.PI / 2) * (j / 4)), -h - r * Math.sin((Math.PI / 2) * (j / 4))]);
			return lathe(rings, 16, x / 2, z / 2, false);
		}
		case 'torus': {
			const tube = Math.min(0.49, z / x / 2);
			const R = 0.5 - tube;
			const U = 24, V = 8;
			const m: EditMesh = { v: [], f: [] };
			for (let i = 0; i < U; i++)
				for (let j = 0; j < V; j++) {
					const u = (i / U) * Math.PI * 2, w = (j / V) * Math.PI * 2;
					addV(m, new Vector3((R + tube * Math.cos(w)) * Math.cos(u) * x, (R + tube * Math.cos(w)) * Math.sin(u) * y, tube * Math.sin(w) * x));
				}
			const id = (i: number, j: number) => (i % U) * V + (j % V);
			for (let i = 0; i < U; i++) for (let j = 0; j < V; j++) m.f.push([id(i, j), id(i + 1, j), id(i + 1, j + 1), id(i, j + 1)]);
			return m;
		}
		default:
			return boxMesh(x, y, z); // box, rbox (rounding dropped on conversion)
	}
}

// ---------------------------------------------------------------- queries
export function meshBounds(m: EditMesh) {
	const min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity);
	const p = new Vector3();
	for (let i = 0; i < vcount(m); i++) {
		vget(m, i, p);
		min.min(p);
		max.max(p);
	}
	if (!vcount(m)) min.set(0, 0, 0), max.set(0, 0, 0);
	return { min, max, size: [Math.max(0.001, max.x - min.x), Math.max(0.001, max.y - min.y), Math.max(0.001, max.z - min.z)] as [number, number, number] };
}
export function edgesOf(m: EditMesh): Map<string, number[]> {
	const map = new Map<string, number[]>();
	m.f.forEach((f, fi) => f.forEach((a, k) => {
		const key = ekey(a, f[(k + 1) % f.length]);
		const l = map.get(key);
		if (l) l.push(fi);
		else map.set(key, [fi]);
	}));
	return map;
}
export function faceNormal(m: EditMesh, f: number[]): Vector3 {
	const n = new Vector3(), a = new Vector3(), b = new Vector3();
	for (let k = 0; k < f.length; k++) {
		vget(m, f[k], a);
		vget(m, f[(k + 1) % f.length], b);
		n.x += (a.y - b.y) * (a.z + b.z);
		n.y += (a.z - b.z) * (a.x + b.x);
		n.z += (a.x - b.x) * (a.y + b.y);
	}
	return n;
}
export function faceCentroid(m: EditMesh, f: number[]): Vector3 {
	const c = new Vector3(), p = new Vector3();
	for (const i of f) c.add(vget(m, i, p));
	return c.divideScalar(Math.max(1, f.length));
}
/** vertex indices touched by a component selection */
export function selVerts(m: EditMesh, mode: CompMode, s: CompSel): number[] {
	const set = new Set<number>();
	if (mode === 'vertex') s.v.forEach((i) => set.add(i));
	else if (mode === 'edge') s.e.forEach((k) => eparse(k).forEach((i) => set.add(i)));
	else s.f.forEach((fi) => m.f[fi]?.forEach((i) => set.add(i)));
	return [...set].filter((i) => i >= 0 && i < vcount(m));
}
export function centroidOf(m: EditMesh, idx: number[]): Vector3 {
	const c = new Vector3(), p = new Vector3();
	for (const i of idx) c.add(vget(m, i, p));
	return idx.length ? c.divideScalar(idx.length) : c;
}

/** triangulated flat-shaded geometry (non-indexed) with one group per material; triFace maps triangle → face */
export function toGeometry(m: EditMesh, base: MatName): { geo: BufferGeometry; mats: MatName[]; triFace: number[] } {
	const byMat = new Map<MatName, number[]>();
	m.f.forEach((f, fi) => {
		if (f.length < 3) return;
		const k = matOf(m, fi) ?? base;
		const l = byMat.get(k) ?? [];
		l.push(fi);
		byMat.set(k, l);
	});
	const pos: number[] = [];
	const triFace: number[] = [];
	const mats: MatName[] = [];
	const geo = new BufferGeometry();
	let start = 0;
	for (const [mat, faces] of byMat) {
		let n = 0;
		for (const fi of faces) {
			const f = m.f[fi];
			for (let k = 1; k < f.length - 1; k++) {
				for (const i of [f[0], f[k], f[k + 1]]) pos.push(m.v[3 * i], m.v[3 * i + 1], m.v[3 * i + 2]);
				triFace.push(fi);
				n += 3;
			}
		}
		geo.addGroup(start, n, mats.length);
		mats.push(mat);
		start += n;
	}
	geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
	if (m.sm) {
		// smooth: area-weighted face normals averaged per shared vertex index
		const vn = new Float32Array(m.v.length);
		m.f.forEach((f) => {
			const n = faceNormal(m, f);
			for (const i of f) (vn[3 * i] += n.x), (vn[3 * i + 1] += n.y), (vn[3 * i + 2] += n.z);
		});
		const nrm: number[] = [];
		const t = new Vector3();
		for (const [, faces] of byMat)
			for (const fi of faces) {
				const f = m.f[fi];
				for (let k = 1; k < f.length - 1; k++)
					for (const i of [f[0], f[k], f[k + 1]]) {
						t.set(vn[3 * i], vn[3 * i + 1], vn[3 * i + 2]).normalize();
						nrm.push(t.x, t.y, t.z);
					}
			}
		geo.setAttribute('normal', new Float32BufferAttribute(nrm, 3));
	} else geo.computeVertexNormals();
	geo.computeBoundingSphere();
	return { geo, mats, triFace };
}

// ---------------------------------------------------------------- operations (return new meshes)
export function transformVerts(m: EditMesh, idx: number[], mat: Matrix4): EditMesh {
	const out = cloneMesh(m);
	const p = new Vector3();
	for (const i of idx) vset(out, i, vget(m, i, p).applyMatrix4(mat));
	return out;
}
/** drop unused vertices and degenerate faces, reindex */
export function compact(m: EditMesh): EditMesh {
	const faces: number[][] = [];
	const fm: (MatName | null)[] = [];
	m.f.forEach((f, fi) => {
		const g: number[] = [];
		for (const i of f) if (g[g.length - 1] !== i) g.push(i);
		while (g.length > 1 && g[0] === g[g.length - 1]) g.pop();
		if (new Set(g).size >= 3) {
			faces.push(g);
			fm.push(matOf(m, fi));
		}
	});
	const map = new Map<number, number>();
	const v: number[] = [];
	for (const f of faces)
		for (let k = 0; k < f.length; k++) {
			const i = f[k];
			if (!map.has(i)) {
				map.set(i, v.length / 3);
				v.push(m.v[3 * i], m.v[3 * i + 1], m.v[3 * i + 2]);
			}
			f[k] = map.get(i)!;
		}
	return { v, f: faces, fm: fm.some((x) => x) ? fm : undefined, ...(m.sm ? { sm: true } : {}) };
}
export function deleteFaces(m: EditMesh, faces: number[]): EditMesh {
	const s = new Set(faces);
	return compact({ v: m.v, f: m.f.filter((_, i) => !s.has(i)), fm: m.fm?.filter((_, i) => !s.has(i)), sm: m.sm });
}
export function deleteVerts(m: EditMesh, verts: number[]): EditMesh {
	const s = new Set(verts);
	const keep = m.f.map((f) => !f.some((i) => s.has(i)));
	return compact({ v: m.v, f: m.f.filter((_, i) => keep[i]), fm: m.fm?.filter((_, i) => keep[i]), sm: m.sm });
}
export function deleteEdges(m: EditMesh, edges: string[]): EditMesh {
	const map = edgesOf(m);
	const faces = new Set<number>();
	for (const k of edges) map.get(k)?.forEach((fi) => faces.add(fi));
	return deleteFaces(m, [...faces]);
}
/** merge vertices at their centroid */
export function mergeVerts(m: EditMesh, verts: number[]): EditMesh {
	if (verts.length < 2) return m;
	const c = centroidOf(m, verts);
	const out = cloneMesh(m);
	const keep = verts[0];
	vset(out, keep, c);
	const s = new Set(verts);
	out.f = out.f.map((f) => f.map((i) => (s.has(i) ? keep : i)));
	return compact(out);
}
/** region extrude: selected faces move out along their average normal by `dist`; side walls join the boundary */
export function extrudeFaces(m: EditMesh, faces: number[], dist = 0.05): { mesh: EditMesh; faces: number[] } {
	if (!faces.length) return { mesh: m, faces };
	const out = cloneMesh(m);
	const sel = new Set(faces);
	const n = new Vector3();
	for (const fi of faces) n.add(faceNormal(m, m.f[fi]).normalize());
	if (n.lengthSq() < 1e-9) n.copy(faceNormal(m, m.f[faces[0]]));
	n.normalize();
	// boundary edges of the region (directed, as in the selected face)
	const count = new Map<string, number>();
	for (const fi of faces) m.f[fi].forEach((a, k, f) => count.set(ekey(a, f[(k + 1) % f.length]), (count.get(ekey(a, f[(k + 1) % f.length])) ?? 0) + 1));
	const dup = new Map<number, number>();
	const p = new Vector3();
	const nv = (i: number) => {
		let j = dup.get(i);
		if (j === undefined) dup.set(i, (j = addV(out, vget(m, i, p).addScaledVector(n, dist))));
		return j;
	};
	for (const fi of faces) {
		const f = m.f[fi];
		f.forEach((a, k) => {
			const b = f[(k + 1) % f.length];
			if (count.get(ekey(a, b)) === 1) pushFace(out, [a, b, nv(b), nv(a)], matOf(m, fi));
		});
	}
	for (const fi of faces) out.f[fi] = m.f[fi].map(nv);
	void sel;
	return { mesh: out, faces };
}
/** individual inset: each face gets an inner copy (fraction k towards its centroid) joined by a ring of quads */
export function insetFaces(m: EditMesh, faces: number[], k = 0.2): { mesh: EditMesh; faces: number[] } {
	const out = cloneMesh(m);
	const p = new Vector3();
	for (const fi of faces) {
		const f = m.f[fi];
		const c = faceCentroid(m, f);
		const inner = f.map((i) => addV(out, vget(m, i, p).lerp(c, k)));
		f.forEach((a, j) => {
			const j1 = (j + 1) % f.length;
			pushFace(out, [a, f[j1], inner[j1], inner[j]], matOf(m, fi));
		});
		out.f[fi] = inner;
	}
	return { mesh: out, faces };
}
/** simple chamfer of manifold edges (two adjacent faces); width w in metres */
export function bevelEdges(m: EditMesh, edges: string[], w = 0.02): EditMesh {
	let out = cloneMesh(m);
	const pos = (i: number) => vget(out, i);
	for (const key of edges) {
		const [ea, eb] = eparse(key);
		const map = edgesOf(out);
		const adj = map.get(ekey(ea, eb));
		if (!adj || adj.length !== 2) continue;
		// F1 holds a→b, F2 holds b→a
		let [F1, F2] = adj;
		const dirIn = (fi: number, a: number, b: number) => {
			const f = out.f[fi];
			const k = f.indexOf(a);
			return f[(k + 1) % f.length] === b;
		};
		let a = ea, b = eb;
		if (!dirIn(F1, a, b)) [a, b] = [b, a];
		if (!dirIn(F2, b, a)) continue;
		const f1 = out.f[F1], f2 = out.f[F2];
		const prevIn = (f: number[], i: number) => f[(f.indexOf(i) - 1 + f.length) % f.length];
		const nextIn = (f: number[], i: number) => f[(f.indexOf(i) + 1) % f.length];
		const len = pos(a).distanceTo(pos(b));
		const ww = Math.min(w, len * 0.45);
		const slide = (from: number, to: number) => {
			const pa = pos(from), dir = pos(to).sub(pa);
			const l = dir.length();
			return addV(out, pa.addScaledVector(dir.normalize(), Math.min(ww, l * 0.45)));
		};
		const p1 = prevIn(f1, a), r1 = nextIn(f1, b); // F1: p1 → a → b → r1
		const q2 = nextIn(f2, a), s2 = prevIn(f2, b); // F2: s2 → b → a → q2
		const a1 = slide(a, p1), b1 = slide(b, r1), a2 = slide(a, q2), b2 = slide(b, s2);
		const nb1: Record<number, number> = { [p1]: a1, [q2]: a2 };
		const nbB: Record<number, number> = { [r1]: b1, [s2]: b2 };
		out.f = out.f.map((f, fi) => {
			if (fi === F1) return f.map((i) => (i === a ? a1 : i === b ? b1 : i));
			if (fi === F2) return f.map((i) => (i === a ? a2 : i === b ? b2 : i));
			const g: number[] = [];
			for (let k = 0; k < f.length; k++) {
				const i = f[k];
				if (i !== a && i !== b) {
					g.push(i);
					continue;
				}
				const rep = i === a ? nb1 : nbB;
				const prev = f[(k - 1 + f.length) % f.length], next = f[(k + 1) % f.length];
				const x = rep[prev], y = rep[next];
				if (x !== undefined) g.push(x);
				if (y !== undefined && y !== x) g.push(y);
				if (x === undefined && y === undefined) g.push(i);
			}
			return g;
		});
		pushFace(out, [b1, a1, a2, b2], matOf(out, F1));
		out = compact(out);
	}
	return out;
}

/** reverse the winding (normal direction) of the given faces */
export function flipFaces(m: EditMesh, faces: number[]): EditMesh {
	const out = cloneMesh(m);
	for (const fi of faces) if (out.f[fi]) out.f[fi] = out.f[fi].slice().reverse();
	return out;
}
/** make windings consistent across shared edges (flood fill per connected piece), then point each closed piece outwards */
export function recalcNormals(m: EditMesh): EditMesh {
	const out = cloneMesh(m);
	const map = edgesOf(out);
	const seen = new Array(out.f.length).fill(false);
	const has = (f: number[], a: number, b: number) => f.some((x, k) => x === a && f[(k + 1) % f.length] === b);
	for (let s0 = 0; s0 < out.f.length; s0++) {
		if (seen[s0]) continue;
		const piece: number[] = [];
		const queue = [s0];
		seen[s0] = true;
		while (queue.length) {
			const fi = queue.shift()!;
			piece.push(fi);
			const f = out.f[fi];
			f.forEach((a, k) => {
				const b = f[(k + 1) % f.length];
				for (const g of map.get(ekey(a, b)) ?? []) {
					if (seen[g]) continue;
					seen[g] = true;
					// a neighbour must run b→a; if it also runs a→b it is flipped
					if (has(out.f[g], a, b)) out.f[g] = out.f[g].slice().reverse();
					queue.push(g);
				}
			});
		}
		let vol = 0;
		const a = new Vector3(), b = new Vector3(), c = new Vector3();
		for (const fi of piece) {
			const f = out.f[fi];
			for (let k = 1; k < f.length - 1; k++) vol += vget(out, f[0], a).dot(vget(out, f[k], b).cross(vget(out, f[k + 1], c)));
		}
		if (vol < 0) for (const fi of piece) out.f[fi] = out.f[fi].slice().reverse();
	}
	return out;
}
/** assign a material to faces (null = the part material) */
export function setFaceMat(m: EditMesh, faces: number[], mat: MatName | null): EditMesh {
	const out = cloneMesh(m);
	out.fm = out.fm ?? Array(out.f.length).fill(null);
	for (const fi of faces) if (fi < out.f.length) out.fm[fi] = mat;
	if (!out.fm.some((x) => x)) out.fm = undefined;
	return out;
}

// ---------------------------------------------------------------- validation
export function validateMesh(m: EditMesh): string[] {
	const w: string[] = [];
	const map = edgesOf(m);
	let open = 0, non = 0;
	for (const l of map.values()) {
		if (l.length === 1) open++;
		else if (l.length > 2) non++;
	}
	if (non) w.push(`${non} non-manifold edge(s) (shared by 3+ faces)`);
	if (open) w.push(`${open} open edge(s) – the mesh has holes`);
	const deg = m.f.filter((f) => faceNormal(m, f).length() < 1e-8).length;
	if (deg) w.push(`${deg} zero-area face(s)`);
	if (!open && !non && m.f.length) {
		// signed volume (divergence theorem); negative = inside-out / folded
		let vol = 0;
		const a = new Vector3(), b = new Vector3(), c = new Vector3();
		for (const f of m.f)
			for (let k = 1; k < f.length - 1; k++) vol += vget(m, f[0], a).dot(vget(m, f[k], b).cross(vget(m, f[k + 1], c))) / 6;
		if (vol < -1e-9) w.push('Mesh is inside-out or self-intersecting (negative volume)');
		else if (Math.abs(vol) < 1e-9) w.push('Mesh has no volume (flattened)');
	}
	return w;
}
export function sanitizeMesh(raw: unknown): EditMesh | undefined {
	if (!raw || typeof raw !== 'object') return undefined;
	const r = raw as { v?: unknown; f?: unknown; fm?: unknown; sm?: unknown };
	if (!Array.isArray(r.v) || !Array.isArray(r.f) || r.v.length % 3 || r.v.length > 60000) return undefined;
	const v = r.v.map((x) => (typeof x === 'number' && isFinite(x) ? Math.max(-50, Math.min(50, x)) : 0));
	const n = v.length / 3;
	const f = r.f.slice(0, 20000).filter((x): x is number[] => Array.isArray(x) && x.length >= 3 && x.length <= 64 && x.every((i) => Number.isInteger(i) && i >= 0 && i < n));
	if (!f.length) return undefined;
	const fm = Array.isArray(r.fm) ? r.fm.slice(0, f.length).map((x) => (typeof x === 'string' ? (x as MatName) : null)) : undefined;
	return { v, f, fm: fm?.some((x) => x) ? fm : undefined, ...(r.sm === true ? { sm: true } : {}) };
}
