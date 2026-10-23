import * as THREE from 'three';
import type { NightstandEntity } from './types';
import { buildNightstand } from './props/builders';
import { type Build } from './props/kit';

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
  const camera = new THREE.PerspectiveCamera(mode === 'fit' ? 32 : 32, 1, 0.05, 30);
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

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), new THREE.MeshBasicMaterial({ color: '#3f2410' }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.02;
  scene.add(floor);
  const plankTones = ['#5c3016', '#6e3c1c', '#7a4520', '#4e2812', '#814820', '#643616', '#734222', '#583016'];
  const plankD = 0.06;
  const plankGap = 0.007;
  for (let i = 0; i < 22; i += 1) {
    const geo = new THREE.BoxGeometry(3.4, 0.02, plankD);
    const mat = new THREE.MeshBasicMaterial({ color: plankTones[i % plankTones.length] ?? '#5c3016' });
    const plank = new THREE.Mesh(geo, mat);
    plank.position.set(0, -0.01, -0.35 + i * (plankD + plankGap));
    scene.add(plank);
    build.geos.push(geo);
    build.mats.push(mat);
  }

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
    const dist0 = span * (mode === 'orbit' ? 1.28 : 1);
    if (mode === 'fit') {
      // 28° down from the front-right: top reads as a parallelogram, right side shows.
      const az = 0.4;
      const elev = (26 * Math.PI) / 180;
      const targetTop = 0.25;
      const targetFoot = 1.02;
      let dist = dist0;
      let lookY = center.y;
      const corner = new THREE.Vector3();
      const ndc = new THREE.Vector3();
      const place = (): { topY: number; footY: number } => {
        const look = new THREE.Vector3(center.x, lookY, center.z);
        camera.position.set(
          look.x + Math.sin(az) * Math.cos(elev) * dist,
          look.y + Math.sin(elev) * dist,
          look.z + Math.cos(az) * Math.cos(elev) * dist,
        );
        camera.lookAt(look);
        camera.updateMatrixWorld(true);
        let topY = 1;
        let footY = 0;
        for (const x of [box.min.x, box.max.x]) {
          for (const y of [box.min.y, box.max.y]) {
            for (const z of [box.min.z, box.max.z]) {
              ndc.copy(corner.set(x, y, z)).project(camera);
              const sy = (1 - ndc.y) / 2;
              if (y === box.max.y) topY = Math.min(topY, sy);
              if (y === box.min.y) footY = Math.max(footY, sy);
            }
          }
        }
        return { topY, footY };
      };
      for (let i = 0; i < 12; i += 1) {
        const { topY, footY } = place();
        const mid = (topY + footY) / 2;
        const targetMid = (targetTop + targetFoot) / 2;
        lookY += (targetMid - mid) * size.y * 0.65;
        const spanY = footY - topY;
        const targetSpan = targetFoot - targetTop;
        if (spanY > 0.05) dist *= 1 + (spanY - targetSpan) * 0.55;
      }
      place();
    } else {
      const spin = yaw;
      camera.position.set(center.x + Math.sin(spin) * dist0, center.y + dist0 * 0.38, center.z + Math.cos(spin) * dist0);
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
