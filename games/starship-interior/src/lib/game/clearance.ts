/**
 * Clearance analysis for one deck:
 *  1. Front access zones must not be blocked by other modules or the hull.
 *  2. Path check: is there a path at least MIN_PASSAGE_WIDTH wide from a hatch (or the hull
 *     airlock on the bottom deck) to each module's access zone? Done with a flood fill on a
 *     PATH_GRID-sized grid in configuration space (obstacles inflated by half the width).
 */
import { CATALOG_BY_ID } from './catalog';
import { accessFootprint, containsPoint, footprintOf, maxRadius, overlaps, shaftAccess, shaftFootprint, type Footprint } from './geometry';
import { AIRLOCK_ANGLE, HULL_INNER_RADIUS, MIN_PASSAGE_WIDTH, PATH_GRID } from './specs';
import type { PlacedModule, Shaft } from './types';

export interface DeckAnalysis {
	blocked: Set<number>;
	unreachable: Set<number>;
	warnings: { uid: number; text: string }[];
	hasEntry: boolean;
}

/** `shafts` = hatch shafts touching this deck; `label` gives their display IDs (L1-2…). */
export function analyzeDeck(
	modules: PlacedModule[],
	hasAirlock: boolean,
	shafts: Shaft[] = [],
	label: (s: Shaft) => string = () => 'H',
	R: number = HULL_INNER_RADIUS
): DeckAnalysis {
	const blocked = new Set<number>();
	const unreachable = new Set<number>();
	const warnings: { uid: number; text: string }[] = [];
	const name = (m: PlacedModule) => CATALOG_BY_ID[m.type].name;

	// 1. access zones
	for (const m of modules) {
		const acc = accessFootprint(m.type, m.x, m.z, m.angle);
		if (!acc) continue;
		let why = '';
		if (maxRadius(acc) > R + 1e-6) why = 'hull wall';
		else
			for (const o of modules) {
				if (o.uid === m.uid || CATALOG_BY_ID[o.type].walkable) continue;
				if (overlaps(acc, footprintOf(o.type, o.x, o.z, o.angle))) {
					why = name(o);
					break;
				}
			}
		if (why) {
			blocked.add(m.uid);
			warnings.push({ uid: m.uid, text: `${name(m)}: access zone blocked by ${why}` });
		}
	}

	for (const sh of shafts) {
		const acc = shaftAccess(sh.x, sh.z, sh.angle);
		let why = '';
		if (maxRadius(acc) > R + 1e-6) why = 'hull wall';
		else
			for (const o of modules)
				if (overlaps(acc, footprintOf(o.type, o.x, o.z, o.angle))) {
					why = name(o);
					break;
				}
		if (why) {
			blocked.add(sh.uid);
			warnings.push({ uid: sh.uid, text: `Ladder ${label(sh)}: access blocked by ${why}` });
		}
	}

	// 2. passage flood fill
	const half = MIN_PASSAGE_WIDTH / 2;
	const N = Math.ceil((2 * R) / PATH_GRID);
	const cx = (i: number) => -R + (i + 0.5) * PATH_GRID;
	const obstacles: Footprint[] = modules
		.filter((m) => !CATALOG_BY_ID[m.type].walkable)
		.map((m) => footprintOf(m.type, m.x, m.z, m.angle, half));
	const free = new Uint8Array(N * N);
	for (let j = 0; j < N; j++)
		for (let i = 0; i < N; i++) {
			const x = cx(i);
			const z = cx(j);
			if (Math.hypot(x, z) > R - half) continue;
			let ok = true;
			for (const f of obstacles)
				if (containsPoint(f, x, z)) {
					ok = false;
					break;
				}
			if (ok) free[j * N + i] = 1;
		}

	const entries: Footprint[] = shafts.map((sh) => shaftFootprint(sh.x, sh.z, sh.angle));
	if (hasAirlock) {
		const r = R - half - 0.05;
		entries.push({ kind: 'circle', cx: Math.cos(AIRLOCK_ANGLE) * r, cz: Math.sin(AIRLOCK_ANGLE) * r, r: 0.35 });
	}
	const flood = (seeds: Footprint[]) => {
		const reach = new Uint8Array(N * N);
		const queue: number[] = [];
		for (let j = 0; j < N; j++)
			for (let i = 0; i < N; i++) {
				const k = j * N + i;
				if (free[k] && seeds.some((e) => containsPoint(e, cx(i), cx(j)))) {
					reach[k] = 1;
					queue.push(k);
				}
			}
		while (queue.length) {
			const k = queue.pop()!;
			const i = k % N;
			const j = (k - i) / N;
			for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
				const ni = i + di;
				const nj = j + dj;
				if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
				const nk = nj * N + ni;
				if (free[nk] && !reach[nk]) {
					reach[nk] = 1;
					queue.push(nk);
				}
			}
		}
		return reach;
	};
	const reach = flood(entries);
	// connectivity between entries: flood from the first one only (airlock on deck 1, else first shaft)
	const first = entries.length > 1 ? flood([hasAirlock ? entries[entries.length - 1] : entries[0]]) : reach;

	const hasEntry = entries.length > 0;
	const reachable = (target: Footprint, r = reach) => {
		for (let j = 0; j < N; j++)
			for (let i = 0; i < N; i++) if (r[j * N + i] && containsPoint(target, cx(i), cx(j))) return true;
		return false;
	};
	if (hasEntry) {
		for (const sh of shafts)
			if (!reachable(shaftFootprint(sh.x, sh.z, sh.angle), first)) {
				unreachable.add(sh.uid);
				warnings.push({ uid: sh.uid, text: `Ladder ${label(sh)}: no ${MIN_PASSAGE_WIDTH} m path to the other entries on this deck` });
			}
		for (const m of modules) {
			const target = accessFootprint(m.type, m.x, m.z, m.angle);
			if (!target) continue;
			let ok = false;
			for (let j = 0; j < N && !ok; j++)
				for (let i = 0; i < N; i++)
					if (reach[j * N + i] && containsPoint(target, cx(i), cx(j))) {
						ok = true;
						break;
					}
			if (!ok) {
				unreachable.add(m.uid);
				warnings.push({ uid: m.uid, text: `${name(m)}: no ${MIN_PASSAGE_WIDTH} m wide path from hatch/airlock` });
			}
		}
	}
	return { blocked, unreachable, warnings, hasEntry };
}
