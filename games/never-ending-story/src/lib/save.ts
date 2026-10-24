import { format } from './i18n/core.ts';
import type { FlowProgress, SaveV1, TextSize } from './types';

export const SAVE_KEY = 'nesg.player.v1';

const SIZES: TextSize[] = ['sm', 'md', 'lg'];

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** Decor ids placed by rewards. Older saves stored a display label instead. */
export const DECOR_IDS = ['photo'] as const;

/**
 * Difficulty is stored as an English id. Saves from before 0.2.11 stored the
 * Thai label; map it back through the Thai locale table.
 */
export function migrateDifficulty(value: unknown): Difficulty {
  if (typeof value !== 'string') return 'medium';
  for (const id of DIFFICULTIES) {
    if (value === id || value === format('th', `game.difficulty.${id}`) || value === format('en', `game.difficulty.${id}`)) {
      return id;
    }
  }
  return 'medium';
}

/** Old saves stored the shown label (e.g. a camera emoji and a name); map any filled slot to its id. */
export function migrateDecor(decor: Record<string, unknown>): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [slot, value] of Object.entries(decor)) {
    if (typeof value !== 'string' || value === '') out[slot] = null;
    else out[slot] = (DECOR_IDS as readonly string[]).includes(value) ? value : 'photo';
  }
  return out;
}

export function defaultSave(): SaveV1 {
  return {
    version: 1,
    player: {
      onboardingComplete: false,
      textSize: 'md',
      soundEnabled: false,
      calendarTheme: null,
      decor: {},
    },
    knowledge: {
      evidence: [],
      solvedCaseIds: [],
      exploreHints: 0,
    },
    caseState: {
      facts: {},
    },
    flow: defaultFlow(),
  };
}

export function defaultFlow(): FlowProgress {
  return {
    evidence: [],
    solved: false,
    deduced: false,
    reward: false,
    difficulty: 'medium',
    played: [],
    seen: [],
    levels: { cross: [], jig: [], slide: [] },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function readSave(): SaveV1 {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const data: unknown = JSON.parse(raw);
    if (!isRecord(data) || data.version !== 1) return defaultSave();
    const base = defaultSave();
    const player = isRecord(data.player) ? data.player : {};
    const knowledge = isRecord(data.knowledge) ? data.knowledge : {};
    const caseState = isRecord(data.caseState) ? data.caseState : {};
    const flow = isRecord(data.flow) ? data.flow : {};
    const levels = isRecord(flow.levels) ? flow.levels : {};
    const stars = (value: unknown): number[] => (Array.isArray(value) ? value.filter((item) => typeof item === 'number') : []);
    const textSize = SIZES.includes(player.textSize as TextSize) ? (player.textSize as TextSize) : 'md';
    const decor = isRecord(player.decor) ? migrateDecor(player.decor) : {};
    return {
      version: 1,
      player: {
        onboardingComplete: player.onboardingComplete === true,
        textSize,
        soundEnabled: player.soundEnabled === true,
        calendarTheme: typeof player.calendarTheme === 'string' ? player.calendarTheme : null,
        decor,
      },
      knowledge: {
        evidence: Array.isArray(knowledge.evidence) ? knowledge.evidence.filter((id) => typeof id === 'string') : [],
        solvedCaseIds: Array.isArray(knowledge.solvedCaseIds)
          ? knowledge.solvedCaseIds.filter((id) => typeof id === 'string')
          : [],
        exploreHints: typeof knowledge.exploreHints === 'number' ? knowledge.exploreHints : 0,
      },
      caseState: {
        facts: isRecord(caseState.facts) ? (caseState.facts as Record<string, boolean>) : base.caseState.facts,
      },
      flow: {
        evidence: Array.isArray(flow.evidence) ? flow.evidence.filter((id) => typeof id === 'string') : [],
        solved: flow.solved === true,
        deduced: flow.deduced === true,
        reward: flow.reward === true,
        difficulty: migrateDifficulty(flow.difficulty),
        played: Array.isArray(flow.played) ? flow.played.filter((id) => typeof id === 'string') : [],
        seen: Array.isArray(flow.seen) ? flow.seen.filter((id) => typeof id === 'string') : [],
        levels: {
          cross: stars(levels.cross),
          jig: stars(levels.jig),
          slide: stars(levels.slide),
        },
      },
    };
  } catch {
    return defaultSave();
  }
}

export function writeSave(save: SaveV1): void {
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
}
