/** Challenge-mode jigsaw grid sizes. Story-mode placement stays in puzzle.ts. */
import meta from './module.json';
import data from './ruleset.json';

export type JigDiff = 'easy' | 'medium' | 'hard';
export type JigRuleset = { grid: Record<JigDiff, [number, number]> };

export const JIG_RULESETS = data as unknown as Record<string, JigRuleset>;
export const JIG_VERSION = meta.version;
export const jigRules = (version: string): JigRuleset | null => JIG_RULESETS[version] ?? null;
