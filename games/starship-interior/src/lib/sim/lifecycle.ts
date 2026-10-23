/**
 * Equipment life cycle: New → Operational → Worn → Needs maintenance → Broken (→ Repaired / Replaced).
 * Hours count actual use (crew-hours of use; always-on systems count calendar time). Condition falls with
 * wear per hour of use (+ slow calendar aging); random failures follow an MTBF-based hazard that rises with
 * wear and beyond the rated service life. Maintenance restores condition (no spare); repairs need spare
 * kits from the locker inventory and an engineer. All values ESTIMATE (ISS hardware analogs where noted).
 */
import type { ModuleDef } from '$lib/game/types';

export interface LifeSpec {
	/** rated service life, hours of use */
	life: number;
	/** mean time between failures, hours of use */
	mtbf: number;
	/** maintenance interval, hours of use */
	service: number;
	/** repair time, sim minutes */
	repair: number;
	/** spare kits consumed by a repair (×3 for a replacement) */
	spares: number;
	/** runs continuously (hours accrue with calendar time) */
	alwaysOn?: boolean;
	/** typical use, hours per day (mission planning before the sim has data) */
	typical?: number;
	source?: string;
}
const L = (life: number, mtbf: number, service: number, repair: number, spares = 1, extra: Partial<LifeSpec> = {}): LifeSpec => ({ life, mtbf, service, repair, spares, ...extra });
export const LIFE: Record<string, LifeSpec> = {
	hygiene: L(3000, 400, 60, 120, 1, { typical: 3, source: 'ISS WHC / UWMS toilet: frequent repairs (analog)' }),
	zerogtoilet: L(3000, 300, 50, 180, 1, { typical: 3, source: 'ISS UWMS / WHC analog' }),
	treadmill: L(2000, 300, 40, 120, 1, { typical: 4, source: 'ISS T2/COLBERT treadmill analog' }),
	ared: L(5000, 800, 80, 90, 1, { typical: 4, source: 'ISS ARED analog' }),
	eclss: L(20000, 2500, 200, 240, 2, { alwaysOn: true, source: 'ISS ECLSS racks (ORU swaps) analog' }),
	galley: L(4000, 1000, 150, 60, 1, { typical: 3 }),
	foodwarmer: L(4000, 1000, 150, 60, 1, { typical: 2, source: 'ISS food warmer analog' }),
	waterdispenser: L(6000, 1200, 200, 60, 1, { typical: 2, source: 'ISS PWD analog' }),
	fridge: L(40000, 8000, 1000, 120, 1, { alwaysOn: true }),
	trash: L(2000, 500, 100, 60, 1, { typical: 1, source: 'Heat Melt Compactor analog' }),
	workstation: L(20000, 5000, 1000, 60, 1, { typical: 6 }),
	workstation2: L(20000, 5000, 1000, 60, 1, { typical: 10 }),
	hydroponics: L(20000, 4000, 300, 90, 1, { alwaysOn: true, source: 'Veggie / APH analog' }),
	bunk: L(30000, 20000, 2000, 30, 1, { typical: 8 }),
	crewpod: L(30000, 20000, 2000, 30, 1, { typical: 8 }),
	sleepingbag: L(20000, 20000, 2000, 20, 1, { typical: 8 })
};
const PASSIVE = L(50000, 40000, 5000, 30, 1, { typical: 2 });
const POWERED = L(10000, 3000, 300, 60, 1, { typical: 2 });
export const SPARES_PER_LOCKER = 6;
/** condition lost per day of calendar aging, % */
export const AGING_PER_DAY = 0.2;

export function lifeOf(def: ModuleDef | undefined): LifeSpec {
	if (!def) return PASSIVE;
	const base = LIFE[def.id] ?? (def.power > 0 ? POWERED : PASSIVE);
	return def.life ? { ...base, ...def.life } : base;
}
/** wear per hour of use, % of condition (reaches "needs maintenance" ≈ at the service interval) */
export function wearPerHour(s: LifeSpec) {
	return 65 / Math.max(1, s.service);
}
/** failure hazard per hour of use: 1/MTBF, ×(1+4·wear²), ×3 past the rated life */
export function hazard(s: LifeSpec, cond: number, hours: number) {
	const w = 1 - Math.max(0, Math.min(100, cond)) / 100;
	return (1 / Math.max(1, s.mtbf)) * (1 + 4 * w * w) * (hours > s.life ? 3 : 1);
}
export type LifeState = 'New' | 'Operational' | 'Worn' | 'Needs maintenance' | 'Broken';
export function lifeState(s: LifeSpec, cond: number, hours: number, sinceService: number, broken: boolean): LifeState {
	if (broken) return 'Broken';
	if (cond < 35 || sinceService >= s.service) return 'Needs maintenance';
	if (cond < 60) return 'Worn';
	if (hours < 0.05 * s.service && cond > 95) return 'New';
	return 'Operational';
}
export const LIFE_ICON: Record<LifeState, string> = { New: '✦', Operational: '✓', Worn: '◐', 'Needs maintenance': '🔧', Broken: '✖' };
/** condition after maintenance (permanent degradation with age) */
export function afterService(s: LifeSpec, hours: number) {
	return Math.max(50, 100 - (25 * hours) / Math.max(1, s.life));
}
/** condition after a repair */
export function afterRepair(s: LifeSpec, hours: number) {
	return Math.max(60, 100 - (40 * hours) / Math.max(1, s.life));
}
export function sanitizeLife(v: unknown): Partial<LifeSpec> | undefined {
	if (!v || typeof v !== 'object') return undefined;
	const o = v as Record<string, unknown>;
	const n = (x: unknown, a: number, b: number) => (typeof x === 'number' && isFinite(x) ? Math.min(b, Math.max(a, x)) : undefined);
	const out: Partial<LifeSpec> = {
		life: n(o.life, 1, 1e6),
		mtbf: n(o.mtbf, 1, 1e6),
		service: n(o.service, 1, 1e5),
		repair: n(o.repair, 1, 5000),
		spares: n(o.spares, 0, 20),
		alwaysOn: o.alwaysOn === true ? true : undefined
	};
	for (const k of Object.keys(out) as (keyof LifeSpec)[]) if (out[k] === undefined) delete out[k];
	return Object.keys(out).length ? out : undefined;
}
