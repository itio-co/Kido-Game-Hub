import * as THREE from 'three';
import type { NightstandEntity } from './types';
import { buildNightstand } from './props/builders';
import type { Build } from './props/kit';

export type OrbitView = { dispose: () => void };

/** Isolated nightstand. Renders on mount and while the pointer drags — no loop. */
export function mountOrbit(canvas: HTMLCanvasElement, entity: NightstandEntity): OrbitView {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor('#efe4d4');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 20);
  const [, height] = entity.size;
  camera.position.set(0.85, height * 0.95, 1.05);
  camera.lookAt(0, height * 0.42, 0);

  scene.add(new THREE.AmbientLight('#fff2e0', 1.15));
  const sun = new THREE.DirectionalLight('#ffe0bf', 1.1);
  sun.position.set(-1.2, 2.4, 1.6);
  scene.add(sun);
  const fill = new THREE.DirectionalLight('#fff6ea', 0.45);
  fill.position.set(1.4, 1.2, 0.4);
  scene.add(fill);

  const build: Build = { geos: [], mats: [], textures: [], matCache: new Map() };
  const stand: NightstandEntity = { ...entity, position: [0, 0, 0], rotation: [0, 0, 0] };
  const group = buildNightstand(build, scene, stand);
  let yaw = 0.5;
  let dragX = 0;
  let dragging = false;

  function render(): void {
    const width = canvas.clientWidth || 1;
    const viewHeight = canvas.clientHeight || 1;
    camera.aspect = width / viewHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(width, viewHeight, false);
    group.rotation.y = yaw;
    renderer.render(scene, camera);
  }

  function down(event: PointerEvent): void {
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
