import type { Component } from 'svelte';
import { rhythmRuleset, RHYTHM_VERSION, type RhythmRulesetParams } from './ruleset';

/** Tunable timing knobs. Every pack supplies its own values (see its ruleset registry). */
export type RhythmParams = RhythmRulesetParams;

/** Engine defaults for the current rhythm version. Packs snapshot their own copy. */
export const DEFAULT_PARAMS: RhythmParams = rhythmRuleset(RHYTHM_VERSION)!.params;

export type Judgement = 'perfect' | 'good' | 'miss' | 'extra-hit' | 'extra-miss';

/** What the pack's stage component receives every frame. */
export type StageProps = {
  progress: number; // 0..100 dish/song progress
  pressure: number; // 0..100 meter (heat)
  pressureZone: [number, number];
  combo: number;
  beat: number; // 0..1 proximity to the next beat
  extraDue: boolean;
  /** Last judgement + a counter that changes on every judgement (use with {#key}). */
  last: Judgement | null;
  pulse: number;
  /** Active pack ruleset version, so the stage can pick versioned visuals. */
  packVersion: string;
};

export type RhythmPack = {
  /** Pack module id, also the leaderboard key ("game" on the server). */
  id: string;
  leaderboardId: string;
  /** i18n key prefix for all copy, e.g. "stirfry" -> "stirfry.title", "stirfry.stir". */
  copy: string;
  /** localStorage key for the run/best store (kept per pack for save compatibility). */
  storageKey: string;
  /** Hash route that opens this pack (share link). */
  route: string;
  /** Pack module version (module.json). */
  version: string;
  /** Version played by versionless links from app 0.6.10. */
  legacyVersion: string;
  rulesets: Record<string, { params: RhythmParams }>;
  theme: { background: string; accent?: string };
  /** Visual inside the play area, driven by StageProps. */
  Stage: Component<StageProps>;
  hooks?: {
    onBeat?: () => void;
    onJudge?: (j: Judgement, state: StageProps) => void;
    onFinish?: (score: number, progress: number) => void;
  };
};
