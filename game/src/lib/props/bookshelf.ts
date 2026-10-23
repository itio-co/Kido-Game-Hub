import * as THREE from 'three';
import type { BookEntity, BookshelfEntity, Buildable, ShelfRowEntity } from '../types';
import { addBox, place, tag, type Build } from './kit';
import { dispatch } from './registry';

type ShelfSize = { width: number; depth: number; color: string };

/** Wall or floor shelf: frame group, then one group per row, then one mesh per book. */
export function buildBookshelf(build: Build, parent: THREE.Object3D, entity: Buildable): THREE.Object3D {
  if (entity.kind !== 'bookshelf') throw new Error('expected bookshelf');
  const shelf = entity as BookshelfEntity;
  const group = new THREE.Group();
  tag(group, shelf);
  place(group, shelf.position, shelf.rotation);
  const [w, h, d] = shelf.size;
  const sideT = 0.035;
  addBox(build, group, sideT, h, d, -w / 2 + sideT / 2, h / 2, 0, shelf.color);
  addBox(build, group, sideT, h, d, w / 2 - sideT / 2, h / 2, 0, shelf.color);
  group.userData.shelf = { width: w, depth: d, color: shelf.color } satisfies ShelfSize;
  for (const row of shelf.rows) dispatch(build, group, row);
  parent.add(group);
  return group;
}

export function buildShelfRow(build: Build, parent: THREE.Object3D, entity: Buildable): THREE.Object3D {
  if (entity.kind !== 'shelf-row') throw new Error('expected shelf-row');
  const row = entity as ShelfRowEntity;
  const shelf = parent.userData.shelf as ShelfSize | undefined;
  if (!shelf) throw new Error(`${row.slug} ไม่อยู่ในชั้นหนังสือ`);
  const group = new THREE.Group();
  tag(group, row);
  group.position.y = row.y;
  const plankT = 0.04;
  addBox(build, group, shelf.width - 0.06, plankT, shelf.depth - 0.012, 0, -plankT / 2, 0.004, shelf.color);
  layBooks(build, group, row, shelf);
  parent.add(group);
  return group;
}

function layBooks(build: Build, rowGroup: THREE.Object3D, row: ShelfRowEntity, shelf: ShelfSize): void {
  const inset = shelf.width / 2 - 0.055;
  let cursor = -inset;
  const gap = 0.014;
  const placed = new Map<string, { x: number; z: number; top: number }>();

  for (const book of row.books) {
    if (book.stackOn) {
      const base = placed.get(book.stackOn);
      if (!base) continue;
      const obj = dispatch(build, rowGroup, book);
      obj.position.set(base.x, base.top, base.z);
      placed.set(book.id, { x: base.x, z: base.z, top: base.top + book.height });
      continue;
    }
    const tilt = ((book.tilt ?? 0) * Math.PI) / 180;
    const lean = book.pose === 'flat' ? 0 : Math.abs(Math.sin(tilt)) * book.height * 0.45;
    const span = book.width + lean;
    const x = cursor + span / 2;
    const obj = dispatch(build, rowGroup, book);
    obj.position.set(x, 0, 0.012);
    placed.set(book.id, { x, z: 0.012, top: book.height });
    cursor += span + gap;
  }
}

export function buildBook(build: Build, parent: THREE.Object3D, entity: Buildable): THREE.Object3D {
  if (entity.kind !== 'book') throw new Error('expected book');
  const book = entity as BookEntity;
  const group = new THREE.Group();
  tag(group, book);
  const tilt = ((book.tilt ?? 0) * Math.PI) / 180;
  if (book.pose === 'flat') group.rotation.y = tilt;
  else group.rotation.z = tilt;
  addBox(build, group, book.width, book.height, book.depth, 0, book.height / 2, 0, book.color, { shadow: 'cast' });
  parent.add(group);
  return group;
}
