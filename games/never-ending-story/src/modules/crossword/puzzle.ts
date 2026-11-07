/** Crossword puzzle rules (event + practice board). */
export type CrossState = { fill: Record<string, string>; sel: string };

export const CROSS_SOLUTION: Record<string, string> = { '2,2': 'ง', '2,3': 'า', '2,4': 'ม' };
export const CROSS_GRID = ['ดาว##', '##า##', '##งาม'];
export const CROSS_NUM: Record<string, number> = { '0,0': 1, '0,2': 2, '2,2': 3 };
export const CROSS_KEYS = ['ง', 'า', 'ม', 'า', 'ว', 'ด', 'ส', 'ล'];

export function freshCross(): CrossState {
  return { fill: { '0,0': 'ด', '0,1': 'า', '0,2': 'ว', '1,2': 'า' }, sel: '2,3' };
}

export function crossCorrect(fill: Record<string, string>): boolean {
  return Object.entries(CROSS_SOLUTION).every(([key, letter]) => fill[key] === letter);
}

export function cloneCross(state: CrossState): CrossState {
  return { fill: { ...state.fill }, sel: state.sel };
}
