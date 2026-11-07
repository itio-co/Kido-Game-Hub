import { imageUrl } from '../../lib/flow/loadFlow';
import { DEFAULT_PARAMS, readRun, type RhythmEdition } from '../rhythm';
import WokStage from './WokStage.svelte';

/** Wok frames in cook order; "burnt" and "toss" are overlays. */
export const WOK_FRAMES = ['raw', 'half', 'cooked'] as const;
export type CookStage = (typeof WOK_FRAMES)[number];

/** progress (0..100) -> which wok photo is shown. */
export function cookStage(progress: number): CookStage {
  return progress < 30 ? 'raw' : progress < 70 ? 'half' : 'cooked';
}
/** heat above the safe zone burns the food: 0 (fine) .. 1 (charred). */
export function burntLevel(heat: number): number {
  return Math.max(0, Math.min(1, (heat - 78) / 18));
}

const STORAGE_KEY = 'nesg.stirfry.v1'; // unchanged from v0.5.x: existing best scores keep working

export const stirfryEdition: RhythmEdition = {
  id: 'stirfry',
  leaderboardId: 'stirfry',
  copy: 'stirfry',
  storageKey: STORAGE_KEY,
  route: '#/play/stirfry',
  params: { ...DEFAULT_PARAMS },
  theme: { background: imageUrl('stirfry/kitchen.webp') },
  Stage: WokStage,
};

export const readStirFry = () => readRun(STORAGE_KEY);
