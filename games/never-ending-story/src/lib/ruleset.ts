/** Re-export of the minigame-core ruleset math so core (catalog, tests) keeps one import path. */
export {
  RULESET_SRC,
  canonicalRuleset,
  parseRuleset,
  pinVersion,
  resolveRuleset,
  supportedKeys,
  type ModulePin,
  type ModuleRules,
  type RulesetBad,
  type RulesetOk,
  type RulesetResolution,
} from '../modules/minigame-core/ruleset';
