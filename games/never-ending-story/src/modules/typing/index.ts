/** Public entry of the `typing` module. Other code imports from here only. */
import { defineMinigame } from '../minigame-core/framework';
import { bestKey, readBests } from '../minigame-core/result';
import { SETS } from './content.ts';
import { TYPING_DIFFICULTIES } from './ruleset.ts';

export const typingGame = defineMinigame({
  id: 'typing',
  kind: 'minigame',
  modes: ['practice'],
});
export { default as TypingGame } from './TypingGame.svelte';
export { TYPING_DIFFICULTIES, TYPING_RULESETS, TYPING_VERSION, typingRuleset, type TypingDifficulty, type TypingRuleset } from './ruleset.ts';
export { SETS, type SetId } from './content.ts';
export { TYPIST_QUOTES_URL, TYPIST_SOURCES, parseTypist, type Lesson, type LessonSource } from './sources/index.ts';

/** Stars earned over every built-in set and level, for the practice card. */
export function readTypingStars(): { stars: number; max: number } {
  const bests = readBests();
  let stars = 0;
  for (const set of SETS) {
    for (const diff of TYPING_DIFFICULTIES) stars += bests[bestKey(`typing-${set.id}`, diff)]?.stars ?? 0;
  }
  return { stars, max: SETS.length * TYPING_DIFFICULTIES.length * 3 };
}
