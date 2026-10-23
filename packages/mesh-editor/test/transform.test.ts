import { describe, expect, it } from 'vitest';
import { Matrix4, Mesh, Object3D, PerspectiveCamera, Scene, Vector3 } from 'three';
import { EditorViewport, createHistory, editMeshOps, type EditMesh, type EditorHost, type Selection } from '../src/index.js';

const cube = (): EditMesh => ({
  v: [-0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5],
  f: [
    [0, 3, 2, 1],
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [2, 3, 7, 6],
    [1, 2, 6, 5],
    [0, 4, 7, 3],
  ],
});

class Dom extends EventTarget {
  getBoundingClientRect(): DOMRect {
    return { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON() { return {}; } } as DOMRect;
  }
  setPointerCapture(): void {}
  releasePointerCapture(): void {}
}

function pointer(type: string, x: number, y: number, extra: Record<string, unknown> = {}): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, {
    isPrimary: true,
    button: 0,
    clientX: x,
    clientY: y,
    pointerId: 1,
    pointerType: 'mouse',
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...extra,
  });
  return event;
}

interface HostState {
  mesh: EditMesh;
  commits: { id: string; live: boolean }[];
  locked: Record<string, boolean | string>;
}

function world(mesh: EditMesh, obj: Object3D, i: number): Vector3 {
  return new Vector3(mesh.v[3 * i] ?? 0, mesh.v[3 * i + 1] ?? 0, mesh.v[3 * i + 2] ?? 0).applyMatrix4(obj.matrixWorld);
}

function setup(opts?: { snap?: boolean; second?: boolean }) {
  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 800 / 600, 0.1, 100);
  camera.position.set(0, 0, 4);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const state: HostState = { mesh: cube(), commits: [], locked: {} };
  const meshes = new Map<string, EditMesh>([['a', state.mesh]]);
  if (opts?.second) meshes.set('b', cube());
  const objects = new Map<string, Object3D>();
  for (const [id, mesh] of meshes) {
    const obj = new Mesh(editMeshOps.toBufferGeometry(mesh));
    if (id === 'b') obj.position.set(2, 0, 0);
    scene.add(obj);
    objects.set(id, obj);
  }
  const nav: boolean[] = [];
  const host: EditorHost = {
    getMesh: (id) => meshes.get(id) ?? null,
    commit: (id, mesh, o) => {
      meshes.set(id, mesh);
      if (id === 'a') state.mesh = mesh;
      state.commits.push({ id, live: o.live });
      const obj = objects.get(id);
      if (obj && 'geometry' in obj) (obj as Mesh).geometry = editMeshOps.toBufferGeometry(mesh);
    },
    onSelectionChange: () => {},
    setNavigationEnabled: (on) => nav.push(on),
    requestRender: () => {},
    resolveMaterial: () => ({}) as never,
    listObjects: () => [...meshes.keys()],
    getObject3D: (id) => objects.get(id) ?? null,
    commitTransform: () => {},
    canEdit: (id) => state.locked[id] ?? true,
  };
  const dom = new Dom();
  const history = createHistory();
  const vp = new EditorViewport({
    scene,
    camera,
    domElement: dom as unknown as HTMLElement,
    host,
    history,
    ...(opts?.snap ? {} : { snap: (c: { matrix: Matrix4 }) => c.matrix }),
  });
  vp.attach();
  return { vp, dom, state, host, objects, nav, history, meshes };
}

describe('transform session', () => {
  it('applies a drag to the start snapshot once and records one command', () => {
    const h = setup();
    const obj = h.objects.get('a')!;
    h.vp.setSelectMode('vertex');
    h.vp.setSelection({
      mode: 'vertex',
      objects: ['a'],
      active: 'a',
      elements: { a: { verts: [0, 1, 2, 3, 4, 5, 6, 7], edges: [], faces: [] } },
    });
    h.vp.setTransformMode('translate');
    const before = h.state.mesh.v.slice();
    h.dom.dispatchEvent(pointer('pointerdown', 400, 300));
    expect(h.vp.session?.active).toBe(true);
    const delta = new Matrix4().makeTranslation(0.2, 0, 0);
    h.vp.session?.update(delta);
    h.vp.session?.update(delta);
    const once = world(h.state.mesh, obj, 1);
    expect(once.x).toBeCloseTo(0.7, 4);
    h.dom.dispatchEvent(pointer('pointerup', 460, 300));
    const finals = h.state.commits.filter((c) => !c.live);
    const lives = h.state.commits.filter((c) => c.live);
    expect(finals).toHaveLength(1);
    expect(lives.length).toBeGreaterThan(0);
    expect(h.history.canUndo).toBe(true);
    expect(world(h.state.mesh, obj, 1).x).toBeCloseTo(0.7, 4);
    h.history.undo();
    expect(h.state.mesh.v).toEqual(before);
    h.vp.dispose();
  });

  it('cancels a drag without a history command', () => {
    const h = setup();
    h.vp.setSelectMode('vertex');
    h.vp.setSelection({
      mode: 'vertex',
      objects: ['a'],
      active: 'a',
      elements: { a: { verts: [6], edges: [], faces: [] } },
    });
    h.vp.setTransformMode('translate');
    const before = h.state.mesh.v.slice();
    const obj = h.objects.get('a')!;
    const pivot = world(h.state.mesh, obj, 6).project(h.vp.options.camera);
    const sx = ((pivot.x + 1) / 2) * 800;
    const sy = ((1 - pivot.y) / 2) * 600;
    h.dom.dispatchEvent(pointer('pointerdown', sx, sy));
    h.vp.session?.update(new Matrix4().makeTranslation(0.3, 0, 0));
    expect(h.state.mesh.v).not.toEqual(before);
    h.dom.dispatchEvent(pointer('pointerdown', 400, 300, { isPrimary: false, pointerId: 2 }));
    expect(h.state.mesh.v).toEqual(before);
    expect(h.history.canUndo).toBe(false);
    expect(h.state.commits.every((c) => c.live)).toBe(true);
    h.vp.dispose();
  });

  it('typed values move the pivot axis and merge repeated edits', () => {
    const h = setup();
    h.vp.setSelectMode('vertex');
    const sel: Selection = {
      mode: 'vertex',
      objects: ['a'],
      active: 'a',
      elements: { a: { verts: [1], edges: [], faces: [] } },
    };
    h.vp.setSelection(sel);
    h.vp.applyTyped({ kind: 'position', axis: 0, value: 1, space: 'world' });
    expect(h.state.mesh.v[3]).toBeCloseTo(1, 5);
    expect(h.state.commits.filter((c) => !c.live)).toHaveLength(1);
    h.vp.applyTyped({ kind: 'position', axis: 0, value: 1.25, space: 'world' });
    expect(h.state.mesh.v[3]).toBeCloseTo(1.25, 5);
    h.history.undo();
    expect(h.state.mesh.v[3]).toBeCloseTo(0.5, 5);
    expect(h.history.canUndo).toBe(false);
    h.vp.dispose();
  });

  it('drops locked objects and emits a notice', () => {
    const h = setup({ second: true });
    const notices: unknown[] = [];
    h.vp.on('notice', (n) => notices.push(n));
    h.state.locked.b = 'locked by teacher';
    h.vp.setSelectMode('vertex');
    h.vp.setSelection({
      mode: 'vertex',
      objects: ['a', 'b'],
      active: 'a',
      elements: {
        a: { verts: [1], edges: [], faces: [] },
        b: { verts: [1], edges: [], faces: [] },
      },
    });
    h.vp.setTransformMode('translate');
    expect(notices.at(-1)).toMatchObject({ kind: 'locked-skipped', count: 1, allLocked: false, reasons: [{ objId: 'b', reason: 'locked by teacher' }] });
    const bBefore = h.meshes.get('b')!.v.slice();
    h.vp.applyTyped({ kind: 'position', axis: 0, value: 2, space: 'world' });
    expect(h.state.mesh.v[3]).toBeCloseTo(2, 4);
    expect(h.meshes.get('b')!.v).toEqual(bBefore);
    h.state.locked.a = false;
    h.vp.applyTyped({ kind: 'position', axis: 0, value: 3, space: 'world' });
    expect(notices.at(-1)).toMatchObject({ allLocked: true, count: 2 });
    expect(h.state.mesh.v[3]).toBeCloseTo(2, 4);
    h.vp.dispose();
  });

  it('uses the default 5 mm snap when none is passed', () => {
    const h = setup({ snap: true });
    h.vp.setSelectMode('vertex');
    h.vp.setSelection({
      mode: 'vertex',
      objects: ['a'],
      active: 'a',
      elements: { a: { verts: [1], edges: [], faces: [] } },
    });
    h.vp.applyTyped({ kind: 'position', axis: 0, value: 0.507, space: 'world' });
    expect(h.state.mesh.v[3]).toBeCloseTo(0.505, 5);
    h.vp.dispose();
  });
});
