/** Challenge-mode sliding puzzle size and scramble length. */
import meta from './module.json';
import data from './ruleset.json';

export type SlideDiff = 'easy' | 'medium' | 'hard';
export type SlideRuleset = {
  size: Record<SlideDiff, number>;
  scramble: Record<SlideDiff, number>;
};

export const SLIDE_RULESETS = data as Record<string, SlideRuleset>;
export const SLIDE_VERSION = meta.version;
export const slideRules = (version: string): SlideRuleset | null => SLIDE_RULESETS[version] ?? null;
