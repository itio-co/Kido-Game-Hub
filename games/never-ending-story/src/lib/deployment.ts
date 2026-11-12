/** Runtime partition supplied by the hosting Worker; defaults preserve production/local saves. */
export function normalizeAppBase(value = '/never'): string {
  if (value.length > 128 || !/^\/[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)*$/.test(value)) throw new Error('Invalid APP_BASE');
  return value;
}
export function appBase(): string {
  const value = typeof document === 'undefined' ? undefined : document.querySelector<HTMLMetaElement>('meta[name="nes-app-base"]')?.content;
  return normalizeAppBase(value || '/never');
}
export function partitionKey(key: string, base = appBase()): string {
  return base === '/never' ? key : `nes-space:${normalizeAppBase(base).slice(1).replaceAll('/', ':')}:${key}`;
}
/** Do not patch native Storage: every application call explicitly uses this adapter. */
export const appStorage = {
  getItem: (key: string) => localStorage.getItem(partitionKey(key)),
  setItem: (key: string, value: string) => localStorage.setItem(partitionKey(key), value),
  removeItem: (key: string) => localStorage.removeItem(partitionKey(key)),
};
