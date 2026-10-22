import * as THREE from 'three';
import type { PlayerRoom, RoomObject, ShadowMode, Vec3 } from './types';

const DEG = Math.PI / 180;

export type RoomView = {
  resize: () => void;
  project: (anchor: Vec3) => { x: number; y: number; visible: boolean };
  pick: (clientX: number, clientY: number) => string | null;
  dispose: () => void;
};

type Build = {
  geos: THREE.BufferGeometry[];
  mats: THREE.Material[];
  matCache: Map<string, THREE.Material>;
};

function material(
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

function addBox(
  build: Build,
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  color: string,
  opts?: { shadow?: ShadowMode; emissive?: string; basic?: boolean; map?: THREE.Texture },
): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d);
  build.geos.push(geo);
  const mesh = new THREE.Mesh(geo, material(build, color, opts));
  mesh.position.set(x, y, z);
  const shadow = opts?.shadow ?? 'both';
  mesh.castShadow = shadow === 'cast' || shadow === 'both';
  mesh.receiveShadow = shadow === 'receive' || shadow === 'both';
  parent.add(mesh);
  return mesh;
}

function addCyl(
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

function place(group: THREE.Object3D, position: Vec3, rotation?: Vec3): void {
  group.position.set(position[0], position[1], position[2]);
  if (rotation) {
    group.rotation.set(rotation[0] * DEG, rotation[1] * DEG, rotation[2] * DEG);
  }
}

function calendarTexture(head: string, paper: string, ink: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, 128, 160);
  ctx.fillStyle = head;
  ctx.fillRect(0, 0, 128, 32);
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 2;
  for (let row = 0; row < 5; row += 1) {
    for (let col = 0; col < 7; col += 1) {
      ctx.strokeRect(10 + col * 16, 44 + row * 22, 13, 16);
    }
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = head;
  ctx.fillRect(10 + 4 * 16, 44 + 3 * 22, 13, 16);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

function addObject(build: Build, parent: THREE.Object3D, obj: RoomObject): void {
  switch (obj.kind) {
    case 'box': {
      addBox(build, parent, obj.size[0], obj.size[1], obj.size[2], obj.position[0], obj.position[1], obj.position[2], obj.color, {
        shadow: obj.shadow,
      });
      const mesh = parent.children[parent.children.length - 1] as THREE.Mesh;
      if (obj.rotation) {
        mesh.rotation.set(obj.rotation[0] * DEG, obj.rotation[1] * DEG, obj.rotation[2] * DEG);
      }
      return;
    }
    case 'floor': {
      const [w, thick, d] = obj.size;
      const g = new THREE.Group();
      place(g, obj.position);
      addBox(build, g, w, thick, d, 0, -thick / 2, 0, obj.colors[obj.colors.length - 1] ?? '#c9954c', { shadow: 'receive' });
      const n = 8;
      const gap = 0.015;
      const plankW = (w - gap * (n + 1)) / n;
      for (let i = 0; i < n; i += 1) {
        const x = -w / 2 + gap + plankW / 2 + i * (plankW + gap);
        const color = obj.colors[i % obj.colors.length] ?? '#e0b06a';
        addBox(build, g, plankW, 0.02, d - 0.04, x, 0.01, 0, color, { shadow: 'receive' });
      }
      parent.add(g);
      return;
    }
    case 'window': {
      const g = new THREE.Group();
      place(g, obj.position, obj.rotation);
      const [w, h] = obj.size;
      addBox(build, g, w + 0.1, h + 0.1, 0.06, 0, 0, 0.02, obj.colors.frame);
      addBox(build, g, w, h, 0.02, 0, 0, 0.045, obj.colors.glass, { basic: true, shadow: 'none' });
      addBox(build, g, 0.035, h, 0.025, 0, 0, 0.06, obj.colors.frame, { shadow: 'none' });
      addBox(build, g, w, 0.035, 0.025, 0, 0, 0.06, obj.colors.frame, { shadow: 'none' });
      const cw = w * 0.22;
      addBox(build, g, cw, h * 0.92, 0.04, -w / 2 + cw / 2, -0.02, 0.09, obj.colors.curtain);
      addBox(build, g, cw, h * 0.92, 0.04, w / 2 - cw / 2, -0.02, 0.09, obj.colors.curtain);
      addCyl(build, g, 0.018, 0.018, w + 0.18, 0, h / 2 + 0.03, 0.09, obj.colors.rod, 'x');
      addBox(build, g, w + 0.18, 0.05, 0.14, 0, -h / 2 - 0.02, 0.09, obj.colors.sill);
      const sunGeo = new THREE.CircleGeometry(0.1, 12);
      build.geos.push(sunGeo);
      const sun = new THREE.Mesh(sunGeo, material(build, obj.colors.sun, { basic: true }));
      sun.position.set(w * 0.18, h * 0.16, 0.07);
      g.add(sun);
      parent.add(g);
      return;
    }
    case 'door': {
      const g = new THREE.Group();
      place(g, obj.position, obj.rotation);
      const [w, h] = obj.size;
      addBox(build, g, w + 0.12, h + 0.08, 0.07, 0, 0.02, 0, obj.colors.frame);
      addBox(build, g, w, h, 0.045, 0, 0, 0.04, obj.colors.slab);
      addBox(build, g, w * 0.68, h * 0.32, 0.02, 0, h * 0.18, 0.07, obj.colors.panel, { shadow: 'none' });
      addBox(build, g, w * 0.68, h * 0.32, 0.02, 0, -h * 0.2, 0.07, obj.colors.panel, { shadow: 'none' });
      addCyl(build, g, 0.04, 0.04, 0.045, w * 0.32, 0.02, 0.1, obj.colors.knob, 'z', 10);
      parent.add(g);
      return;
    }
    case 'bed': {
      const g = new THREE.Group();
      place(g, obj.position, obj.rotation);
      const [w, , len] = obj.size;
      const frameH = 0.22;
      addBox(build, g, w, frameH, len, 0, frameH / 2, 0, obj.colors.frame);
      addBox(build, g, w, 0.52, 0.07, 0, 0.34, -len / 2 + 0.035, obj.colors.head);
      addBox(build, g, w - 0.08, 0.12, len - 0.12, 0, frameH + 0.06, 0.03, obj.colors.sheet);
      addBox(build, g, w * 0.55, 0.1, 0.32, 0, frameH + 0.16, -len / 2 + 0.32, obj.colors.pillow);
      addBox(build, g, w - 0.12, 0.08, len * 0.52, 0, frameH + 0.15, len * 0.16, obj.colors.blanket);
      parent.add(g);
      return;
    }
    case 'desk': {
      const g = new THREE.Group();
      place(g, obj.position, obj.rotation);
      const [w, h, d] = obj.size;
      const topT = 0.06;
      addBox(build, g, w, topT, d, 0, h - topT / 2, 0, obj.colors.top);
      const leg = 0.06;
      const hy = (h - topT) / 2;
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          addBox(
            build,
            g,
            leg,
            h - topT,
            leg,
            sx * (w / 2 - 0.08),
            hy,
            sz * (d / 2 - 0.08),
            obj.colors.leg,
          );
        }
      }
      addBox(build, g, 0.18, 0.035, 0.12, 0, h + 0.02, -d / 2 + 0.14, obj.colors.bezel);
      addBox(build, g, 0.045, 0.16, 0.04, 0, h + 0.12, -d / 2 + 0.14, obj.colors.bezel);
      addBox(build, g, 0.52, 0.34, 0.04, 0, h + 0.36, -d / 2 + 0.12, obj.colors.bezel);
      addBox(build, g, 0.44, 0.26, 0.012, 0, h + 0.36, -d / 2 + 0.148, obj.colors.screen, {
        basic: true,
        shadow: 'none',
      });
      addBox(build, g, 0.36, 0.02, 0.12, -0.04, h + 0.012, 0.02, obj.colors.key, { shadow: 'none' });
      addBox(build, g, 0.08, 0.02, 0.1, 0.28, h + 0.012, 0.04, obj.colors.key, { shadow: 'none' });
      parent.add(g);
      return;
    }
    case 'shelf': {
      const g = new THREE.Group();
      place(g, obj.position, obj.rotation);
      const [w, h, d] = obj.size;
      addBox(build, g, 0.04, h, d, -w / 2 + 0.02, h / 2, 0, obj.color);
      addBox(build, g, 0.04, h, d, w / 2 - 0.02, h / 2, 0, obj.color);
      addBox(build, g, w, h, 0.02, 0, h / 2, -d / 2 + 0.01, obj.color);
      const levels = [0.04, h * 0.34, h * 0.64, h - 0.02];
      for (const y of levels) addBox(build, g, w - 0.06, 0.03, d - 0.02, 0, y, 0.01, obj.color);
      const rows = [levels[0] ?? 0.04, levels[1] ?? 0.4, levels[2] ?? 0.8];
      obj.books.forEach((book, index) => {
        const row = rows[index % rows.length] ?? 0.04;
        const col = Math.floor(index / rows.length);
        const bw = 0.055;
        const x = -w / 2 + 0.1 + col * (bw + 0.012);
        if (x > w / 2 - 0.28) return;
        addBox(build, g, bw, book.h, d * 0.62, x, row + 0.02 + book.h / 2, 0.02, book.color, { shadow: 'cast' });
      });
      parent.add(g);
      return;
    }
    case 'calendar': {
      const g = new THREE.Group();
      place(g, obj.position, obj.rotation);
      const [w, h] = obj.size;
      addBox(build, g, w + 0.04, h + 0.04, 0.02, 0, 0, 0, obj.colors.ink, { shadow: 'none' });
      const tex = calendarTexture(obj.colors.head, obj.colors.paper, obj.colors.ink);
      const geo = new THREE.PlaneGeometry(w, h);
      build.geos.push(geo);
      const face = new THREE.Mesh(geo, material(build, '#ffffff', { basic: true, map: tex }));
      face.position.z = 0.016;
      g.add(face);
      parent.add(g);
      return;
    }
    case 'board': {
      const g = new THREE.Group();
      place(g, obj.position, obj.rotation);
      const [w, h] = obj.size;
      addBox(build, g, w + 0.06, h + 0.06, 0.025, 0, 0, 0, obj.colors.frame);
      addBox(build, g, w, h, 0.02, 0, 0, 0.02, obj.colors.cork);
      addBox(build, g, 0.16, 0.12, 0.008, -0.1, 0.06, 0.036, '#f7f4ee', { shadow: 'none' });
      addBox(build, g, 0.13, 0.09, 0.008, -0.1, 0.06, 0.042, obj.colors.photoA, { basic: true, shadow: 'none' });
      addBox(build, g, 0.14, 0.11, 0.008, 0.1, 0.05, 0.036, '#f7f4ee', { shadow: 'none' });
      addBox(build, g, 0.11, 0.08, 0.008, 0.1, 0.05, 0.042, obj.colors.photoB, { basic: true, shadow: 'none' });
      addBox(build, g, 0.12, 0.1, 0.008, 0.02, -0.1, 0.04, obj.colors.note, { basic: true, shadow: 'none' });
      parent.add(g);
      return;
    }
    case 'rug': {
      const g = new THREE.Group();
      place(g, obj.position);
      const [w, d] = obj.size;
      addBox(build, g, w, 0.015, d, 0, 0.008, 0, obj.colors.edge, { shadow: 'receive' });
      addBox(build, g, w * 0.86, 0.012, d * 0.82, 0, 0.016, 0, obj.colors.fill, { shadow: 'receive' });
      parent.add(g);
      return;
    }
    case 'plant': {
      const g = new THREE.Group();
      place(g, obj.position);
      addCyl(build, g, 0.075, 0.095, 0.13, 0, 0.065, 0, obj.colors.pot, 'y', 8);
      addCyl(build, g, 0.068, 0.068, 0.02, 0, 0.13, 0, obj.colors.soil, 'y', 8);
      for (let i = 0; i < 5; i += 1) {
        const geo = new THREE.ConeGeometry(0.07, 0.24, 5);
        build.geos.push(geo);
        const leaf = new THREE.Mesh(geo, material(build, obj.colors.leaf));
        const a = (i / 5) * Math.PI * 2;
        leaf.position.set(Math.cos(a) * 0.04, 0.3, Math.sin(a) * 0.04);
        leaf.rotation.z = Math.cos(a) * 0.45;
        leaf.rotation.x = -Math.sin(a) * 0.45;
        leaf.castShadow = true;
        g.add(leaf);
      }
      parent.add(g);
      return;
    }
    case 'lamp': {
      const g = new THREE.Group();
      place(g, obj.position);
      addCyl(build, g, 0.08, 0.09, 0.03, 0, 0.015, 0, obj.colors.base, 'y', 8);
      addCyl(build, g, 0.015, 0.015, 0.22, 0, 0.14, 0, obj.colors.pole, 'y', 6);
      const shade = new THREE.ConeGeometry(0.1, 0.1, 6, 1, true);
      build.geos.push(shade);
      const shadeMesh = new THREE.Mesh(shade, material(build, obj.colors.shade));
      shadeMesh.position.y = 0.28;
      shadeMesh.castShadow = true;
      g.add(shadeMesh);
      parent.add(g);
      return;
    }
    case 'poster': {
      const g = new THREE.Group();
      place(g, obj.position, obj.rotation);
      const [w, h] = obj.size;
      addBox(build, g, w, h, 0.02, 0, 0, 0, obj.colors.paper, { shadow: 'none' });
      const shape = new THREE.Shape();
      const spikes = 5;
      const outer = Math.min(w, h) * 0.28;
      const inner = outer * 0.42;
      for (let i = 0; i < spikes * 2; i += 1) {
        const rad = (i * Math.PI) / spikes - Math.PI / 2;
        const r = i % 2 === 0 ? outer : inner;
        const x = Math.cos(rad) * r;
        const y = Math.sin(rad) * r;
        if (i === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      }
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.015, bevelEnabled: false });
      build.geos.push(geo);
      const star = new THREE.Mesh(geo, material(build, obj.colors.star, { basic: true }));
      star.position.z = 0.012;
      g.add(star);
      parent.add(g);
      return;
    }
    case 'ball': {
      const geo = new THREE.SphereGeometry(obj.radius, 8, 6);
      build.geos.push(geo);
      const mesh = new THREE.Mesh(geo, material(build, obj.color));
      mesh.position.set(obj.position[0], obj.position[1], obj.position[2]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return;
    }
    default:
      return;
  }
}

export function mountRoom(canvas: HTMLCanvasElement, room: PlayerRoom): RoomView {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor('#c5dff0');
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(room.camera.fov, 1, 0.08, 40);
  camera.position.set(room.camera.position[0], room.camera.position[1], room.camera.position[2]);
  camera.lookAt(room.camera.target[0], room.camera.target[1], room.camera.target[2]);

  const amb = new THREE.AmbientLight(room.lighting.ambient.color, room.lighting.ambient.intensity);
  const hemi = new THREE.HemisphereLight(
    room.lighting.hemisphere.sky,
    room.lighting.hemisphere.ground,
    room.lighting.hemisphere.intensity,
  );
  const sun = new THREE.DirectionalLight(room.lighting.sun.color, room.lighting.sun.intensity);
  sun.position.set(room.lighting.sun.position[0], room.lighting.sun.position[1], room.lighting.sun.position[2]);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 0.4;
  sun.shadow.camera.far = 14;
  sun.shadow.camera.left = -4;
  sun.shadow.camera.right = 4;
  sun.shadow.camera.top = 4;
  sun.shadow.camera.bottom = -4;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  const fill = new THREE.DirectionalLight(room.lighting.fill.color, room.lighting.fill.intensity);
  fill.position.set(room.lighting.fill.position[0], room.lighting.fill.position[1], room.lighting.fill.position[2]);
  scene.add(amb, hemi, sun, fill);

  const build: Build = { geos: [], mats: [], matCache: new Map() };
  const root = new THREE.Group();
  for (const obj of room.objects) addObject(build, root, obj);
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
    scene.clear();
  }

  resize();
  return { resize, project, pick, dispose };
}
