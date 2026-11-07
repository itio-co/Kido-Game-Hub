/** Pure framework entry (no Svelte, no cloud sync). Safe for the Worker via re-exports of ruleset math. */
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
} from './ruleset';
export { nextPhase, type PhaseEvent, type RunPhase } from './lifecycle';
export { RULESET_SRC as RULESET_SEGMENT, minigameRoute, seededPath, withChallenger } from './share';
export { gameCopy } from './copy';
export { defineMinigame, playModeFromContext, type MinigameDef, type MinigameKind, type PlayMode } from './define';
export {
  b64url,
  decodeRun,
  emptyRun,
  encodeRun,
  packRun,
  tagFor,
  unb64url,
  unpackRun,
  type ChallengeRunPb,
} from './runProto';
