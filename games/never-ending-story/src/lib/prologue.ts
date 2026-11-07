import type { ComicLine } from '../modules/event-core';

export type ProloguePage = { image: string; caption: string; lines: ComicLine[] };

/** Text values are i18n keys (src/locales/*.json). */
export const PROLOGUE_PAGES: ProloguePage[] = [
  { image: 'player-room-wide.jpg', caption: 'prologue.p1.caption', lines: [{ id: 'p1a', who: 'prologue.who.me', text: 'prologue.p1.me', x: 6, y: 18, w: 60 }] },
  { image: 'house-map.jpg', caption: 'prologue.p2.caption', lines: [] },
  { image: 'living-grandma.jpg', caption: 'prologue.p3.caption', lines: [{ id: 'p3a', who: 'prologue.who.grandma', text: 'prologue.p3.grandma', x: 6, y: 14, w: 62 }] },
  { image: 'living-wide-yesterday.jpg', caption: 'prologue.p4.caption', lines: [{ id: 'p4a', who: 'prologue.who.me', text: 'prologue.p4.me', x: 30, y: 16, w: 62 }] },
  { image: 'living-wide.jpg', caption: 'prologue.p5.caption', lines: [] },
];

export const NICK_MIN = 2;
export const NICK_MAX = 16;
const NICK_RE = /^[\p{Script=Thai}A-Za-z0-9 _.-]+$/u;

/** Returns an i18n error key, or null when the nickname is valid. */
export function nicknameError(raw: string): string | null {
  const value = raw.trim().replace(/\s+/g, ' ');
  if ([...value].length < NICK_MIN) return 'prologue.name.errShort';
  if ([...value].length > NICK_MAX) return 'prologue.name.errLong';
  if (!NICK_RE.test(value)) return 'prologue.name.errChars';
  return null;
}

export function suggestNickname(base: string): string {
  return `${base}${100 + Math.floor(Math.random() * 900)}`;
}
