/** Public entry of the `jigsaw` module. Import from here only. */
import { defineMinigame } from '../minigame-core/framework.ts';

export const jigsawGame = defineMinigame({
  id: 'jigsaw',
  kind: 'minigame',
  modes: ['practice', 'story', 'challenge'],
  leaderboardId: 'jig',
});
export * from './puzzle.ts';
export {
  JIG_RULESETS,
  JIG_VERSION,
  jigDiffFromLabel,
  jigProfile,
  jigProfileForLabel,
  jigRules,
  type JigDiff,
  type JigHintOptions,
  type JigProfile,
  type JigRotation,
  type JigRuleset,
} from './ruleset.ts';
export { generateEdges, piecePath, tabDepth, TAB_RATIO, type EdgeKind, type PieceEdges } from './edges.ts';
