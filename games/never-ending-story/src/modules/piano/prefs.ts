/** Browser storage for the piano settings, through the deployment partition adapter. */
import { appStorage } from '../../lib/deployment';
import { defaultPrefs, parsePrefs, PIANO_STORAGE_KEY, type PianoPrefs } from './store.ts';

export function readPrefs(): PianoPrefs {
  try {
    return parsePrefs(appStorage.getItem(PIANO_STORAGE_KEY));
  } catch {
    return defaultPrefs();
  }
}

export function writePrefs(prefs: PianoPrefs): void {
  try {
    appStorage.setItem(PIANO_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Private mode or a full quota must not break playing.
  }
}
