import { t } from '../../lib/i18n';

/** `gameCopy('stirfry')('title')` reads `stirfry.title` from the locale tables. */
export function gameCopy(prefix: string) {
  return (key: string, vars?: Record<string, string | number>) => t(`${prefix}.${key}`, vars);
}
