// Part origin (pivot) editing: `npm test` in games/never-ending-story/.
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  applyPivot,
  cleanPivot,
  localBox,
  migrateParts,
  nearestOnScreen,
  presetPivot,
  registerPart,
  shiftedPosition,
  snapTargets,
  type Vec3,
} from '../src/lib/editor/pivot.ts';

declare const process: { exitCode?: number };
let failed = 0;
let passed = 0;
const pending: Promise<void>[] = [];
function test(name: string, fn: () => void | Promise<void>): void {
  const done = (e?: unknown) => {
    if (e) {
      failed++;
      console.error(`FAIL ${name}: ${(e as Error).message}`);
    } else passed++;
  };
  try {
    const r = fn();
    if (r) pending.push(r.then(() => done(), done));
    else done();
  } catch (e) {
    done(e);
  }
}
function ok(c: boolean, msg: string): void {
  if (!c) throw new Error(msg);
}
const near = (a: THREE.Vector3, b: THREE.Vector3, eps = 1e-5) => a.distanceTo(b) < eps;
const v = (p: readonly number[]) => new THREE.Vector3(p[0], p[1], p[2]);
const DEG = Math.PI / 180;

/** A box mesh (not centred on its origin) with one child, under a parent like a GLB part. */
function makePart(): { root: THREE.Group; part: THREE.Mesh; kid: THREE.Mesh } {
  const root = new THREE.Group();
  const geo = new THREE.BoxGeometry(0.4, 0.2, 0.1).translate(0.3, 0.1, -0.05);
  const part = new THREE.Mesh(geo, new THREE.MeshStandardMaterial());
  part.name = 'Drawer';
  const kid = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), new THREE.MeshStandardMaterial());
  kid.name = 'Knob';
  kid.position.set(0.3, 0.1, 0.02);
  part.add(kid);
  root.add(part);
  return { root, part, kid };
}
/** World positions of all vertices under `node`. */
function worldVerts(node: THREE.Object3D): THREE.Vector3[] {
  node.updateWorldMatrix(true, true);
  const out: THREE.Vector3[] = [];
  node.traverse((n) => {
    const m = n as THREE.Mesh;
    if (!m.isMesh) return;
    const pos = m.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld));
  });
  return out;
}
type T3 = { position: Vec3; rotation: Vec3; scale: Vec3; pivot?: Vec3 };
function setTransform(part: THREE.Object3D, t: T3): void {
  applyPivot(part, t.pivot);
  part.position.set(...t.position);
  part.rotation.set(t.rotation[0] * DEG, t.rotation[1] * DEG, t.rotation[2] * DEG);
  part.scale.set(...t.scale);
}
/** Move the pivot like the editor does (position compensates so the mesh stays put). */
function movePivot(t: T3, to: Vec3): T3 {
  return { ...t, position: shiftedPosition(t.position, t.rotation, t.scale, t.pivot ?? [0, 0, 0], to), pivot: to };
}

test('a pivot change keeps every vertex where it was in world space (rotated + scaled part, child included)', () => {
  const { part } = makePart();
  registerPart(part);
  let t: T3 = { position: [0.1, 0.2, 0.3], rotation: [10, 35, -20], scale: [1.5, 0.8, 1.2] };
  setTransform(part, t);
  const before = worldVerts(part);
  for (const to of [[0.5, 0.2, 0] as Vec3, [-0.1, 0, 0.07] as Vec3, [0, 0, 0] as Vec3]) {
    t = movePivot(t, to);
    setTransform(part, t);
    const after = worldVerts(part);
    ok(after.length === before.length, 'vertex count');
    after.forEach((p, i) => ok(near(p, before[i]!), `vertex ${i} moved to ${p.toArray()} (pivot ${to})`));
    // the node origin is the pivot
    const origin = new THREE.Vector3().setFromMatrixPosition(part.matrixWorld);
    const expect = v(to).applyMatrix4(new THREE.Matrix4().compose(v(shiftedPosition(t.position, t.rotation, t.scale, to, [0, 0, 0])), new THREE.Quaternion().setFromEuler(part.rotation), part.scale));
    ok(near(origin, expect), `origin ${origin.toArray()} vs ${expect.toArray()}`);
  }
});

test('rotating after a pivot change turns the part about the new pivot', () => {
  const { part } = makePart();
  registerPart(part);
  let t: T3 = { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
  t = movePivot(t, [0.5, 0, 0]);
  setTransform(part, t);
  part.updateWorldMatrix(true, false);
  const pivotWorld = new THREE.Vector3().setFromMatrixPosition(part.matrixWorld);
  ok(near(pivotWorld, new THREE.Vector3(0.5, 0, 0)), `pivot at ${pivotWorld.toArray()}`);
  const before = worldVerts(part);
  setTransform(part, { ...t, rotation: [0, 90, 0] });
  const after = worldVerts(part);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  after.forEach((p, i) => ok(near(p, before[i]!.clone().sub(pivotWorld).applyQuaternion(q).add(pivotWorld)), `vertex ${i}`));
});

test('presets: centre, bottom centre, reset; box of the part (child included)', () => {
  const { part } = makePart();
  const box = localBox(part.clone());
  ok(near(v(box.min), new THREE.Vector3(0.1, 0, -0.1)) && near(v(box.max), new THREE.Vector3(0.5, 0.2, 0.045)), `box ${box.min} ${box.max}`);
  ok(near(v(presetPivot('center', box)), new THREE.Vector3(0.3, 0.1, -0.0275)), `center ${presetPivot('center', box)}`);
  ok(near(v(presetPivot('bottom', box)), new THREE.Vector3(0.3, 0, -0.0275)), `bottom ${presetPivot('bottom', box)}`);
  ok(presetPivot('reset', box).every((x) => x === 0), 'reset');
});

test('snap targets: vertices, edge midpoints, face centres, box corners + centre; nearest on screen', () => {
  const geo = new THREE.BoxGeometry(2, 2, 2);
  const s = snapTargets(new THREE.Mesh(geo));
  const count = (k: number) => s.kinds.filter((x) => x === k).length;
  ok(count(0) === 8, `vertices ${count(0)}`);
  ok(count(3) === 9, `box ${count(3)}`);
  ok(count(1) >= 12 && count(2) === 12, `edges ${count(1)} faces ${count(2)}`);
  // project with x,y as the screen; a tie between a box corner and a vertex goes to the vertex
  const screen = new Float32Array((s.points.length / 3) * 2);
  for (let i = 0; i < s.points.length / 3; i++) screen.set([s.points[i * 3]! * 100, s.points[i * 3 + 1]! * 100], i * 2);
  const i = nearestOnScreen(screen, [98, 97], 10);
  ok(i >= 0 && s.kinds[i] !== 3 && Math.abs(s.points[i * 3]! - 1) < 1e-6, `nearest ${i} kind ${s.kinds[i]}`);
  ok(nearestOnScreen(screen, [50, 300], 10) === -1, 'nothing near');
});

test('edits.json migration: old files (no pivot) load unchanged; bad / zero pivots are dropped', () => {
  const old = [{ source: 'A', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }];
  const m = migrateParts(old as { pivot?: unknown }[]);
  ok(!('pivot' in m[0]!) && JSON.stringify(m) === JSON.stringify(old), 'old untouched');
  const mixed = migrateParts([{ pivot: [0.1, 0, 0.2] }, { pivot: [0, 0, 0] }, { pivot: ['x', 1, 2] }, { pivot: [1, 2] }, { pivot: null }]);
  ok(JSON.stringify(mixed) === JSON.stringify([{ pivot: [0.1, 0, 0.2] }, {}, {}, {}, {}]), JSON.stringify(mixed));
  ok(cleanPivot([0.1234567891, 0, 0])![0] === 0.123457, 'rounded');
});

// GLTFExporter (binary) reads its Blob through FileReader, which node does not have.
const g = globalThis as unknown as { FileReader?: unknown };
if (!g.FileReader) {
  g.FileReader = class {
    result: ArrayBuffer | string | null = null;
    onload: ((e: unknown) => void) | null = null;
    onloadend: ((e: unknown) => void) | null = null;
    readAsArrayBuffer(b: Blob): void {
      void b.arrayBuffer().then((buf) => {
        this.result = buf;
        this.onload?.({ target: this });
        this.onloadend?.({ target: this });
      });
    }
    readAsDataURL(b: Blob): void {
      void b.arrayBuffer().then((buf) => {
        let s = '';
        for (const x of new Uint8Array(buf)) s += String.fromCharCode(x);
        this.result = `data:${b.type || 'application/octet-stream'};base64,${btoa(s)}`;
        this.onload?.({ target: this });
        this.onloadend?.({ target: this });
      });
    }
  };
}

test('GLB export round trip: the node origin is the new pivot, the mesh is where it was', async () => {
  const { root, part } = makePart();
  registerPart(part);
  let t: T3 = { position: [0.1, 0, 0.2], rotation: [0, 30, 0], scale: [1, 1, 1] };
  setTransform(part, t);
  const before = worldVerts(root);
  t = movePivot(t, presetPivot('bottom', localBox(part.clone())));
  setTransform(part, t);
  root.updateMatrixWorld(true);
  const pivotWorld = new THREE.Vector3().setFromMatrixPosition(part.matrixWorld);
  const glb = (await new GLTFExporter().parseAsync(root, { binary: true })) as ArrayBuffer;
  const gltf = await new GLTFLoader().parseAsync(glb, '');
  const back = gltf.scene.getObjectByName('Drawer')!;
  ok(!!back, 'Drawer in GLB');
  gltf.scene.updateMatrixWorld(true);
  const origin = new THREE.Vector3().setFromMatrixPosition(back.matrixWorld);
  ok(near(origin, pivotWorld), `origin ${origin.toArray()} vs pivot ${pivotWorld.toArray()}`);
  ok(near(back.position, v(t.position)), `node translation ${back.position.toArray()} vs ${t.position}`);
  // bottom centre: the lowest local y of the drawer's own geometry is 0 (relative to the new origin)
  const own = (back as THREE.Mesh).geometry;
  own.computeBoundingBox();
  ok(Math.abs(own.boundingBox!.min.y) < 1e-6, `geometry min y ${own.boundingBox!.min.y}`);
  const after = worldVerts(gltf.scene);
  ok(after.length === before.length, `vertex count ${after.length}/${before.length}`);
  // the loader may reorder nothing here (one mesh + one child); compare as sets
  for (const p of before) ok(after.some((q) => near(p, q, 1e-5)), `vertex ${p.toArray()} lost`);
});

await Promise.all(pending);
console.log(`pivot: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
