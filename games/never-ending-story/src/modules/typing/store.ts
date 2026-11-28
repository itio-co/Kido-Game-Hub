/** Local settings for typing (difficulty, last set, last Typist source, run counter per set). Personal bests use the shared minigame-core store. */
import { SETS, type SetId } from './content.ts';
import { TYPING_DIFFICULTIES, type TypingDifficulty } from './ruleset.ts';
import { TYPIST_SOURCES } from './sources/typist.ts';

export const TYPING_STORAGE_KEY = 'nesg.typing.v1';

export type TypingPrefs = { difficulty: TypingDifficulty; set: SetId; source: string; plays: Partial<Record<SetId, number>> };
export const defaultPrefs = (): TypingPrefs => ({ difficulty: 'easy', set: 'home', source: TYPIST_SOURCES[0].id, plays: {} });

export function parsePrefs(raw: string | null | undefined): TypingPrefs {
  const base = defaultPrefs();
  if (!raw) return base;
  try {
    const data = JSON.parse(raw) as Partial<TypingPrefs> | null;
    if (!data || typeof data !== 'object') return base;
    const plays: TypingPrefs['plays'] = {};
    if (data.plays && typeof data.plays === 'object') {
      for (const set of SETS) {
        const n = (data.plays as Record<string, unknown>)[set.id];
        if (typeof n === 'number' && Number.isFinite(n) && n >= 0) plays[set.id] = Math.floor(n);
      }
    }
    return {
      difficulty: TYPING_DIFFICULTIES.includes(data.difficulty as TypingDifficulty) ? (data.difficulty as TypingDifficulty) : base.difficulty,
      set: SETS.some((s) => s.id === data.set) ? (data.set as SetId) : base.set,
      source: TYPIST_SOURCES.some((s) => s.id === data.source) ? (data.source as string) : base.source,
      plays,
    };
  } catch {
    return base;
  }
}
