/** Local author-portrait catalog (free-licensed stills) plus a faceless silhouette fallback. */
import { imageUrl } from '../../lib/imageUrl.ts';
import catalog from './portraits/catalog.json' with { type: 'json' };

export type PortraitEntry = {
  author: string;
  aliases: string[];
  qid: string;
  file: string;
  sourceFile: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
  artist: string;
  attributionRequired: boolean;
};

const ENTRIES = catalog as PortraitEntry[];

const norm = (s: string): string => s.trim().toLowerCase().replace(/[.]/g, '').replace(/\s+/g, ' ');

const byName = new Map<string, PortraitEntry>();
for (const e of ENTRIES) {
  byName.set(norm(e.author), e);
  for (const a of e.aliases) byName.set(norm(a), e);
}

export const portraitCatalog: readonly PortraitEntry[] = ENTRIES;

export function findPortrait(author: string): PortraitEntry | null {
  return byName.get(norm(author)) ?? null;
}

/**
 * Public URL for a catalog still, valid under a non-root app base such as /never/.
 * Accepts catalog paths of the form `/img/typing/portraits/x.webp` or `typing/portraits/x.webp`.
 */
export function portraitSrc(file: string): string {
  const rel = file.replace(/^\/+/, '').replace(/^img\//, '');
  return imageUrl(rel);
}

/** Initials for the silhouette fallback (up to 3). */
export function initialsOf(author: string): string {
  const words = author.split(/\s+/).filter((w) => w && w !== '&' && !/^(and|or|of|the|de|van|von)$/i.test(w));
  if (words.length === 0) return '?';
  return words.slice(0, 3).map((w) => w[0]!.toUpperCase()).join('');
}

export type SilhouetteStyle = { hair: string; shirt: string; skin: string; hairStyle: 0 | 1 | 2 | 3 };

const HAIR_COLORS = ['#1c1612', '#3a2415', '#6a3b1a', '#c4a15a', '#4a4a4a', '#d8c7a2'];
const SHIRTS = ['#2c4a6e', '#6b2d3c', '#2d5a45', '#5a3d7a', '#8a4b1f', '#1f4f6b'];
const SKIN = ['#e2b896', '#c48a62', '#8d5a3b', '#f0c9a0'];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function silhouetteStyle(author: string): SilhouetteStyle {
  const h = hash(norm(author) || 'anon');
  return {
    hair: HAIR_COLORS[h % HAIR_COLORS.length],
    shirt: SHIRTS[(h >>> 8) % SHIRTS.length],
    skin: SKIN[(h >>> 16) % SKIN.length],
    hairStyle: ((h >>> 24) % 4) as 0 | 1 | 2 | 3,
  };
}
