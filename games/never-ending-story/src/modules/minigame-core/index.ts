/** Public entry. Client games import from here. The Worker keeps using ruleset math through src/lib/ruleset.ts. */
export * from './framework';
export { submitFinishedRun } from './report';
export { default as RulesetBanner } from './RulesetBanner.svelte';
export { default as UnsupportedRuleset } from './UnsupportedRuleset.svelte';
export { default as WinResultDialog } from './WinResultDialog.svelte';
export {
  BEST_STORAGE_KEY,
  applyBest,
  bestKey,
  formatTime,
  parseBests,
  readBest,
  readBests,
  recordBest,
  type BestEntry,
  type BestStore,
  type WinResult,
} from './result';
