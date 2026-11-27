/** Challenge grid sizes plus event difficulty profiles. */
import meta from './module.json' with { type: 'json' };
import data from './ruleset.json' with { type: 'json' };

export type JigDiff = 'easy' | 'medium' | 'hard';
export type JigRotation = 'none' | 'quarter' | 'free';

export type JigHintOptions = {
  highlightTarget: boolean;
  placeOne: boolean;
};

export type JigProfile = {
  cols: number;
  rows: number;
  rotation: JigRotation;
  /** Snap radius in CSS pixels, measured from the piece centre to its slot. */
  snapDistance: number;
  /** Max absolute angle error in degrees that still locks (hard) or counts as upright. */
  angleTolerance: number;
  /** Extra margin around the board, as a fraction of the shorter board side, used when scattering pieces. */
  scatterPadding: number;
  /** Fixed seed for scatter and edges. Omit or set 0 to pick a new seed each start. */
  scatterSeed: number;
  hint: JigHintOptions;
};

export type JigRuleset = {
  grid: Record<JigDiff, [number, number]>;
  profiles?: Record<JigDiff, JigProfile>;
};

export const JIG_RULESETS = data as unknown as Record<string, JigRuleset>;
export const JIG_VERSION = meta.version;
export const jigRules = (version: string): JigRuleset | null => JIG_RULESETS[version] ?? null;

const LABEL_TO_DIFF: Record<string, JigDiff> = {
  easy: 'easy',
  medium: 'medium',
  hard: 'hard',
  normal: 'medium',
  'ง่าย': 'easy',
  'ปานกลาง': 'medium',
  'ยาก': 'hard',
};

export function jigDiffFromLabel(label: string | null | undefined): JigDiff {
  if (!label) return 'medium';
  return LABEL_TO_DIFF[label] ?? LABEL_TO_DIFF[label.trim().toLowerCase()] ?? 'medium';
}

const DEFAULT_HINT: JigHintOptions = { highlightTarget: true, placeOne: true };

const DEFAULT_PROFILE: Record<JigDiff, Omit<JigProfile, 'cols' | 'rows'>> = {
  easy: { rotation: 'none', snapDistance: 28, angleTolerance: 15, scatterPadding: 0.22, scatterSeed: 1101, hint: { highlightTarget: true, placeOne: true } },
  medium: { rotation: 'quarter', snapDistance: 24, angleTolerance: 14, scatterPadding: 0.2, scatterSeed: 2202, hint: { highlightTarget: true, placeOne: true } },
  hard: { rotation: 'free', snapDistance: 20, angleTolerance: 10, scatterPadding: 0.18, scatterSeed: 3303, hint: { highlightTarget: false, placeOne: true } },
};

export function jigProfile(diff: JigDiff, version: string = JIG_VERSION): JigProfile {
  const rules = jigRules(version) ?? jigRules(JIG_VERSION) ?? jigRules('1.1.0') ?? jigRules('1.0.0');
  const fromRules = rules?.profiles?.[diff];
  if (fromRules) {
    return {
      cols: fromRules.cols,
      rows: fromRules.rows,
      rotation: fromRules.rotation,
      snapDistance: fromRules.snapDistance,
      angleTolerance: fromRules.angleTolerance,
      scatterPadding: fromRules.scatterPadding,
      scatterSeed: fromRules.scatterSeed ?? 0,
      hint: { ...DEFAULT_HINT, ...fromRules.hint },
    };
  }
  const grid = rules?.grid[diff] ?? [3, 4];
  const fallback = DEFAULT_PROFILE[diff];
  return { cols: grid[0], rows: grid[1], ...fallback };
}

export function jigProfileForLabel(label: string | null | undefined, version: string = JIG_VERSION): JigProfile {
  return jigProfile(jigDiffFromLabel(label), version);
}
