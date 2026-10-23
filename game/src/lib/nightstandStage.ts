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
  // Low ambient and a key from the upper left. Lambert divides by π, so the key is near π
  // on the lit top and the right face (facing away) stays clearly darker.
  scene.add(new THREE.AmbientLight('#ffe8d2', 0.42));
  const sun = new THREE.DirectionalLight('#fff1dc', 2.7);
  sun.position.set(-1.4, 2.4, 0.7);
  scene.add(sun);
  const fill = new THREE.DirectionalLight('#ffe0c4', 0.22);
  fill.position.set(1.6, 0.6, 0.3);
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
  const plankTones = ['#6b3a1c', '#7a4522', '#5a3016', '#8a4e28', '#623616', '#734222'];
  const plankD = 0.072;
  const plankGap = 0.006;
  for (let i = 0; i < 24; i += 1) {
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
  const shadowTex = canvasTexture(build, shadowCanvas);
  const shadowGeo = new THREE.PlaneGeometry(0.78, 0.42);
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, 0.003, 0.02);
  scene.add(shadow);
  build.geos.push(shadowGeo);
  build.mats.push(shadowMat);
  build.geos.push(wall.geometry, skirt.geometry, skirtLine.geometry, floor.geometry);
  build.mats.push(wall.material, skirt.material, skirtLine.material, floor.material);

  let yaw = mode === 'orbit' ? 0.7 : 0;
  let dragX = 0;
  let dragging = false;

  // Solved against nightstand-ref-points.json. Mean error 5.99px on the 252×284 crop. FOV 30°.
  const solvedPosition = new THREE.Vector3(0.415003, 0.881212, 1.392777);
  const solvedTarget = new THREE.Vector3(0.012042, 0.346358, -0.023403);
  const solvedRoll = 0.014751;

  function applySolvedCamera(): void {
    camera.fov = 30;
    camera.position.copy(solvedPosition);
    const forward = solvedTarget.clone().sub(solvedPosition).normalize();
    const worldUp = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(forward, worldUp).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward);
    const cr = Math.cos(solvedRoll);
    const sr = Math.sin(solvedRoll);
    camera.up.copy(right.multiplyScalar(-sr).add(up.multiplyScalar(cr)));
    camera.lookAt(solvedTarget);
    camera.updateProjectionMatrix();
  }

  function frame(): void {
    group.rotation.y = yaw;
    if (mode === 'fit') {
      group.rotation.y = 0;
      applySolvedCamera();
    } else {
      camera.fov = 32;
      camera.up.set(0, 1, 0);
      const spin = yaw;
      const dist = 1.45;
      camera.position.set(Math.sin(spin) * dist, 0.78, Math.cos(spin) * dist);
      camera.lookAt(0, 0.22, 0);
      group.rotation.y = 0;
      camera.updateProjectionMatrix();
    }
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
