/** Public entry of the `piano` module. Other code imports from here only. */
import { defineMinigame } from '../minigame-core/framework';
import { bestKey, readBests } from '../minigame-core/result';
import { PIANO_DIFFICULTIES } from './ruleset.ts';
import { SONGS } from './songs.ts';

export const pianoGame = defineMinigame({
  id: 'piano',
  kind: 'minigame',
  modes: ['practice'],
});
export { default as PianoGame } from './PianoGame.svelte';
export { PIANO_DIFFICULTIES, PIANO_RULESETS, PIANO_VERSION, pianoRuleset, type PianoDifficulty, type PianoRuleset } from './ruleset.ts';
export { SONGS, type SongId } from './songs.ts';

/** Stars earned over every song and level, for the practice card. */
export function readPianoStars(): { stars: number; max: number } {
  const bests = readBests();
  let stars = 0;
  for (const song of SONGS) {
    for (const diff of PIANO_DIFFICULTIES) stars += bests[bestKey(`piano-${song.id}`, diff)]?.stars ?? 0;
  }
  return { stars, max: SONGS.length * PIANO_DIFFICULTIES.length * 3 };
}
