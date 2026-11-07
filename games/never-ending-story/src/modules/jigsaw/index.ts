/** Public entry of the `jigsaw` module. Import from here only. */
import { defineMinigame } from '../minigame-core/framework';

export const jigsawGame = defineMinigame({
  id: 'jigsaw',
  kind: 'minigame',
  modes: ['practice', 'story', 'challenge'],
  leaderboardId: 'jig',
});
export * from './puzzle';
