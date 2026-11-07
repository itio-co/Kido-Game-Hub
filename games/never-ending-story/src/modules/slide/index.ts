/** Public entry of the `slide` module. Import from here only. */
import { defineMinigame } from '../minigame-core/framework';

export const slideGame = defineMinigame({
  id: 'slide',
  kind: 'minigame',
  modes: ['practice', 'story', 'challenge'],
  leaderboardId: 'slide',
});
export * from './puzzle';
