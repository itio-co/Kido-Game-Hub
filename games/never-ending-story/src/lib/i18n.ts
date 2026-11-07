import en from '../locales/en.json';
import th from '../locales/th.json';

const tables = { th, en } as const;
export type Locale = keyof typeof tables;

let locale: Locale = 'th';

export function setLocale(next: Locale): void {
  locale = next in tables ? next : 'th';
}

export function t(key: string, vars?: Record<string, string | number>): string {
  const table = tables[locale] as Record<string, string>;
  const fallback = tables.en as Record<string, string>;
  let text = table[key] ?? fallback[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}
