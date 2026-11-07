import { t, type MessageKey } from '../i18n/core.ts';
import type { PuzzleKey } from './types';

export type CrossState = { fill: Record<string, string>; sel: string };
export type JigState = { placed: number[]; sel: number | null };
export type SlideBlock = { r: number; c: number; len: number; v: 0 | 1; col: string; key?: boolean; label: string };
export type SlideState = Record<'A' | 'B' | 'K', SlideBlock>;

/**
 * The crossword is language-specific, so its grid and letter keys live in the
 * locale files ('game.crossword.grid', rows split by '|', '#' = blocked cell;
 * 'game.crossword.keys', letters split by spaces). Every locale uses the same
 * shape: 1 across (row 0), 2 down (column 2), 3 across (row 2, to be solved).
 */
export const CROSS_NUM: Record<string, number> = { '0,0': 1, '0,2': 2, '2,2': 3 };
/** Cells shown pre-filled (1 across and the middle of 2 down). */
const CROSS_GIVEN = ['0,0', '0,1', '0,2', '1,2'];
/** Cells the player fills (3 across). */
const CROSS_BLANK = ['2,2', '2,3', '2,4'];

export function crossGrid(): string[] {
  return t('game.crossword.grid').split('|');
}

export function crossKeys(): string[] {
  return t('game.crossword.keys').split(' ');
}

function crossLetter(cell: string): string {
  const [row, col] = cell.split(',').map(Number);
  return Array.from(crossGrid()[row] ?? '')[col] ?? '';
}

export function crossSolution(): Record<string, string> {
  return Object.fromEntries(CROSS_BLANK.map((cell) => [cell, crossLetter(cell)]));
}

export function freshCross(): CrossState {
  return { fill: Object.fromEntries(CROSS_GIVEN.map((cell) => [cell, crossLetter(cell)])), sel: '2,3' };
}

export function freshJig(): JigState {
  return { placed: [0, 1, 2, 3, 5, 6, 9], sel: null };
}

export function freshSlide(): SlideState {
  return {
    A: { r: 0, c: 2, len: 2, v: 1, col: '#e0574f', label: 'A' },
    B: { r: 2, c: 0, len: 2, v: 0, col: '#4f8fe0', label: 'B' },
    K: { r: 1, c: 0, len: 2, v: 0, col: '#f2b632', key: true, label: '🗝 K' },
  };
}

export function crossCorrect(fill: Record<string, string>): boolean {
  return Object.entries(crossSolution()).every(([key, letter]) => fill[key] === letter);
}

export function jigPosition(index: number): string {
  return `${(index % 3) * 50}% ${Math.floor(index / 3) * 33.333}%`;
}

function occupied(state: SlideState, except: string): Record<string, boolean> {
  const cells: Record<string, boolean> = {};
  for (const [name, block] of Object.entries(state)) {
    if (name === except) continue;
    for (let i = 0; i < block.len; i++) {
      const row = block.r + (block.v ? i : 0);
      const col = block.c + (block.v ? 0 : i);
      cells[`${row},${col}`] = true;
    }
  }
  return cells;
}

/** One tap of a sliding block. Mutates `state` the same way the prototype does. */
export function stepBlock(state: SlideState, name: 'A' | 'B' | 'K'): 0 | 1 | 'win' {
  const block = state[name];
  const cells = occupied(state, name);
  const forward: [number, number] = block.v ? [block.r + block.len, block.c] : [block.r, block.c + block.len];
  const back: [number, number] = block.v ? [block.r - 1, block.c] : [block.r, block.c - 1];
  const open = ([row, col]: [number, number]) => row >= 0 && col >= 0 && row < 4 && col < 4 && !cells[`${row},${col}`];
  if (name === 'K' && block.c === 2) return 'win';
  if (name === 'A') {
    if (open(forward)) {
      block.r += 1;
      return 1;
    }
    if (open(back)) {
      block.r -= 1;
      return 1;
    }
  } else if (name === 'B') {
    if (open(back)) {
      block.c -= 1;
      return 1;
    }
    if (open(forward)) {
      block.c += 1;
      return 1;
    }
  } else if (open(forward)) {
    block.c += 1;
    return block.c === 2 ? 'win' : 1;
  }
  return 0;
}

export function cloneCross(state: CrossState): CrossState {
  return { fill: { ...state.fill }, sel: state.sel };
}

export function cloneJig(state: JigState): JigState {
  return { placed: [...state.placed], sel: state.sel };
}

export function cloneSlide(state: SlideState): SlideState {
  return {
    A: { ...state.A },
    B: { ...state.B },
    K: { ...state.K },
  };
}

export function practiceSetup(game: PuzzleKey, level: number, cross: CrossState, jig: JigState, slide: SlideState): void {
  if (game === 'cross') {
    const given: [string, string][] = CROSS_GIVEN.map((cell) => [cell, crossLetter(cell)]);
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

export const LEVEL_THEME: Record<PuzzleKey, { nameKey: MessageKey; bg: string; path: string; icon: string }> = {
  cross: {
    nameKey: 'game.puzzle.crossword',
    bg: 'repeating-linear-gradient(0deg,#f7f3e6 0 27px,#b9d3e8 27px 28px)',
    path: '#2b4a6b',
    icon: '📰',
  },
  jig: {
    nameKey: 'game.puzzle.jigsaw',
    bg: 'radial-gradient(circle at 30% 20%,#f3e7c9,#d9c39a)',
    path: '#7a5a2e',
    icon: '🗺',
  },
  slide: {
    nameKey: 'game.puzzle.slide',
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
