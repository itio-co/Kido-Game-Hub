/**
 * Tiny i18n core (no dependencies). English is the source language: keys are dotted English
 * (`editor.match.setOrigin`) and every key must exist in `src/locales/en.json`. Other locales may lag behind;
 * a missing translation falls back to English, then to the key itself.
 *
 * This module is plain TypeScript so node unit tests can import it. The reactive locale (Svelte 5 runes) lives in
 * `locale.svelte.ts`, which plugs itself in through `setLocaleSource`.
 */
import en from '../../locales/en.json' with { type: 'json' };
import th from '../../locales/th.json' with { type: 'json' };

export type Locale = 'en' | 'th';
export const LOCALES: readonly Locale[] = ['en', 'th'];
export type MessageKey = keyof typeof en;
export type Params = Record<string, string | number>;

const TABLES: Record<Locale, Partial<Record<string, string>>> = { en, th };

/** Fill `{name}` placeholders. Unknown placeholders are left as they are. */
export function interpolate(text: string, params?: Params): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m));
}

/** Text of `key` in `locale`, falling back to English, then to the key. */
export function format(locale: Locale, key: MessageKey, params?: Params): string {
  const text = TABLES[locale][key] ?? TABLES.en[key] ?? key;
  return interpolate(text, params);
}

export function isLocale(v: unknown): v is Locale {
  return v === 'en' || v === 'th';
}

export function hasKey(key: string): key is MessageKey {
  return key in TABLES.en;
}

let source: () => Locale = () => 'en';

/** Plug in the active-locale getter (the reactive state in `locale.svelte.ts`; English in node tests). */
export function setLocaleSource(fn: () => Locale): void {
  source = fn;
}

export function currentLocale(): Locale {
  return source();
}

/** Translate `key` in the active locale. Reading it inside a Svelte template or `$derived` is reactive. */
export const t = (key: MessageKey, params?: Params): string => format(source(), key, params);

/** Flat `key → text` table of one locale (fallbacks applied). */
export function localeTable(locale: Locale): Record<MessageKey, string> {
  const out = {} as Record<MessageKey, string>;
  for (const k of Object.keys(TABLES.en) as MessageKey[]) out[k] = format(locale, k);
  return out;
}
