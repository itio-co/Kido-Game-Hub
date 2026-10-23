import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export type NightstandStage = { dispose: () => void };
export type NightstandVariant = 'lowpoly' | 'master';

/** Cream wall sampled to the crop's background. */
const WALL = '#f0c9a0';

/** Runtime models exported from game/assets-src/nightstand (Blender). */
export const NIGHTSTAND_MODELS: Record<NightstandVariant, string> = {
  lowpoly: `${import.meta.env.BASE_URL}models/nightstand.glb`,
  master: `${import.meta.env.BASE_URL}models/nightstand-master.glb`,
};

/**
 * Camera matched in Blender to showcase/nightstand-ref.png (252×284).
 * Blender: lens 162.12 mm on a 36 mm sensor (horizontal fit), location (1.5167, -3.0410, 1.3648) m,
 * rotation XYZ (73.63°, 0.54°, 26.89°). Converted Z-up → Y-up as (x, y, z) → (x, z, -y).
 * See game/assets-src/nightstand/cam.json and solve_cam.py.
 */
const MATCH = {
  /** Horizontal field of view (deg). Vertical FOV is derived from the canvas aspect. */
  hfovDeg: 2 * THREE.MathUtils.radToDeg(Math.atan(36 / 2 / 162.1169)),
  position: new THREE.Vector3(1.51665, 1.36477, 3.04096),
  quaternion: new THREE.Quaternion(-0.139571, 0.230806, 0.028608, 0.962512),
};

function vfovFromHfov(hfovDeg: number, aspect: number): number {
  const h = THREE.MathUtils.degToRad(hfovDeg);
  return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(h / 2) / aspect));
}

/**
 * Isolated nightstand for the showcase, loaded from a GLB.
 * `fit` uses the Blender-matched camera so it lines up with the crop. `orbit` yaws while dragging.
 */
export function mountNightstandStage(
  canvas: HTMLCanvasElement,
  variant: NightstandVariant,
  mode: 'fit' | 'orbit',
): NightstandStage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(WALL);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 30);
  // Warm key from the upper left (same direction as the Blender preview sun), warm ambient fill.
  scene.add(new THREE.HemisphereLight('#ffe6cc', '#7a4a2a', 1.15));
  const sun = new THREE.DirectionalLight('#ffdcb4', 3.1);
  sun.position.set(-1.3, 1.9, 0.7);
  scene.add(sun);

  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];

  function add(mesh: THREE.Mesh): THREE.Mesh {
    geos.push(mesh.geometry);
    mats.push(mesh.material as THREE.Material);
    scene.add(mesh);
    return mesh;
  }

  // Backdrop: wall, skirting and plank floor behind the table, as in the crop.
  const wall = add(new THREE.Mesh(new THREE.PlaneGeometry(6, 3), new THREE.MeshBasicMaterial({ color: WALL })));
  wall.position.set(0, 1.2, -0.3);
  const skirt = add(
    new THREE.Mesh(new THREE.BoxGeometry(6, 0.085, 0.04), new THREE.MeshBasicMaterial({ color: '#e8c4a2' })),
  );
  skirt.position.set(0, 0.042, -0.28);
  const skirtLine = add(
    new THREE.Mesh(new THREE.BoxGeometry(6, 0.012, 0.05), new THREE.MeshBasicMaterial({ color: '#d7b08a' })),
  );
  skirtLine.position.set(0, 0.09, -0.275);
  const floor = add(new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ color: '#3f2410' })));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.02;
  const plankTones = ['#6b3a1c', '#7a4522', '#5a3016', '#8a4e28', '#623616', '#734222'];
  const plankD = 0.072;
  const plankGap = 0.006;
  for (let i = 0; i < 40; i += 1) {
    const plank = add(
      new THREE.Mesh(
        new THREE.BoxGeometry(6, 0.02, plankD),
        new THREE.MeshBasicMaterial({ color: plankTones[i % plankTones.length] ?? '#5c3016' }),
      ),
    );
    plank.position.set(0, -0.01, -0.26 + i * (plankD + plankGap));
  }

  // Soft contact shadow under the table.
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;
  const shadowCtx = shadowCanvas.getContext('2d');
  if (shadowCtx) {
    const shade = shadowCtx.createRadialGradient(64, 64, 10, 64, 64, 62);
    shade.addColorStop(0, 'rgba(28,14,6,0.62)');
    shade.addColorStop(0.55, 'rgba(28,14,6,0.28)');
    shade.addColorStop(1, 'rgba(28,14,6,0)');
    shadowCtx.fillStyle = shade;
    shadowCtx.fillRect(0, 0, 128, 128);
  }
  const shadowTex = new THREE.CanvasTexture(shadowCanvas);
  shadowTex.colorSpace = THREE.SRGBColorSpace;
  textures.push(shadowTex);
  const shadow = add(
    new THREE.Mesh(
      new THREE.PlaneGeometry(0.86, 0.6),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
    ),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, 0.003, 0);

  const group = new THREE.Group();
  scene.add(group);

  let disposed = false;
  const loader = new GLTFLoader();
  loader.load(
    NIGHTSTAND_MODELS[variant],
    (gltf) => {
      if (disposed) return;
      gltf.scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        geos.push(mesh.geometry);
        const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of list) {
          mats.push(mat);
          if (variant === 'lowpoly' && 'flatShading' in mat) {
            (mat as THREE.MeshStandardMaterial).flatShading = true;
            mat.needsUpdate = true;
          }
          const map = (mat as THREE.MeshStandardMaterial).map;
          if (map) textures.push(map);
        }
      });
      group.add(gltf.scene);
      render();
    },
    undefined,
    (err) => console.warn('nightstand model failed to load', err),
  );

  let yaw = 0.7;
  let dragX = 0;
  let dragging = false;

  function frame(aspect: number): void {
    camera.aspect = aspect;
    if (mode === 'fit') {
      camera.fov = vfovFromHfov(MATCH.hfovDeg, aspect);
      camera.position.copy(MATCH.position);
      camera.quaternion.copy(MATCH.quaternion);
    } else {
      camera.fov = 32;
      camera.up.set(0, 1, 0);
      const dist = 1.7;
      camera.position.set(Math.sin(yaw) * dist, 0.9, Math.cos(yaw) * dist);
      camera.lookAt(0, 0.26, 0);
    }
    camera.updateProjectionMatrix();
  }

  function render(): void {
    if (disposed) return;
    const width = canvas.clientWidth || 1;
    const viewHeight = canvas.clientHeight || 1;
    renderer.setSize(width, viewHeight, false);
    frame(width / viewHeight);
    renderer.render(scene, camera);
  }

  function down(event: PointerEvent): void {
    if (mode !== 'orbit') return;
    dragging = true;
    dragX = event.clientX;
    canvas.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent): void {
    if (!dragging) return;
    yaw -= (event.clientX - dragX) * 0.01;
    dragX = event.clientX;
    render();
  }
  function up(): void {
    dragging = false;
  }

  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  const observer = new ResizeObserver(render);
  observer.observe(canvas);
  render();

  return {
    dispose() {
      disposed = true;
      observer.disconnect();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      renderer.dispose();
      for (const geo of geos) geo.dispose();
      for (const mat of mats) mat.dispose();
      for (const tex of textures) tex.dispose();
    },
  };
}
