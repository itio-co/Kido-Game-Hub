/**
 * New designer strings. Keys are English. Catalogs: `src/locales/en.json` and `src/locales/th.json`.
 * The rest of Starship's UI is not routed through here. The default locale is English, matching
 * the designer copy that is already on screen. Set `locale` to `th` to use the Thai catalog.
 */
import en from '../locales/en.json';
import th from '../locales/th.json';

export type LocaleId = 'en' | 'th';
export type MessageKey = keyof typeof en;

const catalogs: Record<LocaleId, Record<MessageKey, string>> = { en, th };

export let locale: LocaleId = 'en';

export function t(key: MessageKey): string {
	return catalogs[locale][key];
}
