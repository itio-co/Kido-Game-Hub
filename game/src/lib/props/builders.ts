import * as THREE from 'three';
import type {
  BedEntity,
  BoxEntity,
  Buildable,
  CalendarEntity,
  DeskEntity,
  DoorEntity,
  FloorEntity,
  LampEntity,
  NightstandEntity,
  PlantEntity,
  RugEntity,
  WindowEntity,
} from '../types';
import { addBox, addCyl, canvasTexture, material, patternTexture, place, tag, type Build } from './kit';

function use<T extends Buildable>(entity: Buildable, kind: T['kind']): T {
  if (entity.kind !== kind) throw new Error(`expected ${kind}`);
  return entity as T;
}

function shadeRgb(hex: string, scale: number): [number, number, number] {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  const clamp = (channel: number) => Math.min(1, Math.max(0, channel * scale));
  return [clamp(((n >> 16) & 255) / 255), clamp(((n >> 8) & 255) / 255), clamp((n & 255) / 255)];
}

/** Large soft planes on the room-facing side so flat shading reads as low-poly wall facets. */
function addWallFacets(
  build: Build,
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  color: string,
  inward: 1 | -1,
  axis: 'x' | 'z',
): void {
  const cols = 3;
  const rows = 4;
  const positions: number[] = [];
  const colors: number[] = [];
  const spanU = axis === 'x' ? d : w;
  const bumpAt = (i: number, j: number) => {
    const n = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
    return (n - Math.floor(n) - 0.25) * 0.06;
  };
  const push = (u: number, v: number, bump: number, shade: number) => {
    const inset = 0.014 + Math.max(0, bump);
    const x = axis === 'x' ? inward * (w / 2 + inset) : u;
    const z = axis === 'z' ? inward * (d / 2 + inset) : u;
    positions.push(x, v, z);
    colors.push(...shadeRgb(color, shade));
  };
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const u0 = -spanU / 2 + (spanU * i) / cols;
      const u1 = -spanU / 2 + (spanU * (i + 1)) / cols;
      const v0 = (h * j) / rows;
      const v1 = (h * (j + 1)) / rows;
      const shade = 0.92 + ((i + j) % 3) * 0.05;
      const corners: [number, number, number][] = [
        [u0, v0, bumpAt(i, j)],
        [u1, v0, bumpAt(i + 1, j)],
        [u1, v1, bumpAt(i + 1, j + 1)],
        [u0, v1, bumpAt(i, j + 1)],
      ];
      const order = axis === 'z' ? (inward > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]) : inward > 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
      for (const index of order) {
        const corner = corners[index];
        if (!corner) continue;
        push(corner[0], corner[1], corner[2], shade);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  build.geos.push(geo);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  build.mats.push(mat);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  parent.add(mesh);
}

export function buildBox(build: Build, parent: THREE.Object3D, entity: Buildable): THREE.Object3D {
  const box = use<BoxEntity>(entity, 'box');
  const group = new THREE.Group();
  tag(group, box);
  place(group, box.position, box.rotation);
  addBox(build, group, box.size[0], box.size[1], box.size[2], 0, box.size[1] / 2, 0, box.color, { shadow: box.shadow });
  if (box.slug.includes('/wall-')) {
    const [w, h, d] = box.size;
    const axis = w <= d ? 'x' : 'z';
    const inward: 1 | -1 = axis === 'x' ? (box.position[0] < 0 ? 1 : -1) : box.position[2] < 0 ? 1 : -1;
    addWallFacets(build, group, w, h, d, box.color, inward, axis);
  }
  parent.add(group);
  return group;
}

export function buildFloor(build: Build, parent: THREE.Object3D, entity: Buildable): THREE.Object3D {
  const floor = use<FloorEntity>(entity, 'floor');
  const group = new THREE.Group();
  tag(group, floor);
  place(group, floor.position);
  const [w, thick, d] = floor.size;
  const grout = floor.colors[floor.colors.length - 1] ?? '#4a301c';
  const tones = floor.colors.slice(0, -1);
  const lights = tones.filter((_, index) => index % 2 === 0);
  const darks = tones.filter((_, index) => index % 2 === 1);
  addBox(build, group, w, thick, d, 0, -thick / 2, 0, grout, { shadow: 'receive' });
  const cols = 8;
  const rows = 14;
  const gap = 0.014;
  const tileW = (w - 0.08) / cols;
  const tileD = (d - 0.08) / rows;
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const family = (i + j) % 2 === 0 ? lights : darks;
      const palette = family.length > 0 ? family : tones;
      const color = palette[(i * 3 + j) % palette.length] ?? grout;
      const x = -w / 2 + 0.04 + tileW * (i + 0.5);
      const z = -d / 2 + 0.04 + tileD * (j + 0.5);
      addBox(build, group, tileW - gap, 0.02, tileD - gap, x, 0.012, z, color, { shadow: 'receive' });
    }
  }
  parent.add(group);
  return group;
}

function outdoorCanvas(sky: string, tree: string, sun: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const skyGrad = ctx.createLinearGradient(0, 0, 0, 256);
  skyGrad.addColorStop(0, '#c5ebff');
  skyGrad.addColorStop(0.42, sky);
  skyGrad.addColorStop(0.62, '#9dcf6a');
  skyGrad.addColorStop(1, '#5f8f3a');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#6fa844';
  ctx.fillRect(0, 150, 256, 106);
  ctx.fillStyle = tree;
  ctx.beginPath();
  ctx.moveTo(0, 168);
  ctx.lineTo(70, 132);
  ctx.lineTo(140, 176);
  ctx.lineTo(210, 128);
  ctx.lineTo(256, 170);
  ctx.lineTo(256, 256);
  ctx.lineTo(0, 256);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = sun;
  ctx.beginPath();
  ctx.arc(176, 64, 26, 0, Math.PI * 2);
  ctx.fill();
  const trees: [number, number, number][] = [
    [48, 118, 92],
    [104, 128, 100],
    [168, 122, 86],
    [214, 136, 96],
  ];
  for (const [x, y, h] of trees) {
    ctx.fillStyle = '#3f7a32';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 34, y + h);
    ctx.lineTo(x - 34, y + h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = tree;
    ctx.beginPath();
    ctx.moveTo(x, y + 28);
    ctx.lineTo(x + 26, y + h * 0.85);
    ctx.lineTo(x - 26, y + h * 0.85);
    ctx.closePath();
    ctx.fill();
  }
  return canvas;
}

export function buildWindow(build: Build, parent: THREE.Object3D, entity: Buildable): THREE.Object3D {
  const win = use<WindowEntity>(entity, 'window');
  const group = new THREE.Group();
  tag(group, win);
  place(group, win.position, win.rotation);
  const [w, h] = win.size;
  const c = win.colors;
  const outdoor = canvasTexture(build, outdoorCanvas(c.sky, c.tree, c.sun));
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.92, h * 0.92), new THREE.MeshBasicMaterial({ map: outdoor }));
  build.geos.push(backdrop.geometry);
  build.mats.push(backdrop.material);
  backdrop.position.z = 0.012;
  group.add(backdrop);

  addBox(build, group, w + 0.08, h + 0.08, 0.045, 0, 0, 0.03, c.frame, { shadow: 'none' });
  addBox(build, group, w * 0.9, h * 0.9, 0.012, 0, 0, 0.05, c.glass, { basic: true, opacity: 0.18, shadow: 'none' });
  addBox(build, group, 0.028, h * 0.9, 0.02, 0, 0, 0.062, c.frame, { shadow: 'none' });
  addBox(build, group, w * 0.9, 0.028, 0.02, 0, 0, 0.062, c.frame, { shadow: 'none' });

  const cw = w * 0.3;
  addBox(build, group, cw, h * 0.46, 0.035, -w / 2 + cw / 2 + 0.02, h * 0.24, 0.09, c.curtain, { shadow: 'none' });
  addBox(build, group, cw * 0.72, 0.05, 0.05, -w / 2 + cw / 2 + 0.02, 0.02, 0.1, c.curtain, { shadow: 'none' });
  addBox(build, group, cw * 1.05, h * 0.42, 0.04, -w / 2 + cw * 0.42, -h * 0.24, 0.1, c.curtain, { shadow: 'none' });
  addBox(build, group, cw, h * 0.46, 0.035, w / 2 - cw / 2 - 0.02, h * 0.24, 0.09, c.curtain, { shadow: 'none' });
  addBox(build, group, cw * 0.72, 0.05, 0.05, w / 2 - cw / 2 - 0.02, 0.02, 0.1, c.curtain, { shadow: 'none' });
  addBox(build, group, cw * 1.05, h * 0.42, 0.04, w / 2 - cw * 0.42, -h * 0.24, 0.1, c.curtain, { shadow: 'none' });

  addCyl(build, group, 0.02, 0.02, w + 0.22, 0, h / 2 + 0.06, 0.1, c.rod, 'x', 8);
  addCyl(build, group, 0.032, 0.032, 0.04, -w / 2 - 0.08, h / 2 + 0.06, 0.1, c.rod, 'x', 8);
  addCyl(build, group, 0.032, 0.032, 0.04, w / 2 + 0.08, h / 2 + 0.06, 0.1, c.rod, 'x', 8);
  parent.add(group);
  return group;
}

export function buildDoor(build: Build, parent: THREE.Object3D, entity: Buildable): THREE.Object3D {
  const door = use<DoorEntity>(entity, 'door');
  const group = new THREE.Group();
  tag(group, door);
  place(group, door.position, door.rotation);
  const [w, h] = door.size;
  const c = door.colors;
  addBox(build, group, w + 0.12, h + 0.08, 0.06, 0, 0.02, 0, c.frame);
  addBox(build, group, w, h, 0.04, 0, 0, 0.035, c.slab);
  addBox(build, group, w * 0.72, h * 0.28, 0.018, 0, h * 0.22, 0.058, c.panel, { shadow: 'none' });
  addBox(build, group, w * 0.72, h * 0.36, 0.018, 0, -h * 0.16, 0.058, c.panel, { shadow: 'none' });
  const lever = new THREE.Group();
  lever.position.set(w * 0.32, 0.02, 0.08);
  addCyl(build, lever, 0.028, 0.028, 0.02, 0, 0, 0, c.knob, 'z', 8);
  addBox(build, lever, 0.09, 0.02, 0.018, 0.02, -0.03, 0.012, c.knob, { shadow: 'none' });
  group.add(lever);
  parent.add(group);
  return group;
}

function curvedBoard(build: Build, w: number, h: number, depth: number, arch: number, color: string): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(-w / 2, h * 0.62);
  shape.quadraticCurveTo(-w * 0.15, h + arch, w * 0.15, h * 0.78);
  shape.quadraticCurveTo(w * 0.35, h + arch * 0.3, w / 2, h * 0.55);
  shape.lineTo(w / 2, 0);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 2 });
  geo.translate(0, 0, -depth / 2);
  build.geos.push(geo);
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, flatShading: true }));
  build.mats.push(mesh.material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function buildBed(build: Build, parent: THREE.Object3D, entity: Buildable): THREE.Object3D {
  const bed = use<BedEntity>(entity, 'bed');
  const group = new THREE.Group();
  tag(group, bed);
  place(group, bed.position, bed.rotation);
  const [w, , len] = bed.size;
  const wood = bed.colors.wood;
  const frame = new THREE.Group();
  frame.name = `${bed.slug}/frame`;
  const bedding = new THREE.Group();
  bedding.name = `${bed.slug}/bedding`;

  const post = 0.07;
  const posts: [number, number, number][] = [
    [-w / 2 + post / 2, 0.62, -len / 2 + post / 2],
    [w / 2 - post / 2, 0.62, -len / 2 + post / 2],
    [-w / 2 + post / 2, 0.42, len / 2 - post / 2],
    [w / 2 - post / 2, 0.42, len / 2 - post / 2],
  ];
  for (const [x, h, z] of posts) addBox(build, frame, post, h, post, x, h / 2, z, wood);

  addBox(build, frame, post, 0.12, len - post * 2, -w / 2 + post / 2, 0.2, 0, wood);
  addBox(build, frame, post, 0.12, len - post * 2, w / 2 - post / 2, 0.2, 0, wood);
  const head = curvedBoard(build, w - post, 0.58, 0.045, 0.08, wood);
  head.position.set(0, 0.16, -len / 2 + 0.05);
  frame.add(head);
  const foot = curvedBoard(build, w - post * 2, 0.28, 0.04, 0.04, wood);
  foot.position.set(0, 0.16, len / 2 - 0.05);
  frame.add(foot);

  addBox(build, bedding, w - 0.1, 0.1, len - 0.16, 0, 0.3, 0, bed.colors.sheet);
  const pillowGeo = new THREE.IcosahedronGeometry(1, 0);
  pillowGeo.scale(w * 0.28, 0.1, 0.16);
  build.geos.push(pillowGeo);
  const pillow = new THREE.Mesh(pillowGeo, new THREE.MeshLambertMaterial({ color: bed.colors.pillow, flatShading: true }));
  build.mats.push(pillow.material);
  pillow.position.set(0, 0.4, -len / 2 + 0.28);
  pillow.castShadow = true;
  bedding.add(pillow);

  const quiltColors = bed.colors.quilt;
  const patches = [
    [40, 48, 54, 40, -8],
    [100, 70, 46, 36, 6],
    [36, 110, 40, 34, 4],
    [96, 130, 58, 42, -6],
    [150, 50, 44, 38, 10],
    [168, 112, 50, 36, -4],
    [70, 180, 62, 40, 3],
    [140, 176, 48, 44, -9],
    [40, 210, 42, 32, 7],
    [110, 230, 50, 36, -3],
    [175, 214, 40, 34, 5],
  ].map(([x, y, pw, ph, rot], index) => ({
    x: x ?? 0,
    y: y ?? 0,
    w: pw ?? 40,
    h: ph ?? 30,
    rot: rot ?? 0,
    color: quiltColors[index % quiltColors.length] ?? '#f3c9b0',
  }));
  const tex = patternTexture(build, 220, 280, '#f7e6d2', patches);
  addBox(build, bedding, w - 0.04, 0.07, len * 0.62, 0, 0.38, len * 0.12, '#ffffff', { map: tex, shadow: 'cast' });

  group.add(frame, bedding);
  parent.add(group);
  return group;
}

/** Low-poly top: a raised center and a lower front edge so flat shading shows wood facets. */
function addFacetedSlab(
  build: Build,
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  y: number,
  color: string,
): void {
  const hw = w / 2;
  const hd = d / 2;
  const y0 = y - h / 2;
  const y1 = y + h / 2;
  const verts: [number, number, number][] = [
    [-hw, y0, -hd],
    [hw, y0, -hd],
    [hw, y0, hd],
    [-hw, y0, hd],
    [-hw, y1 + 0.006, -hd],
    [hw, y1 + 0.004, -hd],
    [hw, y1 - 0.008, hd],
    [-hw, y1 - 0.006, hd],
    [0, y1 + 0.016, 0],
  ];
  const faces = [
    [0, 2, 1],
    [0, 3, 2],
    [0, 1, 5],
    [0, 5, 4],
    [1, 2, 6],
    [1, 6, 5],
    [2, 3, 7],
    [2, 7, 6],
    [3, 0, 4],
    [3, 4, 7],
    [4, 5, 8],
    [5, 6, 8],
    [6, 7, 8],
    [7, 4, 8],
  ];
  const positions: number[] = [];
  for (const face of faces) {
    for (const index of face) {
      const vert = verts[index];
      if (!vert) continue;
      positions.push(vert[0], vert[1], vert[2]);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  build.geos.push(geo);
  const mesh = new THREE.Mesh(geo, material(build, color));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
}

export function buildNightstand(build: Build, parent: THREE.Object3D, entity: Buildable): THREE.Object3D {
  const table = use<NightstandEntity>(entity, 'nightstand');
  const group = new THREE.Group();
  tag(group, table);
  place(group, table.position, table.rotation);
  const [w, h, d] = table.size;
  const topT = 0.05;
  const topW = w + 0.1;
  const topD = d + 0.08;
  addFacetedSlab(build, group, topW, topT, topD, h - topT / 2, table.colors.top);

  const drawerH = h * 0.36;
  const drawerW = w * 0.78;
  const drawerD = d * 0.7;
  const drawerY = h - topT - drawerH / 2 - 0.01;
  addBox(build, group, drawerW, drawerH, drawerD, 0, drawerY, -0.02, table.colors.wood);
  const frontZ = -0.02 + drawerD / 2 + 0.01;
  addBox(build, group, drawerW * 0.88, drawerH * 0.7, 0.018, 0, drawerY, frontZ, table.colors.wood, {
    shadow: 'none',
  });
  addBox(build, group, w * 0.16, 0.014, 0.016, 0, drawerY, frontZ + 0.014, table.colors.knob, {
    shadow: 'none',
  });

  const legTop = drawerY - drawerH / 2;
  const leg = 0.042;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addBox(
        build,
        group,
        leg,
        legTop,
        leg,
        sx * (w * 0.34),
        legTop / 2,
        sz * (d * 0.3),
        table.colors.wood,
      );
    }
  }
  parent.add(group);
  return group;
}

export function buildDesk(build: Build, parent: THREE.Object3D, entity: Buildable): THREE.Object3D {
  const desk = use<DeskEntity>(entity, 'desk');
  const group = new THREE.Group();
  tag(group, desk);
  place(group, desk.position, desk.rotation);
  const [w, h, d] = desk.size;
  const frame = new THREE.Group();
  frame.name = `${desk.slug}/frame`;
  const monitor = new THREE.Group();
  monitor.name = `${desk.slug}/monitor`;
  const topT = 0.06;
  addBox(build, frame, w, topT, d, 0, h - topT / 2, 0, desk.colors.top);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addBox(build, frame, 0.06, h - topT, 0.06, sx * (w / 2 - 0.08), (h - topT) / 2, sz * (d / 2 - 0.08), desk.colors.leg);
    }
  }
  addBox(build, monitor, 0.045, 0.16, 0.04, 0, h + 0.12, -d / 2 + 0.14, desk.colors.bezel);
  addBox(build, monitor, 0.52, 0.34, 0.04, 0, h + 0.36, -d / 2 + 0.12, desk.colors.bezel);
  addBox(build, monitor, 0.44, 0.26, 0.012, 0, h + 0.36, -d / 2 + 0.148, desk.colors.screen, {
    basic: true,
    shadow: 'none',
    name: `${desk.id}.screen`,
  });
  addBox(build, frame, 0.36, 0.02, 0.12, -0.04, h + 0.012, 0.02, desk.colors.key, { shadow: 'none' });
  group.add(frame, monitor);
  parent.add(group);
  return group;
}

function calendarPage(head: string, paper: string, ink: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, 128, 160);
  ctx.fillStyle = head;
  ctx.fillRect(0, 0, 128, 28);
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 2;
  for (let row = 0; row < 5; row += 1) {
    for (let col = 0; col < 7; col += 1) {
      ctx.strokeRect(12 + col * 15, 42 + row * 22, 12, 16);
    }
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = head;
  ctx.fillRect(12 + 4 * 15, 42 + 3 * 22, 12, 16);
  return canvas;
}

export function buildCalendar(build: Build, parent: THREE.Object3D, entity: Buildable): THREE.Object3D {
  const calendar = use<CalendarEntity>(entity, 'calendar');
  const group = new THREE.Group();
  tag(group, calendar);
  place(group, calendar.position, calendar.rotation);
  const [w, h] = calendar.size;
  const c = calendar.colors;
  addCyl(build, group, 0.035, 0.035, 0.04, 0, h / 2 + 0.16, 0.02, c.head, 'z', 10);
  addBox(build, group, 0.012, 0.14, 0.012, -w * 0.22, h / 2 + 0.08, 0.02, c.ink, { shadow: 'none' });
  addBox(build, group, 0.012, 0.14, 0.012, w * 0.22, h / 2 + 0.08, 0.02, c.ink, { shadow: 'none' });
  addBox(build, group, w + 0.04, 0.06, 0.025, 0, h / 2 + 0.02, 0, c.head);
  const tex = canvasTexture(build, calendarPage(c.head, c.paper, c.ink));
  addBox(build, group, w, h, 0.02, 0, 0, 0, '#ffffff', { map: tex, basic: true, shadow: 'none' });
  parent.add(group);
  return group;
}

export function buildRug(build: Build, parent: THREE.Object3D, entity: Buildable): THREE.Object3D {
  const rug = use<RugEntity>(entity, 'rug');
  const group = new THREE.Group();
  tag(group, rug);
  place(group, rug.position);
  const [w, d] = rug.size;
  const cols = 5;
  const rows = 6;
  const patches = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      patches.push({
        x: ((col + 0.5) / cols) * 320,
        y: ((row + 0.5) / rows) * 400,
        w: 320 / cols - 14,
        h: 400 / rows - 14,
        rot: 0,
        color: rug.colors.patches[(col + row * 2) % rug.colors.patches.length] ?? '#e25d6a',
      });
    }
  }
  const tex = patternTexture(build, 320, 400, rug.colors.fill, patches, rug.colors.edge);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  addBox(build, group, w, 0.02, d, 0, 0.012, 0, '#ffffff', { map: tex, shadow: 'receive' });
  parent.add(group);
  return group;
}

export function buildPlant(build: Build, parent: THREE.Object3D, entity: Buildable): THREE.Object3D {
  const plant = use<PlantEntity>(entity, 'plant');
  const group = new THREE.Group();
  tag(group, plant);
  place(group, plant.position, plant.rotation);
  addCyl(build, group, 0.09, 0.11, 0.13, 0, 0.065, 0, plant.colors.pot, 'y', 7);
  addCyl(build, group, 0.08, 0.08, 0.025, 0, 0.13, 0, plant.colors.soil, 'y', 7);
  for (let i = 0; i < 6; i += 1) {
    const geo = new THREE.ConeGeometry(0.075, 0.28, 4);
    build.geos.push(geo);
    const leaf = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: plant.colors.leaf, flatShading: true }));
    build.mats.push(leaf.material);
    const a = (i / 6) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 0.04, 0.32, Math.sin(a) * 0.04);
    leaf.rotation.z = Math.cos(a) * 0.55;
    leaf.rotation.x = -Math.sin(a) * 0.55;
    leaf.castShadow = true;
    group.add(leaf);
  }
  parent.add(group);
  return group;
}

export function buildLamp(build: Build, parent: THREE.Object3D, entity: Buildable): THREE.Object3D {
  const lamp = use<LampEntity>(entity, 'lamp');
  const group = new THREE.Group();
  tag(group, lamp);
  place(group, lamp.position, lamp.rotation);
  addCyl(build, group, 0.045, 0.045, 0.03, 0, 0, 0, lamp.colors.wood, 'z', 8);
  addCyl(build, group, 0.015, 0.015, 0.1, 0, -0.02, 0.06, lamp.colors.wood, 'z', 6);
  const shade = new THREE.ConeGeometry(0.07, 0.08, 6, 1, true);
  build.geos.push(shade);
  const shadeMesh = new THREE.Mesh(shade, new THREE.MeshLambertMaterial({ color: lamp.colors.shade, flatShading: true }));
  build.mats.push(shadeMesh.material);
  shadeMesh.position.set(0, -0.02, 0.12);
  shadeMesh.rotation.x = Math.PI / 2;
  shadeMesh.castShadow = true;
  group.add(shadeMesh);
  parent.add(group);
  return group;
}
