/**
 * Crew navigation: per-deck occupancy grid (0.1 m, same as the clearance check) with obstacles
 * inflated by the body radius, Dijkstra distance fields (8-connected, no corner cutting),
 * gradient-descent paths + line-of-sight smoothing, and a small portal graph for multi-deck routes
 * through ladder connections.
 */
import { CATALOG_BY_ID } from '$lib/game/catalog';
import { containsPoint, footprintOf, localToWorld, shaftAccess, type Footprint } from '$lib/game/geometry';
import { PATH_GRID } from '$lib/game/specs';
import type { Deck, Shaft } from '$lib/game/types';

export const NAV_CELL = PATH_GRID;
export const BODY_PAD = 0.25;

export class DeckNav {
	readonly N: number;
	readonly R: number;
	readonly free: Uint8Array;
	private fields = new Map<number, Float32Array>();
	constructor(R: number, obstacles: Footprint[], extraBlocked: Footprint[] = []) {
		this.R = R;
		this.N = Math.ceil((2 * R) / NAV_CELL);
		const N = this.N;
		this.free = new Uint8Array(N * N);
		const lim = R - 0.3;
		for (let j = 0; j < N; j++)
			for (let i = 0; i < N; i++) {
				const x = this.cx(i), z = this.cx(j);
				if (Math.hypot(x, z) > lim) continue;
				let ok = true;
				for (const f of obstacles)
					if (containsPoint(f, x, z)) {
						ok = false;
						break;
					}
				if (ok) for (const f of extraBlocked) if (containsPoint(f, x, z)) { ok = false; break; }
				if (ok) this.free[j * N + i] = 1;
			}
	}
	cx(i: number) {
		return -this.R + (i + 0.5) * NAV_CELL;
	}
	cell(x: number, z: number): number {
		const i = Math.floor((x + this.R) / NAV_CELL);
		const j = Math.floor((z + this.R) / NAV_CELL);
		if (i < 0 || j < 0 || i >= this.N || j >= this.N) return -1;
		return j * this.N + i;
	}
	isFree(x: number, z: number) {
		const c = this.cell(x, z);
		return c >= 0 && this.free[c] === 1;
	}
	pt(c: number): [number, number] {
		const i = c % this.N;
		return [this.cx(i), this.cx((c - i) / this.N)];
	}
	/** nearest free cell to (x, z) within maxD metres (−1 if none) */
	nearestFree(x: number, z: number, maxD = 1.3): number {
		const c0 = this.cell(x, z);
		if (c0 >= 0 && this.free[c0]) return c0;
		const r = Math.ceil(maxD / NAV_CELL);
		const i0 = Math.floor((x + this.R) / NAV_CELL), j0 = Math.floor((z + this.R) / NAV_CELL);
		let best = -1, bd = Infinity;
		for (let dj = -r; dj <= r; dj++)
			for (let di = -r; di <= r; di++) {
				const i = i0 + di, j = j0 + dj;
				if (i < 0 || j < 0 || i >= this.N || j >= this.N) continue;
				const c = j * this.N + i;
				if (!this.free[c]) continue;
				const d = Math.hypot(this.cx(i) - x, this.cx(j) - z);
				if (d < bd && d <= maxD) (bd = d), (best = c);
			}
		return best;
	}
	/** Dijkstra distance field (metres) from a free cell; cached per source cell */
	field(src: number): Float32Array {
		const hit = this.fields.get(src);
		if (hit) return hit;
		const N = this.N;
		const dist = new Float32Array(N * N).fill(Infinity);
		if (src < 0 || !this.free[src]) return dist;
		dist[src] = 0;
		// binary heap of (dist, cell)
		const hc: number[] = [src], hd: number[] = [0];
		const push = (c: number, d: number) => {
			hc.push(c), hd.push(d);
			let k = hc.length - 1;
			while (k > 0) {
				const p = (k - 1) >> 1;
				if (hd[p] <= hd[k]) break;
				[hc[p], hc[k]] = [hc[k], hc[p]];
				[hd[p], hd[k]] = [hd[k], hd[p]];
				k = p;
			}
		};
		const pop = (): [number, number] => {
			const c = hc[0], d = hd[0];
			const lc = hc.pop()!, ld = hd.pop()!;
			if (hc.length) {
				hc[0] = lc, hd[0] = ld;
				let k = 0;
				for (;;) {
					const l = 2 * k + 1, r = l + 1;
					let m = k;
					if (l < hc.length && hd[l] < hd[m]) m = l;
					if (r < hc.length && hd[r] < hd[m]) m = r;
					if (m === k) break;
					[hc[m], hc[k]] = [hc[k], hc[m]];
					[hd[m], hd[k]] = [hd[k], hd[m]];
					k = m;
				}
			}
			return [c, d];
		};
		const D = NAV_CELL, DD = NAV_CELL * Math.SQRT2;
		while (hc.length) {
			const [c, d] = pop();
			if (d > dist[c]) continue;
			const i = c % N, j = (c - i) / N;
			for (let dj = -1; dj <= 1; dj++)
				for (let di = -1; di <= 1; di++) {
					if (!di && !dj) continue;
					const ni = i + di, nj = j + dj;
					if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
					const nc = nj * N + ni;
					if (!this.free[nc]) continue;
					if (di && dj && (!this.free[j * N + ni] || !this.free[nj * N + i])) continue; // no corner cutting
					const nd = d + (di && dj ? DD : D);
					if (nd < dist[nc]) (dist[nc] = nd), push(nc, nd);
				}
		}
		if (this.fields.size > 48) this.fields.delete(this.fields.keys().next().value!);
		this.fields.set(src, dist);
		return dist;
	}
	/** path (world points) from the field's source to `dst` by steepest descent, then smoothed */
	pathTo(field: Float32Array, dst: number): [number, number][] | null {
		if (dst < 0 || !isFinite(field[dst])) return null;
		const N = this.N;
		const cells = [dst];
		let c = dst;
		let guard = N * N;
		while (field[c] > 0 && guard-- > 0) {
			const i = c % N, j = (c - i) / N;
			let best = c, bd = field[c];
			for (let dj = -1; dj <= 1; dj++)
				for (let di = -1; di <= 1; di++) {
					const ni = i + di, nj = j + dj;
					if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
					const nc = nj * N + ni;
					if (field[nc] < bd) (bd = field[nc]), (best = nc);
				}
			if (best === c) break;
			c = best;
			cells.push(c);
		}
		cells.reverse();
		return this.smooth(cells.map((k) => this.pt(k)));
	}
	/** straight segment stays in free cells (sampled every 0.05 m) */
	los(a: [number, number], b: [number, number]): boolean {
		const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
		const n = Math.ceil(L / 0.05);
		for (let k = 1; k < n; k++) {
			const t = k / n;
			if (!this.isFree(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) return false;
		}
		return true;
	}
	smooth(pts: [number, number][]): [number, number][] {
		if (pts.length <= 2) return pts;
		const out: [number, number][] = [pts[0]];
		let k = 0;
		while (k < pts.length - 1) {
			let far = k + 1;
			for (let m = pts.length - 1; m > k + 1; m--)
				if (this.los(pts[k], pts[m])) {
					far = m;
					break;
				}
			out.push(pts[far]);
			k = far;
		}
		return out;
	}
}

export interface Portal {
	shaft: Shaft;
	/** standing point in front of the ladder on the lower deck / of the opening on the upper deck */
	bottom: { deck: number; x: number; z: number; cell: number };
	top: { deck: number; x: number; z: number; cell: number };
	length: number;
}

/** build navigation for every deck (obstacles: equipment footprints + ladders/openings) */
export function buildNav(decks: Deck[], shafts: Shaft[], radius: (k: number) => number, shaftLen: (s: Shaft) => number) {
	const navs = decks.map((d, k) => {
		const obstacles = d.modules.filter((m) => !CATALOG_BY_ID[m.type]?.walkable && CATALOG_BY_ID[m.type]).map((m) => footprintOf(m.type, m.x, m.z, m.angle, BODY_PAD));
		const holes: Footprint[] = shafts.filter((s) => s.from === k || s.to === k).map((s) => ({ kind: 'circle', cx: s.x, cz: s.z, r: 0.45 + BODY_PAD * 0.5 }));
		return new DeckNav(radius(k), obstacles, holes);
	});
	const portals: Portal[] = [];
	for (const s of shafts) {
		const a = shaftAccess(s.x, s.z, s.angle);
		const [ax, az] = a.kind === 'rect' ? [a.cx, a.cz] : localToWorld(s.x, s.z, s.angle, 0, 0.85);
		const lo = navs[s.from], hi = navs[s.to];
		if (!lo || !hi) continue;
		const cb = lo.nearestFree(ax, az, 0.9), ct = hi.nearestFree(ax, az, 0.9);
		if (cb < 0 || ct < 0) continue;
		const pb = lo.pt(cb), pt = hi.pt(ct);
		portals.push({ shaft: s, bottom: { deck: s.from, x: pb[0], z: pb[1], cell: cb }, top: { deck: s.to, x: pt[0], z: pt[1], cell: ct }, length: shaftLen(s) });
	}
	return { navs, portals };
}
export type NavWorld = ReturnType<typeof buildNav>;

/** climbing is slower than walking: equivalent walking metres per metre of ladder */
export const CLIMB_COST = 2.5;

export type Leg =
	| { kind: 'walk'; deck: number; pts: [number, number][] }
	| { kind: 'climb'; portal: number; up: boolean };

/**
 * Costs from a start point to every portal end (Dijkstra over the portal graph).
 * Returns per portal [costToBottom, costToTop] and predecessor info for path reconstruction.
 */
export function portalCosts(w: NavWorld, deck: number, startCell: number) {
	const P = w.portals.length;
	const cost = new Float64Array(2 * P).fill(Infinity); // node 2p = bottom, 2p+1 = top
	const prev = new Int32Array(2 * P).fill(-2); // -1 = from start
	const end = (n: number) => (n % 2 === 0 ? w.portals[n >> 1].bottom : w.portals[n >> 1].top);
	const startField = w.navs[deck].field(startCell);
	for (let n = 0; n < 2 * P; n++) {
		const e = end(n);
		if (e.deck === deck && isFinite(startField[e.cell])) (cost[n] = startField[e.cell]), (prev[n] = -1);
	}
	const done = new Uint8Array(2 * P);
	for (;;) {
		let n = -1, best = Infinity;
		for (let k = 0; k < 2 * P; k++) if (!done[k] && cost[k] < best) (best = cost[k]), (n = k);
		if (n < 0) break;
		done[n] = 1;
		// climb to the other end
		const o = n ^ 1;
		const c = cost[n] + w.portals[n >> 1].length * CLIMB_COST + 1;
		if (c < cost[o]) (cost[o] = c), (prev[o] = n);
		// walk to other portal ends on the same deck
		const e = end(n);
		const f = w.navs[e.deck].field(e.cell);
		for (let k = 0; k < 2 * P; k++) {
			if (done[k]) continue;
			const ek = end(k);
			if (ek.deck !== e.deck) continue;
			const ck = cost[n] + f[ek.cell];
			if (ck < cost[k]) (cost[k] = ck), (prev[k] = n);
		}
	}
	return { cost, prev, startField, end };
}

/** travel cost to a target cell on a deck, plus the portal node used (−1 = direct) */
export function travelCost(w: NavWorld, pc: ReturnType<typeof portalCosts>, startDeck: number, deck: number, cell: number): { cost: number; via: number } {
	let best = Infinity, via = -1;
	if (deck === startDeck) best = pc.startField[cell];
	for (let n = 0; n < pc.cost.length; n++) {
		const e = pc.end(n);
		if (e.deck !== deck || !isFinite(pc.cost[n])) continue;
		const c = pc.cost[n] + w.navs[deck].field(e.cell)[cell];
		if (c < best) (best = c), (via = n);
	}
	return { cost: best, via };
}

/** legs from start to (deck, cell) given the chosen final portal node */
export function buildLegs(w: NavWorld, pc: ReturnType<typeof portalCosts>, startDeck: number, startCell: number, deck: number, cell: number, via: number): Leg[] | null {
	const legs: Leg[] = [];
	if (via < 0) {
		const pts = w.navs[startDeck].pathTo(pc.startField, cell);
		return pts ? [{ kind: 'walk', deck: startDeck, pts }] : null;
	}
	// reconstruct node chain
	const chain: number[] = [];
	for (let n = via; n >= 0; n = pc.prev[n]) chain.push(n);
	chain.reverse();
	let curDeck = startDeck, curField = pc.startField;
	for (let k = 0; k < chain.length; k++) {
		const n = chain[k];
		const e = pc.end(n);
		if (k > 0 && (chain[k - 1] ^ 1) === n) {
			// climb from previous end to this end
			legs.push({ kind: 'climb', portal: n >> 1, up: n % 2 === 1 });
		} else {
			const pts = w.navs[curDeck].pathTo(curField, e.cell);
			if (!pts) return null;
			legs.push({ kind: 'walk', deck: curDeck, pts });
		}
		curDeck = e.deck;
		curField = w.navs[e.deck].field(e.cell);
	}
	const pts = w.navs[curDeck].pathTo(curField, cell);
	if (!pts) return null;
	legs.push({ kind: 'walk', deck: curDeck, pts });
	return legs;
}
