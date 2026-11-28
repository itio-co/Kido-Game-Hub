/** Public ruleset registry for the typing module. Keys must include module.json `version`. */
import meta from './module.json' with { type: 'json' };
import data from './ruleset.json' with { type: 'json' };

export type TypingDifficulty = 'easy' | 'normal' | 'hard';
export const TYPING_DIFFICULTIES: readonly TypingDifficulty[] = ['easy', 'normal', 'hard'];

export type TypingRules = {
  /** Accuracy needed for the first star (and to count as a win). */
  minAccuracy: number;
  /** Net WPM needed for the second and third star. */
  wpm: [number, number];
  /** Accuracy also needed for the third star. */
  goldAccuracy: number;
  /** Hard mode does not let you erase a typed character. */
  backspace: boolean;
};
export type TypingScoring = { hit: number; comboBonus: number; comboCap: number };
export type TypingRuleset = {
  /** Characters that make one "word" for WPM. */
  wordChars: number;
  difficulties: Record<TypingDifficulty, TypingRules>;
  scoring: TypingScoring;
};

export const TYPING_RULESETS = data as unknown as Record<string, TypingRuleset>;
export const TYPING_VERSION = meta.version;
export const typingRuleset = (version: string): TypingRuleset | null => TYPING_RULESETS[version] ?? null;
