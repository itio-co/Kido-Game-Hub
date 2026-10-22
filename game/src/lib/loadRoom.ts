import { validateRoom } from './catalog';
import type { PlayerRoom } from './types';

export async function loadPlayerRoom(): Promise<PlayerRoom> {
  const url = `${import.meta.env.BASE_URL}data/player-room.json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`โหลดห้องไม่ได้ (${response.status})`);
  const data: unknown = await response.json();
  return openRoom(data);
}

/** Validate identity fields and return a room whose objects can be looked up by id or slug. */
export function openRoom(data: unknown): PlayerRoom {
  const catalog = validateRoom(data);
  const room = data as PlayerRoom;
  const bySlug = catalog.getBySlug(room.slug);
  if (!bySlug || bySlug.id !== room.id) throw new Error('ดัชนีห้องไม่ตรง');
  const hinted = catalog.getById(room.hud.hintTarget);
  if (!hinted || hinted.kind !== 'hotspot') throw new Error('คำใบ้ไม่ได้ชี้จุดโต้ตอบ');
  return room;
}
