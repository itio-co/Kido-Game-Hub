import type { SaveV1, TextSize } from './types';

export const SAVE_KEY = 'nesg.player.v1';

const SIZES: TextSize[] = ['sm', 'md', 'lg'];

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
    const textSize = SIZES.includes(player.textSize as TextSize) ? (player.textSize as TextSize) : 'md';
    const decor = isRecord(player.decor) ? (player.decor as Record<string, string | null>) : {};
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
    };
  } catch {
    return defaultSave();
  }
}

export function writeSave(save: SaveV1): void {
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
}
