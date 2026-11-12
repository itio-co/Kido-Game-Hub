/// <reference types="vite/client" />
// Regression coverage for camera-match projection and export, without a WebGL context.
import * as THREE from 'three';
import { recoveryDepth } from '../src/lib/editor/viewFrame.ts';
import { applyToCamera, camFromMatched, fullExport, hfovDeg, threePose } from '../src/lib/editor/cameraMatch.ts';
import { fromBlenderEulerDeg, project, type Cam, type V3 } from '../src/lib/editor/camMath.ts';
import type { ShowcaseAsset } from '../src/lib/showcaseAssets.ts';

declare const process: { exitCode?: number };
let passed = 0, failed = 0;
function test(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`ok   ${name}`); }
  catch (e) { failed++; console.error(`FAIL ${name}\n     ${(e as Error).message}`); }
}
function near(actual: number, expected: number, eps = 1e-6): void {
  if (Math.abs(actual - expected) > eps) throw new Error(`${actual} != ${expected}`);
}
function ok(value: boolean, message: string): void { if (!value) throw new Error(message); }
const W = 252, H = 284;
// Full-room image centre expressed in crop pixels, matching the editor's default line solve.
const cam: Cam = { f: 1134.82, cx: -8, cy: 100, R: fromBlenderEulerDeg([73.63, 0.54, 26.89]), C: [151.665, -304.096, 136.477] };
const points: V3[] = [[-30.5, -20.25, 55], [30.5, -20.25, 55], [30.5, 20.25, 55], [-29.6, -19.35, 0]];
function fixture(scale = 1): ShowcaseAsset {
  return {
    id: 'test', slug: 'player-room/nightstand', title: 'Test', variants: [],
    orbit: { target: .26, distance: 1.7, height: .9 },
    ref: { src: 'showcase/nightstand-ref.png', width: W, height: H,
      camera: { hfovDeg: hfovDeg(cam.f, W), ...threePose(cam) },
      mockup: { src: 'img/player-room-wide.jpg', width: 720, height: 1280, crop: { x: 368, y: 540 }, scale },
    },
  };
}
function exported(scale = 1) {
  return fullExport(cam, { asset: fixture(scale), dims: [61, 40.5, 55], lines: [], pairs: [], residual: { lines: null, points: null }, image: 'crop' });
}

test('stored matched cameras preserve off-centre projection', () => {
  const stored = { hfovDeg: hfovDeg(cam.f, W), ...threePose(cam), principalPoint: [cam.cx, cam.cy] as [number, number] };
  const restored = camFromMatched(stored, W, H);
  for (const p of points) {
    const a = project(cam, p)!, b = project(restored, p)!;
    near(a[0], b[0]); near(a[1], b[1]);
  }
});

test('legacy cameras without principalPoint keep the centred fallback', () => {
  const restored = camFromMatched(fixture().ref!.camera, W, H);
  near(restored.cx, W / 2); near(restored.cy, H / 2);
});

test('exported Three.js snippet retains the solved principal point', () => {
  ok(exported().three.snippet.includes('principalPoint: [-8, 100]'), exported().three.snippet);
});

test('full-image export applies both crop offset and scale to all intrinsics', () => {
  for (const s of [1, 1.75]) {
    const m = exported(s).mockup!;
    near(m.focal_px, cam.f * s, .001);
    near(m.principalPoint[0]!, 368 + cam.cx * s, .001);
    near(m.principalPoint[1]!, 540 + cam.cy * s, .001);
    near(m.lens_mm, cam.f * s * 36 / 720, .001);
    near(m.hfovDeg, hfovDeg(cam.f * s, 720), .0001);
    near(m.shift_x, (360 - (368 + cam.cx * s)) / 720, .00001);
    near(m.shift_y, (540 + cam.cy * s - 640) / 720, .00001);
  }
});

test('full-image export uses the session crop instead of stale asset defaults', () => {
  const out = fullExport(cam, { asset: fixture(), dims: [61, 40.5, 55], lines: [], pairs: [], residual: { lines: null, points: null }, image: 'crop', crop: { x: 12, y: 34, s: 2 } });
  const m = out.mockup!;
  near(m.cropOffset[0]!, 12); near(m.cropOffset[1]!, 34); near(m.cropScale, 2);
  near(m.focal_px, cam.f * 2); near(m.principalPoint[0]!, -4); near(m.principalPoint[1]!, 234);
});

test('Three.js projection stays pixel-locked through crop, room, zoom and pan', () => {
  const camera = new THREE.PerspectiveCamera(30, 1, .05, 30);
  for (const rect of [
    { x0: 0, y0: 0, w: W, h: H },
    { x0: -368, y0: -540, w: 720, h: 1280 },
    { x0: 24.5, y0: -9, w: 140, h: 110 },
  ]) {
    applyToCamera(camera, cam, rect);
    for (const p of points) {
      const uv = project(cam, p)!;
      const q = new THREE.Vector3(p[0] / 100, p[2] / 100, -p[1] / 100).project(camera);
      near((q.x + 1) * rect.w / 2 + rect.x0, uv[0]);
      near((1 - q.y) * rect.h / 2 + rect.y0, uv[1]);
    }
  }
});
test('recovery clipping reveals very near and far objects without altering camera alignment', () => {
  const c: Cam = { f: 100, cx: 50, cy: 50, C: [0, 0, 0], R: [[1, 0, 0], [0, 0, -1], [0, 1, 0]] };
  for (const distance of [0.01, 10000]) {
    const p: V3 = [0, distance, 0];
    const before = JSON.stringify(c);
    const range = recoveryDepth(c, [p])!;
    const camera = new THREE.PerspectiveCamera(32, 1, range.near, range.far);
    applyToCamera(camera, c, { x0: 0, y0: 0, w: 100, h: 100 });
    const ndc = new THREE.Vector3(0, 0, -distance / 100).project(camera);
    near(ndc.x, 0); near(ndc.y, 0);
    ok(ndc.z > -1 && ndc.z < 1, 'model inside clipping planes');
    ok(JSON.stringify(c) === before, 'camera match unchanged');
  }
  ok(recoveryDepth(c, [[0, -1, 0]]) === null, 'behind camera cannot be recovered with clipping');
});
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
