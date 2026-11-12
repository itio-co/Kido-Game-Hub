import { appStorage } from './deployment';
import type { FlowProgress, SaveV1, TextSize } from './types';
import { markDirty } from './cloudSync';

export const SAVE_KEY = 'nesg.player.v1';

const SIZES: TextSize[] = ['sm', 'md', 'lg'];

export function defaultSave(): SaveV1 {
  return {
    version: 1,
    player: {
      onboardingComplete: false,
      prologueSeen: false,
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
    difficulty: 'ปานกลาง',
    played: [],
    seen: [],
    levels: { cross: [], jig: [], slide: [] },
    poster: false,
    caseDone: false,
    nav: undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function readSave(): SaveV1 {
  try {
    const raw = appStorage.getItem(SAVE_KEY);
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
    const decor = isRecord(player.decor) ? (player.decor as Record<string, string | null>) : {};
    return {
      version: 1,
      player: {
        onboardingComplete: player.onboardingComplete === true,
        prologueSeen: player.prologueSeen === true,
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
        difficulty: typeof flow.difficulty === 'string' ? flow.difficulty : 'ปานกลาง',
        played: Array.isArray(flow.played) ? flow.played.filter((id) => typeof id === 'string') : [],
        seen: Array.isArray(flow.seen) ? flow.seen.filter((id) => typeof id === 'string') : [],
        levels: {
          cross: stars(levels.cross),
          jig: stars(levels.jig),
          slide: stars(levels.slide),
        },
        poster: flow.poster === true,
        caseDone: flow.caseDone === true,
        mapUnlocked: flow.mapUnlocked === true,
        nav: isRecord(flow.nav)
          ? {
              screen: typeof flow.nav.screen === 'string' ? flow.nav.screen : 'player-room',
              history: Array.isArray(flow.nav.history)
                ? flow.nav.history.filter((item): item is string => typeof item === 'string')
                : [],
              slot:
                flow.nav.slot === 'yesterday' || flow.nav.slot === 'afternoon' || flow.nav.slot === 'now'
                  ? flow.nav.slot
                  : 'now',
              page: typeof flow.nav.page === 'number' ? flow.nav.page : 0,
              talkSlug: typeof flow.nav.talkSlug === 'string' ? flow.nav.talkSlug : null,
              context:
                flow.nav.context === 'hub' || flow.nav.context === 'event' || flow.nav.context === 'practice'
                  ? flow.nav.context
                  : undefined,
              schema: typeof flow.nav.schema === 'number' ? flow.nav.schema : 0,
              practice: flow.nav.practice === true,
              lvGame:
                flow.nav.lvGame === 'cross' || flow.nav.lvGame === 'jig' || flow.nav.lvGame === 'slide'
                  ? flow.nav.lvGame
                  : undefined,
              lvN: typeof flow.nav.lvN === 'number' ? flow.nav.lvN : undefined,
            }
          : undefined,
      },
    };
  } catch {
    return defaultSave();
  }
}

export function writeSave(save: SaveV1): void {
  appStorage.setItem(SAVE_KEY, JSON.stringify(save));
  markDirty();
}
