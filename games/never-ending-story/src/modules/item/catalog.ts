/** Item catalog: kinds own the reusable icon; unique items reference a kind and keep their own name and detail image. */

/** Entity type written on a kind row. */
export const ITEM_KIND_TYPE = 'item-kind';

/** Reusable item kind: owns the grid icon. Each row has id (UUID), kind, title and slug. */
export type ItemKindRecord = {
  /** UUID v4 written in the catalog file, never minted at runtime. */
  id: string;
  kind: typeof ITEM_KIND_TYPE;
  /** Thai kind name, e.g. กรอบรูป. */
  title: string;
  titleEn?: string;
  /** Unique kebab-case slug, e.g. picture-frame. */
  slug: string;
  /** Generic icon path under `public/img/`. */
  icon: string;
};

/** Unique item instance. `kind` is the slug of a registered kind. */
export type Item = {
  /** UUID v4 written in the catalog file, never minted at runtime. */
  id: string;
  /** Slug of a registered kind (e.g. picture-frame). */
  kind: string;
  /** Thai title; the special name shown in the grid and in Item Detail. */
  title: string;
  titleEn?: string;
  /** Unique kebab-case slug; also the bag save id. */
  slug: string;
  /** Detail image under `public/img/`; the grid icon comes from the kind. */
  image?: string;
  /** Thai description, shown only in Item Detail. */
  description: string;
  descriptionEn?: string;
};

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const kinds: ItemKindRecord[] = [];
const registry: Item[] = [];

function validateRow(id: string, slug: string, title: string, errors: string[]): void {
  if (!UUID_V4.test(id)) errors.push(`${slug || id}: id must be a UUID v4`);
  if (!slug || !SLUG.test(slug)) errors.push(`${id}: slug must be unique kebab-case`);
  if (!title) errors.push(`${slug}: title is required`);
}

export function validateKinds(rows: readonly ItemKindRecord[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const slugs = new Set<string>();
  for (const row of rows) {
    validateRow(row.id, row.slug, row.title, errors);
    if (ids.has(row.id)) errors.push(`duplicate kind id ${row.id}`);
    ids.add(row.id);
    if (slugs.has(row.slug)) errors.push(`duplicate kind slug ${row.slug}`);
    slugs.add(row.slug);
    if (row.kind !== ITEM_KIND_TYPE) errors.push(`${row.slug}: kind must be ${ITEM_KIND_TYPE}`);
    if (!row.icon) errors.push(`${row.slug}: icon is required`);
  }
  return errors;
}

export function validateItems(items: readonly Item[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const slugs = new Set<string>();
  const known = new Set(kinds.map((row) => row.slug));
  for (const item of items) {
    validateRow(item.id, item.slug, item.title, errors);
    if (ids.has(item.id)) errors.push(`duplicate id ${item.id}`);
    ids.add(item.id);
    if (slugs.has(item.slug)) errors.push(`duplicate slug ${item.slug}`);
    slugs.add(item.slug);
    if (!item.kind || !known.has(item.kind)) {
      errors.push(`${item.slug}: unknown kind ${item.kind || '(missing)'}`);
    }
    if (!item.description) errors.push(`${item.slug}: description is required`);
  }
  return errors;
}

export function registerKinds(rows: readonly ItemKindRecord[]): void {
  const errors = validateKinds(rows);
  if (errors.length) throw new Error(errors.join('; '));
  for (const row of rows) {
    const existing = kinds.findIndex((kind) => kind.id === row.id || kind.slug === row.slug);
    if (existing >= 0) kinds.splice(existing, 1, { ...row });
    else kinds.push({ ...row });
  }
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

export function clearKinds(): void {
  kinds.splice(0, kinds.length);
}

export function clearItems(): void {
  registry.splice(0, registry.length);
}

export function allKinds(): readonly ItemKindRecord[] {
  return kinds;
}

export function allItems(): readonly Item[] {
  return registry;
}

export function kindBySlug(slug: string): ItemKindRecord | undefined {
  return kinds.find((row) => row.slug === slug);
}

export function kindById(id: string): ItemKindRecord | undefined {
  return kinds.find((row) => row.id === id);
}

export function kindForItem(item: Item): ItemKindRecord | undefined {
  return kindBySlug(item.kind);
}

/** Grid icon: always the kind's generic icon. */
export function itemIconFile(item: Item): string | undefined {
  return kindForItem(item)?.icon;
}

/** Detail image: the unique item's image, falling back to the kind icon. */
export function itemImageFile(item: Item): string | undefined {
  return item.image || itemIconFile(item);
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

export function kindCopy(kind: ItemKindRecord, locale: 'th' | 'en' = 'th'): { title: string } {
  if (locale === 'en') return { title: kind.titleEn || kind.title };
  return { title: kind.title };
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
