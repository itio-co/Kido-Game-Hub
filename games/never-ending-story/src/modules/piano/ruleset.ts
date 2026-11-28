/** Public ruleset registry for the piano module. Keys must include module.json `version`. */
import meta from './module.json' with { type: 'json' };
import data from './ruleset.json' with { type: 'json' };

export type PianoDifficulty = 'easy' | 'normal' | 'hard';
export const PIANO_DIFFICULTIES: readonly PianoDifficulty[] = ['easy', 'normal', 'hard'];

export type PianoTiming = { beatMs: number; perfectMs: number; goodMs: number; fallMs: number; names: boolean };
export type PianoScoring = { perfect: number; good: number; comboBonus: number; comboCap: number; goodWeight: number };
export type PianoRuleset = {
  leadInBeats: number;
  difficulties: Record<PianoDifficulty, PianoTiming>;
  scoring: PianoScoring;
  /** Accuracy needed for 1, 2 and 3 stars. */
  stars: [number, number, number];
};

export const PIANO_RULESETS = data as unknown as Record<string, PianoRuleset>;
export const PIANO_VERSION = meta.version;
export const pianoRuleset = (version: string): PianoRuleset | null => PIANO_RULESETS[version] ?? null;
