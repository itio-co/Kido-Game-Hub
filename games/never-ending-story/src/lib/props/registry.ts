import type { Object3D } from 'three';
import type { EntityKind } from '../catalog';
import type { Buildable } from '../types';
import type { Build } from './kit';

export type KindRole = 'root' | 'scene' | 'nested' | 'ui' | 'data';

export type KindHandler = {
  role: KindRole;
  build?: (build: Build, parent: Object3D, entity: Buildable) => Object3D;
};

const handlers = new Map<EntityKind, KindHandler>();

export function registerKind(kind: EntityKind, handler: KindHandler): void {
  handlers.set(kind, handler);
}

export function handlerFor(kind: EntityKind): KindHandler {
  const handler = handlers.get(kind);
  if (!handler) throw new Error(`ไม่มีตัวสร้างสำหรับชนิด ${kind}`);
  return handler;
}

/** Scene construction dispatches on `kind`. */
export function dispatch(build: Build, parent: Object3D, entity: Buildable): Object3D {
  const handler = handlerFor(entity.kind);
  if (!handler.build || (handler.role !== 'scene' && handler.role !== 'nested')) {
    throw new Error(`ชนิด ${entity.kind} ไม่ได้สร้างเป็นวัตถุในฉาก`);
  }
  return handler.build(build, parent, entity);
}
