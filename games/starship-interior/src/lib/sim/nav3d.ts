/**
 * Micro-g volumetric navigation: one voxel grid (0.2 m) over the whole deck stack.
 * Free voxels = inside the hull (minus a body margin), inside a deck's habitable volume or a hatch
 * column through a slab / dome gap, and outside every equipment box (inflated by the body radius).
 * Distance fields use Dial's bucket queue over the 26-neighbourhood (integer costs 5/7/9 per
 * 0.2 m step ≈ 1/√2/√3), paths descend the field and are smoothed by 3D line of sight.
 */
import { CATALOG_BY_ID } from '$lib/game/catalog';
import { containsPoint, footprintOf, type Footprint } from '$lib/game/geometry';
import type { Deck, Shaft } from '$lib/game/types';

export const VOX = 0.2;
const PAD = 0.25; // body radius / personal space
const VMARGIN = 0.3; // body centre clearance from floor / ceiling
const HATCH_R = 0.3; // usable radius of the hatch column (Ø0.8 opening minus shoulders)
export type V3 = [number, number, number];

interface Box {
	f: Footprint;
	y0: number;
	y1: number;
}

export class VoxNav {
	readonly C: number;
	readonly R: number;
	readonly N: number;
	readonly M: number;
	readonly y0: number;
	readonly free: Uint8Array;
	/** 1 = free voxel next to a surface (wall, slab, equipment) within reach → can push off / grab */
	readonly near: Uint8Array;
	readonly deckOf: Int8Array;
	private fields = new Map<number, Float32Array>();
	private nb: { d: number; c: number }[] = [];
	constructor(
		decks: Deck[],
		shafts: Shaft[],
		floorY: number[],
		radius: (k: number) => number,
		moduleHeight: (type: string) => number
	) {
		const Rmax = Math.max(1, ...decks.map((_, k) => radius(k)));
		const top = Math.max(...decks.map((d, k) => floorY[k] + d.height));
		const y0 = floorY[0] ?? 0;
		let C = VOX;
		// keep the grid bounded on huge habitats
		while (Math.ceil((2 * Rmax) / C) ** 2 * Math.ceil((top - y0) / C) > 600_000) C += 0.05;
		this.C = C;
		this.R = Rmax;
		this.N = Math.ceil((2 * Rmax) / C);
		this.M = Math.ceil((top - y0) / C);
		this.y0 = y0;
		const N = this.N, M = this.M;
		this.free = new Uint8Array(N * N * M);
		this.near = new Uint8Array(N * N * M);
		this.deckOf = new Int8Array(N * N * M).fill(-1);
		const boxes: Box[][] = decks.map((d, k) =>
			d.modules
				.filter((m) => {
					const def = CATALOG_BY_ID[m.type];
					return def && !def.walkable && !def.restraint;
				})
				.map((m) => {
					const fy = floorY[k] + (m.y ?? 0);
					return { f: footprintOf(m.type, m.x, m.z, m.angle, PAD), y0: fy - PAD, y1: fy + moduleHeight(m.type) + PAD };
				})
		);
		const lim = decks.map((_, k) => radius(k) - 0.35);
		for (let l = 0; l < M; l++) {
			const y = y0 + (l + 0.5) * C;
			// which deck volume (habitable band) is this layer in?
			let dk = -1;
			for (let k = 0; k < decks.length; k++) if (y >= floorY[k] + VMARGIN && y <= floorY[k] + decks[k].height - VMARGIN) dk = k;
			// hatch columns crossing this layer
			const cols = shafts.filter((s) => floorY[s.from] !== undefined && floorY[s.to] !== undefined && y >= floorY[s.from] + VMARGIN && y <= floorY[s.to] + VMARGIN + 0.1);
			if (dk < 0 && !cols.length) continue;
			for (let j = 0; j < N; j++)
				for (let i = 0; i < N; i++) {
					const x = -Rmax + (i + 0.5) * C, z = -Rmax + (j + 0.5) * C;
					let k = -1;
					for (const s of cols)
						if (Math.hypot(x - s.x, z - s.z) <= HATCH_R) {
							k = y < floorY[s.to] ? s.from : s.to;
							break;
						}
					if (k < 0) {
						if (dk < 0 || Math.hypot(x, z) > lim[dk]) continue;
						let hit = false;
						for (const b of boxes[dk])
							if (y >= b.y0 && y <= b.y1 && containsPoint(b.f, x, z)) {
								hit = true;
								break;
							}
						if (hit) continue;
						k = dk;
					}
					const c = (l * N + j) * N + i;
					this.free[c] = 1;
					this.deckOf[c] = k;
				}
		}
		// neighbourhood
		for (let dl = -1; dl <= 1; dl++)
			for (let dj = -1; dj <= 1; dj++)
				for (let di = -1; di <= 1; di++) {
					const n = Math.abs(di) + Math.abs(dj) + Math.abs(dl);
					if (!n) continue;
					this.nb.push({ d: n === 1 ? 5 : n === 2 ? 7 : 9, c: (dl * N + dj) * N + di });
				}
		// "near a surface": any blocked voxel within 3 cells (≈0.6 m beyond the padded surface ≈ arm/leg reach)
		const reach = 3;
		for (let l = 0; l < M; l++)
			for (let j = 0; j < N; j++)
				for (let i = 0; i < N; i++) {
					const c = (l * N + j) * N + i;
					if (!this.free[c]) continue;
					let found = false;
					for (let dl = -reach; dl <= reach && !found; dl++)
						for (let dj = -reach; dj <= reach && !found; dj++)
							for (let di = -reach; di <= reach; di++) {
								const ii = i + di, jj = j + dj, ll = l + dl;
								if (ii < 0 || jj < 0 || ll < 0 || ii >= N || jj >= N || ll >= M || !this.free[(ll * N + jj) * N + ii]) {
									found = true;
									break;
								}
							}
					if (found) this.near[c] = 1;
				}
	}
	cell(x: number, y: number, z: number): number {
		const C = this.C;
		const i = Math.floor((x + this.R) / C), j = Math.floor((z + this.R) / C), l = Math.floor((y - this.y0) / C);
		if (i < 0 || j < 0 || l < 0 || i >= this.N || j >= this.N || l >= this.M) return -1;
		return (l * this.N + j) * this.N + i;
	}
	pt(c: number): V3 {
		const N = this.N;
		const i = c % N, j = Math.floor(c / N) % N, l = Math.floor(c / (N * N));
		return [-this.R + (i + 0.5) * this.C, this.y0 + (l + 0.5) * this.C, -this.R + (j + 0.5) * this.C];
	}
	isFree(x: number, y: number, z: number) {
		const c = this.cell(x, y, z);
		return c >= 0 && this.free[c] === 1;
	}
	isNear(x: number, y: number, z: number) {
		const c = this.cell(x, y, z);
		return c < 0 || !this.free[c] || this.near[c] === 1;
	}
	nearestFree(x: number, y: number, z: number, maxD = 1.0): number {
		const c0 = this.cell(x, y, z);
		if (c0 >= 0 && this.free[c0]) return c0;
		const C = this.C, N = this.N;
		const r = Math.ceil(maxD / C);
		const i0 = Math.floor((x + this.R) / C), j0 = Math.floor((z + this.R) / C), l0 = Math.floor((y - this.y0) / C);
		let best = -1, bd = Infinity;
		for (let dl = -r; dl <= r; dl++)
			for (let dj = -r; dj <= r; dj++)
				for (let di = -r; di <= r; di++) {
					const i = i0 + di, j = j0 + dj, l = l0 + dl;
					if (i < 0 || j < 0 || l < 0 || i >= N || j >= N || l >= this.M) continue;
					const c = (l * N + j) * N + i;
					if (!this.free[c]) continue;
					const d = di * di + dj * dj + dl * dl;
					if (d < bd) (bd = d), (best = c);
				}
		return Math.sqrt(bd) * C <= maxD + C ? best : -1;
	}
	/** distance field (metres) from `src` to every voxel; cached (LRU) */
	field(src: number): Float32Array {
		const hit = this.fields.get(src);
		if (hit) {
			this.fields.delete(src);
			this.fields.set(src, hit);
			return hit;
		}
		const N = this.N, M = this.M, NN = N * N;
		const dist = new Int32Array(this.free.length).fill(0x7fffffff);
		const B = 10;
		const buckets: number[][] = Array.from({ length: B }, () => []);
		dist[src] = 0;
		buckets[0].push(src);
		let cur = 0, pending = 1;
		while (pending > 0) {
			const bk = buckets[cur % B];
			if (!bk.length) {
				cur++;
				continue;
			}
			const c = bk.pop()!;
			pending--;
			if (dist[c] !== cur) continue;
			const i = c % N, j = Math.floor(c / N) % N, l = Math.floor(c / NN);
			for (const n of this.nb) {
				const nc = c + n.c;
				const ni = nc % N, nj = Math.floor(nc / N) % N, nl = Math.floor(nc / NN);
				if (nc < 0 || nc >= this.free.length || Math.abs(ni - i) > 1 || Math.abs(nj - j) > 1 || Math.abs(nl - l) > 1 || !this.free[nc]) continue;
				const nd = cur + n.d;
				if (nd < dist[nc]) {
					dist[nc] = nd;
					buckets[nd % B].push(nc);
					pending++;
				}
			}
			void M;
		}
		const f = new Float32Array(dist.length);
		const k = this.C / 5;
		for (let c = 0; c < dist.length; c++) f[c] = dist[c] === 0x7fffffff ? Infinity : dist[c] * k;
		this.fields.set(src, f);
		if (this.fields.size > 40) this.fields.delete(this.fields.keys().next().value!);
		return f;
	}
	/** path from `from` to the field's source (descending), smoothed; null if unreachable */
	path(from: number, f: Float32Array): V3[] | null {
		if (from < 0 || !isFinite(f[from])) return null;
		const N = this.N, NN = N * N;
		const cells = [from];
		let c = from;
		for (let guard = 0; guard < 4000 && f[c] > 0; guard++) {
			const i = c % N, j = Math.floor(c / N) % N, l = Math.floor(c / NN);
			let best = c, bv = f[c];
			for (const n of this.nb) {
				const nc = c + n.c;
				if (nc < 0 || nc >= f.length) continue;
				const ni = nc % N, nj = Math.floor(nc / N) % N, nl = Math.floor(nc / NN);
				if (Math.abs(ni - i) > 1 || Math.abs(nj - j) > 1 || Math.abs(nl - l) > 1) continue;
				if (f[nc] < bv - 1e-5) (bv = f[nc]), (best = nc);
			}
			if (best === c) break;
			c = best;
			cells.push(c);
		}
		const pts = cells.map((x) => this.pt(x));
		// line-of-sight smoothing
		const out: V3[] = [pts[0]];
		let a = 0;
		while (a < pts.length - 1) {
			let b = pts.length - 1;
			while (b > a + 1 && !this.los(pts[a], pts[b])) b--;
			out.push(pts[b]);
			a = b;
		}
		return out;
	}
	los(a: V3, b: V3): boolean {
		const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
		const n = Math.ceil(d / (this.C * 0.5));
		for (let s = 1; s < n; s++) {
			const t = s / n;
			if (!this.isFree(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)) return false;
		}
		return true;
	}
}
