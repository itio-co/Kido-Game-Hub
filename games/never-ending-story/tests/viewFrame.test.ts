// Plain test for 2D view framing (Focus / Object crop) of the mock-up stage: `npm test` in game/.
import type { Cam, M3, V3 } from '../src/lib/editor/camMath.ts';
import { project } from '../src/lib/editor/camMath.ts';
import { boxOnStage, frameWindow, recoveryWindow, projectedBox, usableHeight, FOCUS_MAX_ZOOM, FOCUS_MIN_ZOOM } from '../src/lib/editor/viewFrame.ts';

declare const process: { exitCode?: number };
let failed = 0;
let passed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n     ${(e as Error).message}`);
  }
}
function ok(c: boolean, msg: string): void {
  if (!c) throw new Error(msg);
}
const near = (a: number, b: number, t = 1e-6): boolean => Math.abs(a - b) <= t;

// camera at C looking along +Y (Blender world), image y down: rows of R = camera axes in world coords
const R: M3 = [
  [1, 0, 0],
  [0, 0, -1],
  [0, 1, 0],
];
const cam: Cam = { f: 1000, cx: 400, cy: 300, R, C: [0, -200, 50] };
const cube = (c: V3, s: number): V3[] => {
  const out: V3[] = [];
  for (const dx of [-s, s]) for (const dy of [-s, s]) for (const dz of [-s, s]) out.push([c[0] + dx, c[1] + dy, c[2] + dz]);
  return out;
};

test('projectedBox = min/max of the projected points (points behind the camera skipped)', () => {
  const pts = cube([10, 0, 50], 5);
  const b = projectedBox(cam, [...pts, [0, -400, 50]])!;
  const pr = pts.map((p) => project(cam, p)!);
  ok(near(b.x0, Math.min(...pr.map((p) => p[0]))) && near(b.x1, Math.max(...pr.map((p) => p[0]))), `x range ${b.x0}..${b.x1}`);
  ok(near(b.y0, Math.min(...pr.map((p) => p[1]))) && near(b.y1, Math.max(...pr.map((p) => p[1]))), `y range ${b.y0}..${b.y1}`);
  ok(b.x0 > 400 && b.x1 > b.x0, 'object right of centre projects right of cx');
  ok(projectedBox(cam, [[0, -400, 50]]) === null, 'only points behind → null');
});

const stage = { w: 800, h: 700, padBottom: 100 };
const fitScale = 0.5;

test('frameWindow: box fills the usable stage with 15 % padding on the limiting side, centred above the tool strip', () => {
  const box = { x0: 100, y0: 200, x1: 300, y1: 260 }; // wide box → width limits
  const { zoom, center } = frameWindow(box, stage, fitScale);
  const s = boxOnStage(box, stage, fitScale, zoom, center);
  const w = s.x1 - s.x0;
  ok(near(w * 1.3, stage.w, 1e-6), `width + 2·15 % = stage width (${w})`);
  ok(near(s.x0, stage.w * 0.15 / 1.3, 1e-6), `left padding 15 % of the box (${s.x0})`);
  const hu = usableHeight(stage);
  ok(near((s.y0 + s.y1) / 2, hu / 2, 1e-6), `centred in the usable height (${(s.y0 + s.y1) / 2} vs ${hu / 2})`);
  ok(s.y1 <= hu, 'box stays above the tool strip');
});

test('frameWindow: tall box → height limits', () => {
  const box = { x0: 100, y0: 0, x1: 120, y1: 400 };
  const { zoom, center } = frameWindow(box, stage, fitScale);
  const s = boxOnStage(box, stage, fitScale, zoom, center);
  ok(near((s.y1 - s.y0) * 1.3, usableHeight(stage), 1e-6), `height + padding = usable height (${s.y1 - s.y0})`);
  ok(near((s.x0 + s.x1) / 2, stage.w / 2, 1e-6), 'horizontally centred');
});

test('frameWindow: zoom clamped to [min, max]', () => {
  const tiny = frameWindow({ x0: 10, y0: 10, x1: 10.01, y1: 10.01 }, stage, fitScale);
  ok(tiny.zoom === FOCUS_MAX_ZOOM, `tiny box → max zoom (${tiny.zoom})`);
  const huge = frameWindow({ x0: -1e5, y0: -1e5, x1: 1e5, y1: 1e5 }, stage, fitScale);
  ok(huge.zoom === FOCUS_MIN_ZOOM, `huge box → min zoom (${huge.zoom})`);
  ok(near(huge.center[0], 0, 1e-6), 'still centred on the box');
});

test('frameWindow with pad 0 = exact crop rect (Object crop preset)', () => {
  const crop = { x0: 0, y0: 0, x1: 1024, y1: 1024 };
  const { zoom, center } = frameWindow(crop, stage, fitScale, { pad: 0 });
  const s = boxOnStage(crop, stage, fitScale, zoom, center);
  ok(near(s.y1 - s.y0, usableHeight(stage), 1e-6) || near(s.x1 - s.x0, stage.w, 1e-6), 'crop rect touches the usable area on its limiting side');
  ok(s.x0 >= -1e-6 && s.x1 <= stage.w + 1e-6 && s.y0 >= -1e-6 && s.y1 <= usableHeight(stage) + 1e-6, 'crop rect fully visible');
});

test('framing a projected part through the camera puts its projection in the padded window', () => {
  const pts = cube([-20, 30, 40], 8);
  const box = projectedBox(cam, pts)!;
  const { zoom, center } = frameWindow(box, stage, fitScale);
  const k = fitScale * zoom;
  const ox = center[0] - stage.w / 2 / k;
  const oy = center[1] - stage.h / 2 / k;
  for (const p of pts) {
    const [u, v] = project(cam, p)!;
    const sx = (u - ox) * k;
    const sy = (v - oy) * k;
    ok(sx >= 0 && sx <= stage.w && sy >= 0 && sy <= usableHeight(stage), `vertex on screen (${sx.toFixed(1)}, ${sy.toFixed(1)})`);
  }
});

test('recovery frames an off-screen model on phone and desktop without changing camera or vertices', () => {
  const pts = cube([4000, 30, 1200], 20);
  const original = JSON.stringify({ cam, pts });
  for (const [w, h] of [[390, 844], [320, 568], [844, 390], [1440, 900]]) {
    const size = { w: w!, h: h!, padBottom: 110 };
    const result = recoveryWindow(cam, pts, size, 0.35)!;
    ok(!!result, 'recovery available');
    const screen = boxOnStage(result.box, size, 0.35, result.zoom, result.center);
    ok(near((screen.x0 + screen.x1) / 2, w! / 2), 'model horizontally centred');
    ok(screen.x0 >= 0 && screen.x1 <= w! && screen.y0 >= 0 && screen.y1 <= usableHeight(size), 'entire model visible');
  }
  ok(JSON.stringify({ cam, pts }) === original, 'camera and geometry unchanged');
});

test('recovery may zoom below 50% to fit a huge projection, repeated recovery is stable', () => {
  const pts = cube([1000, -180, 500], 19);
  const first = recoveryWindow(cam, pts, stage, fitScale)!;
  ok(first.zoom > 0 && first.zoom < 0.5, 'fits without the focus minimum');
  const screen = boxOnStage(first.box, stage, fitScale, first.zoom, first.center);
  ok(screen.x0 >= 0 && screen.x1 <= stage.w && screen.y0 >= 0 && screen.y1 <= usableHeight(stage), 'huge projection contained');
  ok(JSON.stringify(first) === JSON.stringify(recoveryWindow(cam, pts, stage, fitScale)), 'repeated recovery stable');
});

test('recovery declines hidden, invalid, behind-camera and camera-crossing geometry', () => {
  ok(recoveryWindow(cam, [], stage, fitScale) === null, 'empty model');
  ok(recoveryWindow(cam, [[0, -400, 50]], stage, fitScale) === null, 'behind camera');
  ok(recoveryWindow(cam, cube([0, -200, 50], 10), stage, fitScale) === null, 'crosses camera');
  ok(recoveryWindow(cam, [[NaN, 0, 0]], stage, fitScale) === null, 'invalid projection');
  ok(recoveryWindow(cam, cube([0, 0, 0], 10), stage, 0) === null, 'invalid viewport');
});

console.log(`\nviewFrame: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
