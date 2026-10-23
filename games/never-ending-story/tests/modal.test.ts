// Blender-style modal transforms (G / R / S helpers): `npm test` in games/never-ending-story/.
import * as THREE from 'three';
import {
  AXIS_COLORS,
  NumInput,
  closestOnLine,
  cycleConstraint,
  rotationFromScreen,
  screenAngle,
  screenScale,
  snapTo,
} from '../src/lib/editor/modal.ts';

declare const process: { exitCode?: number };
let failed = 0;
let passed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    console.error(`FAIL ${name}: ${(e as Error).message}`);
  }
}
function eq(a: unknown, b: unknown, msg = ''): void {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
}
function near(a: number, b: number, eps = 1e-6, msg = ''): void {
  if (!(Math.abs(a - b) <= eps)) throw new Error(`${msg} ${a} != ${b}`);
}

test('X / Y / Z cycle: global → local → off; another axis restarts at global', () => {
  let c = cycleConstraint(null, 0);
  eq(c, { axis: 0, space: 'global' });
  c = cycleConstraint(c, 0);
  eq(c, { axis: 0, space: 'local' });
  eq(cycleConstraint(c, 0), null);
  eq(cycleConstraint({ axis: 0, space: 'local' }, 2), { axis: 2, space: 'global' });
});

test('typed numeric input: digits, decimal point, minus toggle, backspace', () => {
  const n = new NumInput();
  eq(n.active, false);
  eq(n.value(), null);
  for (const k of ['0', '.', '0', '5']) eq(n.key(k), true);
  near(n.value()!, 0.05);
  eq(n.display(), '0.05|');
  n.key('-');
  near(n.value()!, -0.05);
  eq(n.display(), '-0.05|');
  n.key('-');
  near(n.value()!, 0.05);
  n.key('.'); // second point ignored
  eq(n.text, '0.05');
  n.key('Backspace');
  near(n.value()!, 0.0);
  eq(n.key('q'), false);
  n.clear();
  eq(n.active, false);
  const m = new NumInput();
  m.key(',');
  m.key('5');
  near(m.value()!, 0.5, 1e-9, 'comma starts "0."');
  const k = new NumInput();
  k.key('-');
  eq(k.active, true);
  eq(k.value(), null, 'only "-" typed');
});

test('closestOnLine: axis-constrained grab follows the mouse ray', () => {
  // line: the X axis through the origin; ray from (2, 1, 5) straight down -Z → closest point x = 2
  const t = closestOnLine(new THREE.Vector3(2, 1, 5), new THREE.Vector3(0, 0, -1), new THREE.Vector3(), new THREE.Vector3(1, 0, 0));
  near(t!, 2);
  // a ray parallel to the line has no answer
  eq(closestOnLine(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(), new THREE.Vector3(1, 0, 0)), null);
  // oblique ray
  const o = new THREE.Vector3(0, 3, 3);
  const r = new THREE.Vector3(1, -1, -1).normalize();
  const tt = closestOnLine(o, r, new THREE.Vector3(), new THREE.Vector3(1, 0, 0))!;
  const onLine = new THREE.Vector3(tt, 0, 0);
  // the connecting segment is perpendicular to the line
  const s = r.dot(new THREE.Vector3().subVectors(onLine, o));
  const onRay = o.clone().addScaledVector(r, s);
  near(new THREE.Vector3().subVectors(onRay, onLine).x, 0, 1e-9);
});

test('screen angle / scale and snapping', () => {
  near(screenAngle([0, 0], [10, 0], [0, 10]), Math.PI / 2, 1e-9, 'clockwise on screen (y down) is positive');
  near(screenAngle([0, 0], [10, 0], [0, -10]), -Math.PI / 2, 1e-9);
  near(Math.abs(screenAngle([0, 0], [-10, 1], [-10, -1])), 0.19933, 1e-4, 'wraps across ±180°');
  near(screenScale([0, 0], [80, 0], [160, 0]), 2);
  near(screenScale([0, 0], [0, 0], [50, 0]), 1, 0, 'no start distance → 1');
  near(snapTo(0.0123, 0.005), 0.01, 1e-12);
  near(snapTo(47, 15), 45);
  near(snapTo(3.3, 0), 3.3);
});

test('rotation follows the screen whichever side the camera is on', () => {
  const axis = new THREE.Vector3(0, 0, 1);
  near(rotationFromScreen(0.5, axis, new THREE.Vector3(0, 0, 1)), -0.5);
  near(rotationFromScreen(0.5, axis, new THREE.Vector3(0, 0, -1)), 0.5);
});

test('Blender axis colours (X red, Y green, Z blue)', () => {
  eq(AXIS_COLORS.length, 3);
  const rgb = AXIS_COLORS.map((c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)));
  for (let i = 0; i < 3; i++) eq(rgb[i]!.indexOf(Math.max(...rgb[i]!)), i, `axis ${i}`);
});

console.log(`modal: ${passed} passed${failed ? `, ${failed} FAILED` : ''}`);
if (failed) process.exitCode = 1;
