/** Public entry of the `stirfry` pack (rhythm mechanism). Other code imports from here only. */
import { defineMinigame } from '../minigame-core/framework';

export const stirfryGame = defineMinigame({
  id: 'stirfry',
  kind: 'pack',
  modes: ['practice', 'challenge'],
  leaderboardId: 'stirfry',
});
export { default as StirFryGame } from './StirFryGame.svelte';
export { readStirFry, stirfryPack } from './pack';
export { STIRFRY_RULESETS, STIRFRY_VERSION, stirfryRuleset, type StirfryRuleset } from './ruleset';
export type { RhythmRun as StirFryRun } from '../rhythm';
