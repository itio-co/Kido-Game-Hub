import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { type ShowcaseAsset, type ShowcaseVariant } from '../showcaseAssets';
import type { Cam } from './camMath';
import { applyToCamera, camFromMatched, type ViewRect } from './cameraMatch';
import {
  SNAP_KINDS,
  ZERO,
  applyPivot,
  isZero,
  localBox,
  migrateParts,
  nearestOnScreen,
  originalGeometry,
  presetPivot,
  registerPart,
  shiftedPosition,
  snapTargets,
  type LocalBox,
  type PivotPreset,
  type SnapKind,
  type SnapTargets,
} from './pivot';
import {
  AXIS_COLORS,
  AXIS_NAMES,
  NumInput,
  closestOnLine,
  cycleConstraint,
  rotationFromScreen,
  screenAngle,
  screenScale,
  snapTo,
  type Constraint,
  type ModalKind,
  type Space,
} from './modal';

export type Vec3 = [number, number, number];
export type GizmoMode = 'translate' | 'rotate' | 'scale';
export type ViewMode = 'orbit' | 'mock' | 'match';
/** How the model is drawn over the mock-up: shaded, wireframe, or outline/crease edges. */
export type DisplayMode = 'solid' | 'wire' | 'edges';
/** Blender "Set Origin" operations (+ Origin to Bottom and Reset Origin). */
export type OriginOp = 'geometry' | 'cursor' | 'geometryToOrigin' | 'bottom' | 'reset';
/** A running G / R / S modal transform, for the header / status bar. */
export type ModalInfo = {
  kind: ModalKind;
  /** Affect Only Origins: the grab moves the origin, not the part. */
  origins: boolean;
  axis: 'X' | 'Y' | 'Z' | null;
  space: Space | null;
  /** Typed numeric input as shown ("0.05|"), null when the mouse drives the value. */
  typed: string | null;
  /** grab: metres (1 value along the axis, or world dx/dy/dz) · rotate: degrees · scale: factor. */
  values: number[];
  snapping: boolean;
  precision: boolean;
};

/** One part (top-level node of the GLB). Positions in metres (glTF, Y-up), rotation in degrees. */
export type PartState = {
  name: string;
  /** Original part this one was copied from (same as name for parts in the GLB). */
  source: string;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  hidden: boolean;
  deleted: boolean;
  color: string | null;
  /**
   * Origin (pivot) offset in the part's local frame, metres, relative to the origin baked in the GLB.
   * Optional: absent = the GLB origin (edits files written before pivots load unchanged).
   * `position` is where this pivot sits; the mesh is offset by −pivot so it stays put.
   */
  pivot?: Vec3;
};

export type EditState = { parts: PartState[] };

export type PartInfo = { name: string; source: string; hidden: boolean; deleted: boolean; copy: boolean };

export type SelectedInfo = {
  name: string;
  /** Centre position, cm. */
  positionCm: Vec3;
  rotationDeg: Vec3;
  /** Width (X) × height (Y) × depth (Z), cm. */
  sizeCm: Vec3;
  hidden: boolean;
  color: string;
  /** Pivot relative to the GLB origin, part-local axes, cm. */
  pivotLocalCm: Vec3;
  /** Pivot (= node origin, where the gizmo sits) in world space, glTF axes (x right, y up, z front), cm. */
  pivotWorldCm: Vec3;
  /** World-space box centre of the part, glTF axes, cm. */
  centerWorldCm: Vec3;
  /** Pivot moved away from the GLB origin. */
  pivotSet: boolean;
};

export type EditorSnapshot = {
  ready: boolean;
  parts: PartInfo[];
  selected: SelectedInfo | null;
  canUndo: boolean;
  canRedo: boolean;
  dirty: boolean;
  /** Blender's Options > Transform > Affect Only Origins: transforms move only the selected part's origin. */
  pivotMode: boolean;
  /** "Place 3D Cursor" tool: the next taps / clicks place the 3D cursor. */
  cursorTool: boolean;
  /** 3D cursor, world (glTF axes), cm. */
  cursorCm: Vec3;
  /** Running G / R / S modal transform. */
  modal: ModalInfo | null;
  /** What the last pivot drag snapped to (null = free). */
  pivotSnap: SnapKind | null;
};

type Base = {
  object: THREE.Object3D;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  /** Size at scale 1, metres. */
  size: Vec3;
  /** Material(s) as loaded, restored when a colour edit is undone. */
  materials: Map<THREE.Mesh, THREE.Material | THREE.Material[]>;
  /** Box as loaded, Blender coordinates (cm). */
  before: BlenderBox | null;
  /** Untouched copy of the part node at the identity transform: source of copies, snap targets and the local box. */
  template: THREE.Object3D;
  /** Local box of the part as loaded (metres, node frame): pivot presets. */
  box: LocalBox;
  /** Pivot snap targets, built on the first pivot drag. */
  targets: SnapTargets | null;
};

export type BlenderBox = { x: [number, number]; y: [number, number]; z: [number, number] };

const DEG = 180 / Math.PI;
const r3 = (v: number, d = 4): number => Math.round(v * 10 ** d) / 10 ** d;
const vec = (v: THREE.Vector3 | THREE.Euler, k = 1, d = 4): Vec3 => [r3(v.x * k, d), r3(v.y * k, d), r3(v.z * k, d)];

export type ModelEditor = ReturnType<typeof createModelEditor>;

export function createModelEditor(canvas: HTMLCanvasElement, onChange: (snap: EditorSnapshot) => void) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.02, 40);
  scene.add(new THREE.HemisphereLight('#ffe6cc', '#7a4a2a', 1.15));
  const sun = new THREE.DirectionalLight('#ffdcb4', 3.1);
  sun.position.set(-1.3, 1.9, 0.7);
  scene.add(sun);
  const grid = new THREE.GridHelper(2, 20, '#5f7f99', '#3a4f62');
  scene.add(grid);

  const holder = new THREE.Group();
  scene.add(holder);
  const box = new THREE.BoxHelper(new THREE.Object3D(), '#ffe14d');
  (box.material as THREE.LineBasicMaterial).depthTest = false;
  box.renderOrder = 10;
  box.visible = false;
  scene.add(box);

  const orbit = new OrbitControls(camera, canvas);
  orbit.enableDamping = false;
  // Blender navigation: middle-drag orbits, Shift+middle-drag pans (OrbitControls pans when Shift / Ctrl is held),
  // the wheel zooms; the left button selects / uses tools and the right button is for menus / cancel.
  orbit.mouseButtons = { LEFT: -1 as THREE.MOUSE, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: -1 as THREE.MOUSE };
  const gizmo = new TransformControls(camera, canvas);
  const GIZMO_SIZE = 1.25;
  gizmo.setSize(GIZMO_SIZE);
  gizmo.setSpace('local');
  const gizmoHelper = gizmo.getHelper();
  scene.add(gizmoHelper);
  // Blender axis colours on the gizmo (three.js uses pure red / green / blue).
  {
    const swap = new Map<number, string>([[0xff0000, AXIS_COLORS[0]], [0x00ff00, AXIS_COLORS[1]], [0x0000ff, AXIS_COLORS[2]]]);
    const done = new Set<THREE.Material>();
    gizmoHelper.traverse((node) => {
      const mat = (node as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
      if (!mat || Array.isArray(mat) || !mat.color || done.has(mat)) return;
      done.add(mat);
      const to = swap.get(mat.color.getHex());
      if (to) mat.color.set(to);
    });
  }

  // Display modes for camera matching
  const wireMat = new THREE.MeshBasicMaterial({ color: '#39f3ff', wireframe: true });
  const depthMat = new THREE.MeshBasicMaterial({ colorWrite: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const edgeMat = new THREE.LineBasicMaterial({ color: '#39f3ff' });
  const edgesGroup = new THREE.Group();
  edgesGroup.visible = false;
  scene.add(edgesGroup);
  let edgeLines: { mesh: THREE.Mesh; line: THREE.LineSegments }[] = [];
  let display: DisplayMode = 'solid';
  /** Camera used in mock-up / match views (ref px pinhole) and the visible window of the ref image. */
  let matchCam: Cam | null = null;
  let viewRect: ViewRect | null = null;

  let asset: ShowcaseAsset | null = null;
  let variant: ShowcaseVariant | null = null;
  let root: THREE.Object3D | null = null;
  const bases = new Map<string, Base>();
  const objects = new Map<string, THREE.Object3D>();
  let state: EditState = { parts: [] };
  let history: string[] = [];
  let index = -1;
  let selected: string | null = null;
  let view: ViewMode = 'orbit';
  let snap = true;
  let gizmoMode: GizmoMode = 'translate';
  let disposed = false;
  let loadToken = 0;
  // Original (untinted) material per mesh, and which meshes carry a tinted clone.
  // Kept out of userData so clone()/GLTFExporter never copy or serialise them.
  const origMat = new WeakMap<THREE.Mesh, THREE.Material | THREE.Material[]>();
  const tinted = new WeakSet<THREE.Mesh>();

  function disposeTree(tree: THREE.Object3D): void {
    tree.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      originalGeometry(mesh)?.dispose();
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const orig = origMat.get(mesh);
      if (orig && orig !== mesh.material) list.push(...(Array.isArray(orig) ? orig : [orig]));
      for (const mat of list) {
        (mat as THREE.MeshStandardMaterial).map?.dispose();
        mat.dispose();
      }
    });
  }

  // ---------- render ----------
  let queued = false;
  function render(): void {
    if (queued || disposed) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      if (disposed) return;
      const w = canvas.clientWidth || 1;
      const h = canvas.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      const matched = view !== 'orbit' && asset?.ref;
      if (matched) {
        const ref = asset!.ref!;
        const cam = matchCam ?? camFromMatched(ref.camera, ref.width, ref.height);
        // Fallback window: the whole crop, letterboxed to the canvas aspect.
        let rect = viewRect;
        if (!rect) {
          const a = w / h;
          const rw = ref.width / ref.height > a ? ref.width : ref.height * a;
          const rh = rw / a;
          rect = { x0: (ref.width - rw) / 2, y0: (ref.height - rh) / 2, w: rw, h: rh };
        }
        applyToCamera(camera, cam, rect);
        // TransformControls sizes the gizmo from camera.fov, which the off-axis window ignores: scale it so it keeps
        // the orbit view's on-screen size at any 2D zoom (otherwise it grows with the zoom and covers the part).
        gizmo.setSize(GIZMO_SIZE * rect.h / (2 * cam.f * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)));
      } else {
        camera.updateProjectionMatrix();
        gizmo.setSize(GIZMO_SIZE);
      }
      if (selected && objects.get(selected)?.visible) {
        box.setFromObject(objects.get(selected)!);
        box.visible = true;
      } else box.visible = false;
      draw();
    });
  }

  function draw(): void {
    if (display === 'solid' || view === 'orbit') {
      edgesGroup.visible = false;
      renderer.render(scene, camera);
      return;
    }
    const helpers = [box, gizmoHelper, grid, marker, cursorMark, axisLine];
    const shown = helpers.map((h) => h.visible);
    for (const h of helpers) h.visible = false;
    if (display === 'edges') syncEdges();
    // pass 1: model (wireframe colour, or depth only for hidden-line edges)
    scene.overrideMaterial = display === 'wire' ? wireMat : depthMat;
    edgesGroup.visible = false;
    renderer.render(scene, camera);
    scene.overrideMaterial = null;
    // pass 2: edges + helpers on top
    renderer.autoClear = false;
    holder.visible = false;
    edgesGroup.visible = display === 'edges';
    helpers.forEach((h, i) => (h.visible = shown[i]!));
    renderer.render(scene, camera);
    holder.visible = true;
    edgesGroup.visible = false;
    renderer.autoClear = true;
  }

  function visibleChain(node: THREE.Object3D): boolean {
    for (let n: THREE.Object3D | null = node; n; n = n.parent) if (!n.visible) return false;
    return true;
  }
  function syncEdges(): void {
    if (!edgeLines.length && root) {
      root.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        const line = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 25), edgeMat);
        line.matrixAutoUpdate = false;
        edgeLines.push({ mesh, line });
        edgesGroup.add(line);
      });
    }
    root?.updateMatrixWorld(true);
    for (const { mesh, line } of edgeLines) {
      line.matrix.copy(mesh.matrixWorld);
      line.matrixWorld.copy(mesh.matrixWorld);
      line.visible = !!mesh.parent && visibleChain(mesh);
    }
  }
  function clearEdges(): void {
    for (const { line } of edgeLines) {
      line.geometry.dispose();
      line.removeFromParent();
    }
    edgeLines = [];
  }
  orbit.addEventListener('change', render);
  gizmo.addEventListener('change', render);
  gizmo.addEventListener('dragging-changed', (event) => {
    orbit.enabled = view === 'orbit' && !event.value;
    if (event.value) {
      if (pivotMode) beginPivotDrag();
    } else if (pivotMode) endPivotDrag();
    else readGizmo();
  });
  gizmo.addEventListener('objectChange', () => {
    if (pivotMode && gizmo.dragging) snapPivot();
    emit();
  });
  const observer = new ResizeObserver(render);
  observer.observe(canvas);

  function setOrbitCamera(): void {
    const o = asset?.orbit ?? { target: 0.3, distance: 1.7, height: 0.9 };
    const yaw = 0.7;
    camera.fov = 32;
    camera.up.set(0, 1, 0);
    camera.position.set(Math.sin(yaw) * o.distance, o.height, Math.cos(yaw) * o.distance);
    orbit.target.set(0, o.target, 0);
    camera.lookAt(orbit.target);
    orbit.update();
  }

  function setView(next: ViewMode): void {
    view = next;
    const ref = asset?.ref;
    if (next !== 'orbit' && ref) {
      orbit.enabled = false;
      grid.visible = false;
      // transparent: the mock-up image sits under the canvas
      scene.background = null;
      renderer.setClearColor(0x000000, 0);
    } else {
      view = 'orbit';
      orbit.enabled = true;
      grid.visible = true;
      scene.background = new THREE.Color('#22303d');
      setOrbitCamera();
    }
    render();
  }

  // ---------- state ----------
  function current(name: string): PartState | undefined {
    return state.parts.find((p) => p.name === name);
  }

  function partsOf(scene: THREE.Object3D): THREE.Object3D[] {
    // Descend through single-child wrappers (glTF scene → root empty) to the list of parts.
    let node: THREE.Object3D = scene;
    while (node.children.length === 1 && !(node as THREE.Mesh).isMesh && node.children[0]!.children.length > 0) {
      node = node.children[0]!;
    }
    return node.children.length ? node.children : [node];
  }

  function makeBase(object: THREE.Object3D): Base {
    const position = vec(object.position);
    const rotation = vec(object.rotation, DEG, 3);
    const scale = vec(object.scale);
    const saved = { p: object.position.clone(), q: object.quaternion.clone(), s: object.scale.clone() };
    object.position.set(0, 0, 0);
    object.quaternion.identity();
    object.scale.set(1, 1, 1);
    const parent = object.parent;
    object.parent = null;
    object.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(object, true).getSize(new THREE.Vector3());
    object.parent = parent;
    object.position.copy(saved.p);
    object.quaternion.copy(saved.q);
    object.scale.copy(saved.s);
    const materials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    object.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) materials.set(mesh, mesh.material);
    });
    const template = object.clone(true);
    template.position.set(0, 0, 0);
    template.quaternion.identity();
    template.scale.set(1, 1, 1);
    template.updateMatrixWorld(true);
    registerPart(object);
    return { object, position, rotation, scale, size: vec(size), materials, before: null, template, box: localBox(template), targets: null };
  }

  function initialState(): EditState {
    return {
      parts: [...bases.entries()].map(([name, b]) => ({
        name,
        source: name,
        position: [...b.position],
        rotation: [...b.rotation],
        scale: [...b.scale],
        hidden: false,
        deleted: false,
        color: null,
      })),
    };
  }

  function setColor(object: THREE.Object3D, base: Base, color: string | null): void {
    object.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const orig = base.materials.get(mesh) ?? origMat.get(mesh) ?? mesh.material;
      origMat.set(mesh, orig);
      if (!color) {
        if (tinted.has(mesh)) (mesh.material as THREE.Material).dispose();
        mesh.material = orig;
        tinted.delete(mesh);
        return;
      }
      if (!tinted.has(mesh)) {
        const src = Array.isArray(orig) ? orig[0]! : orig;
        const tint = src.clone() as THREE.MeshStandardMaterial;
        // Flat colour: drop the baked texture / vertex colours so the picked colour reads as-is.
        tint.map = null;
        tint.vertexColors = false;
        tint.needsUpdate = true;
        mesh.material = tint;
        tinted.add(mesh);
      }
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (mat.color) mat.color.set(color);
    });
  }

  function apply(next: EditState): void {
    state = next;
    if (!root) return;
    const parent = bases.values().next().value?.object.parent ?? root;
    const wanted = new Set(state.parts.map((p) => p.name));
    for (const [name, obj] of objects) {
      if (!wanted.has(name)) {
        obj.removeFromParent();
        objects.delete(name);
      }
    }
    let swapped = false;
    for (const part of state.parts) {
      let obj = objects.get(part.name);
      const base = bases.get(part.source);
      if (!base) continue;
      if (!obj) {
        obj = base.template.clone(true);
        obj.name = part.name;
        registerPart(obj);
        // clone() shares materials with the source; point copies at the untinted originals.
        const srcMeshes: THREE.Mesh[] = [];
        base.object.traverse((c) => { if ((c as THREE.Mesh).isMesh) srcMeshes.push(c as THREE.Mesh); });
        let k = 0;
        obj.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (!mesh.isMesh) return;
          const src = srcMeshes[k++];
          const orig = src ? base.materials.get(src) ?? origMat.get(src) ?? src.material : mesh.material;
          mesh.material = orig;
          origMat.set(mesh, orig);
        });
        parent.add(obj);
        objects.set(part.name, obj);
      }
      obj.position.fromArray(part.position);
      obj.rotation.set(part.rotation[0] / DEG, part.rotation[1] / DEG, part.rotation[2] / DEG);
      obj.scale.fromArray(part.scale);
      obj.visible = !part.hidden && !part.deleted;
      setColor(obj, base, part.color);
      if (applyPivot(obj, part.pivot)) swapped = true;
    }
    if (swapped) clearEdges();
    if (selected && !objects.get(selected)?.visible) selected = null;
    attach();
    save();
    emit();
    render();
  }

  function attach(): void {
    const obj = selected ? objects.get(selected) : undefined;
    if (!obj || !obj.visible || modal) gizmo.detach();
    else if (pivotMode) {
      placeHandle(obj);
      gizmo.attach(handle);
    } else gizmo.attach(obj);
  }

  // ---------- pivot (origin) editing ----------
  // With Affect Only Origins the gizmo drives a stand-in at the part's origin (same orientation as the part); on release the
  // part's pivot moves there and the node position shifts so the mesh stays where it was.
  const handle = new THREE.Object3D();
  scene.add(handle);
  let pivotMode = false;
  let pivotSnapKind: SnapKind | null = null;
  let altDown = false;
  let lastPointer = 'mouse';
  let drag: { start: THREE.Vector3; world: Float32Array; screen: Float32Array; kinds: Uint8Array } | null = null;
  const SNAP_COLORS: Record<SnapKind, string> = { vertex: '#ff4fd8', edge: '#39f3ff', face: '#7dff6a', bbox: '#ffe14d', grid: '#ffffff' };
  const marker = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3)),
    new THREE.PointsMaterial({ size: 30, sizeAttenuation: false, depthTest: false, transparent: true, map: ringTexture() }),
  );
  marker.renderOrder = 12;
  marker.visible = false;
  marker.frustumCulled = false;
  scene.add(marker);
  function ringTexture(): THREE.Texture | null {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    if (!g) return null;
    g.lineWidth = 9;
    g.strokeStyle = '#000';
    g.beginPath();
    g.arc(32, 32, 24, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 5;
    g.strokeStyle = '#fff';
    g.stroke();
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(32, 32, 5, 0, Math.PI * 2);
    g.fill();
    return new THREE.CanvasTexture(c);
  }
  function placeHandle(obj: THREE.Object3D): void {
    obj.updateWorldMatrix(true, false);
    obj.matrixWorld.decompose(handle.position, handle.quaternion, new THREE.Vector3());
    handle.scale.set(1, 1, 1);
    handle.updateMatrixWorld(true);
  }
  function toScreen(v: THREE.Vector3): [number, number] {
    const p = v.clone().project(camera);
    return [((p.x + 1) / 2) * canvas.clientWidth, ((1 - p.y) / 2) * canvas.clientHeight];
  }
  function syncGridSnap(): void {
    gizmo.setTranslationSnap(snap && !altDown ? 0.005 : null);
  }
  function beginPivotDrag(): void {
    const part = selected ? current(selected) : undefined;
    const obj = selected ? objects.get(selected) : undefined;
    const base = part ? bases.get(part.source) : undefined;
    if (!part || !obj || !base) return;
    base.targets ??= snapTargets(base.template);
    const t = base.targets;
    obj.updateWorldMatrix(true, false);
    const pv = part.pivot ?? ZERO;
    const m = obj.matrixWorld.clone().multiply(new THREE.Matrix4().makeTranslation(-pv[0], -pv[1], -pv[2]));
    const n = t.kinds.length;
    const world = new Float32Array(n * 3);
    const screen = new Float32Array(n * 2);
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.fromArray(t.points, i * 3).applyMatrix4(m);
      v.toArray(world, i * 3);
      const p = v.project(camera);
      // behind the camera → never matches
      screen[i * 2] = p.z > 1 ? 1e9 : ((p.x + 1) / 2) * canvas.clientWidth;
      screen[i * 2 + 1] = ((1 - p.y) / 2) * canvas.clientHeight;
    }
    drag = { start: handle.position.clone(), world, screen, kinds: t.kinds };
    pivotSnapKind = null;
  }
  /** During a pivot drag: snap the stand-in to the nearest target on screen (kept on the dragged axis / plane). */
  function snapPivot(): void {
    marker.visible = false;
    if (!drag) return;
    if (!snap || altDown) {
      pivotSnapKind = null;
      return;
    }
    const idx = nearestOnScreen(drag.screen, toScreen(handle.position), lastPointer === 'mouse' ? 14 : 24);
    if (idx < 0) {
      pivotSnapKind = 'grid';
      return;
    }
    const target = new THREE.Vector3().fromArray(drag.world, idx * 3);
    const axis = gizmo.axis ?? 'XYZ';
    const dirs = { X: new THREE.Vector3(1, 0, 0), Y: new THREE.Vector3(0, 1, 0), Z: new THREE.Vector3(0, 0, 1) };
    const along = (k: 'X' | 'Y' | 'Z') => dirs[k].clone().applyQuaternion(handle.quaternion);
    const next = target.clone();
    if (axis === 'X' || axis === 'Y' || axis === 'Z') {
      const d = along(axis);
      next.copy(drag.start).addScaledVector(d, target.clone().sub(drag.start).dot(d));
    } else if (axis === 'XY' || axis === 'YZ' || axis === 'XZ') {
      const normal = along((['X', 'Y', 'Z'] as const).find((k) => !axis.includes(k))!);
      next.addScaledVector(normal, -target.clone().sub(drag.start).dot(normal));
    }
    handle.position.copy(next);
    handle.updateMatrixWorld(true);
    marker.position.copy(target);
    marker.updateMatrixWorld(true);
    pivotSnapKind = SNAP_KINDS[drag.kinds[idx]!]!;
    (marker.material as THREE.PointsMaterial).color.set(SNAP_COLORS[pivotSnapKind]);
    marker.visible = true;
  }
  function endPivotDrag(): void {
    drag = null;
    marker.visible = false;
    const moved = selected ? objects.get(selected) : undefined;
    if (!moved) return;
    moved.updateWorldMatrix(true, false);
    const origin = new THREE.Vector3().setFromMatrixPosition(moved.matrixWorld);
    if (origin.distanceTo(handle.position) < 1e-7) {
      emit();
      return;
    }
    setPivotWorld(handle.position.clone());
  }
  /** Move the selected part's pivot (local m, GLB frame) keeping its mesh in place. Undoable. */
  function setPivotLocal(p: Vec3): void {
    if (!selected || !p.every(Number.isFinite)) return;
    const name = selected;
    change((draft) => {
      const part = draft.parts.find((q) => q.name === name);
      if (!part) return;
      const next: Vec3 = [r3(p[0], 6), r3(p[1], 6), r3(p[2], 6)];
      part.position = shiftedPosition(part.position, part.rotation, part.scale, part.pivot ?? ZERO, next).map((v) => r3(v, 6)) as Vec3;
      if (isZero(next)) delete part.pivot;
      else part.pivot = next;
    });
  }
  /** Move the selected part's pivot to a world point. */
  function setPivotWorld(world: THREE.Vector3): void {
    const part = selected ? current(selected) : undefined;
    const obj = selected ? objects.get(selected) : undefined;
    if (!part || !obj) return;
    obj.updateWorldMatrix(true, false);
    const local = obj.worldToLocal(world.clone());
    const pv = part.pivot ?? ZERO;
    setPivotLocal([local.x + pv[0], local.y + pv[1], local.z + pv[2]]);
  }
  const onKeyAlt = (event: KeyboardEvent) => {
    if (modal && (event.key === 'Control' || event.key === 'Shift')) {
      modal.ctrl = event.ctrlKey;
      modal.shift = event.shiftKey;
      modalUpdate();
    }
    if (event.key !== 'Alt' || altDown === (event.type === 'keydown')) return;
    altDown = event.type === 'keydown';
    syncGridSnap();
    if (altDown && drag) {
      marker.visible = false;
      pivotSnapKind = null;
      render();
    }
  };
  const onBlurAlt = () => {
    altDown = false;
    syncGridSnap();
  };
  window.addEventListener('keydown', onKeyAlt);
  window.addEventListener('keyup', onKeyAlt);
  window.addEventListener('blur', onBlurAlt);
  // Alt state from pointer events too (keyup can be lost when the window loses focus mid-drag)
  const onPointerAlt = (event: PointerEvent) => {
    lastPointer = event.pointerType || 'mouse';
    if (event.altKey !== altDown) {
      altDown = event.altKey;
      syncGridSnap();
    }
  };
  canvas.addEventListener('pointerdown', onPointerAlt, { capture: true });
  canvas.addEventListener('pointermove', onPointerAlt, { capture: true });


  // ---------- 3D cursor (Blender) ----------
  // A world point used by "Origin to 3D Cursor"; Shift+right-click (or the Place 3D Cursor tool + tap) places it on
  // the surface under the pointer, Shift+C puts it back at the world origin.
  const cursor = new THREE.Vector3();
  let cursorTool = false;
  const cursorMark = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3)),
    new THREE.PointsMaterial({ size: 34, sizeAttenuation: false, depthTest: false, transparent: true, map: cursorTexture() }),
  );
  cursorMark.renderOrder = 13;
  cursorMark.frustumCulled = false;
  scene.add(cursorMark);
  function cursorTexture(): THREE.Texture | null {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    if (!g) return null;
    // Blender's cursor: a red / white dashed ring with black cross-hair ticks
    g.lineWidth = 5;
    for (let i = 0; i < 8; i++) {
      g.strokeStyle = i % 2 ? '#ffffff' : '#ff2a2a';
      g.beginPath();
      g.arc(32, 32, 17, (i * Math.PI) / 4, ((i + 1) * Math.PI) / 4);
      g.stroke();
    }
    g.strokeStyle = '#000';
    g.lineWidth = 3;
    g.beginPath();
    for (const [x0, y0, x1, y1] of [[2, 32, 12, 32], [52, 32, 62, 32], [32, 2, 32, 12], [32, 52, 32, 62]]) {
      g.moveTo(x0!, y0!);
      g.lineTo(x1!, y1!);
    }
    g.stroke();
    return new THREE.CanvasTexture(c);
  }
  function setCursor(v: THREE.Vector3): void {
    cursor.copy(v);
    cursorMark.position.copy(v);
    cursorMark.updateMatrixWorld(true);
    emit();
    render();
  }
  /** Ray through a client point, with the view's camera (mock-up / match windows included). */
  function rayAt(clientX: number, clientY: number): THREE.Ray {
    const rect = canvas.getBoundingClientRect();
    camera.updateMatrixWorld();
    ray.setFromCamera(
      new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1),
      camera,
    );
    return ray.ray.clone();
  }
  /** Place the 3D cursor on the visible surface under a client point (else on the view plane through the cursor). */
  function placeCursorAt(clientX: number, clientY: number): boolean {
    const r = rayAt(clientX, clientY);
    root?.updateMatrixWorld(true);
    const hit = ray.intersectObjects([...objects.values()].filter((o) => o.visible), true)[0];
    if (hit) {
      setCursor(hit.point.clone());
      return true;
    }
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), cursor);
    const p = r.intersectPlane(plane, new THREE.Vector3());
    if (p) setCursor(p);
    return !!p;
  }

  // ---------- Blender-style modal transforms: G / R / S ----------
  // The mouse drives the value, X / Y / Z constrain it (twice = local axes), typed numbers override the mouse,
  // Ctrl toggles snapping, Shift slows the mouse down; click / Enter confirms, right-click / Esc cancels.
  type Modal = {
    kind: ModalKind;
    origins: boolean;
    name: string;
    /** State JSON at the start (cancel restores it; confirm adds one undo step). */
    start: string;
    part: PartState;
    pos0: THREE.Vector3;
    quat0: THREE.Quaternion;
    parentInv: THREE.Matrix4;
    parentQuat: THREE.Quaternion;
    objInv: THREE.Matrix4;
    /** Origin on screen, client px. */
    center: [number, number];
    m0: [number, number];
    /** Mouse position with precision (Shift) applied, client px. */
    virt: [number, number];
    last: [number, number];
    /** Accumulated screen angle (rotate), radians. */
    angle: number;
    constraint: Constraint;
    num: NumInput;
    ctrl: boolean;
    shift: boolean;
    values: number[];
  };
  let modal: Modal | null = null;
  let lastMouse: [number, number] | null = null;
  let swallowUp = false;
  const axisLine = new THREE.Line(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3)),
    new THREE.LineBasicMaterial({ depthTest: false, transparent: true }),
  );
  axisLine.renderOrder = 11;
  axisLine.visible = false;
  axisLine.frustumCulled = false;
  scene.add(axisLine);
  const onMouseTrack = (event: PointerEvent) => {
    if (event.pointerType === 'mouse') lastMouse = [event.clientX, event.clientY];
  };
  window.addEventListener('pointermove', onMouseTrack, { capture: true, passive: true });

  function axisDir(m: Modal, c: NonNullable<Constraint>): THREE.Vector3 {
    const d = new THREE.Vector3().setComponent(c.axis, 1);
    return c.space === 'local' ? d.applyQuaternion(m.quat0) : d;
  }
  /** Part-local axis (0..2) closest to a world axis — scaling is always along the part's own axes. */
  function dominantAxis(q: THREE.Quaternion, axis: 0 | 1 | 2): 0 | 1 | 2 {
    const w = new THREE.Vector3().setComponent(axis, 1);
    let best: 0 | 1 | 2 = axis;
    let bd = -1;
    for (const i of [0, 1, 2] as const) {
      const d = Math.abs(new THREE.Vector3().setComponent(i, 1).applyQuaternion(q).dot(w));
      if (d > bd + 1e-9) {
        bd = d;
        best = i;
      }
    }
    return best;
  }
  function startModal(kind: ModalKind): boolean {
    if (modal) endModal(false);
    const name = selected;
    const obj = name ? objects.get(name) : undefined;
    const part = name ? current(name) : undefined;
    if (!name || !obj?.visible || !part || !obj.parent) return false;
    const origins = pivotMode;
    if (origins && kind !== 'grab') return false;
    obj.updateWorldMatrix(true, false);
    const pos0 = new THREE.Vector3();
    const quat0 = new THREE.Quaternion();
    obj.matrixWorld.decompose(pos0, quat0, new THREE.Vector3());
    const parentQuat = new THREE.Quaternion();
    obj.parent.matrixWorld.decompose(new THREE.Vector3(), parentQuat, new THREE.Vector3());
    const rect = canvas.getBoundingClientRect();
    camera.updateMatrixWorld();
    const s = toScreen(pos0);
    const center: [number, number] = [s[0] + rect.left, s[1] + rect.top];
    let m0: [number, number] = lastMouse ? [...lastMouse] : [rect.left + rect.width / 2, rect.top + rect.height / 2];
    // rotate / scale read the mouse around the origin: start a little away from it
    if (kind !== 'grab' && Math.hypot(m0[0] - center[0], m0[1] - center[1]) < 16) m0 = [center[0] + 80, center[1]];
    modal = {
      kind,
      origins,
      name,
      start: JSON.stringify(state),
      part: structuredClone(part),
      pos0,
      quat0,
      parentInv: obj.parent.matrixWorld.clone().invert(),
      parentQuat,
      objInv: obj.matrixWorld.clone().invert(),
      center,
      m0,
      virt: [...m0],
      last: [...m0],
      angle: 0,
      constraint: null,
      num: new NumInput(),
      ctrl: false,
      shift: false,
      values: kind === 'scale' ? [1] : kind === 'rotate' ? [0] : [0, 0, 0],
    };
    gizmo.detach();
    marker.visible = false;
    orbit.enabled = false;
    window.addEventListener('pointermove', modalMove, true);
    window.addEventListener('pointerdown', modalDown, true);
    modalUpdate();
    return true;
  }
  /** Finish the modal: true = confirm (one undo step), false = cancel (restore), null = drop (model reload). */
  function endModal(confirm: boolean | null): void {
    const m = modal;
    if (!m) return;
    modal = null;
    window.removeEventListener('pointermove', modalMove, true);
    window.removeEventListener('pointerdown', modalDown, true);
    axisLine.visible = false;
    orbit.enabled = view === 'orbit';
    if (confirm === null) return;
    if (confirm && JSON.stringify(state) !== m.start) commit();
    else apply(JSON.parse(m.start) as EditState);
    attach();
    emit();
    render();
  }
  function modalUpdate(): void {
    const m = modal;
    if (!m) return;
    const typed = m.num.value();
    const snapping = snap !== m.ctrl;
    const draft = JSON.parse(m.start) as EditState;
    const part = draft.parts.find((q) => q.name === m.name);
    if (!part) return;
    const c = m.constraint;
    if (m.kind === 'grab') {
      const delta = new THREE.Vector3();
      if (typed !== null) delta.copy(c ? axisDir(m, c) : new THREE.Vector3(1, 0, 0)).multiplyScalar(typed);
      else {
        const r0 = rayAt(m.m0[0], m.m0[1]);
        const r1 = rayAt(m.virt[0], m.virt[1]);
        if (c) {
          const d = axisDir(m, c);
          const t0 = closestOnLine(r0.origin, r0.direction, m.pos0, d);
          const t1 = closestOnLine(r1.origin, r1.direction, m.pos0, d);
          if (t0 !== null && t1 !== null) delta.copy(d).multiplyScalar(snapping ? snapTo(t1 - t0, 0.005) : t1 - t0);
        } else {
          const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), m.pos0);
          const p0 = r0.intersectPlane(plane, new THREE.Vector3());
          const p1 = r1.intersectPlane(plane, new THREE.Vector3());
          if (p0 && p1) delta.subVectors(p1, p0);
          if (snapping) delta.set(snapTo(delta.x, 0.005), snapTo(delta.y, 0.005), snapTo(delta.z, 0.005));
        }
      }
      m.values = c ? [delta.dot(axisDir(m, c))] : typed !== null ? [typed] : [delta.x, delta.y, delta.z];
      const w = m.pos0.clone().add(delta);
      if (m.origins) {
        const local = w.applyMatrix4(m.objInv);
        const pv = m.part.pivot ?? ZERO;
        const next: Vec3 = [r3(local.x + pv[0], 6), r3(local.y + pv[1], 6), r3(local.z + pv[2], 6)];
        part.position = shiftedPosition(m.part.position, m.part.rotation, m.part.scale, pv, next).map((v) => r3(v, 6)) as Vec3;
        if (isZero(next)) delete part.pivot;
        else part.pivot = next;
      } else part.position = vec(w.applyMatrix4(m.parentInv), 1, 5);
    } else if (m.kind === 'rotate') {
      const toCam = camera.position.clone().sub(m.pos0).normalize();
      const axis = c ? axisDir(m, c) : camera.getWorldDirection(new THREE.Vector3()).negate();
      let angle = typed !== null ? typed / DEG : rotationFromScreen(m.angle, axis, toCam);
      if (typed === null && snapping) angle = snapTo(angle, 15 / DEG);
      m.values = [r3(angle * DEG, 3)];
      const q = new THREE.Quaternion().setFromAxisAngle(axis, angle).multiply(m.quat0);
      const local = m.parentQuat.clone().invert().multiply(q);
      part.rotation = vec(new THREE.Euler().setFromQuaternion(local, 'XYZ'), DEG, 3);
    } else {
      let f = typed ?? screenScale(m.center, m.m0, m.virt);
      if (typed === null && snapping) f = snapTo(f, 0.1);
      m.values = [r3(f, 4)];
      const sc = [...m.part.scale] as Vec3;
      if (c) {
        const i = c.space === 'local' ? c.axis : dominantAxis(m.quat0, c.axis);
        sc[i] *= f;
      } else for (const i of [0, 1, 2] as const) sc[i] *= f;
      part.scale = sc.map((v) => r3(v, 5)) as Vec3;
    }
    if (c) {
      const d = axisDir(m, c);
      const pos = axisLine.geometry.getAttribute('position') as THREE.BufferAttribute;
      const a = m.pos0.clone().addScaledVector(d, -50);
      const b = m.pos0.clone().addScaledVector(d, 50);
      pos.setXYZ(0, a.x, a.y, a.z);
      pos.setXYZ(1, b.x, b.y, b.z);
      pos.needsUpdate = true;
      (axisLine.material as THREE.LineBasicMaterial).color.set(AXIS_COLORS[c.axis]);
      axisLine.visible = true;
    } else axisLine.visible = false;
    apply(draft); // live preview, no undo step until confirmed
  }
  function modalMove(event: PointerEvent): void {
    const m = modal;
    if (!m) return;
    m.ctrl = event.ctrlKey;
    m.shift = event.shiftKey;
    const k = m.shift ? 0.1 : 1;
    const prev = m.virt;
    m.virt = [prev[0] + (event.clientX - m.last[0]) * k, prev[1] + (event.clientY - m.last[1]) * k];
    m.last = [event.clientX, event.clientY];
    if (m.kind === 'rotate') m.angle += screenAngle(m.center, prev, m.virt);
    if (!m.num.active) modalUpdate();
  }
  function modalDown(event: PointerEvent): void {
    if (!modal) return;
    event.preventDefault();
    event.stopPropagation();
    swallowUp = true;
    if (event.button === 0) endModal(true);
    else if (event.button === 2) endModal(false);
    else swallowUp = false;
  }
  // the confirming / cancelling click's pointerup arrives after the modal ended
  const onUpAfterModal = (event: PointerEvent) => {
    if (!swallowUp) return;
    swallowUp = false;
    downAt = null;
    event.stopPropagation();
  };
  window.addEventListener('pointerup', onUpAfterModal, true);
  function modalInfo(): ModalInfo | null {
    const m = modal;
    if (!m) return null;
    return {
      kind: m.kind,
      origins: m.origins,
      axis: m.constraint ? AXIS_NAMES[m.constraint.axis] : null,
      space: m.constraint?.space ?? null,
      typed: m.num.active ? m.num.display() : null,
      values: m.values,
      snapping: snap !== m.ctrl,
      precision: m.shift,
    };
  }
  /** Keys while a modal runs (called by the view's key handler first); true = consumed. */
  function modalKey(event: KeyboardEvent): boolean {
    const m = modal;
    if (!m) return false;
    const key = event.key;
    const lower = key.length === 1 ? key.toLowerCase() : key;
    if (key === 'Escape') endModal(false);
    else if (key === 'Enter') endModal(true);
    else if ((lower === 'x' || lower === 'y' || lower === 'z') && !event.ctrlKey && !event.metaKey) {
      m.constraint = cycleConstraint(m.constraint, lower === 'x' ? 0 : lower === 'y' ? 1 : 2);
      modalUpdate();
    } else if ((lower === 'g' || lower === 'r' || lower === 's') && !event.ctrlKey && !event.metaKey) {
      const kind: ModalKind = lower === 'g' ? 'grab' : lower === 'r' ? 'rotate' : 'scale';
      if (kind !== m.kind && !(m.origins && kind !== 'grab')) startModal(kind);
    } else if (!event.ctrlKey && !event.metaKey && m.num.key(key === 'Decimal' ? '.' : key)) modalUpdate();
    event.preventDefault();
    return true;
  }

  function commit(): void {
    history = history.slice(0, index + 1);
    history.push(JSON.stringify(state));
    if (history.length > 200) history.shift();
    index = history.length - 1;
    save();
    emit();
  }

  function change(mutate: (draft: EditState) => void): void {
    const draft = structuredClone(state) as EditState;
    mutate(draft);
    apply(draft);
    commit();
  }

  function readGizmo(): void {
    if (!selected) return;
    const obj = objects.get(selected);
    if (!obj) return;
    const name = selected;
    change((draft) => {
      const part = draft.parts.find((p) => p.name === name);
      if (!part) return;
      part.position = vec(obj.position, 1, 5);
      part.rotation = vec(obj.rotation, DEG, 3);
      part.scale = vec(obj.scale, 1, 5);
    });
  }

  // ---------- persistence ----------
  /** Old drafts / files: drop malformed pivots (parts without one keep the GLB origin). */
  function migrate(s: EditState | null | undefined): EditState | null | undefined {
    return s && Array.isArray(s.parts) ? { ...s, parts: migrateParts(s.parts) } : s;
  }
  function fitsModel(s: EditState | null | undefined): s is EditState {
    return !!s && Array.isArray(s.parts) && s.parts.length > 0 && s.parts.every((p) => p && typeof p.name === 'string' && bases.has(p.source));
  }
  function storageKey(): string {
    return `kido-editor:${asset?.slug}:${variant?.id}`;
  }
  function save(): void {
    if (!asset || !variant || index < 0) return;
    try {
      if (index === 0 && history.length === 1) localStorage.removeItem(storageKey());
      else localStorage.setItem(storageKey(), JSON.stringify(state));
    } catch {
      /* storage full or blocked: editing still works */
    }
  }

  // ---------- snapshot for the UI ----------
  function emit(): void {
    const parts: PartInfo[] = state.parts.map((p) => ({
      name: p.name,
      source: p.source,
      hidden: p.hidden,
      deleted: p.deleted,
      copy: p.name !== p.source,
    }));
    let info: SelectedInfo | null = null;
    const obj = selected ? objects.get(selected) : undefined;
    obj?.updateWorldMatrix(true, true);
    const part = selected ? current(selected) : undefined;
    if (obj && part) {
      const base = bases.get(part.source)!;
      info = {
        name: part.name,
        positionCm: vec(obj.position, 100, 2),
        rotationDeg: vec(obj.rotation, DEG, 1),
        sizeCm: [
          r3(base.size[0] * obj.scale.x * 100, 2),
          r3(base.size[1] * obj.scale.y * 100, 2),
          r3(base.size[2] * obj.scale.z * 100, 2),
        ],
        hidden: part.hidden,
        color: part.color ?? baseColor(base),
        pivotLocalCm: vec(new THREE.Vector3(...(part.pivot ?? ZERO)), 100, 2),
        pivotWorldCm: vec(new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld), 100, 2),
        centerWorldCm: vec(new THREE.Box3().setFromObject(obj, true).getCenter(new THREE.Vector3()), 100, 2),
        pivotSet: !!part.pivot,
      };
    }
    onChange({
      ready: !!root,
      parts,
      selected: info,
      canUndo: index > 0,
      canRedo: index < history.length - 1,
      dirty: index >= 0 && history[index] !== history[0],
      pivotMode,
      cursorTool,
      cursorCm: vec(cursor, 100, 2),
      modal: modalInfo(),
      pivotSnap: pivotSnapKind,
    });
  }

  function baseColor(base: Base): string {
    const first = base.materials.values().next().value;
    const mat = (Array.isArray(first) ? first[0] : first) as THREE.MeshStandardMaterial | undefined;
    return mat?.color ? `#${mat.color.getHexString()}` : '#ffffff';
  }

  // ---------- picking ----------
  const ray = new THREE.Raycaster();
  let downAt: { x: number; y: number; t: number; onGizmo: boolean } | null = null;
  function pointerDown(event: PointerEvent): void {
    downAt = { x: event.clientX, y: event.clientY, t: performance.now(), onGizmo: gizmo.axis !== null };
  }
  function pointerUp(event: PointerEvent): void {
    if (!downAt || downAt.onGizmo || gizmo.dragging) return;
    const moved = Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y);
    downAt = null;
    if (moved > 8) return;
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    ray.setFromCamera(ndc, camera);
    if (cursorTool) {
      placeCursorAt(event.clientX, event.clientY);
      return;
    }
    const targets = [...objects.values()].filter((o) => o.visible);
    const hit = ray.intersectObjects(targets, true)[0];
    if (!hit) {
      select(null);
      return;
    }
    let node: THREE.Object3D | null = hit.object;
    while (node && !targets.includes(node)) node = node.parent;
    select(node ? node.name : null);
  }
  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointerup', pointerUp);

  function select(name: string | null): void {
    selected = name && objects.has(name) ? name : null;
    attach();
    emit();
    render();
  }

  function setSnap(on: boolean): void {
    snap = on;
    syncGridSnap();
    gizmo.setRotationSnap(on ? THREE.MathUtils.degToRad(15) : null);
    gizmo.setScaleSnap(on ? 0.05 : null);
  }
  setSnap(true);

  function uniqueName(base: string): string {
    let n = 1;
    while (state.parts.some((p) => p.name === `${base}_copy${n}`)) n += 1;
    return `${base}_copy${n}`;
  }

  // ---------- export ----------
  function exportRoot(): THREE.Object3D {
    const out = root!.clone(true);
    const drop: THREE.Object3D[] = [];
    out.traverse((node) => {
      const part = current(node.name);
      if (part?.deleted && objects.has(node.name)) drop.push(node);
      else if (part) node.visible = true;
    });
    for (const node of drop) node.removeFromParent();
    return out;
  }

  /** World-space box in Blender coordinates (Z-up, front = −Y), cm — same as box(x0,x1,y0,y1,z0,z1) in build_master.py. */
  function blenderBox(obj: THREE.Object3D): BlenderBox {
    obj.updateWorldMatrix(true, true);
    const b = new THREE.Box3().setFromObject(obj, true);
    const c = (v: number) => r3(v * 100, 2);
    return { x: [c(b.min.x), c(b.max.x)], y: [c(-b.max.z), c(-b.min.z)], z: [c(b.min.y), c(b.max.y)] };
  }

  return {
    /**
     * Load a variant. Its local draft (localStorage) wins; otherwise `baseline` (the committed
     * <variant>.edits.json state) becomes the starting point AND the bottom of the undo history,
     * so "no draft" always means "same as the source file".
     */
    async load(
      nextAsset: ShowcaseAsset,
      nextVariant: ShowcaseVariant,
      baseline?: EditState | null,
    ): Promise<{ restored: boolean; from: 'draft' | 'file' | null }> {
      const token = ++loadToken;
      const gltf = await new GLTFLoader().loadAsync(nextVariant.url);
      if (disposed || token !== loadToken) return { restored: false, from: null };
      if (root) {
        gizmo.detach();
        holder.remove(root);
        disposeTree(root);
      }
      clearEdges();
      asset = nextAsset;
      variant = nextVariant;
      root = gltf.scene;
      root.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh || !nextVariant.flat) return;
        for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          (mat as THREE.MeshStandardMaterial).flatShading = true;
          mat.needsUpdate = true;
        }
      });
      holder.add(root);
      root.updateMatrixWorld(true);
      bases.clear();
      objects.clear();
      for (const object of partsOf(root)) {
        if (!object.name) object.name = `part${bases.size + 1}`;
        const base = makeBase(object);
        base.before = blenderBox(object);
        bases.set(object.name, base);
        objects.set(object.name, object);
      }
      endModal(null);
      selected = null;
      drag = null;
      let start = initialState();
      let from: 'draft' | 'file' | null = null;
      baseline = migrate(baseline);
      if (baseline && fitsModel(baseline)) {
        start = structuredClone(baseline);
        from = 'file';
      }
      history = [JSON.stringify(start)];
      index = 0;
      let restored = false;
      try {
        const saved = localStorage.getItem(storageKey());
        if (saved) {
          const parsed = migrate(JSON.parse(saved) as EditState);
          if (fitsModel(parsed)) {
            apply(parsed);
            commit();
            restored = true;
            from = 'draft';
          }
        }
      } catch {
        /* ignore a broken save */
      }
      if (!restored) apply(start);
      setView(view);
      return { restored, from };
    },

    /** Current edit state (plain copy) — what <variant>.edits.json stores. */
    getState(): EditState {
      return structuredClone(state);
    },
    /** Replace the edit state (e.g. "revert to the source file"); undoable. */
    loadState(next: EditState): boolean {
      next = migrate(next) as EditState;
      if (!fitsModel(next)) return false;
      selected = null;
      apply(structuredClone(next));
      commit();
      attach();
      return true;
    },

    select,
    setMode(mode: GizmoMode): void {
      gizmoMode = mode;
      if (!pivotMode) gizmo.setMode(mode);
      render();
    },
    /**
     * Blender's Options > Transform > Affect Only Origins: the move gizmo and G move only the selected part's origin
     * (the mesh stays put); gizmo drags snap to the part's vertices / edge midpoints / face centres / box corners +
     * centre (and the grid) unless Alt is held. Rotating / scaling origins is not supported.
     */
    setPivotMode(on: boolean): void {
      if (modal) endModal(false);
      pivotMode = on;
      drag = null;
      marker.visible = false;
      gizmo.setMode(on ? 'translate' : gizmoMode);
      attach();
      emit();
      render();
    },
    get pivotMode(): boolean {
      return pivotMode;
    },
    /**
     * Blender "Set Origin" on the selected part: Origin to Geometry (bounds centre), Origin to 3D Cursor,
     * Geometry to Origin (moves the mesh so its bounds centre sits on the origin), plus Origin to Bottom (bottom
     * centre) and Reset Origin (back to the GLB origin). Undoable.
     */
    setOrigin(op: OriginOp): void {
      const part = selected ? current(selected) : undefined;
      const base = part ? bases.get(part.source) : undefined;
      if (!part || !base) return;
      pivotSnapKind = null;
      if (op === 'cursor') setPivotWorld(cursor.clone());
      else if (op === 'geometryToOrigin') {
        const name = part.name;
        const c = presetPivot('center', base.box);
        change((draft) => {
          const q = draft.parts.find((x) => x.name === name);
          if (!q) return;
          if (isZero(c)) delete q.pivot;
          else q.pivot = c;
        });
      } else setPivotLocal(presetPivot(op === 'geometry' ? 'center' : op, base.box));
    },
    /** 3D cursor (world, metres). */
    get cursor(): Vec3 {
      return [cursor.x, cursor.y, cursor.z];
    },
    setCursor(p: Vec3): void {
      setCursor(new THREE.Vector3(...p));
    },
    /** Shift+right-click / Place 3D Cursor tap: put the 3D cursor on the surface under a client point. */
    placeCursorAt,
    /** Shift+C: 3D cursor back to the world origin. */
    resetCursor(): void {
      setCursor(new THREE.Vector3());
    },
    /** The "Place 3D Cursor" tool (touch): taps place the cursor instead of selecting. */
    setCursorTool(on: boolean): void {
      cursorTool = on;
      emit();
    },
    get cursorTool(): boolean {
      return cursorTool;
    },
    /** G / R / S on the selected part (false if nothing to transform, or R / S with Affect Only Origins). */
    startModal,
    modalKey,
    get modalActive(): boolean {
      return !!modal;
    },
    cancelModal(): void {
      endModal(false);
    },
    /** Orbit view: Frame Selected (numpad . / F) or Frame All (Home) — aim the orbit at the part(s) and fit them. */
    frameOrbit(name: string | null): void {
      if (view !== 'orbit') return;
      const list = name ? [objects.get(name)].filter((o): o is THREE.Object3D => !!o?.visible) : [...objects.values()].filter((o) => o.visible);
      if (!list.length) return;
      const bb = new THREE.Box3();
      for (const o of list) bb.union(new THREE.Box3().setFromObject(o, true));
      if (bb.isEmpty()) return;
      const sphere = bb.getBoundingSphere(new THREE.Sphere());
      const dist = Math.max(0.15, (sphere.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov) / 2)) * 1.1);
      const dir = camera.position.clone().sub(orbit.target).normalize();
      orbit.target.copy(sphere.center);
      camera.position.copy(sphere.center).addScaledVector(dir, dist);
      camera.lookAt(orbit.target);
      orbit.update();
      render();
    },
    /** Orbit camera pose (test hook). */
    orbitPose(): { target: Vec3; position: Vec3 } {
      return { target: vec(orbit.target, 1, 4), position: vec(camera.position, 1, 4) };
    },
    /** Client point of the positive handle of the gizmo's X / Y / Z axis (move / scale arrows; test hook). */
    gizmoHandle(axis: 'X' | 'Y' | 'Z'): [number, number] | null {
      const g = (gizmo as unknown as { _gizmo?: { picker?: Record<string, THREE.Object3D> } })._gizmo;
      const group = g?.picker?.[gizmo.mode];
      const mesh = group?.children.find((c) => c.name === axis) as THREE.Mesh | undefined;
      if (!mesh || !gizmo.object) return null;
      gizmoHelper.updateMatrixWorld(true);
      mesh.geometry.computeBoundingBox();
      const c = mesh.geometry.boundingBox!.getCenter(new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
      const rect = canvas.getBoundingClientRect();
      const s = toScreen(c);
      return [s[0] + rect.left, s[1] + rect.top];
    },
    /** Pivot presets of the selected part: box centre, bottom centre, or back to the GLB origin. */
    pivotPreset(kind: PivotPreset): void {
      const part = selected ? current(selected) : undefined;
      const base = part ? bases.get(part.source) : undefined;
      if (!part || !base) return;
      pivotSnapKind = null;
      setPivotLocal(presetPivot(kind, base.box));
    },
    /** Set one pivot coordinate (cm): `local` = part axes relative to the GLB origin, `world` = scene axes. */
    setPivotValue(space: 'local' | 'world', axis: 0 | 1 | 2, cm: number): void {
      const part = selected ? current(selected) : undefined;
      const obj = selected ? objects.get(selected) : undefined;
      if (!part || !obj || !Number.isFinite(cm)) return;
      if (space === 'local') {
        const p = [...(part.pivot ?? ZERO)] as Vec3;
        p[axis] = cm / 100;
        setPivotLocal(p);
      } else {
        obj.updateWorldMatrix(true, false);
        const w = new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld);
        w.setComponent(axis, cm / 100);
        setPivotWorld(w);
      }
    },
    /** Screen points (canvas px) of the selected part's box centre and nearest-to-camera box corner — test hook. */
    pivotHints(): { center: [number, number]; corner: [number, number] } | null {
      const part = selected ? current(selected) : undefined;
      const obj = selected ? objects.get(selected) : undefined;
      const base = part ? bases.get(part.source) : undefined;
      if (!part || !obj || !base) return null;
      obj.updateWorldMatrix(true, false);
      const pv = part.pivot ?? ZERO;
      const m = obj.matrixWorld.clone().multiply(new THREE.Matrix4().makeTranslation(-pv[0], -pv[1], -pv[2]));
      const { min, max } = base.box;
      let best: THREE.Vector3 | null = null;
      let bd = Infinity;
      for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) {
        const w = new THREE.Vector3(x, y, z).applyMatrix4(m);
        const d = w.distanceTo(camera.position);
        if (d < bd) {
          bd = d;
          best = w;
        }
      }
      const c = new THREE.Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2).applyMatrix4(m);
      return { center: toScreen(c), corner: toScreen(best!) };
    },
    setSnap,
    get snap(): boolean {
      return snap;
    },
    setView,
    /** Camera for mock-up / match views (null = the asset's stored camera) and the visible ref-px window. */
    setMatch(cam: Cam | null, rect: ViewRect | null): void {
      matchCam = cam;
      viewRect = rect;
      render();
    },
    setDisplay(next: DisplayMode): void {
      display = next;
      render();
    },
    /**
     * Nearest mesh vertex under a screen point, in Blender world cm (X right, Y back, Z up), or null.
     * Used to tap model points for camera-match point pairs.
     */
    pickVertex(clientX: number, clientY: number): [number, number, number] | null {
      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      root?.updateMatrixWorld(true);
      ray.setFromCamera(ndc, camera);
      const targets = [...objects.values()].filter((o) => o.visible);
      const hit = ray.intersectObjects(targets, true)[0];
      if (!hit || !(hit.object as THREE.Mesh).isMesh) return null;
      const mesh = hit.object as THREE.Mesh;
      const pos = mesh.geometry.getAttribute('position');
      const v = new THREE.Vector3();
      const sp = new THREE.Vector3();
      let best: THREE.Vector3 | null = null;
      let bestD = Infinity;
      const w = rect.width / 2;
      const h = rect.height / 2;
      const want = new THREE.Vector2(clientX - rect.left, clientY - rect.top);
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        sp.copy(v).project(camera);
        const d = Math.hypot((sp.x + 1) * w - want.x, (1 - sp.y) * h - want.y);
        // prefer vertices close to the hit point in 3D (front side) and on screen
        const depthPenalty = v.distanceTo(hit.point) > 0.12 ? 1e3 : 0;
        if (d + depthPenalty < bestD) {
          bestD = d + depthPenalty;
          best = v.clone();
        }
      }
      if (!best || bestD > 60) best = hit.point.clone();
      return [r3(best.x * 100, 3), r3(-best.z * 100, 3), r3(best.y * 100, 3)];
    },
    /**
     * Mesh vertices (Blender cm) of one visible part, or of the whole visible model when `name` is null —
     * projected through the solved camera to frame it in the 2D stage (Focus). Decimated to ~`max` points.
     */
    pointsOf(name: string | null, max = 4000): [number, number, number][] {
      root?.updateMatrixWorld(true);
      const owners = name ? [objects.get(name)].filter((o): o is THREE.Object3D => !!o && o.visible) : [...objects.values()].filter((o) => o.visible);
      const meshes: THREE.Mesh[] = [];
      const shown = (n: THREE.Object3D, owner: THREE.Object3D): boolean => {
        for (let c: THREE.Object3D | null = n; c && c !== owner; c = c.parent) if (!c.visible) return false;
        return true;
      };
      for (const o of owners)
        o.traverse((n) => {
          if ((n as THREE.Mesh).isMesh && shown(n, o)) meshes.push(n as THREE.Mesh);
        });
      let total = 0;
      for (const m of meshes) total += m.geometry.getAttribute('position')?.count ?? 0;
      const stride = Math.max(1, Math.ceil(total / max));
      const out: [number, number, number][] = [];
      const v = new THREE.Vector3();
      for (const m of meshes) {
        const pos = m.geometry.getAttribute('position');
        if (!pos) continue;
        for (let i = 0; i < pos.count; i += stride) {
          v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
          out.push([v.x * 100, -v.z * 100, v.y * 100]);
        }
      }
      return out;
    },
    /** Name of the visible part under a screen point (same raycast as click-select), or null. */
    partAt(clientX: number, clientY: number): string | null {
      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      root?.updateMatrixWorld(true);
      ray.setFromCamera(ndc, camera);
      const targets = [...objects.values()].filter((o) => o.visible);
      const hit = ray.intersectObjects(targets, true)[0];
      if (!hit) return null;
      let node: THREE.Object3D | null = hit.object;
      while (node && !targets.includes(node)) node = node.parent;
      return node ? node.name : null;
    },
    /** Screen point (canvas px from its top-left) of the selected part's origin = where the gizmo sits; null if none. */
    selectedScreen(): [number, number] | null {
      const o = selected ? objects.get(selected) : undefined;
      if (!o) return null;
      root?.updateMatrixWorld(true);
      const p = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).project(camera);
      if (p.z > 1) return null;
      return [((p.x + 1) / 2) * canvas.clientWidth, ((1 - p.y) / 2) * canvas.clientHeight];
    },
    /** Model bounding box in Blender cm. */
    modelBox(): BlenderBox | null {
      if (!root) return null;
      const vis = [...objects.values()].filter((o) => o.visible);
      const b = new THREE.Box3();
      for (const o of vis) b.expandByObject(o, true);
      if (b.isEmpty()) return null;
      const c = (x: number) => r3(x * 100, 2);
      return { x: [c(b.min.x), c(b.max.x)], y: [c(-b.max.z), c(-b.min.z)], z: [c(b.min.y), c(b.max.y)] };
    },

    /** Set position (cm), rotation (deg) or size (cm) of the selected part. */
    setValue(kind: 'position' | 'rotation' | 'size', axis: 0 | 1 | 2, value: number): void {
      if (!selected || !Number.isFinite(value)) return;
      const name = selected;
      change((draft) => {
        const part = draft.parts.find((p) => p.name === name);
        if (!part) return;
        if (kind === 'position') part.position[axis] = r3(value / 100, 5);
        else if (kind === 'rotation') part.rotation[axis] = r3(value, 3);
        else {
          const base = bases.get(part.source)!;
          const s = base.size[axis] > 1e-6 ? value / 100 / base.size[axis] : 1;
          part.scale[axis] = r3(Math.max(s, 0.001), 5);
        }
      });
    },
    setColor(color: string | null): void {
      if (!selected) return;
      const name = selected;
      change((draft) => {
        const part = draft.parts.find((p) => p.name === name);
        if (part) part.color = color;
      });
    },
    toggleHidden(name: string): void {
      change((draft) => {
        const part = draft.parts.find((p) => p.name === name);
        if (part) part.hidden = !part.hidden;
      });
    },
    remove(name: string): void {
      change((draft) => {
        const part = draft.parts.find((p) => p.name === name);
        if (!part) return;
        if (part.name !== part.source) draft.parts = draft.parts.filter((p) => p !== part);
        else part.deleted = true;
      });
      if (selected === name) select(null);
    },
    restore(name: string): void {
      change((draft) => {
        const part = draft.parts.find((p) => p.name === name);
        if (part) part.deleted = false;
      });
    },
    /** Copy a part (offset 5 cm on X; Shift+D copies in place and starts a grab). */
    duplicate(name: string, offset = true): void {
      const part = current(name);
      if (!part) return;
      const copyName = uniqueName(part.source);
      change((draft) => {
        const idx = draft.parts.findIndex((p) => p.name === name);
        const copy: PartState = { ...structuredClone(part), name: copyName, hidden: false, deleted: false };
        if (offset) copy.position[0] = r3(copy.position[0] + 0.05, 5);
        draft.parts.splice(idx + 1, 0, copy);
      });
      select(copyName);
    },
    reset(): void {
      change((draft) => {
        draft.parts = initialState().parts;
      });
    },
    undo(): void {
      if (index <= 0) return;
      index -= 1;
      apply(JSON.parse(history[index]!) as EditState);
    },
    redo(): void {
      if (index >= history.length - 1) return;
      index += 1;
      apply(JSON.parse(history[index]!) as EditState);
    },

    async exportGlb(): Promise<Blob> {
      const out = exportRoot();
      const data = await new GLTFExporter().parseAsync(out, { binary: true });
      return new Blob([data as ArrayBuffer], { type: 'model/gltf-binary' });
    },

    /** Edits relative to the loaded GLB, for porting back into the Blender build scripts. */
    exportEdits(): object {
      root?.updateMatrixWorld(true);
      const parts = state.parts.map((part) => {
        const base = bases.get(part.source)!;
        const obj = objects.get(part.name);
        const changed =
          part.name !== part.source ||
          part.deleted ||
          part.color !== null ||
          !!part.pivot ||
          part.position.some((v, i) => Math.abs(v - base.position[i]!) > 1e-6) ||
          part.rotation.some((v, i) => Math.abs(v - base.rotation[i]!) > 1e-3) ||
          part.scale.some((v, i) => Math.abs(v - base.scale[i]!) > 1e-6);
        const visible = obj?.visible;
        if (obj) obj.visible = true;
        const after = obj && !part.deleted ? blenderBox(obj) : null;
        if (obj && visible !== undefined) obj.visible = visible;
        return {
          name: part.name,
          ...(part.name !== part.source ? { copyOf: part.source } : {}),
          changed,
          deleted: part.deleted,
          hidden: part.hidden,
          positionDeltaCm: part.position.map((v, i) => r3((v - base.position[i]!) * 100, 2)),
          rotationDeg: part.rotation,
          scale: part.scale,
          sizeCm: { before: base.size.map((v) => r3(v * 100, 2)), after: base.size.map((v, i) => r3(v * part.scale[i]! * 100, 2)) },
          color: part.color,
          ...(part.pivot ? { pivotCm: part.pivot.map((v) => r3(v * 100, 2)) } : {}),
          blenderBoxCm: { after } as Record<string, unknown>,
        };
      });
      for (const part of parts) (part.blenderBoxCm as Record<string, unknown>).before = bases.get(part.copyOf ?? part.name)?.before ?? null;
      return {
        format: 'kido-model-edits/1',
        asset: asset?.slug,
        variant: variant?.id,
        model: variant?.url.replace(/^.*\/models\//, 'models/'),
        savedAt: new Date().toISOString(),
        units: {
          positionDeltaCm: 'glTF / Three.js axes: x right, y up, z towards the front',
          pivotCm: 'origin moved from the GLB origin, part-local axes (the exported GLB already has it baked in)',
          blenderBoxCm: 'Blender axes (Z-up, front = -Y), world cm; maps to box(name, x0, x1, y0, y1, z0, z1) in blender/build_master.py',
        },
        summary: {
          deleted: parts.filter((p) => p.deleted).map((p) => p.name),
          added: parts.filter((p) => p.copyOf).map((p) => p.name),
          changed: parts.filter((p) => p.changed && !p.deleted && !p.copyOf).map((p) => p.name),
        },
        parts,
      };
    },

    dispose(): void {
      disposed = true;
      observer.disconnect();
      canvas.removeEventListener('pointerdown', pointerDown);
      canvas.removeEventListener('pointerup', pointerUp);
      canvas.removeEventListener('pointerdown', onPointerAlt, { capture: true });
      canvas.removeEventListener('pointermove', onPointerAlt, { capture: true });
      window.removeEventListener('keydown', onKeyAlt);
      window.removeEventListener('keyup', onKeyAlt);
      window.removeEventListener('blur', onBlurAlt);
      endModal(null);
      window.removeEventListener('pointermove', onMouseTrack, { capture: true });
      window.removeEventListener('pointerup', onUpAfterModal, true);
      cursorMark.geometry.dispose();
      (cursorMark.material as THREE.PointsMaterial).map?.dispose();
      (cursorMark.material as THREE.PointsMaterial).dispose();
      axisLine.geometry.dispose();
      (axisLine.material as THREE.LineBasicMaterial).dispose();
      marker.geometry.dispose();
      (marker.material as THREE.PointsMaterial).map?.dispose();
      (marker.material as THREE.PointsMaterial).dispose();
      gizmo.detach();
      gizmo.dispose();
      orbit.dispose();
      if (root) disposeTree(root);
      clearEdges();
      wireMat.dispose();
      depthMat.dispose();
      edgeMat.dispose();
      renderer.dispose();
    },
  };
}
