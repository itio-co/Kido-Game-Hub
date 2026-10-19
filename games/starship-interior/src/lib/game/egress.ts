/**
 * Couch egress / ingress clearance (IDSS-style ≥ 0.8 m translation path, ESTIMATE rule set).
 *
 * For every launch couch (any item with `seats`) the clear path from its access side to the nearest
 * ladder / hatch access zone (or the airlock) is found on a 0.1 m grid. Other equipment does not wall the
 * path off: cells inside an item's footprint (padded by half the path width) are expensive instead, so
 * the cheapest path tells us exactly WHICH items block the egress and WHERE (the blocked segment). The
 * couch's own envelope uses the geometry of the phase in effect: deployed (reclined) in Launch/Landing,
 * stowed otherwise. Keep-out zones (door swings, fold-downs) are visualised but do not block egress
 * (doors are closed and latched for launch / landing).
 */
import { CATALOG_BY_ID } from './catalog';
import { PHASE, accessFootprint, containsPoint, footprintOf, localToWorld, overlaps, shaftAccess, type Footprint, type Vec2 } from './geometry';
import { AIRLOCK_ANGLE, MIN_PASSAGE_WIDTH } from './specs';
import type { ModuleId, Phase, PlacedModule, Shaft } from './types';

export const EGRESS_GRID = 0.1;
const BLOCK_COST = 60; // per cell inside another item: always detoured around when a clear path exists

export interface Blocker {
	uid: number;
	name: string;
	x: number;
	z: number;
}
export interface EgressResult {
	uid: number;
	name: string;
	x: number;
	z: number;
	envelope: 'deployed' | 'stowed';
	ok: boolean;
	/** "Ladder L3-4" / "Airlock" */
	target: string | null;
	/** polyline on the floor (world x, z) */
	path: Vec2[];
	/** per path point: inside a blocking item */
	blocked: boolean[];
	blockers: Blocker[];
	length: number;
	text: string;
}
export interface EgressCtx {
	modules: PlacedModule[];
	shafts: Shaft[];
	label: (s: Shaft) => string;
	R: number;
	hasAirlock: boolean;
	deckLabel: string;
}

/** keep-out zone in front of an item (door swing / fold-down), local +Z side */
export function keepoutFootprint(m: { type: ModuleId; x: number; z: number; angle: number }): Footprint | null {
	const def = CATALOG_BY_ID[m.type];
	const k = def?.keepout;
	if (!k || def.shape !== 'rect') return null;
	const [cx, cz] = localToWorld(m.x, m.z, m.angle, 0, def.d / 2 + k.d / 2);
	return { kind: 'rect', cx, cz, hw: (k.w ?? def.w) / 2, hd: k.d / 2, angle: m.angle };
}

interface Grid {
	N: number;
	R: number;
	/** -1 = outside hull, else index into obs (+1), 0 = free */
	tag: Int32Array;
	obs: PlacedModule[];
	targets: { f: Footprint; label: string }[];
}
const cx = (g: Grid, i: number) => -g.R + (i + 0.5) * EGRESS_GRID;

/** obstacle grid for a deck (everything except `skip`), in the geometry of `phase` */
export function egressGrid(ctx: EgressCtx, phase: Phase, skip: number): Grid {
	const keep = PHASE.v;
	PHASE.v = phase;
	const half = MIN_PASSAGE_WIDTH / 2;
	const R = ctx.R;
	const N = Math.ceil((2 * R) / EGRESS_GRID);
	const tag = new Int32Array(N * N);
	const obs = ctx.modules.filter((m) => m.uid !== skip && !CATALOG_BY_ID[m.type]?.walkable && (m.y ?? 0) < 1.2);
	const fps = obs.map((m) => footprintOf(m.type, m.x, m.z, m.angle, half));
	const g: Grid = { N, R, tag, obs, targets: [] };
	for (let j = 0; j < N; j++)
		for (let i = 0; i < N; i++) {
			const x = cx(g, i), z = cx(g, j);
			const k = j * N + i;
			if (Math.hypot(x, z) > R - half) {
				tag[k] = -1;
				continue;
			}
			for (let o = 0; o < fps.length; o++)
				if (containsPoint(fps[o], x, z)) {
					tag[k] = o + 1;
					break;
				}
		}
	for (const sh of ctx.shafts) g.targets.push({ f: shaftAccess(sh.x, sh.z, sh.angle), label: `Ladder ${ctx.label(sh)}` });
	if (ctx.hasAirlock) {
		const r = R - half - 0.05;
		g.targets.push({ f: { kind: 'circle', cx: Math.cos(AIRLOCK_ANGLE) * r, cz: Math.sin(AIRLOCK_ANGLE) * r, r: 0.4 }, label: 'Airlock' });
	}
	PHASE.v = keep;
	return g;
}

/** egress of one couch at pose `m` over a prepared grid */
export function egressSolve(ctx: EgressCtx, g: Grid, m: PlacedModule, phase: Phase): EgressResult {
	const keep = PHASE.v;
	PHASE.v = phase;
	const def = CATALOG_BY_ID[m.type];
	const env = phase === 'launch' && def.launch ? 'deployed' : 'stowed';
	const name = def.name;
	const base = { uid: m.uid, name, x: m.x, z: m.z, envelope: env as EgressResult['envelope'] };
	const self = footprintOf(m.type, m.x, m.z, m.angle);
	const acc = accessFootprint(m.type, m.x, m.z, m.angle) ?? footprintOf(m.type, m.x, m.z, m.angle, 0.3);
	// items standing in the couch's own access zone block ingress directly
	const accBlock: Blocker[] = [];
	for (const o of g.obs) {
		if (overlaps(acc, footprintOf(o.type, o.x, o.z, o.angle))) accBlock.push({ uid: o.uid, name: CATALOG_BY_ID[o.type]?.name ?? o.type, x: o.x, z: o.z });
	}
	PHASE.v = keep;
	const { N, tag } = g;
	if (!g.targets.length) {
		return { ...base, ok: false, target: null, path: [], blocked: [], blockers: [], length: 0, text: `${name} (${ctx.deckLabel}): no ladder / hatch or airlock on this deck to egress to` };
	}
	const isTarget = new Int16Array(N * N).fill(-1);
	const dist = new Float32Array(N * N).fill(Infinity);
	const prev = new Int32Array(N * N).fill(-1);
	const heap: number[] = []; // binary heap of cell indices keyed by dist
	const push = (k: number) => {
		heap.push(k);
		let i = heap.length - 1;
		while (i > 0) {
			const p = (i - 1) >> 1;
			if (dist[heap[p]] <= dist[heap[i]]) break;
			[heap[p], heap[i]] = [heap[i], heap[p]];
			i = p;
		}
	};
	const pop = () => {
		const top = heap[0];
		const last = heap.pop()!;
		if (heap.length) {
			heap[0] = last;
			let i = 0;
			for (;;) {
				const l = 2 * i + 1, r = l + 1;
				let s = i;
				if (l < heap.length && dist[heap[l]] < dist[heap[s]]) s = l;
				if (r < heap.length && dist[heap[r]] < dist[heap[s]]) s = r;
				if (s === i) break;
				[heap[s], heap[i]] = [heap[i], heap[s]];
				i = s;
			}
		}
		return top;
	};
	const selfCell = (x: number, z: number) => containsPoint(self, x, z);
	const cost = (k: number) => (tag[k] > 0 ? BLOCK_COST : 1);
	for (let j = 0; j < N; j++)
		for (let i = 0; i < N; i++) {
			const k = j * N + i;
			if (tag[k] < 0) continue;
			const x = cx(g, i), z = cx(g, j);
			for (let t = 0; t < g.targets.length; t++) if (containsPoint(g.targets[t].f, x, z)) isTarget[k] = t;
			if (containsPoint(acc, x, z) && !selfCell(x, z)) {
				dist[k] = cost(k);
				push(k);
			}
		}
	let end = -1;
	while (heap.length) {
		const k = pop();
		if (isTarget[k] >= 0) {
			end = k;
			break;
		}
		const i = k % N, j = (k - i) / N;
		for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const ni = i + di, nj = j + dj;
			if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
			const nk = nj * N + ni;
			if (tag[nk] < 0 || selfCell(cx(g, ni), cx(g, nj))) continue;
			const d = dist[k] + cost(nk);
			if (d < dist[nk]) {
				dist[nk] = d;
				prev[nk] = k;
				push(nk);
			}
		}
	}
	if (end < 0)
		return { ...base, ok: false, target: null, path: [], blocked: [], blockers: [], length: 0, text: `${name} (${ctx.deckLabel}) egress blocked: no ${MIN_PASSAGE_WIDTH} m path to any ladder / hatch (hull or enclosed)` };
	const cells: number[] = [];
	for (let k = end; k >= 0; k = prev[k]) cells.push(k);
	cells.reverse();
	const pts: Vec2[] = [];
	const blocked: boolean[] = [];
	const bset = new Map<number, Blocker>();
	for (const k of cells) {
		const i = k % N, j = (k - i) / N;
		pts.push([cx(g, i), cx(g, j)]);
		const t = tag[k];
		blocked.push(t > 0);
		if (t > 0 && !bset.has(t)) {
			const o = g.obs[t - 1];
			bset.set(t, { uid: o.uid, name: CATALOG_BY_ID[o.type]?.name ?? o.type, x: o.x, z: o.z });
		}
	}
	// simplify: keep corners and blocked/free transitions
	const sp: Vec2[] = [], sb: boolean[] = [];
	for (let n = 0; n < pts.length; n++) {
		const a = pts[n - 1], b = pts[n], c = pts[n + 1];
		const turn = !a || !c || (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) !== 0;
		if (turn || blocked[n] !== blocked[n - 1] || blocked[n] !== blocked[n + 1]) (sp.push(b), sb.push(blocked[n]));
	}
	const length = cells.length * EGRESS_GRID;
	for (const b of accBlock) if (![...bset.values()].some((x) => x.uid === b.uid)) bset.set(-b.uid - 1, b);
	const blockers = [...bset.values()];
	const target = g.targets[isTarget[end]].label;
	const ok = blockers.length === 0;
	const env2 = env === 'deployed' ? 'deployed envelope' : 'stowed envelope';
	const text = ok
		? `${name} (${ctx.deckLabel}) egress clear: ${length.toFixed(1)} m to ${target} (${env2})`
		: `${name} (${ctx.deckLabel}) egress blocked by ${blockers.map((b) => `${b.name} at (${b.x.toFixed(1)}, ${b.z.toFixed(1)})`).join(', ')}; needs ${MIN_PASSAGE_WIDTH} m path to ${target} (${env2})`;
	return { ...base, ok, target, path: sp, blocked: sb, blockers, length, text };
}

export function egressFor(ctx: EgressCtx, m: PlacedModule, phase: Phase): EgressResult {
	return egressSolve(ctx, egressGrid(ctx, phase, m.uid), m, phase);
}

/**
 * Nearest pose (same angle) within 1.2 m where the couch fits (`fits`) and its egress is clear.
 * Candidates are tried ring by ring (closest first) over a grid prepared once.
 */
export function nudgeFor(ctx: EgressCtx, m: PlacedModule, phase: Phase, fits: (x: number, z: number) => boolean): { x: number; z: number; d: number } | null {
	const g = egressGrid(ctx, phase, m.uid);
	for (let r = 0.1; r <= 1.2 + 1e-9; r += 0.1)
		for (let k = 0; k < 12; k++) {
			const a = (k / 12) * Math.PI * 2;
			const x = +(m.x + Math.cos(a) * r).toFixed(3), z = +(m.z + Math.sin(a) * r).toFixed(3);
			if (!fits(x, z)) continue;
			if (egressSolve(ctx, g, { ...m, x, z }, phase).ok) return { x, z, d: r };
		}
	return null;
}
