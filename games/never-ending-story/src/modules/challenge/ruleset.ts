/** Scoring rules for puzzle challenges. A new formula bumps this module and adds a key. */
import meta from './module.json';
import data from './ruleset.json';

export type ChallengeDiffName = 'easy' | 'medium' | 'hard';
export type ChallengeGameName = 'cross' | 'jig' | 'slide';

export type ChallengeScoring = {
  correct: number;
  combo: number;
  mistake: number;
  hint: number;
  timeBonus: number;
  floor: number;
  maxBase: number;
  minMs: number;
  maxMs: number;
  mult: Record<ChallengeDiffName, number>;
  par: Record<ChallengeGameName, Record<ChallengeDiffName, number>>;
};

export const CHALLENGE_RULESETS = data as Record<string, ChallengeScoring>;
export const CHALLENGE_VERSION = meta.version;
export const challengeScoring = (version: string): ChallengeScoring | null => CHALLENGE_RULESETS[version] ?? null;
