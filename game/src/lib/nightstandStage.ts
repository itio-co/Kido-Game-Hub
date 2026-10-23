import * as THREE from 'three';
import type { NightstandEntity } from './types';
import { buildNightstand } from './props/builders';
import { canvasTexture, type Build } from './props/kit';

export type NightstandStage = { dispose: () => void };

/** Cream wall sampled to the crop's background. */
const WALL = '#f0c9a0';

/**
 * Isolated nightstand for the showcase.
 * `fit` uses the crop's 3/4 angle. `orbit` yaws while dragging.
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
  renderer.setClearColor(WALL);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(mode === 'fit' ? 30 : 32, 1, 0.05, 30);
  // Lambert divides by π. Keep the lit top near the wood albedo, with light from the upper left.
  scene.add(new THREE.AmbientLight('#fff6ee', 1.85));
  const sun = new THREE.DirectionalLight('#fff1e0', 1.35);
  sun.position.set(-2.4, 3.6, 2.1);
  scene.add(sun);
  const fill = new THREE.DirectionalLight('#ffe6cc', 0.4);
  fill.position.set(1.4, 1.5, 1.6);
  scene.add(fill);

  const build: Build = { geos: [], mats: [], textures: [], matCache: new Map() };

  const wall = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.6), new THREE.MeshBasicMaterial({ color: WALL }));
  wall.position.set(0, 1.05, -0.42);
  scene.add(wall);

  const skirt = new THREE.Mesh(
    new THREE.BoxGeometry(4.2, 0.085, 0.04),
    new THREE.MeshBasicMaterial({ color: '#e8c4a2' }),
  );
  skirt.position.set(0, 0.042, -0.39);
  scene.add(skirt);
  const skirtLine = new THREE.Mesh(
    new THREE.BoxGeometry(4.2, 0.012, 0.05),
    new THREE.MeshBasicMaterial({ color: '#d7b08a' }),
  );
  skirtLine.position.set(0, 0.09, -0.385);
  scene.add(skirtLine);

  const planks = document.createElement('canvas');
  planks.width = 256;
  planks.height = 256;
  const ctx = planks.getContext('2d');
  if (ctx) {
    const tones = ['#c88848', '#b87538', '#d09652', '#a86c34', '#c07e40'];
    const band = 32;
    for (let i = 0; i < 8; i += 1) {
      ctx.fillStyle = tones[i % tones.length] ?? '#c88848';
      ctx.fillRect(0, i * band, 256, band - 3);
      ctx.fillStyle = '#8d5a30';
      ctx.fillRect(0, i * band + band - 3, 256, 3);
    }
  }
  const floorTex = canvasTexture(build, planks);
  floorTex.wrapS = THREE.RepeatWrapping;
  floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(4, 4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), new THREE.MeshBasicMaterial({ map: floorTex }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.004;
  scene.add(floor);

  const stand: NightstandEntity = { ...entity, position: [0, 0, 0], rotation: [0, 0, 0] };
  const group = buildNightstand(build, scene, stand);
  build.geos.push(wall.geometry, skirt.geometry, skirtLine.geometry, floor.geometry);
  build.mats.push(wall.material, skirt.material, skirtLine.material, floor.material);

  let yaw = mode === 'orbit' ? 0.7 : 0;
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
    const span = Math.max(distX, distY, size.z / 2 / Math.tan(hFov / 2));
    const dist = (span / 0.62) * (mode === 'orbit' ? 1.2 : 1);
    if (mode === 'fit') {
      const az = 0.4;
      camera.position.set(center.x + Math.sin(az) * dist, center.y + dist * 0.3, center.z + Math.cos(az) * dist);
      camera.lookAt(center.x + 0.03, center.y + size.y * 0.12, center.z);
    } else {
      const spin = yaw;
      camera.position.set(center.x + Math.sin(spin) * dist, center.y + dist * 0.38, center.z + Math.cos(spin) * dist);
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
