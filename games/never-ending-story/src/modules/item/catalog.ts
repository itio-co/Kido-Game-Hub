/** Item catalog: identities follow the scene-entity rules (UUID id, kind, title, slug). */

export const ITEM_KINDS = ['item', 'item-photo', 'item-key'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export type Item = {
  /** UUID v4 written in the catalog file, never minted at runtime. */
  id: string;
  kind: ItemKind;
  /** Thai title. */
  title: string;
  titleEn?: string;
  /** Unique kebab-case slug; also the bag save id. */
  slug: string;
  /** Path under `public/img/`. */
  icon: string;
  /** Optional larger still for the detail view; falls back to `icon`. */
  image?: string;
  /** Thai description. */
  description: string;
  descriptionEn?: string;
};

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const registry: Item[] = [];

export function validateItems(items: readonly Item[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const slugs = new Set<string>();
  for (const item of items) {
    if (!UUID_V4.test(item.id)) errors.push(`${item.slug || item.id}: id must be a UUID v4`);
    if (ids.has(item.id)) errors.push(`duplicate id ${item.id}`);
    ids.add(item.id);
    if (!item.slug || !SLUG.test(item.slug)) errors.push(`${item.id}: slug must be unique kebab-case`);
    if (slugs.has(item.slug)) errors.push(`duplicate slug ${item.slug}`);
    slugs.add(item.slug);
    if (!(ITEM_KINDS as readonly string[]).includes(item.kind)) {
      errors.push(`${item.slug}: unknown kind ${item.kind}`);
    }
    if (!item.title) errors.push(`${item.slug}: title is required`);
    if (!item.icon) errors.push(`${item.slug}: icon is required`);
    if (!item.description) errors.push(`${item.slug}: description is required`);
  }
  return errors;
}

export function registerItems(items: readonly Item[]): void {
  const errors = validateItems(items);
  if (errors.length) throw new Error(errors.join('; '));
  for (const item of items) {
    const existing = registry.findIndex((row) => row.id === item.id || row.slug === item.slug);
    if (existing >= 0) registry.splice(existing, 1, { ...item });
    else registry.push({ ...item });
  }
}

export function clearItems(): void {
  registry.splice(0, registry.length);
}

export function allItems(): readonly Item[] {
  return registry;
}

export function itemBySlug(slug: string): Item | undefined {
  return registry.find((item) => item.slug === slug);
}

export function itemById(id: string): Item | undefined {
  return registry.find((item) => item.id === id);
}

/** Resolve the bag save id (slug, or a UUID) to a catalog row. */
export function itemForBagId(bagId: string): Item | undefined {
  return itemBySlug(bagId) ?? itemById(bagId);
}

export function itemCopy(item: Item, locale: 'th' | 'en' = 'th'): { title: string; description: string } {
  if (locale === 'en') {
    return {
      title: item.titleEn || item.title,
      description: item.descriptionEn || item.description,
    };
  }
  return { title: item.title, description: item.description };
}
