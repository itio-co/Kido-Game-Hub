/** Split a Typist drill into typable quote-card text: wrapped quote + author line. Every character shown on the card is in `text`. */
import { normalizeForTyping } from './sources/typParser.ts';
import type { Drill } from './sources/types.ts';

const AUTHOR_PREFIX = '- ';

/** Trailing dash attribution already in the drill text (`-- Name` or `- Name`). */
const TRAILING_AUTHOR = /(?:\s+[-–—]{1,2}\s+|\s+--\s+)([^\n]+)$/;

export type QuoteCard = {
  /** Typable string shown on the card, ASCII-normalized. */
  text: string;
  /** The quote body, already wrapped in ASCII double quotes. */
  quote: string;
  /** Author display/typed line, starting with `- `. */
  authorLine: string;
  author: string;
  /** Optional work or source left in the instruction, not shown on the card. */
  work: string;
  /** Index in `text` where the author line begins (`- Name`). */
  authorFrom: number;
};

const PARTICLES = new Set(['and', 'or', 'of', 'the', 'de', 'van', 'von', 'da', 'del', 'jr', 'jr.', 'sr', 'sr.', 'ii', 'iii']);

/** A short, mostly-capitalized phrase that can stand as a personal name. */
export function looksLikePersonName(raw: string): boolean {
  const s = normalizeForTyping(raw);
  if (!s || s.length > 80) return false;
  if (/[?!]/.test(s) || /\.$/.test(s.replace(/[.]{1,3}$/, ''))) return false;
  const words = s.split(' ').filter(Boolean);
  if (words.length < 1 || words.length > 7) return false;
  let caps = 0;
  for (const w of words) {
    const bare = w.replace(/^[("'[]+|[)"'\],]+$/g, '');
    if (!bare) continue;
    if (PARTICLES.has(bare.toLowerCase()) || bare === '&') continue;
    if (/^[A-Z](?:[A-Za-z'.-]*|\.?)$/.test(bare) || /^[A-Z](?:\.[A-Z])+\.?$/.test(bare)) {
      caps += 1;
      continue;
    }
    return false;
  }
  return caps >= 1;
}

/** Strip a leading `[12]` index from a typist instruction. */
export function stripIndex(instruction: string): string {
  return normalizeForTyping(instruction).replace(/^\[\d+\]\s*/, '');
}

/**
 * Take the author name from an instruction such as `[14] Donald E. Knuth, "Selected Papers..."`.
 * The first comma-separated segment is the name when it looks like one; the rest is `work`.
 */
export function authorFromInstruction(instruction: string): { author: string; work: string } | null {
  const rest = stripIndex(instruction);
  if (!rest) return null;
  const comma = rest.match(/^([^,]+),\s*(.*)$/);
  const name = (comma ? comma[1] : rest).trim();
  const work = comma ? comma[2].replace(/^"|"$/g, '').trim() : '';
  return looksLikePersonName(name) ? { author: name, work } : null;
}

export function splitTrailingAuthor(text: string): { quote: string; author: string } {
  const t = normalizeForTyping(text);
  const m = TRAILING_AUTHOR.exec(t);
  if (!m) return { quote: t, author: '' };
  const author = normalizeForTyping(m[1]);
  if (!looksLikePersonName(author)) return { quote: t, author: '' };
  return { quote: normalizeForTyping(t.slice(0, m.index)), author };
}

/** Wrap `quote` in ASCII `"` unless it already has a matching pair. */
export function wrapQuote(quote: string): string {
  const t = normalizeForTyping(quote);
  if (t.startsWith('"') && t.endsWith('"') && t.length >= 2) return t;
  return `"${t}"`;
}

export function buildQuoteCard(input: { text: string; instruction?: string }): QuoteCard | null {
  const split = splitTrailingAuthor(input.text);
  const fromInstr = authorFromInstruction(input.instruction ?? '');
  const author = split.author || fromInstr?.author || '';
  if (!author) return null;
  const quote = wrapQuote(split.quote);
  const authorLine = `${AUTHOR_PREFIX}${author}`;
  const text = `${quote} ${authorLine}`;
  return { text, quote, authorLine, author, work: split.author ? '' : fromInstr?.work ?? '', authorFrom: quote.length + 1 };
}

export function cardForDrill(drill: Pick<Drill, 'text' | 'instruction'>): QuoteCard | null {
  return buildQuoteCard({ text: drill.text, instruction: drill.instruction });
}
