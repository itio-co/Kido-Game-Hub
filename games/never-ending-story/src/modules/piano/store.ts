/** Local settings for the piano (octave, sound, last song/difficulty). Personal bests use the shared minigame-core store. */
import { clampOctave } from './notes.ts';
import { PIANO_DIFFICULTIES, type PianoDifficulty } from './ruleset.ts';
import { SONGS, type SongId } from './songs.ts';

export const PIANO_STORAGE_KEY = 'nesg.piano.v1';

export type PianoPrefs = { octave: number; muted: boolean; difficulty: PianoDifficulty; song: SongId };
export const defaultPrefs = (): PianoPrefs => ({ octave: 4, muted: false, difficulty: 'easy', song: 'twinkle' });

export function parsePrefs(raw: string | null | undefined): PianoPrefs {
  const base = defaultPrefs();
  if (!raw) return base;
  try {
    const data = JSON.parse(raw) as Partial<PianoPrefs> | null;
    if (!data || typeof data !== 'object') return base;
    return {
      octave: typeof data.octave === 'number' && Number.isFinite(data.octave) ? clampOctave(data.octave, 1) : base.octave,
      muted: data.muted === true,
      difficulty: PIANO_DIFFICULTIES.includes(data.difficulty as PianoDifficulty) ? (data.difficulty as PianoDifficulty) : base.difficulty,
      song: SONGS.some((song) => song.id === data.song) ? (data.song as SongId) : base.song,
    };
  } catch {
    return base;
  }
}

export function readPrefs(): PianoPrefs {
  try {
    return parsePrefs(localStorage.getItem(PIANO_STORAGE_KEY));
  } catch {
    return defaultPrefs();
  }
}

export function writePrefs(prefs: PianoPrefs): void {
  try {
    localStorage.setItem(PIANO_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Private mode or a full quota must not break playing.
  }
}
