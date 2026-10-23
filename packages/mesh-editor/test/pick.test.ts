import { describe, expect, it } from 'vitest';
import { Mesh, PerspectiveCamera, Scene, Vector3 } from 'three';
import { EditorViewport, editMeshOps, type EditMesh, type EditorHost, type Selection } from '../src/index.js';

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
  style: { cursor?: string } = {};
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

function harness(mesh: EditMesh = cube()) {
  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 800 / 600, 0.1, 100);
  camera.position.set(0, 0, 4);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const geo = editMeshOps.toBufferGeometry(mesh);
  const object = new Mesh(geo);
  object.userData.meshEditorId = 'cube';
  scene.add(object);
  const commits: { live: boolean; mesh: EditMesh }[] = [];
  const host: EditorHost = {
    getMesh: () => mesh,
    commit: (_id, next, opts) => {
      mesh = next;
      commits.push({ live: opts.live, mesh: next });
      object.geometry = editMeshOps.toBufferGeometry(next);
    },
    onSelectionChange: () => {},
    setNavigationEnabled: () => {},
    requestRender: () => {},
    resolveMaterial: () => object.material as never,
    listObjects: () => ['cube'],
    getObject3D: () => object,
    commitTransform: () => {},
  };
  const dom = new Dom();
  const vp = new EditorViewport({ scene, camera, domElement: dom as unknown as HTMLElement, host, snap: (c) => c.matrix });
  vp.attach();
  const project = (i: number) => {
    const p = new Vector3(mesh.v[3 * i] ?? 0, mesh.v[3 * i + 1] ?? 0, mesh.v[3 * i + 2] ?? 0).applyMatrix4(object.matrixWorld).project(camera);
    return { x: ((p.x + 1) / 2) * 800, y: ((1 - p.y) / 2) * 600 };
  };
  const projectAt = (x: number, y: number, z: number) => {
    const p = new Vector3(x, y, z).applyMatrix4(object.matrixWorld).project(camera);
    return { x: ((p.x + 1) / 2) * 800, y: ((1 - p.y) / 2) * 600 };
  };
  const tap = (x: number, y: number, extra?: Record<string, unknown>) => {
    dom.dispatchEvent(pointer('pointerdown', x, y, extra));
    dom.dispatchEvent(pointer('pointerup', x, y, extra));
  };
  return { vp, dom, project, projectAt, tap, object, camera, scene, get mesh() { return mesh; }, commits };
}

describe('picking', () => {
  it('raycasts the front face and ignores a click on empty space', () => {
    const h = harness();
    h.vp.setSelectMode('face');
    const front = h.project(6);
    const back = h.project(2);
    const mid = { x: (front.x + back.x) / 2, y: (front.y + back.y) / 2 };
    h.tap(mid.x, mid.y);
    expect(h.vp.selection.elements.cube?.faces).toEqual([1]);
    h.tap(8, 8);
    expect(h.vp.selection.objects).toEqual([]);
    h.vp.dispose();
  });

  it('picks a vertex inside the radius and an edge at 0.7×, skipping occluded points', () => {
    const h = harness();
    h.vp.setSelectMode('vertex');
    const front = h.project(6);
    h.tap(front.x + 10, front.y);
    expect(h.vp.selection.elements.cube?.verts).toEqual([6]);
    h.tap(front.x + 30, front.y);
    expect(h.vp.selection.objects).toEqual([]);
    const back = h.project(2);
    h.tap(back.x, back.y);
    expect(h.vp.selection.elements.cube?.verts ?? []).not.toContain(2);
    h.vp.xray = true;
    h.tap(back.x, back.y);
    expect(h.vp.selection.elements.cube?.verts).toEqual([2]);
    h.vp.xray = false;
    h.vp.setSelectMode('edge');
    const a = h.project(5);
    const b = h.project(6);
    h.tap((a.x + b.x) / 2, (a.y + b.y) / 2);
    expect(h.vp.selection.elements.cube?.edges).toEqual(['5-6']);
    h.vp.dispose();
  });

  it('adds with Shift, toggles with Ctrl, and toggles when multiSelect is on', () => {
    const h = harness();
    h.vp.setSelectMode('vertex');
    const a = h.project(6);
    const b = h.project(5);
    h.tap(a.x, a.y);
    h.tap(b.x, b.y, { shiftKey: true });
    expect(h.vp.selection.elements.cube?.verts.slice().sort()).toEqual([5, 6]);
    h.tap(a.x, a.y, { ctrlKey: true });
    expect(h.vp.selection.elements.cube?.verts).toEqual([5]);
    h.vp.multiSelect = true;
    h.tap(a.x, a.y);
    expect(h.vp.selection.elements.cube?.verts.slice().sort()).toEqual([5, 6]);
    h.tap(a.x, a.y);
    expect(h.vp.selection.elements.cube?.verts).toEqual([5]);
    h.vp.dispose();
  });

  it('box-selects visible vertices and adds on Shift+drag', () => {
    const h = harness();
    h.vp.setSelectMode('vertex');
    const keep = h.project(7);
    h.tap(keep.x, keep.y);
    h.dom.dispatchEvent(pointer('pointerdown', 12, 12, { shiftKey: true }));
    h.dom.dispatchEvent(pointer('pointermove', 400, 580, { shiftKey: true }));
    h.dom.dispatchEvent(pointer('pointerup', 400, 580, { shiftKey: true }));
    const verts = h.vp.selection.elements.cube?.verts ?? [];
    expect(verts).toContain(7);
    expect(verts.length).toBeGreaterThan(1);
    expect(verts).not.toContain(2);
    h.vp.xray = true;
    h.vp.selectBox({ x: 0, y: 0, width: 800, height: 600 }, 'replace');
    expect(h.vp.selection.elements.cube?.verts).toContain(2);
    h.vp.dispose();
  });

  it('treats a sub-slop move as a tap and leaves a long drag on geometry to the camera', () => {
    const h = harness();
    h.vp.setSelectMode('face');
    const p = h.projectAt(0, 0, 0.5);
    h.dom.dispatchEvent(pointer('pointerdown', p.x, p.y));
    h.dom.dispatchEvent(pointer('pointermove', p.x + 4, p.y));
    h.dom.dispatchEvent(pointer('pointerup', p.x + 4, p.y));
    expect(h.vp.selection.elements.cube?.faces).toEqual([1]);
    h.dom.dispatchEvent(pointer('pointerdown', p.x, p.y));
    h.dom.dispatchEvent(pointer('pointermove', p.x + 40, p.y));
    h.dom.dispatchEvent(pointer('pointerup', p.x + 40, p.y));
    expect(h.vp.selection.elements.cube?.faces).toEqual([1]);
    h.vp.dispose();
  });

  it('converts vertex selection into the enclosed edges and faces', () => {
    const h = harness();
    const sel: Selection = {
      mode: 'vertex',
      objects: ['cube'],
      active: 'cube',
      elements: { cube: { verts: [1, 2, 6, 5], edges: [], faces: [] } },
    };
    h.vp.setSelection(sel);
    h.vp.setSelectMode('edge');
    expect(h.vp.selection.elements.cube?.edges.slice().sort()).toEqual(['1-2', '1-5', '2-6', '5-6']);
    h.vp.setSelectMode('face');
    expect(h.vp.selection.elements.cube?.faces).toEqual([4]);
    h.vp.setSelectMode('vertex');
    expect(h.vp.selection.elements.cube?.verts.slice().sort()).toEqual([1, 2, 5, 6]);
    h.vp.dispose();
  });
});
