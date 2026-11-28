/** Public entry. Client games import from here. The Worker keeps using ruleset math through src/lib/ruleset.ts. */
export * from './framework';
export { reportWin, submitFinishedRun } from './report';
export { default as RulesetBanner } from './RulesetBanner.svelte';
export { default as UnsupportedRuleset } from './UnsupportedRuleset.svelte';
export { default as WinResultDialog } from './WinResultDialog.svelte';
export {
  BEST_STORAGE_KEY,
  migrateBests,
  difficultyId,
  canonicalBestKey,
  DIFFICULTY_IDS,
  applyBest,
  bestKey,
  formatTime,
  parseBests,
  readBest,
  readBests,
  recordBest,
  type BestEntry,
  type DifficultyId,
  type BestStore,
  type WinResult,
} from './result';
