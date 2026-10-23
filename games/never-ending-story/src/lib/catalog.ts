/** Authored scene identity. No runtime imports so `node --experimental-strip-types` can load this file. */

export const ENTITY_KINDS = [
  'room',
  'box',
  'floor',
  'window',
  'door',
  'bed',
  'nightstand',
  'desk',
  'bookshelf',
  'shelf-row',
  'book',
  'calendar',
  'calendar-theme',
  'calendar-entry',
  'rug',
  'plant',
  'lamp',
  'hotspot',
  'decor-slot',
  'screen-registry',
  'screen',
  'story-flow',
  'scene',
  'event',
  'cutscene-page',
  'speech-line',
  'evidence',
  'time-slot',
  'dialogue',
  'choice',
  'practice-game',
  'question',
  'goal',
  'minigame',
] as const;

export type EntityKind = (typeof ENTITY_KINDS)[number];

const KIND_SET = new Set<string>(ENTITY_KINDS);

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;

export type CatalogEntry = {
  id: string;
  kind: EntityKind;
  title: string;
  titleEn?: string;
  slug: string;
};

export class SceneCatalog {
  private readonly byId = new Map<string, CatalogEntry>();
  private readonly bySlug = new Map<string, CatalogEntry>();

  constructor(entries: CatalogEntry[]) {
    for (const entry of entries) {
      this.byId.set(entry.id, entry);
      this.bySlug.set(entry.slug, entry);
    }
  }

  getById(id: string): CatalogEntry | undefined {
    return this.byId.get(id);
  }

  getBySlug(slug: string): CatalogEntry | undefined {
    return this.bySlug.get(slug);
  }
}

export class RoomDataError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(problems.join('\n'));
    this.name = 'RoomDataError';
    this.problems = problems;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

type Found = CatalogEntry & { path: string; node: Record<string, unknown> };

function visit(value: unknown, path: string, found: Found[], problems: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => visit(item, `${path}[${index}]`, found, problems));
    return;
  }
  if (!isRecord(value)) return;

  if (typeof value.kind === 'string' || typeof value.id === 'string' || typeof value.slug === 'string') {
    const label = typeof value.slug === 'string' ? value.slug : path;
    const id = value.id;
    const kind = value.kind;
    const title = value.title;
    const slug = value.slug;
    const titleEn = value.titleEn;

    if (typeof id !== 'string' || !UUID_V4.test(id)) problems.push(`${label}: id must be a UUID v4 stored in the file`);
    if (typeof kind !== 'string' || !KIND_SET.has(kind)) {
      problems.push(`${label}: unknown kind ${String(kind)}`);
    }
    if (typeof title !== 'string' || title.trim() === '') problems.push(`${label}: title is required`);
    if (titleEn !== undefined && (typeof titleEn !== 'string' || titleEn.trim() === '')) {
      problems.push(`${label}: titleEn must be a string`);
    }
    if (typeof slug !== 'string' || !SLUG.test(slug)) {
      problems.push(`${label}: slug must be kebab-case segments separated by /`);
    }

    if (
      typeof id === 'string' &&
      typeof kind === 'string' &&
      KIND_SET.has(kind) &&
      typeof title === 'string' &&
      typeof slug === 'string'
    ) {
      found.push({
        id,
        kind: kind as EntityKind,
        title,
        titleEn: typeof titleEn === 'string' ? titleEn : undefined,
        slug,
        path,
        node: value,
      });
    }
  }

  for (const [key, child] of Object.entries(value)) {
    if (child && typeof child === 'object') visit(child, `${path}.${key}`, found, problems);
  }
}

function checkSameRowStacks(value: unknown, problems: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) checkSameRowStacks(item, problems);
    return;
  }
  if (!isRecord(value)) return;
  if (value.kind === 'shelf-row' && Array.isArray(value.books)) {
    const seen: string[] = [];
    for (const book of value.books) {
      if (!isRecord(book)) continue;
      if (typeof book.stackOn === 'string' && !seen.includes(book.stackOn)) {
        const label = typeof book.slug === 'string' ? book.slug : String(book.id);
        problems.push(`${label}: stackOn must point to an earlier book in the same row`);
      }
      if (typeof book.id === 'string') seen.push(book.id);
    }
  }
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') checkSameRowStacks(child, problems);
  }
}

/** Validate authored ids, kinds, titles, and slugs. Returns a lookup index. */
export function validateRoom(data: unknown): SceneCatalog {
  const problems: string[] = [];
  if (!isRecord(data)) throw new RoomDataError(['invalid room file']);

  if (data.kind !== 'room') problems.push('the file root must be kind room');
  if (!isRecord(data.camera)) problems.push('the room needs a camera');
  if (!Array.isArray(data.objects)) problems.push('the room needs objects');
  if (!Array.isArray(data.hotspots)) problems.push('the room needs hotspots');
  if (!isRecord(data.hud) || typeof data.hud.hintTarget !== 'string') problems.push('hud.hintTarget must point to a hotspot id');

  const found: Found[] = [];
  visit(data, 'room', found, problems);
  checkSameRowStacks(data, problems);

  const seenId = new Map<string, string>();
  const seenSlug = new Map<string, string>();
  for (const entry of found) {
    const prevId = seenId.get(entry.id);
    if (prevId) problems.push(`duplicate id ${entry.id} (${prevId} and ${entry.slug})`);
    else seenId.set(entry.id, entry.slug);

    const prevSlug = seenSlug.get(entry.slug);
    if (prevSlug) problems.push(`duplicate slug ${entry.slug}`);
    else seenSlug.set(entry.slug, entry.id);
  }

  const refs: { from: string; field: string; id: string }[] = [];
  for (const entry of found) {
    if (typeof entry.node.targetId === 'string') {
      refs.push({ from: entry.slug, field: 'targetId', id: entry.node.targetId });
    }
    if (typeof entry.node.stackOn === 'string') {
      refs.push({ from: entry.slug, field: 'stackOn', id: entry.node.stackOn });
    }
    if (entry.kind === 'calendar' && typeof entry.node.theme === 'string') {
      refs.push({ from: entry.slug, field: 'theme', id: entry.node.theme });
    }
  }
  if (isRecord(data.hud) && typeof data.hud.hintTarget === 'string') {
    refs.push({ from: 'hud', field: 'hintTarget', id: data.hud.hintTarget });
  }

  for (const ref of refs) {
    const target = seenId.get(ref.id);
    if (!target) problems.push(`${ref.from}: ${ref.field} points to a missing id (${ref.id})`);
  }

  const calendars = found.filter((entry) => entry.kind === 'calendar');
  if (calendars.length !== 1) problems.push('the room must have exactly one calendar');
  const hint = typeof data.hud === 'object' && data.hud && typeof (data.hud as { hintTarget?: string }).hintTarget === 'string'
    ? found.find((entry) => entry.id === (data.hud as { hintTarget: string }).hintTarget)
    : undefined;
  if (hint && hint.kind !== 'hotspot') problems.push('hintTarget must be a hotspot');

  if (problems.length) throw new RoomDataError(problems);
  return new SceneCatalog(found);
}

/** Identity check for a data file that is not the 3D room. */
export function validateEntities(data: unknown, rootKind: string): SceneCatalog {
  const problems: string[] = [];
  if (!isRecord(data)) throw new RoomDataError(['invalid data file']);
  if (data.kind !== rootKind) problems.push(`the file root must be kind ${rootKind}`);

  const found: Found[] = [];
  visit(data, rootKind, found, problems);

  const seenId = new Map<string, string>();
  const seenSlug = new Map<string, string>();
  for (const entry of found) {
    const prevId = seenId.get(entry.id);
    if (prevId) problems.push(`duplicate id ${entry.id} (${prevId} and ${entry.slug})`);
    else seenId.set(entry.id, entry.slug);
    const prevSlug = seenSlug.get(entry.slug);
    if (prevSlug) problems.push(`duplicate slug ${entry.slug}`);
    else seenSlug.set(entry.slug, entry.id);
  }

  for (const entry of found) {
    if (typeof entry.node.targetId === 'string' && !seenId.has(entry.node.targetId)) {
      problems.push(`${entry.slug}: targetId points to a missing id (${entry.node.targetId})`);
    }
  }

  if (problems.length) throw new RoomDataError(problems);
  return new SceneCatalog(found);
}
