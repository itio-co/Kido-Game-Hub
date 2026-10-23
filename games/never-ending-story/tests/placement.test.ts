// Whole-object placement (Object mode on the asset root): `npm test` in games/never-ending-story/.
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  applyPlacementForExport,
  blenderRotationDeg,
  camToObject,
  camToWorld,
  cleanPlacement,
  fromThree,
  isIdentityPlacement,
  placeToLocal,
  placeToWorld,
  placementFileData,
  placementFromThree,
  rotationXYZ,
  threeMatrix,
  threeQuaternion,
  toThree,
  withOrigin,
  type Placement,
} from '../src/lib/editor/placement.ts';
import { mulMV, type M3, type V3 } from '../src/lib/editor/camMath.ts';

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
const close = (a: readonly number[], b: readonly number[], eps = 1e-6) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]!) < eps);
const fmt = (a: readonly number[]) => `[${a.map((v) => v.toFixed(4)).join(', ')}]`;

const P: Placement = { position: [12.5, -40, 3], rotation: [0, 0, 15], scale: 1 };
const P2: Placement = { position: [-7, 22, 10], rotation: [10, -20, 135], scale: 1.25, origin: [5, -3, 0] };

test('migration: old files / drafts have no placement; identity and junk are dropped', () => {
  ok(cleanPlacement(undefined) === undefined, 'undefined');
  ok(cleanPlacement(null) === undefined, 'null');
  ok(cleanPlacement({}) === undefined, 'empty');
  ok(cleanPlacement({ position: [0, 0, 0], rotation: [0, 0, 360], scale: 1 }) === undefined, 'identity (360°)');
  ok(cleanPlacement({ position: [1, 'x', 0] }) === undefined, 'bad vector');
  ok(cleanPlacement({ position: [1, 2] }) === undefined, 'short vector');
  const c = cleanPlacement({ position: [1, 2, 3], rotation: [0, 0, 190], scale: -2 })!;
  ok(close(c.position, [1, 2, 3]) && close(c.rotation, [0, 0, -170]) && c.scale === 1, JSON.stringify(c));
  ok(isIdentityPlacement(undefined) && !isIdentityPlacement(P), 'isIdentity');
});

test('edits.json round trip (unit-named keys) and the in-memory shape both load', () => {
  for (const p of [P, P2]) {
    const file = JSON.parse(JSON.stringify({ format: 'x', parts: [], placement: placementFileData(p) })) as { placement: unknown };
    ok('positionCm' in (file.placement as object) && 'rotationDeg' in (file.placement as object), 'file keys');
    const back = cleanPlacement(file.placement)!;
    ok(close(back.position, p.position, 1e-3) && close(back.rotation, p.rotation, 1e-3) && back.scale === p.scale, JSON.stringify(back));
    ok(JSON.stringify(back.origin ?? null) === JSON.stringify(p.origin ?? null), 'origin');
    // localStorage drafts store the in-memory shape
    const draft = cleanPlacement(JSON.parse(JSON.stringify(p)))!;
    ok(JSON.stringify(draft) === JSON.stringify(back), 'draft shape');
  }
});

test('rotation is Blender XYZ Euler: R = Rz · Ry · Rx; R Z 15 yaws counter-clockwise seen from above', () => {
  const R = rotationXYZ([0, 0, 15]);
  const v = mulMV(R, [100, 0, 0]);
  ok(close(v, [100 * Math.cos(Math.PI / 12), 100 * Math.sin(Math.PI / 12), 0]), fmt(v));
  // three quaternion agrees with the Blender matrix (via the basis change)
  for (const rot of [[0, 0, 15], [10, -20, 135], [90, 0, 0], [-35, 60, -170]] as V3[]) {
    const M = rotationXYZ(rot);
    const x: V3 = [3, -7, 11];
    const a = mulMV(M, x);
    const b = fromThree(toThree(x).applyQuaternion(threeQuaternion(rot)));
    ok(close(a, b, 1e-9), `${rot}: ${fmt(a)} vs ${fmt(b)}`);
    const back = blenderRotationDeg(threeQuaternion(rot));
    ok(close(mulMV(rotationXYZ(back), x), a, 1e-9), `euler round trip ${rot}`);
  }
});

test('placeToWorld / placeToLocal invert; the origin is where Location puts it', () => {
  for (const p of [P, P2]) {
    const x: V3 = [10, 20, -5];
    ok(close(placeToLocal(p, placeToWorld(p, x)), x, 1e-9), 'inverse');
    ok(close(placeToWorld(p, p.origin ?? [0, 0, 0]), p.position, 1e-9), 'origin → position');
  }
  // R Z 15 about the origin: the origin stays, other points yaw
  const o = placeToWorld(P, [0, 0, 0]);
  ok(close(o, P.position), 'origin fixed');
});

test('Set Origin (withOrigin) keeps the geometry where it is', () => {
  const q = withOrigin(P2, [-12, 4, 30]);
  for (const x of [[0, 0, 0], [10, 20, 30], [-5, 1, 2]] as V3[]) ok(close(placeToWorld(q, x), placeToWorld(P2, x), 1e-9), `x ${x}`);
});

test('camera stays in world space: camToObject / camToWorld invert and keep projections', () => {
  const R: M3 = rotationXYZ([75, 0, 30]);
  const cam = { f: 1000, cx: 640, cy: 360, R, C: [250, -300, 140] as V3 };
  const proj = (c: typeof cam, X: V3): [number, number] => {
    const d: V3 = [X[0] - c.C[0], X[1] - c.C[1], X[2] - c.C[2]];
    const y = mulMV(c.R, d);
    return [c.cx + (c.f * y[0]) / y[2], c.cy + (c.f * y[1]) / y[2]];
  };
  for (const p of [P, P2]) {
    const camObj = camToObject(cam, p);
    const back = camToWorld(camObj, p);
    ok(close(back.C, cam.C, 1e-9) && back.R.every((row, i) => close(row, cam.R[i]!, 1e-12)), 'inverse');
    // a model-frame point seen by the object-frame camera = its placed world point seen by the world camera
    const x: V3 = [20, -10, 50];
    ok(close(proj(camObj, x), proj(cam, placeToWorld(p, x)), 1e-6), 'projection');
  }
  ok(camToObject(cam, undefined) === cam, 'identity = same camera');
});

test('three node matrix = the Blender placement', () => {
  const x: V3 = [4, 5, 6];
  const w = fromThree(toThree(x).applyMatrix4(threeMatrix(P2)));
  ok(close(w, placeToWorld(P2, x), 1e-9), fmt(w));
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  threeMatrix(P2).decompose(pos, quat, scl);
  const back = placementFromThree(pos, quat, scl.x, P2.origin);
  ok(close(back.position, P2.position, 1e-9) && close(mulMV(rotationXYZ(back.rotation), x), mulMV(rotationXYZ(P2.rotation), x), 1e-9), JSON.stringify(back));
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

async function roundTrip(scene: THREE.Object3D): Promise<THREE.Object3D> {
  const glb = (await new GLTFExporter().parseAsync(scene, { binary: true })) as ArrayBuffer;
  return (await new GLTFLoader().parseAsync(glb, '')).scene;
}
function model(singleRoot: boolean): THREE.Group {
  // like GLTFLoader's gltf.scene: a group (written as the GLB root node) holding the file's nodes
  const scene = new THREE.Group();
  scene.name = 'Scene';
  const mk = (name: string, x: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshStandardMaterial());
    m.name = name;
    m.position.set(x, 0.1, 0);
    return m;
  };
  if (singleRoot) {
    const r = new THREE.Group();
    r.name = 'nightstand';
    r.position.set(0, 0.05, 0);
    r.add(mk('body', 0), mk('drawer', 0.3));
    scene.add(r);
  } else scene.add(mk('body', 0), mk('drawer', 0.3));
  return scene;
}
function worldOf(scene: THREE.Object3D, name: string): THREE.Vector3 {
  scene.updateMatrixWorld(true);
  return new THREE.Vector3().setFromMatrixPosition(scene.getObjectByName(name)!.matrixWorld);
}

for (const single of [true, false]) {
  for (const bake of [false, true]) {
    test(`GLB export: placement ${bake ? 'baked into the parts' : 'as the root node transform'} (${single ? 'single root node' : 'loose parts'})`, async () => {
      const before = model(single);
      const expectBody = fromThree(worldOf(before, 'body'));
      const expectDrawer = fromThree(worldOf(before, 'drawer'));
      const back = await roundTrip(applyPlacementForExport(model(single), P2, bake));
      const body = fromThree(worldOf(back, 'body'));
      const drawer = fromThree(worldOf(back, 'drawer'));
      ok(close(body, placeToWorld(P2, expectBody), 1e-3), `body ${fmt(body)} vs ${fmt(placeToWorld(P2, expectBody))}`);
      ok(close(drawer, placeToWorld(P2, expectDrawer), 1e-3), `drawer ${fmt(drawer)}`);
      const rootNode = back.children[0]!;
      ok(back.children.length === 1 && rootNode.name === 'Scene', `root node ${back.children.map((c) => c.name)}`);
      if (!bake) {
        ok(Math.abs(rootNode.scale.x - 1.25) < 1e-5 && close(fromThree(rootNode.position), placeToWorld(P2, [0, 0, 0]), 1e-3), 'root node carries the placement');
      } else {
        ok(close(rootNode.position.toArray(), [0, 0, 0], 1e-6) && Math.abs(rootNode.scale.x - 1) < 1e-6 && Math.abs(rootNode.quaternion.w) > 1 - 1e-9, 'baked: root node stays identity');
      }
    });
  }
}

test('GLB export: a THREE.Scene gets a wrapper node carrying the placement', async () => {
  const s = new THREE.Scene();
  for (const c of [...model(false).children]) s.add(c);
  const back = await roundTrip(applyPlacementForExport(s, P, false, 'nightstand'));
  ok(back.children.length === 1 && back.children[0]!.name === 'nightstand', back.children.map((c) => c.name).join());
  ok(close(fromThree(back.children[0]!.position), P.position, 1e-3), 'wrapper position');
});

test('GLB export: identity placement leaves the scene untouched', () => {
  const s = model(false);
  const out = applyPlacementForExport(s, undefined);
  ok(out === s && s.children.length === 2, 'untouched');
});

await Promise.all(pending);
console.log(`placement: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
