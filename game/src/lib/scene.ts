import * as THREE from 'three';
import type { PlayerRoom, Vec3 } from './types';
import { dispatch, handlerFor } from './props/register';
import type { Build } from './props/kit';

export type RoomView = {
  resize: () => void;
  project: (anchor: Vec3) => { x: number; y: number; visible: boolean };
  pick: (clientX: number, clientY: number) => string | null;
  dispose: () => void;
};

function chosenCamera(room: PlayerRoom): PlayerRoom['camera'] {
  const name = new URLSearchParams(window.location.search).get('shot');
  if (name && room.shots?.[name]) return room.shots[name];
  return room.camera;
}

export function mountRoom(canvas: HTMLCanvasElement, room: PlayerRoom): RoomView {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(room.background);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const shot = chosenCamera(room);
  const camera = new THREE.PerspectiveCamera(shot.fov, 1, 0.08, 40);
  camera.position.set(shot.position[0], shot.position[1], shot.position[2]);
  camera.lookAt(shot.target[0], shot.target[1], shot.target[2]);

  const amb = new THREE.AmbientLight(room.lighting.ambient.color, room.lighting.ambient.intensity);
  const hemi = new THREE.HemisphereLight(
    room.lighting.hemisphere.sky,
    room.lighting.hemisphere.ground,
    room.lighting.hemisphere.intensity,
  );
  const sun = new THREE.DirectionalLight(room.lighting.sun.color, room.lighting.sun.intensity);
  sun.position.set(room.lighting.sun.position[0], room.lighting.sun.position[1], room.lighting.sun.position[2]);
  sun.target.position.set(0.15, 0.05, 0.05);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 0.4;
  sun.shadow.camera.far = 16;
  sun.shadow.camera.left = -5;
  sun.shadow.camera.right = 5;
  sun.shadow.camera.top = 5;
  sun.shadow.camera.bottom = -5;
  sun.shadow.bias = -0.001;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 6;
  sun.shadow.blurSamples = 16;
  const patch = new THREE.SpotLight(room.lighting.sun.color, room.lighting.sun.intensity * 5, 8, 0.62, 0.9, 1.2);
  patch.position.set(room.lighting.sun.position[0], room.lighting.sun.position[1], room.lighting.sun.position[2]);
  patch.target.position.set(-0.1, 0.02, 0.35);
  const fill = new THREE.DirectionalLight(room.lighting.fill.color, room.lighting.fill.intensity);
  fill.position.set(room.lighting.fill.position[0], room.lighting.fill.position[1], room.lighting.fill.position[2]);
  const foreground = new THREE.SpotLight('#ffe6c4', 8, 2.6, 0.4, 0.8, 2);
  foreground.position.set(0.05, 1.45, 2.05);
  foreground.target.position.set(0.02, 0, 1.25);
  scene.add(amb, hemi, sun, sun.target, patch, patch.target, fill, foreground, foreground.target);

  const build: Build = { geos: [], mats: [], textures: [], matCache: new Map() };
  const root = new THREE.Group();
  for (const obj of room.objects) {
    if (handlerFor(obj.kind).role !== 'scene') throw new Error(`${obj.slug} ไม่อยู่ชั้นบนของฉาก`);
    dispatch(build, root, obj);
  }
  scene.add(root);

  const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  build.mats.push(hitMat);
  const hitMeshes: THREE.Mesh[] = [];
  for (const hotspot of room.hotspots) {
    const geo = new THREE.BoxGeometry(hotspot.hit.size[0], hotspot.hit.size[1], hotspot.hit.size[2]);
    build.geos.push(geo);
    const mesh = new THREE.Mesh(geo, hitMat);
    mesh.position.set(hotspot.hit.position[0], hotspot.hit.position[1], hotspot.hit.position[2]);
    mesh.userData.hotspotId = hotspot.id;
    scene.add(mesh);
    hitMeshes.push(mesh);
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const projected = new THREE.Vector3();

  function render(): void {
    renderer.render(scene, camera);
  }

  function resize(): void {
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    render();
  }

  function project(anchor: Vec3): { x: number; y: number; visible: boolean } {
    projected.set(anchor[0], anchor[1], anchor[2]).project(camera);
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    return {
      x: (projected.x * 0.5 + 0.5) * width,
      y: (-projected.y * 0.5 + 0.5) * height,
      visible: projected.z > -1 && projected.z < 1,
    };
  }

  function pick(clientX: number, clientY: number): string | null {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(hitMeshes, false);
    const id = hits[0]?.object.userData.hotspotId;
    return typeof id === 'string' ? id : null;
  }

  function dispose(): void {
    renderer.dispose();
    for (const geo of build.geos) geo.dispose();
    for (const mat of build.mats) mat.dispose();
    for (const tex of build.textures) tex.dispose();
    scene.clear();
  }

  resize();
  return { resize, project, pick, dispose };
}
