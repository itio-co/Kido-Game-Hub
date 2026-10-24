import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { ShowcaseAsset } from './showcaseAssets';

/** Cross-fade between clips (s). */
const FADE = 0.4;
const WALL = '#f3dcc0';
const FLOOR = '#8a5a34';

export type CharacterSnapshot = {
  status: 'loading' | 'ready' | 'error';
  /** Animation name in the GLB of the clip that is playing (or was last picked). */
  clip: string;
  playing: boolean;
  loop: boolean;
  seat: boolean;
  /** Id of the loaded mesh variant (LOD). */
  variant: string;
  flat: boolean;
};

export type CharacterStage = {
  play: (clip: string) => void;
  setPlaying: (playing: boolean) => void;
  setLoop: (loop: boolean) => void;
  /** Show the seat and sit down (SitDown, then the idle sitting clip), or stand up again. */
  setSeat: (on: boolean) => void;
  /** Swap the mesh variant (e.g. a simplified LOD); the clip, its time and the seat are kept. */
  setVariant: (id: string) => void;
  /** Flat shading (faceted low-poly look); the texture is kept. */
  setFlat: (flat: boolean) => void;
  dispose: () => void;
};

/** Read-only hook for browser tests (`window.__characterStage`). */
export type CharacterDebug = {
  slug: string;
  status: CharacterSnapshot['status'];
  clip: string;
  clips: string[];
  /** Accumulated mixer time (s); advances while playing. */
  mixerTime: number;
  /** Local time of the current clip (s). */
  clipTime: number;
  playing: boolean;
  seatVisible: boolean;
  seatTop: number;
  /** Hips bone world position (m). */
  hips: [number, number, number];
  /** Orbit yaw (rad) and distance (m). */
  yaw: number;
  distance: number;
  frames: number;
  variant: string;
  flat: boolean;
  /** Triangles / joints of the loaded skinned mesh(es). */
  tris: number;
  joints: number;
  /** Variants loaded so far (incl. reloads). */
  loads: number;
  /** Test helpers for repeatable screenshots: freeze a clip at a time, and place the camera (target height y). */
  pose?: (clip: string, time: number) => void;
  view?: (opts: { yaw: number; pitch: number; distance: number; y: number }) => void;
};

declare global {
  interface Window {
    __characterStage?: CharacterDebug;
  }
}

/**
 * Rigged character viewer: orbit camera (drag, pinch, wheel), AnimationMixer with cross-fades, optional seat block
 * placed from the character's pelvis offset. Renders continuously while visible on screen.
 */
export function mountCharacterStage(
  canvas: HTMLCanvasElement,
  asset: ShowcaseAsset,
  onChange: (snap: CharacterSnapshot) => void,
): CharacterStage {
  const info = asset.character!;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(WALL);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 40);
  scene.add(new THREE.HemisphereLight('#fff4e8', '#c49a78', 1.85));
  const sun = new THREE.DirectionalLight('#ffe6cc', 1.45);
  sun.position.set(1.2, 2.2, 2.6);
  scene.add(sun);
  const fill = new THREE.DirectionalLight('#fff0e2', 0.85);
  fill.position.set(-1.0, 1.35, 2.8);
  scene.add(fill);

  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  function add<T extends THREE.Mesh>(mesh: T, parent: THREE.Object3D = scene): T {
    geos.push(mesh.geometry);
    mats.push(mesh.material as THREE.Material);
    parent.add(mesh);
    return mesh;
  }

  // Floor with a faint grid so walking and the seat height read clearly.
  const floor = add(new THREE.Mesh(new THREE.CircleGeometry(6, 48), new THREE.MeshLambertMaterial({ color: FLOOR })));
  floor.rotation.x = -Math.PI / 2;
  const grid = new THREE.GridHelper(8, 32, '#a87850', '#a87850');
  geos.push(grid.geometry);
  mats.push(grid.material as THREE.Material);
  grid.position.y = 0.002;
  scene.add(grid);

  // Soft contact shadow that follows the hips.
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 128;
  const ctx = shadowCanvas.getContext('2d');
  if (ctx) {
    const shade = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
    shade.addColorStop(0, 'rgba(40,20,8,0.55)');
    shade.addColorStop(1, 'rgba(40,20,8,0)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, 128, 128);
  }
  const shadowTex = new THREE.CanvasTexture(shadowCanvas);
  textures.push(shadowTex);
  const shadow = add(
    new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.7),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
    ),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.004;

  // Seat block (simple sofa) from the pelvis offset: seat surface at `top`, front edge `front` m in front of the
  // seated hips, `depth` deep, plus a backrest and two armrests. Built facing +X, then turned to `facing`.
  const seatInfo = info.seat;
  const seat = new THREE.Group();
  const fabric = new THREE.MeshLambertMaterial({ color: '#7a9a6a' });
  const frameMat = new THREE.MeshLambertMaterial({ color: '#6b4426' });
  const back = seatInfo.front - seatInfo.depth;
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    geos.push(mesh.geometry);
    mesh.position.set(x, y, z);
    seat.add(mesh);
    return mesh;
  };
  mats.push(fabric, frameMat);
  box(seatInfo.depth, seatInfo.top - 0.08, seatInfo.width, back + seatInfo.depth / 2, (seatInfo.top - 0.08) / 2 + 0.08, 0, fabric);
  box(seatInfo.depth, 0.08, seatInfo.width, back + seatInfo.depth / 2, 0.04, 0, frameMat);
  box(0.16, 0.86, seatInfo.width + 0.24, back - 0.08, 0.43, 0, fabric);
  for (const side of [-1, 1]) box(seatInfo.depth + 0.16, 0.62, 0.12, back + seatInfo.depth / 2 - 0.08, 0.31, side * (seatInfo.width / 2 + 0.06), fabric);
  seat.position.set(seatInfo.hips[0], 0, seatInfo.hips[2]);
  seat.rotation.y = Math.atan2(-seatInfo.facing[1], seatInfo.facing[0]);
  seat.visible = false;
  scene.add(seat);

  const snap: CharacterSnapshot = {
    status: 'loading',
    clip: info.idle,
    playing: true,
    loop: true,
    seat: false,
    variant: (asset.variants.find((v) => v.id === info.defaultVariant) ?? asset.variants[0]!).id,
    flat: false,
  };
  const emit = () => onChange({ ...snap });

  let mixer: THREE.AnimationMixer | null = null;
  const actions = new Map<string, THREE.AnimationAction>();
  let current: THREE.AnimationAction | null = null;
  let hipsBone: THREE.Object3D | null = null;
  let disposed = false;
  let frames = 0;
  const hips = new THREE.Vector3();

  const debug: CharacterDebug = {
    slug: asset.slug,
    status: 'loading',
    clip: snap.clip,
    clips: [],
    mixerTime: 0,
    clipTime: 0,
    playing: true,
    seatVisible: false,
    seatTop: seatInfo.top,
    hips: [0, 0, 0],
    yaw: 0,
    distance: 0,
    frames: 0,
    variant: snap.variant,
    flat: false,
    tris: 0,
    joints: 0,
    loads: 0,
  };
  window.__characterStage = debug;

  const clipInfo = (name: string) => info.clips.find((c) => c.clip === name);

  function play(name: string, fade = FADE): void {
    const next = actions.get(name);
    if (!next || !mixer) {
      snap.clip = name;
      emit();
      return;
    }
    const meta = clipInfo(name);
    const once = !!meta?.next || !snap.loop;
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.enabled = true;
    next.setEffectiveTimeScale(1);
    next.setEffectiveWeight(1);
    next.play();
    if (current && current !== next) current.crossFadeTo(next, fade, false);
    current = next;
    snap.clip = name;
    if (meta) snap.seat = meta.seated;
    seat.visible = snap.seat;
    snap.playing = true;
    emit();
  }

  const loader = new GLTFLoader();
  let model: THREE.Object3D | null = null;
  // Resources owned by the loaded model (freed on variant swap); `geos` / `mats` / `textures` hold the stage's own.
  let modelRes: { geos: THREE.BufferGeometry[]; mats: THREE.Material[]; textures: THREE.Texture[] } | null = null;
  let loadSeq = 0;

  function applyFlat(): void {
    for (const mat of modelRes?.mats ?? []) {
      const std = mat as THREE.MeshStandardMaterial;
      if (std.flatShading === snap.flat) continue;
      std.flatShading = snap.flat;
      std.needsUpdate = true;
    }
    debug.flat = snap.flat;
  }

  function freeModel(): void {
    if (!model) return;
    mixer?.stopAllAction();
    if (mixer) mixer.uncacheRoot(model);
    scene.remove(model);
    for (const geo of modelRes?.geos ?? []) geo.dispose();
    for (const mat of modelRes?.mats ?? []) mat.dispose();
    for (const tex of modelRes?.textures ?? []) tex.dispose();
    model = null;
    modelRes = null;
    mixer = null;
    actions.clear();
    current = null;
    hipsBone = null;
  }

  function loadVariant(id: string): void {
    const variant = asset.variants.find((v) => v.id === id) ?? asset.variants[0]!;
    const seq = ++loadSeq;
    // Resume where the old mesh was: same clip and clip time.
    const resume = { clip: snap.clip, time: current?.time ?? 0, keep: !!model };
    snap.variant = variant.id;
    debug.variant = variant.id;
    snap.status = 'loading';
    emit();
    loader.load(
      variant.url,
      (gltf) => {
        if (disposed || seq !== loadSeq) return;
        freeModel();
        const res = { geos: [] as THREE.BufferGeometry[], mats: [] as THREE.Material[], textures: [] as THREE.Texture[] };
        let tris = 0;
        let joints = 0;
        gltf.scene.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (obj.name === 'Hips') hipsBone = obj;
          if (!mesh.isMesh) return;
          mesh.frustumCulled = false; // Skinned bounds do not follow the walk / sit motion.
          res.geos.push(mesh.geometry);
          tris += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position!.count) / 3;
          const skinned = mesh as unknown as THREE.SkinnedMesh;
          if (skinned.isSkinnedMesh) joints = Math.max(joints, skinned.skeleton.bones.length);
          const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const mat of list) {
            res.mats.push(mat);
            const std = mat as THREE.MeshStandardMaterial;
            for (const tex of [std.map, std.normalMap, std.metalnessMap, std.roughnessMap]) {
              if (tex && !res.textures.includes(tex)) res.textures.push(tex);
            }
          }
        });
        model = gltf.scene;
        modelRes = res;
        scene.add(model);
        applyFlat();
        mixer = new THREE.AnimationMixer(model);
        for (const clip of gltf.animations) actions.set(clip.name, mixer.clipAction(clip));
        debug.clips = gltf.animations.map((c) => c.name);
        debug.tris = tris;
        debug.joints = joints;
        debug.loads += 1;
        mixer.addEventListener('finished', (event) => {
          const done = (event as unknown as { action: THREE.AnimationAction }).action;
          const next = clipInfo(done.getClip().name)?.next;
          if (done === current && next) play(next);
          else if (done === current) {
            snap.playing = false;
            emit();
          }
        });
        snap.status = 'ready';
        const wasPlaying = snap.playing;
        play(resume.clip, 0);
        if (resume.keep && current) {
          current.time = Math.min(resume.time, current.getClip().duration);
          mixer.update(0);
          snap.playing = wasPlaying;
          emit();
        }
      },
      undefined,
      (err) => {
        if (seq !== loadSeq) return;
        console.warn('character model failed to load', err);
        snap.status = 'error';
        emit();
      },
    );
  }
  loadVariant(snap.variant);

  debug.pose = (clip, time) => {
    play(clip, 0);
    if (!current || !mixer) return;
    // Hard cut: a zero-length cross-fade only settles on the next mixer step, which a paused pose never takes.
    for (const action of actions.values()) if (action !== current) action.stop();
    current.stopFading();
    current.setEffectiveWeight(1);
    current.time = time;
    mixer.update(0);
    snap.playing = false;
    emit();
  };
  debug.view = (opts) => {
    yaw = opts.yaw;
    pitch = opts.pitch;
    dist = opts.distance;
    targetY = opts.y;
    yawGoal = null;
  };

  // Orbit camera around the hips (drag = orbit, pinch / wheel = zoom).
  const orbit = asset.orbit;
  let yaw = 0.35;
  let pitch = Math.atan2(orbit.height - orbit.target, orbit.distance);
  let dist = Math.hypot(orbit.distance, orbit.height - orbit.target);
  let yawGoal: number | null = null;
  const target = new THREE.Vector3(0, orbit.target, 0);
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch = 0;
  /** Fixed camera target height (test views); null = follow the standing / seated default. */
  let targetY: number | null = null;

  function down(event: PointerEvent): void {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    canvas.setPointerCapture(event.pointerId);
    yawGoal = null;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    }
  }
  function move(event: PointerEvent): void {
    const prev = pointers.get(event.pointerId);
    if (!prev) return;
    const point = { x: event.clientX, y: event.clientY };
    pointers.set(event.pointerId, point);
    if (pointers.size === 1) {
      yaw -= (point.x - prev.x) * 0.01;
      pitch = THREE.MathUtils.clamp(pitch + (point.y - prev.y) * 0.006, -0.15, 1.2);
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const span = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (pinch > 0 && span > 0) dist = THREE.MathUtils.clamp(dist * (pinch / span), 1.2, 7);
      pinch = span;
    }
  }
  function up(event: PointerEvent): void {
    pointers.delete(event.pointerId);
    pinch = 0;
  }
  function wheel(event: WheelEvent): void {
    event.preventDefault();
    dist = THREE.MathUtils.clamp(dist * Math.exp(event.deltaY * 0.001), 1.2, 7);
  }
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', wheel, { passive: false });

  let visible = true;
  const visibility = new IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting);
  });
  visibility.observe(canvas);

  const clock = new THREE.Clock();
  let raf = 0;
  function tick(): void {
    if (disposed) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.1);
    if (mixer && snap.playing) mixer.update(dt);
    if (hipsBone) {
      hipsBone.getWorldPosition(hips);
      shadow.position.x = hips.x;
      shadow.position.z = hips.z;
      // Follow the hips on the floor plane, softly.
      const k = 1 - Math.exp(-dt * 4);
      target.x += (hips.x - target.x) * k;
      target.z += (hips.z - target.z) * k;
      if (targetY !== null) target.set(hips.x, targetY, hips.z);
      else target.y += ((snap.seat ? orbit.target - 0.2 : orbit.target) - target.y) * k;
    }
    if (yawGoal !== null) {
      const delta = Math.atan2(Math.sin(yawGoal - yaw), Math.cos(yawGoal - yaw));
      yaw += delta * (1 - Math.exp(-dt * 3));
      if (Math.abs(delta) < 0.002) yawGoal = null;
    }
    debug.status = snap.status;
    debug.clip = snap.clip;
    debug.mixerTime = mixer?.time ?? 0;
    debug.clipTime = current?.time ?? 0;
    debug.playing = snap.playing;
    debug.seatVisible = seat.visible;
    debug.hips = [hips.x, hips.y, hips.z];
    debug.yaw = yaw;
    debug.distance = dist;
    if (!visible || document.hidden) return;
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    if (canvas.width !== Math.round(width * renderer.getPixelRatio())) renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    camera.position.set(
      target.x + Math.sin(yaw) * Math.cos(pitch) * dist,
      target.y + Math.sin(pitch) * dist,
      target.z + Math.cos(yaw) * Math.cos(pitch) * dist,
    );
    camera.lookAt(target);
    renderer.render(scene, camera);
    frames += 1;
    debug.frames = frames;
  }
  raf = requestAnimationFrame(tick);
  emit();

  return {
    play(name) {
      play(name);
    },
    setPlaying(playing) {
      snap.playing = playing;
      if (playing && current && !current.isRunning() && current.loop === THREE.LoopOnce) play(snap.clip);
      clock.getDelta();
      emit();
    },
    setLoop(loop) {
      snap.loop = loop;
      if (current && !clipInfo(snap.clip)?.next) {
        current.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
        current.clampWhenFinished = !loop;
        if (loop && !current.isRunning()) play(snap.clip);
      }
      emit();
    },
    setSeat(on) {
      if (on) {
        // Turn the camera towards the side she sits facing (3/4 view).
        yawGoal = Math.atan2(seatInfo.facing[0], seatInfo.facing[1]) - 0.45;
        play(info.sitDown);
      } else {
        yawGoal = 0.35;
        play(info.idle);
      }
    },
    setVariant(id) {
      if (id !== snap.variant) loadVariant(id);
    },
    setFlat(flat) {
      snap.flat = flat;
      applyFlat();
      emit();
    },
    dispose() {
      disposed = true;
      freeModel();
      cancelAnimationFrame(raf);
      visibility.disconnect();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('wheel', wheel);
      mixer?.stopAllAction();
      renderer.dispose();
      for (const geo of geos) geo.dispose();
      for (const mat of mats) mat.dispose();
      for (const tex of textures) tex.dispose();
      if (window.__characterStage === debug) delete window.__characterStage;
    },
  };
}
