import { imageUrl } from '../../lib/imageUrl';
import { readRun, type RhythmPack } from '../rhythm';
import { STIRFRY_RULESETS, STIRFRY_VERSION, type StirfryRuleset } from './ruleset';
import WokStage from './WokStage.svelte';

/** Wok frames in cook order; "burnt" and "toss" are overlays. */
export const WOK_FRAMES = ['raw', 'half', 'cooked'] as const;
export type CookStage = (typeof WOK_FRAMES)[number];

/** progress (0..100) -> which wok photo is shown. Thresholds come from the pack ruleset. */
export function cookStage(progress: number, rules?: Pick<StirfryRuleset, 'cook'>): CookStage {
  const half = rules?.cook.halfBelow ?? 30;
  const cooked = rules?.cook.cookedAt ?? 70;
  return progress < half ? 'raw' : progress < cooked ? 'half' : 'cooked';
}
/** heat above the safe zone burns the food: 0 (fine) .. 1 (charred). */
export function burntLevel(heat: number, rules?: Pick<StirfryRuleset, 'burn'>): number {
  const start = rules?.burn.start ?? 78;
  const span = rules?.burn.span ?? 18;
  return Math.max(0, Math.min(1, (heat - start) / span));
}

const STORAGE_KEY = 'nesg.stirfry.v1'; // unchanged from v0.5.x: existing best scores keep working

export const stirfryPack: RhythmPack = {
  id: 'stirfry',
  leaderboardId: 'stirfry',
  copy: 'stirfry',
  storageKey: STORAGE_KEY,
  route: '#/play/stirfry',
  version: STIRFRY_VERSION,
  legacyVersion: '1.2.0',
  rulesets: STIRFRY_RULESETS,
  theme: { background: imageUrl('stirfry/kitchen.webp') },
  Stage: WokStage,
};

export const readStirFry = () => readRun(STORAGE_KEY);
