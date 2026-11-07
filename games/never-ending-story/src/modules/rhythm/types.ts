import type { Component } from 'svelte';

/** Tunable timing/scoring knobs. Every edition supplies its own values (see DEFAULT_PARAMS). */
export type RhythmParams = {
  durationSec: number;
  beatMs: number;
  perfectMs: number;
  goodMs: number;
  /** Second action ("extra" lane, e.g. add ingredient): first cue delay, window, gap range. */
  extraFirstMs: number;
  extraLeadMs: number;
  extraWindowMs: number;
  extraGapMs: [number, number];
  /** Pressure meter (e.g. wok heat): rise per second, drop per tap, safe zone. */
  pressureRise: number;
  pressureDropPerTap: number;
  pressureZone: [number, number];
  stars: { two: number; three: number };
};

export const DEFAULT_PARAMS: RhythmParams = {
  durationSec: 60,
  beatMs: 780,
  perfectMs: 110,
  goodMs: 200,
  extraFirstMs: 2800,
  extraLeadMs: 850,
  extraWindowMs: 480,
  extraGapMs: [2600, 4000],
  pressureRise: 7,
  pressureDropPerTap: 4,
  pressureZone: [35, 75],
  stars: { two: 900, three: 1400 },
};

export type Judgement = 'perfect' | 'good' | 'miss' | 'extra-hit' | 'extra-miss';

/** What the edition's stage component receives every frame. */
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
};

export type RhythmEdition = {
  /** Edition module id, also the leaderboard key ("game" on the server). */
  id: string;
  leaderboardId: string;
  /** i18n key prefix for all copy, e.g. "stirfry" -> "stirfry.title", "stirfry.stir". */
  copy: string;
  /** localStorage key for the run/best store (kept per edition for save compatibility). */
  storageKey: string;
  /** Hash route that opens this edition (share link). */
  route: string;
  params: RhythmParams;
  theme: { background: string; accent?: string };
  /** Visual inside the play area, driven by StageProps. */
  Stage: Component<StageProps>;
  hooks?: {
    onBeat?: () => void;
    onJudge?: (j: Judgement, state: StageProps) => void;
    onFinish?: (score: number, progress: number) => void;
  };
};
