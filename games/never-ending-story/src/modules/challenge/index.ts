/** Public entry of the `challenge` module. Other code imports from here only. */
import { defineMinigame } from '../minigame-core/framework';

export const challengeGame = defineMinigame({
  id: 'challenge',
  kind: 'feature',
  modes: ['challenge'],
  leaderboardId: 'cross',
});
export { default as ChallengeView } from './ChallengeView.svelte';
export { default as LeaderboardView } from './LeaderboardView.svelte';
export { parseChallengeHash } from './challenge';
