/** Jigsaw puzzle rules (event + practice board). */
export type JigState = { placed: number[]; sel: number | null };

export function freshJig(): JigState {
  return { placed: [0, 1, 2, 3, 5, 6, 9], sel: null };
}

export function jigPosition(index: number): string {
  return `${(index % 3) * 50}% ${Math.floor(index / 3) * 33.333}%`;
}

export function cloneJig(state: JigState): JigState {
  return { placed: [...state.placed], sel: state.sel };
}
