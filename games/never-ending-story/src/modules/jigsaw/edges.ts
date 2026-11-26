/** Procedural tab/blank edges and the SVG path for one piece. */
import type { Rng } from './rng.ts';

export type EdgeKind = 'flat' | 'tab' | 'blank';

export type PieceEdges = {
  top: EdgeKind;
  right: EdgeKind;
  bottom: EdgeKind;
  left: EdgeKind;
};

const OPPOSITE: Record<EdgeKind, EdgeKind> = { flat: 'flat', tab: 'blank', blank: 'tab' };

function coin(rng: Rng): EdgeKind {
  return rng() < 0.5 ? 'tab' : 'blank';
}

/** Build a cols×rows grid of matching edges. The same seed always yields the same cut. */
export function generateEdges(cols: number, rows: number, rng: Rng): PieceEdges[] {
  const edges: PieceEdges[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const left = col === 0 ? 'flat' : OPPOSITE[edges[row * cols + col - 1].right];
      const top = row === 0 ? 'flat' : OPPOSITE[edges[(row - 1) * cols + col].bottom];
      const right = col === cols - 1 ? 'flat' : coin(rng);
      const bottom = row === rows - 1 ? 'flat' : coin(rng);
      edges.push({ top, right, bottom, left });
    }
  }
  return edges;
}

export function pieceIndex(col: number, row: number, cols: number): number {
  return row * cols + col;
}

/** Tab depth as a fraction of the shorter cell side. */
export const TAB_RATIO = 0.22;

export function tabDepth(cellW: number, cellH: number, ratio: number = TAB_RATIO): number {
  return Math.max(4, Math.min(cellW, cellH) * ratio);
}

function edgeCommands(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  nx: number,
  ny: number,
  kind: EdgeKind,
  tab: number,
): string {
  if (kind === 'flat') return `L ${x1} ${y1}`;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const p = (t: number, n: number): [number, number] => [x0 + dx * t + nx * n, y0 + dy * t + ny * n];
  const sign = kind === 'tab' ? 1 : -1;
  const depth = tab * sign;
  const neck = tab * 0.35 * sign;
  const [ax, ay] = p(0.34, 0);
  const [cx1, cy1] = p(0.36, neck);
  const [cx2, cy2] = p(0.38, depth);
  const [mx, my] = p(0.5, depth);
  const [cx3, cy3] = p(0.62, depth);
  const [cx4, cy4] = p(0.64, neck);
  const [bx, by] = p(0.66, 0);
  const fmt = (x: number, y: number) => `${round(x)} ${round(y)}`;
  return [
    `L ${fmt(ax, ay)}`,
    `C ${fmt(cx1, cy1)}, ${fmt(cx2, cy2)}, ${fmt(mx, my)}`,
    `C ${fmt(cx3, cy3)}, ${fmt(cx4, cy4)}, ${fmt(bx, by)}`,
    `L ${fmt(x1, y1)}`,
  ].join(' ');
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** SVG path in cell coordinates: the rectangle is (0,0)–(cellW,cellH), tabs reach ±tab outside it. */
export function piecePath(edges: PieceEdges, cellW: number, cellH: number, tab: number = tabDepth(cellW, cellH)): string {
  const top = edgeCommands(0, 0, cellW, 0, 0, -1, edges.top, tab);
  const right = edgeCommands(cellW, 0, cellW, cellH, 1, 0, edges.right, tab);
  const bottom = edgeCommands(cellW, cellH, 0, cellH, 0, 1, edges.bottom, tab);
  const left = edgeCommands(0, cellH, 0, 0, -1, 0, edges.left, tab);
  return `M 0 0 ${top} ${right} ${bottom} ${left} Z`;
}

export function pathHasTabs(d: string): boolean {
  return /[Cc]/.test(d);
}
