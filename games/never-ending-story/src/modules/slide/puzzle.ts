/** Sliding-block puzzle rules (event + practice board). */
export type SlideBlock = { r: number; c: number; len: number; v: 0 | 1; col: string; key?: boolean; label: string };
export type SlideState = Record<'A' | 'B' | 'K', SlideBlock>;

export function freshSlide(): SlideState {
  return {
    A: { r: 0, c: 2, len: 2, v: 1, col: '#e0574f', label: 'A' },
    B: { r: 2, c: 0, len: 2, v: 0, col: '#4f8fe0', label: 'B' },
    K: { r: 1, c: 0, len: 2, v: 0, col: '#f2b632', key: true, label: '🗝 K' },
  };
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

export function cloneSlide(state: SlideState): SlideState {
  return {
    A: { ...state.A },
    B: { ...state.B },
    K: { ...state.K },
  };
}
