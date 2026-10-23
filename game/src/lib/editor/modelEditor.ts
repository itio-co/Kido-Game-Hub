import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { type ShowcaseAsset, type ShowcaseVariant } from '../showcaseAssets';
import type { Cam } from './camMath';
import { applyToCamera, camFromMatched, type ViewRect } from './cameraMatch';

export type Vec3 = [number, number, number];
export type GizmoMode = 'translate' | 'rotate' | 'scale';
export type ViewMode = 'orbit' | 'mock' | 'match';
/** How the model is drawn over the mock-up: shaded, wireframe, or outline/crease edges. */
export type DisplayMode = 'solid' | 'wire' | 'edges';

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
};

export type EditorSnapshot = {
  ready: boolean;
  parts: PartInfo[];
  selected: SelectedInfo | null;
  canUndo: boolean;
  canRedo: boolean;
  dirty: boolean;
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
  const gizmo = new TransformControls(camera, canvas);
  gizmo.setSize(1.25);
  gizmo.setSpace('local');
  const gizmoHelper = gizmo.getHelper();
  scene.add(gizmoHelper);

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
      } else camera.updateProjectionMatrix();
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
    const helpers = [box, gizmoHelper, grid];
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
    if (!event.value) readGizmo();
  });
  gizmo.addEventListener('objectChange', () => emit());
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
    return { object, position, rotation, scale, size: vec(size), materials, before: null };
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
    for (const part of state.parts) {
      let obj = objects.get(part.name);
      const base = bases.get(part.source);
      if (!base) continue;
      if (!obj) {
        obj = base.object.clone(true);
        obj.name = part.name;
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
    }
    if (selected && !objects.get(selected)?.visible) selected = null;
    attach();
    save();
    emit();
    render();
  }

  function attach(): void {
    const obj = selected ? objects.get(selected) : undefined;
    if (obj && obj.visible) gizmo.attach(obj);
    else gizmo.detach();
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
      };
    }
    onChange({
      ready: !!root,
      parts,
      selected: info,
      canUndo: index > 0,
      canRedo: index < history.length - 1,
      dirty: index >= 0 && history[index] !== history[0],
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
    gizmo.setTranslationSnap(on ? 0.005 : null);
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
      selected = null;
      let start = initialState();
      let from: 'draft' | 'file' | null = null;
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
          const parsed = JSON.parse(saved) as EditState;
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
      if (!fitsModel(next)) return false;
      selected = null;
      apply(structuredClone(next));
      commit();
      attach();
      return true;
    },

    select,
    setMode(mode: GizmoMode): void {
      gizmo.setMode(mode);
      render();
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
    duplicate(name: string): void {
      const part = current(name);
      if (!part) return;
      const copyName = uniqueName(part.source);
      change((draft) => {
        const idx = draft.parts.findIndex((p) => p.name === name);
        const copy: PartState = { ...structuredClone(part), name: copyName, hidden: false, deleted: false };
        copy.position[0] = r3(copy.position[0] + 0.05, 5);
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
