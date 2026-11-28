import type { ComicLine } from '../modules/event-core';
import { artworkFile } from '../modules/cutscene';

export type ProloguePage = { image: string; caption: string; lines: ComicLine[] };

/** Text values are i18n keys (src/locales/*.json). Pictures come from the cutscene module. */
export const PROLOGUE_PAGES: ProloguePage[] = [
  { image: artworkFile('prologue.player-room'), caption: 'prologue.p1.caption', lines: [{ id: 'p1a', who: 'character.player.name', text: 'prologue.p1.me', x: 6, y: 18, w: 60 }] },
  { image: artworkFile('prologue.house-map'), caption: 'prologue.p2.caption', lines: [] },
  { image: artworkFile('prologue.grandma'), caption: 'prologue.p3.caption', lines: [{ id: 'p3a', who: 'character.grandma.name', text: 'prologue.p3.grandma', x: 6, y: 14, w: 62 }] },
  { image: artworkFile('prologue.yesterday'), caption: 'prologue.p4.caption', lines: [{ id: 'p4a', who: 'character.player.name', text: 'prologue.p4.me', x: 30, y: 16, w: 62 }] },
  { image: artworkFile('prologue.living-now'), caption: 'prologue.p5.caption', lines: [] },
];

export { NICK_MIN, NICK_MAX, nicknameError } from './nickname';
