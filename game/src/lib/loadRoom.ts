import type { PlayerRoom } from './types';

export async function loadPlayerRoom(): Promise<PlayerRoom> {
  const url = `${import.meta.env.BASE_URL}data/player-room.json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`โหลดห้องไม่ได้ (${response.status})`);
  const data: unknown = await response.json();
  if (!data || typeof data !== 'object') throw new Error('ไฟล์ห้องไม่ถูกต้อง');
  const room = data as Partial<PlayerRoom>;
  if (!room.camera || !Array.isArray(room.objects) || !Array.isArray(room.hotspots) || !room.calendar) {
    throw new Error('ไฟล์ห้องไม่ครบ');
  }
  return room as PlayerRoom;
}
