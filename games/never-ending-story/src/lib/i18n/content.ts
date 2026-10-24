// Picks the right language from authored content data. Game data keeps the
// default (Thai) text in `field` and the English text in a `fieldEn` sibling,
// following the existing `title` / `titleEn` convention.
import { currentLocale } from './core.ts';

type Fields<T> = {
  [K in keyof T & string]: T[K] extends string | readonly string[] | null | undefined ? K : never;
}[keyof T & string];

function sibling(obj: object, field: string): unknown {
  return (obj as Record<string, unknown>)[`${field}En`];
}

/** Localized string field (falls back to the default-language field). */
export function tx<T extends object>(obj: T, field: Fields<T>): string {
  const base = (obj as Record<string, unknown>)[field];
  if (currentLocale() === 'en') {
    const en = sibling(obj, field);
    if (typeof en === 'string' && en !== '') return en;
  }
  return typeof base === 'string' ? base : '';
}

/** Localized string-array field. */
export function txList<T extends object>(obj: T, field: Fields<T>): string[] {
  const base = (obj as Record<string, unknown>)[field];
  if (currentLocale() === 'en') {
    const en = sibling(obj, field);
    if (Array.isArray(en) && en.length > 0) return en as string[];
  }
  return Array.isArray(base) ? (base as string[]) : [];
}
