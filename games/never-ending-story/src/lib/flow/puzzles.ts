import type { PuzzleKey } from './types';
import { CROSS_KEYS, type CrossState } from '../../modules/crossword';
import type { JigState } from '../../modules/jigsaw';
import type { SlideState } from '../../modules/slide';

// Puzzle rules live in their minigame modules; re-exported here for existing callers.
export * from '../../modules/crossword';
export * from '../../modules/jigsaw';
export * from '../../modules/slide';

export function practiceSetup(game: PuzzleKey, level: number, cross: CrossState, jig: JigState, slide: SlideState): void {
  if (game === 'cross') {
    const given: [string, string][] = [
      ['0,0', 'ด'],
      ['0,1', 'า'],
      ['0,2', 'ว'],
      ['1,2', 'า'],
    ];
    cross.fill = Object.fromEntries(given.slice(0, Math.max(0, 5 - level)));
    cross.sel = '2,2';
  }
  if (game === 'jig') {
    const order = [0, 5, 10, 3, 6, 9, 1, 8, 11, 2, 4, 7];
    jig.placed = order.slice(0, Math.max(0, 8 - level));
    jig.sel = null;
  }
  if (game === 'slide') {
    slide.K.r = 1;
    slide.K.c = 0;
    slide.A.r = 0;
    slide.A.c = 2;
    slide.B.r = 2;
    slide.B.c = level % 2 ? 0 : 1;
  }
}

export function starCount(hints: number): number {
  if (hints <= 0) return 3;
  if (hints === 1) return 2;
  return 1;
}

export function starText(hints: number): string {
  const count = starCount(hints);
  return '⭐'.repeat(count) + '☆'.repeat(3 - count);
}

export const LEVEL_COUNT = 14;

export const LEVEL_THEME: Record<PuzzleKey, { name: string; bg: string; path: string; icon: string }> = {
  cross: {
    name: 'ครอสเวิร์ด',
    bg: 'repeating-linear-gradient(0deg,#f7f3e6 0 27px,#b9d3e8 27px 28px)',
    path: '#2b4a6b',
    icon: '📰',
  },
  jig: {
    name: 'จิ๊กซอว์',
    bg: 'radial-gradient(circle at 30% 20%,#f3e7c9,#d9c39a)',
    path: '#7a5a2e',
    icon: '🗺',
  },
  slide: {
    name: 'เลื่อนบล็อก',
    bg: 'repeating-linear-gradient(90deg,#a8743f 0 46px,#9a6836 46px 92px)',
    path: '#3b2412',
    icon: '🧩',
  },
};

export const FAKE_TIME: Record<string, { elapsed: string; best: string }> = {
  crossword: { elapsed: '01:12', best: '00:58' },
  jigsaw: { elapsed: '00:42', best: '00:35' },
  slide: { elapsed: '01:05', best: '—' },
};
