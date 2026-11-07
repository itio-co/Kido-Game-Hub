/** Public ruleset registry for the rhythm engine. Keys must include module.json `version`. */
import meta from './module.json';
import data from './ruleset.json';

export type RhythmTuning = { beat: number; window: number; gap: number; rise: number };
export type RhythmDifficultyName = 'easy' | 'normal' | 'hard';

export type RhythmRulesetParams = {
  durationSec: number;
  beatMs: number;
  perfectMs: number;
  goodMs: number;
  extraFirstMs: number;
  extraLeadMs: number;
  extraWindowMs: number;
  extraGapMs: [number, number];
  pressureRise: number;
  pressureDropPerTap: number;
  pressureZone: [number, number];
  stars: { two: number; three: number };
};

export type RhythmScoring = {
  perfectBase: number;
  perfectBonus: number;
  perfectCombo: number;
  perfectComboCap: number;
  perfectProgress: number;
  goodBase: number;
  goodCombo: number;
  goodComboCap: number;
  goodProgress: number;
  missPenalty: number;
  extraHitBase: number;
  extraHitCombo: number;
  extraProgress: number;
  zoneScorePerSec: number;
  zoneProgressPerSec: number;
  outZonePenaltyPerSec: number;
  extraMissGraceMs: number;
  cueMinGapMs: number;
  cueMissGapMs: number;
};

export type RhythmRuleset = {
  chart: 'v1';
  params: RhythmRulesetParams;
  tuning: Record<RhythmDifficultyName, RhythmTuning>;
  scoring: RhythmScoring;
  submit: { minMs: number; slackSec: number; maxScore: number };
};

export const RHYTHM_RULESETS = data as unknown as Record<string, RhythmRuleset>;
export const RHYTHM_VERSION = meta.version;
export const rhythmRuleset = (version: string): RhythmRuleset | null => RHYTHM_RULESETS[version] ?? null;
