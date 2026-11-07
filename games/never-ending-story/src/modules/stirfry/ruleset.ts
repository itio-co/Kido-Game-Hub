/** Public ruleset registry for the stirfry pack. Keys must include module.json `version`. */
import meta from './module.json';
import data from './ruleset.json';
import type { RhythmRulesetParams } from '../rhythm/ruleset';

export type StirfryRuleset = {
  params: RhythmRulesetParams;
  cook: { halfBelow: number; cookedAt: number };
  burn: { start: number; span: number; smokeAt: number };
  reactMs: { hit: number; miss: number };
};

export const STIRFRY_RULESETS = data as unknown as Record<string, StirfryRuleset>;
export const STIRFRY_VERSION = meta.version;
export const stirfryRuleset = (version: string): StirfryRuleset | null => STIRFRY_RULESETS[version] ?? null;
