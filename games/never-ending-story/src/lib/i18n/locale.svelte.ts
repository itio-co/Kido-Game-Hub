/**
 * Reactive locale state. The game and the 3D editor keep independent languages:
 * - the game (every route except `#/editor`) defaults to Thai,
 * - the editor (`#/editor`) defaults to English,
 * each persisted under its own localStorage key. `App.svelte` sets `scope` from the route.
 */
import { isLocale, setLocaleSource, type Locale } from './core.ts';

export type LocaleScope = 'game' | 'editor';

const DEFAULTS: Record<LocaleScope, Locale> = { game: 'th', editor: 'en' };
export const LOCALE_STORAGE_KEYS: Record<LocaleScope, string> = {
  game: 'nes-locale-game',
  editor: 'nes-locale-editor',
};

function load(scope: LocaleScope): Locale {
  try {
    const v = globalThis.localStorage?.getItem(LOCALE_STORAGE_KEYS[scope]);
    return isLocale(v) ? v : DEFAULTS[scope];
  } catch {
    return DEFAULTS[scope];
  }
}

export const scopeOfHash = (hash: string): LocaleScope => (hash.startsWith('#/editor') ? 'editor' : 'game');

class LocaleState {
  scope = $state<LocaleScope>(scopeOfHash(globalThis.location?.hash ?? ''));
  game = $state<Locale>(load('game'));
  editor = $state<Locale>(load('editor'));

  /** Locale of the active scope. */
  get current(): Locale {
    return this.scope === 'editor' ? this.editor : this.game;
  }

  setScope(scope: LocaleScope): void {
    this.scope = scope;
    syncDocument();
  }

  set(scope: LocaleScope, locale: Locale): void {
    this[scope] = locale;
    try {
      globalThis.localStorage?.setItem(LOCALE_STORAGE_KEYS[scope], locale);
    } catch {
      /* private mode: keep it for this session only */
    }
    syncDocument();
  }
}

export const locale = new LocaleState();
setLocaleSource(() => locale.current);

function syncDocument(): void {
  if (typeof document !== 'undefined') document.documentElement.lang = locale.current;
}
syncDocument();
