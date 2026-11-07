/** Challenge-mode crossword generation knobs. Story-mode grid stays in puzzle.ts. */
import meta from './module.json';
import data from './ruleset.json';

export type CrossDiff = 'easy' | 'medium' | 'hard';
export type CrossRuleset = {
  words: Record<CrossDiff, number>;
  decoys: Record<CrossDiff, number>;
  bank: number;
};

export const CROSS_RULESETS = data as Record<string, CrossRuleset>;
export const CROSS_VERSION = meta.version;
export const crossRules = (version: string): CrossRuleset | null => CROSS_RULESETS[version] ?? null;
