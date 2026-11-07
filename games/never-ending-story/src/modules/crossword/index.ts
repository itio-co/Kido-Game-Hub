/** Public entry of the `crossword` module. Import from here only. */
import { defineMinigame } from '../minigame-core/framework';

export const crosswordGame = defineMinigame({
  id: 'crossword',
  kind: 'minigame',
  modes: ['practice', 'story', 'challenge'],
  leaderboardId: 'cross',
});
export * from './puzzle';
