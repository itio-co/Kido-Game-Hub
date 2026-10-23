/**
 * Working rates & status effects (crew needs over realistic timescales).
 * - Direct effect while using an item: rate in need-points per sim hour, scaled by the item's condition,
 *   with diminishing returns near 100 and an optional cap per session (max gain).
 * - Status effects (buffs / debuffs) continue after use: per-need rates and base-decay multipliers with a
 *   duration and a decay curve (const / linear fade / exponential), optionally stackable or chained
 *   (coffee → crash) or cleared by satisfying a need (sweaty → cleared by washing).
 * All values are gameplay ESTIMATES tuned to plausible daily routines (not physiology).
 */
import type { NeedId } from '$lib/game/affordances';

export type Curve = 'const' | 'linear' | 'exp';
export interface EffectDef {
	id: string;
	label: string;
	icon: string;
	/** added need change per sim hour at full strength (negative = debuff) */
	rates?: Partial<Record<NeedId, number>>;
	/** multiplier on the base decay of a need (0.4 = decays 60 % slower) */
	decayMul?: Partial<Record<NeedId, number>>;
	/** default duration, sim minutes */
	minutes: number;
	curve: Curve;
	stack?: boolean;
	/** start this effect when this one ends */
	then?: string;
	/** removed as soon as this need is raised by using an item (e.g. sweaty → wash) */
	clearOn?: NeedId;
}
export const EFFECTS: Record<string, EffectDef> = {
	digest: { id: 'digest', label: 'Digesting (satiated)', icon: '🍽', rates: { hunger: 12, comfort: 2 }, decayMul: { hunger: 0.35 }, minutes: 210, curve: 'linear' },
	snack: { id: 'snack', label: 'Snack', icon: '🍪', rates: { hunger: 6 }, decayMul: { hunger: 0.7 }, minutes: 60, curve: 'linear' },
	rested: { id: 'rested', label: 'Well rested', icon: '😌', decayMul: { energy: 0.7, comfort: 0.8 }, minutes: 300, curve: 'linear' },
	groggy: { id: 'groggy', label: 'Groggy (woke early)', icon: '🥱', rates: { energy: -3 }, minutes: 60, curve: 'exp' },
	exercised: { id: 'exercised', label: 'Post-exercise glow', icon: '💪', rates: { fun: 3, comfort: 2 }, decayMul: { fitness: 0.5 }, minutes: 240, curve: 'linear' },
	sweaty: { id: 'sweaty', label: 'Sweaty (needs a wash)', icon: '💦', rates: { hygiene: -5, comfort: -3 }, minutes: 600, curve: 'const', clearOn: 'hygiene' },
	tired: { id: 'tired', label: 'Muscle fatigue', icon: '😮‍💨', rates: { energy: -6 }, minutes: 60, curve: 'exp' },
	caffeine: { id: 'caffeine', label: 'Coffee boost', icon: '☕', rates: { energy: 14, fun: 3 }, minutes: 45, curve: 'const', then: 'crash' },
	crash: { id: 'crash', label: 'Caffeine crash', icon: '📉', rates: { energy: -9 }, minutes: 60, curve: 'linear' },
	noise: { id: 'noise', label: 'Noise fatigue', icon: '🔊', rates: { comfort: -8 }, minutes: 30, curve: 'linear' },
	refreshed: { id: 'refreshed', label: 'Fresh & clean', icon: '✨', rates: { comfort: 3 }, decayMul: { hygiene: 0.6 }, minutes: 180, curve: 'linear' },
	accomplished: { id: 'accomplished', label: 'Accomplished', icon: '🏅', decayMul: { work: 0.5 }, rates: { fun: 2 }, minutes: 180, curve: 'linear' },
	relieved: { id: 'relieved', label: 'Relieved', icon: '😮', decayMul: { bladder: 0.8 }, minutes: 30, curve: 'linear' }
};
export const EFFECT_IDS = Object.keys(EFFECTS);

/** an after-effect an affordance grants when it ends (scaled by the fraction of the session done) */
export interface AfterEffect {
	id: string;
	/** duration override, sim minutes */
	minutes?: number;
	/** strength multiplier (default 1) */
	k?: number;
}
export interface ActiveEffect {
	id: string;
	src: string;
	t0: number;
	minutes: number;
	k: number;
}
/** strength 0..1 of an active effect at sim time `now` */
export function strength(e: ActiveEffect, now: number): number {
	const def = EFFECTS[e.id];
	if (!def) return 0;
	const u = (now - e.t0) / Math.max(1, e.minutes);
	if (u >= 1 || u < 0) return 0;
	const s = def.curve === 'const' ? 1 : def.curve === 'linear' ? 1 - u : Math.exp(-3 * u);
	return s * e.k;
}
/** diminishing returns: full rate below 70, tapering to 20 % at 100 */
export function diminish(v: number): number {
	return Math.max(0.2, Math.min(1, (100 - v) / 30));
}
/** condition factor: a worn item works slower (100 % → 1, 0 % → 0.5) */
export function condFactor(cond: number): number {
	return 0.5 + 0.5 * Math.max(0, Math.min(100, cond)) / 100;
}
/** trend symbol for a net rate (points/h) */
export function trend(rate: number): { sym: string; cls: 'up2' | 'up' | 'flat' | 'down' | 'down2' } {
	const a = Math.abs(rate);
	if (a < 2) return { sym: '·', cls: 'flat' };
	if (rate > 0) return a >= 10 ? { sym: '>>', cls: 'up2' } : { sym: '>', cls: 'up' };
	return a >= 10 ? { sym: '<<', cls: 'down2' } : { sym: '<', cls: 'down' };
}
export function fmtRate(r: number) {
	return `${r >= 0 ? '+' : '−'}${Math.abs(r) < 10 ? Math.abs(r).toFixed(1) : Math.round(Math.abs(r))}/h`;
}
export function sanitizeAfter(v: unknown): AfterEffect[] | undefined {
	if (!Array.isArray(v)) return undefined;
	const out = v
		.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && typeof (x as { id?: unknown }).id === 'string' && (x as { id: string }).id in EFFECTS)
		.slice(0, 6)
		.map((x) => ({ id: x.id as string, minutes: typeof x.minutes === 'number' && x.minutes > 0 ? Math.min(2000, x.minutes) : undefined, k: typeof x.k === 'number' && x.k > 0 ? Math.min(3, x.k) : undefined }));
	return out.length ? out : undefined;
}
/** default noise sources (ESTIMATE): radius m; always = runs even when nobody uses it */
export const NOISE: Record<string, { r: number; always?: boolean }> = {
	treadmill: { r: 2.5 },
	ared: { r: 2.5 },
	eclss: { r: 1.8, always: true },
	trash: { r: 2.0 },
	foodwarmer: { r: 1.2 }
};
