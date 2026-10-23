/**
 * Electrical load profiles (per item) + priority classes for the live power bus.
 * States: Off · Standby/Idle · Active · Peak (start-up surge, W for s seconds) · optional duty cycle
 * (compressor / heater cycling while "on"). Values from ISS / analog hardware where noted, else ESTIMATE.
 */
import type { ModuleDef } from '$lib/game/types';

export type Priority = 'Critical' | 'Essential' | 'Normal' | 'Deferrable';
export const PRIORITIES: Priority[] = ['Critical', 'Essential', 'Normal', 'Deferrable'];
export type PowerState = 'Off' | 'Standby' | 'Active' | 'Peak' | 'Shed' | 'Brownout' | 'Broken';
export interface PowerSpec {
	/** idle / standby draw, W */
	standby: number;
	/** working draw, W (average while active, before duty cycling) */
	active: number;
	/** start-up surge */
	peak?: { w: number; s: number };
	/** fraction of time the load is on while active (fridge compressor ~0.4, oven holding) */
	duty?: number;
	/** always active (life support, fridge, grow lights) */
	alwaysOn?: boolean;
	priority: Priority;
	source?: string;
}
const P = (standby: number, active: number, priority: Priority, extra: Partial<PowerSpec> = {}): PowerSpec => ({ standby, active, priority, ...extra });
export const POWER: Record<string, PowerSpec> = {
	eclss: P(1500, 1500, 'Critical', { alwaysOn: true, peak: { w: 2200, s: 20 }, source: 'ISS CDRA + OGA + WRS analogs (~1–3 kW per rack, scaled) – ESTIMATE' }),
	fridge: P(5, 250, 'Essential', { alwaysOn: true, duty: 0.4, peak: { w: 700, s: 3 }, source: 'Galley fridge / MELFI-class compressor duty ~40 % – ESTIMATE' }),
	hydroponics: P(20, 450, 'Normal', { alwaysOn: true, duty: 0.67, source: 'Veggie / APH LED panels, 16 h photoperiod – ESTIMATE' }),
	foodwarmer: P(10, 650, 'Deferrable', { duty: 0.7, peak: { w: 900, s: 60 }, source: 'ISS food warmer (~100 W) scaled to a convection oven: heat-up then holding – ESTIMATE' }),
	galley: P(30, 1500, 'Deferrable', { duty: 0.7, peak: { w: 2000, s: 60 }, source: 'Combined galley counter – ESTIMATE' }),
	waterdispenser: P(15, 420, 'Normal', { duty: 0.5, peak: { w: 600, s: 5 }, source: 'ISS Potable Water Dispenser heater – ESTIMATE' }),
	treadmill: P(10, 600, 'Deferrable', { peak: { w: 1500, s: 8 }, source: 'ISS T2 treadmill motor (peak under load) – ESTIMATE' }),
	ared: P(0, 50, 'Deferrable', { source: 'ARED vacuum cylinders: near-passive – ESTIMATE' }),
	hygiene: P(10, 250, 'Essential', { peak: { w: 400, s: 4 }, source: 'Toilet fan / separator – ESTIMATE' }),
	zerogtoilet: P(15, 400, 'Essential', { peak: { w: 650, s: 4 }, source: 'ISS UWMS fan / pump-separator – ESTIMATE' }),
	workstation: P(40, 300, 'Normal', { source: 'Laptops + displays – ESTIMATE' }),
	workstation2: P(60, 550, 'Normal', { source: 'Dual console – ESTIMATE' }),
	trash: P(5, 300, 'Deferrable', { peak: { w: 1000, s: 10 }, source: 'Heat Melt Compactor analog (kW-class heaters, scaled) – ESTIMATE' }),
	crewpod: P(15, 80, 'Normal', { source: 'ISS CQ fan + light + laptop – ESTIMATE' }),
	bunk: P(2, 15, 'Normal', { source: 'Reading light – ESTIMATE' }),
	pilotcouch: P(30, 120, 'Essential', { source: 'Couch displays / controls – ESTIMATE' }),
	hatch: P(20, 20, 'Essential', { alwaysOn: true, source: 'Hatch lighting / sensors – ESTIMATE' })
};
/** lighting per deck (occupancy-switched): ESTIMATE ISS SSLA-class LED panels */
export const LIGHT_W = { on: 120, dim: 15 };

export function powerOf(def: ModuleDef | undefined): PowerSpec | null {
	if (!def) return null;
	const base = POWER[def.id] ?? (def.power > 0 ? P(Math.round(def.power * 0.05), def.power, 'Normal') : null);
	if (!base && !def.powerSpec) return null;
	return { ...(base ?? P(0, 0, 'Normal')), ...(def.powerSpec ?? {}) } as PowerSpec;
}
export const PRIO_RANK: Record<Priority, number> = { Critical: 0, Essential: 1, Normal: 2, Deferrable: 3 };
export function sanitizePower(v: unknown): Partial<PowerSpec> | undefined {
	if (!v || typeof v !== 'object') return undefined;
	const r = v as Record<string, unknown>;
	const n = (x: unknown, lo: number, hi: number) => (typeof x === 'number' && isFinite(x) ? Math.max(lo, Math.min(hi, x)) : undefined);
	const out: Partial<PowerSpec> = {};
	const sb = n(r.standby, 0, 1e5), ac = n(r.active, 0, 1e5), du = n(r.duty, 0.05, 1);
	if (sb !== undefined) out.standby = sb;
	if (ac !== undefined) out.active = ac;
	if (du !== undefined) out.duty = du;
	if (r.peak && typeof r.peak === 'object') {
		const w = n((r.peak as Record<string, unknown>).w, 0, 1e5), s = n((r.peak as Record<string, unknown>).s, 0, 600);
		if (w && s) out.peak = { w, s };
	}
	if (typeof r.priority === 'string' && (PRIORITIES as string[]).includes(r.priority)) out.priority = r.priority as Priority;
	if (typeof r.alwaysOn === 'boolean') out.alwaysOn = r.alwaysOn;
	return Object.keys(out).length ? out : undefined;
}
export const fmtW = (w: number) => (Math.abs(w) >= 1000 ? `${(w / 1000).toFixed(1)} kW` : `${Math.round(w)} W`);
