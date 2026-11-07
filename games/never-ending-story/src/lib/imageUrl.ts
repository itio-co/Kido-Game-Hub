/** Public image URL under the app base path. Shared by events, packs, and challenge art. */
export function imageUrl(file: string): string {
  return `${import.meta.env.BASE_URL}img/${file}`;
}
