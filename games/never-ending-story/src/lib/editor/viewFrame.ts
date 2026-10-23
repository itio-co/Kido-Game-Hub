/**
 * 2D view-window framing for the mock-up / camera-match stage: project model points through the solved camera
 * and compute the zoom + centre that frames a box. Pure (no Svelte / three), unit-tested in tests/viewFrame.test.ts.
 *
 * Window model (same as MatchState): screen px per ref px k = fitScale · zoom; the stage shows ref px
 * [center − stage/2k, center + stage/2k]. A strip of `padBottom` screen px under the image is kept for the tool
 * row, so framing centres the box in the usable area above it.
 */
import { project, type Cam, type V2, type V3 } from './camMath.ts';

export type Box2 = { x0: number; y0: number; x1: number; y1: number };
export type StageSize = { w: number; h: number; padBottom: number };
export type FrameOptions = {
  /** Padding around the box per side, as a fraction of the box size (0.15 = 15 %). */
  pad?: number;
  minZoom?: number;
  maxZoom?: number;
};
export const FOCUS_PAD = 0.15;
export const FOCUS_MIN_ZOOM = 0.5;
export const FOCUS_MAX_ZOOM = 12;

/** 2D bounding box (ref px) of world points (Blender cm) projected through `cam`; points behind it are skipped. */
export function projectedBox(cam: Cam, points: readonly V3[]): Box2 | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const X of points) {
    const p = project(cam, X);
    if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
    if (p[0] < x0) x0 = p[0];
    if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1];
    if (p[1] > y1) y1 = p[1];
  }
  return x1 >= x0 && y1 >= y0 ? { x0, y0, x1, y1 } : null;
}

/** Height of the stage area the image may use (above the tool strip), as MatchState.fit uses it. */
export function usableHeight(stage: StageSize): number {
  return Math.max(stage.h * 0.5, stage.h - stage.padBottom);
}

/** Zoom + centre that frame `box` (ref px) in the usable stage area with `pad` padding, zoom clamped. */
export function frameWindow(box: Box2, stage: StageSize, fitScale: number, opts: FrameOptions = {}): { zoom: number; center: V2 } {
  const pad = opts.pad ?? FOCUS_PAD;
  const minZoom = opts.minZoom ?? FOCUS_MIN_ZOOM;
  const maxZoom = opts.maxZoom ?? FOCUS_MAX_ZOOM;
  const hu = usableHeight(stage);
  const bw = Math.max(1e-6, box.x1 - box.x0) * (1 + 2 * pad);
  const bh = Math.max(1e-6, box.y1 - box.y0) * (1 + 2 * pad);
  const k = Math.min(stage.w / bw, hu / bh);
  const zoom = Math.min(maxZoom, Math.max(minZoom, k / fitScale));
  const kk = fitScale * zoom;
  // the box centre goes to the centre of the usable area (screen y = hu/2), not of the whole stage
  const center: V2 = [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2 + (stage.h - hu) / 2 / kk];
  return { zoom, center };
}

/** Screen box (stage px) of a ref-px box for a given window. */
export function boxOnStage(box: Box2, stage: StageSize, fitScale: number, zoom: number, center: V2): Box2 {
  const k = fitScale * zoom;
  const ox = center[0] - stage.w / 2 / k;
  const oy = center[1] - stage.h / 2 / k;
  return { x0: (box.x0 - ox) * k, y0: (box.y0 - oy) * k, x1: (box.x1 - ox) * k, y1: (box.y1 - oy) * k };
}
