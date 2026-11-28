/** Browser storage for the typing settings, through the deployment partition adapter. */
import { appStorage } from '../../lib/deployment';
import { defaultPrefs, parsePrefs, TYPING_STORAGE_KEY, type TypingPrefs } from './store.ts';

export function readPrefs(): TypingPrefs {
  try {
    return parsePrefs(appStorage.getItem(TYPING_STORAGE_KEY));
  } catch {
    return defaultPrefs();
  }
}

export function writePrefs(prefs: TypingPrefs): void {
  try {
    appStorage.setItem(TYPING_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Private mode or a full quota must not break playing.
  }
}
