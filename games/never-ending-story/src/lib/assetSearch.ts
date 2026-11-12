/** Catalog search stays independent of rendering and the Vite asset loader. */
export type SearchableAsset = {
  key: string; title: string; titleEn: string; slug: string; source: string; kind: string;
};
const aliases: Record<string, string> = { model: '3d model', scene: 'scene map', story: 'story artwork', reference: 'reference', character: 'character' };
export function filterAssets<T extends SearchableAsset>(items: T[], query: string, kind: string, sort = 'project'): T[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const results = items.filter((item) => (kind === 'all' || item.kind === kind) &&
    words.every((word) => `${item.title} ${item.titleEn} ${item.slug} ${item.source} ${aliases[item.kind] ?? item.kind}`.toLocaleLowerCase().includes(word)));
  if (sort === 'name') results.sort((a, b) => a.titleEn.localeCompare(b.titleEn));
  if (sort === 'type') results.sort((a, b) => a.kind.localeCompare(b.kind) || a.titleEn.localeCompare(b.titleEn));
  return results;
}
