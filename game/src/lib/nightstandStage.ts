import * as THREE from 'three';
import type { NightstandEntity } from './types';
import { buildNightstand } from './props/builders';
import type { Build } from './props/kit';

export type NightstandStage = { dispose: () => void };

/** Wall colour sampled from the upper-right of nightstand-ref.png. */
const BACKDROP = '#d9a478';

/**
 * Isolated nightstand for the showcase.
 * `fit` frames the front to the reference crop. `orbit` yaws while dragging.
 */
export function mountNightstandStage(
  canvas: HTMLCanvasElement,
  entity: NightstandEntity,
  mode: 'fit' | 'orbit',
): NightstandStage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(BACKDROP);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(mode === 'fit' ? 18 : 32, 1, 0.05, 20);
  // Lambert BRDF divides by π, so irradiance near π keeps the sampled albedo on screen.
  scene.add(new THREE.AmbientLight('#fff8f2', 2.35));
  const sun = new THREE.DirectionalLight('#fff4e6', 0.85);
  sun.position.set(1.6, 3.6, 2.6);
  scene.add(sun);
  const fill = new THREE.DirectionalLight('#ffe8d2', 0.35);
  fill.position.set(-1.2, 1.8, 2.2);
  scene.add(fill);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(1.35, 1.05),
    new THREE.MeshBasicMaterial({ color: '#7a4520' }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 0.02);
  scene.add(floor);

  const build: Build = { geos: [], mats: [], textures: [], matCache: new Map() };
  const stand: NightstandEntity = { ...entity, position: [0, 0, 0], rotation: [0, 0, 0] };
  const group = buildNightstand(build, scene, stand);
  const [bw, bh, bd] = stand.size;
  const gap = new THREE.Mesh(
    new THREE.BoxGeometry(bw * 0.62, bh * 0.58, bd * 0.46),
    new THREE.MeshBasicMaterial({ color: '#2a1408' }),
  );
  gap.position.set(0, bh * 0.3, 0);
  group.add(gap);
  build.geos.push(floor.geometry, gap.geometry);
  build.mats.push(floor.material, gap.material);

  let yaw = mode === 'orbit' ? 0.55 : -0.24;
  let dragX = 0;
  let dragging = false;

  function frame(): void {
    group.rotation.y = yaw;
    group.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(group);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const aspect = camera.aspect || 1;
    const vFov = (camera.fov * Math.PI) / 180;
    const distY = size.y / 2 / Math.tan(vFov / 2);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const distX = size.x / 2 / Math.tan(hFov / 2);
    const dist = (Math.max(distX, distY) / 0.86) * (mode === 'orbit' ? 1.15 : 1);
    if (mode === 'fit') {
      camera.position.set(center.x + 0.015, center.y + dist * 0.13, center.z + dist);
      camera.lookAt(center.x + 0.015, center.y - 0.045, center.z);
    } else {
      const spin = yaw;
      camera.position.set(center.x + Math.sin(spin) * dist, center.y + dist * 0.22, center.z + Math.cos(spin) * dist);
      camera.lookAt(center.x, center.y, center.z);
      group.rotation.y = 0;
    }
    camera.updateProjectionMatrix();
  }

  function render(): void {
    const width = canvas.clientWidth || 1;
    const viewHeight = canvas.clientHeight || 1;
    camera.aspect = width / viewHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(width, viewHeight, false);
    frame();
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
    yaw += (event.clientX - dragX) * 0.01;
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
      observer.disconnect();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      renderer.dispose();
      for (const geo of build.geos) geo.dispose();
      for (const mat of build.mats) mat.dispose();
      for (const tex of build.textures) tex.dispose();
    },
  };
}
