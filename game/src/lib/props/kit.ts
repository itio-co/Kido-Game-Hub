import * as THREE from 'three';
import type { ShadowMode, Vec3 } from '../types';

export const DEG = Math.PI / 180;

export type Build = {
  geos: THREE.BufferGeometry[];
  mats: THREE.Material[];
  textures: THREE.Texture[];
  matCache: Map<string, THREE.Material>;
};

export function tag(
  object: THREE.Object3D,
  entity: { id: string; kind: string; slug: string; title: string },
): void {
  object.name = entity.slug;
  object.userData.id = entity.id;
  object.userData.kind = entity.kind;
  object.userData.slug = entity.slug;
  object.userData.title = entity.title;
}

export function material(
  build: Build,
  color: string,
  opts?: { opacity?: number; emissive?: string; map?: THREE.Texture; basic?: boolean },
): THREE.Material {
  const key = `${opts?.basic ? 'b' : 'l'}|${color}|${opts?.opacity ?? 1}|${opts?.emissive ?? ''}|${opts?.map ? 'm' : ''}`;
  const cached = opts?.map ? undefined : build.matCache.get(key);
  if (cached) return cached;
  const mat = opts?.basic
    ? new THREE.MeshBasicMaterial({
        color,
        map: opts.map,
        transparent: (opts.opacity ?? 1) < 1,
        opacity: opts.opacity ?? 1,
      })
    : new THREE.MeshLambertMaterial({
        color,
        map: opts?.map,
        flatShading: true,
        emissive: opts?.emissive ?? '#000000',
        transparent: (opts?.opacity ?? 1) < 1,
        opacity: opts?.opacity ?? 1,
      });
  if (opts?.map) mat.toneMapped = false;
  build.mats.push(mat);
  if (!opts?.map) build.matCache.set(key, mat);
  return mat;
}

export function addBox(
  build: Build,
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  color: string,
  opts?: { shadow?: ShadowMode; emissive?: string; basic?: boolean; map?: THREE.Texture; opacity?: number; name?: string },
): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d);
  build.geos.push(geo);
  const mesh = new THREE.Mesh(geo, material(build, color, opts));
  mesh.position.set(x, y, z);
  if (opts?.name) mesh.name = opts.name;
  const shadow = opts?.shadow ?? 'both';
  mesh.castShadow = shadow === 'cast' || shadow === 'both';
  mesh.receiveShadow = shadow === 'receive' || shadow === 'both';
  parent.add(mesh);
  return mesh;
}

export function addCyl(
  build: Build,
  parent: THREE.Object3D,
  radiusTop: number,
  radiusBottom: number,
  height: number,
  x: number,
  y: number,
  z: number,
  color: string,
  axis: 'x' | 'y' | 'z' = 'y',
  segments = 8,
): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments);
  build.geos.push(geo);
  const mesh = new THREE.Mesh(geo, material(build, color));
  mesh.position.set(x, y, z);
  if (axis === 'x') mesh.rotation.z = Math.PI / 2;
  if (axis === 'z') mesh.rotation.x = Math.PI / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function place(group: THREE.Object3D, position: Vec3, rotation?: Vec3): void {
  group.position.set(position[0], position[1], position[2]);
  if (rotation) group.rotation.set(rotation[0] * DEG, rotation[1] * DEG, rotation[2] * DEG);
}

export function canvasTexture(build: Build, canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  build.textures.push(tex);
  return tex;
}

type Patch = { x: number; y: number; w: number; h: number; rot: number; color: string };

export function patternTexture(
  build: Build,
  width: number,
  height: number,
  fill: string,
  patches: Patch[],
  border?: string,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvasTexture(build, canvas);
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, width, height);
  if (border) {
    const stroke = Math.round(Math.min(width, height) * 0.055);
    ctx.fillStyle = border;
    ctx.fillRect(0, 0, width, stroke);
    ctx.fillRect(0, height - stroke, width, stroke);
    ctx.fillRect(0, 0, stroke, height);
    ctx.fillRect(width - stroke, 0, stroke, height);
  }
  for (const patch of patches) {
    ctx.save();
    ctx.translate(patch.x, patch.y);
    ctx.rotate((patch.rot * Math.PI) / 180);
    ctx.fillStyle = patch.color;
    ctx.fillRect(-patch.w / 2, -patch.h / 2, patch.w, patch.h);
    ctx.restore();
  }
  return canvasTexture(build, canvas);
}
