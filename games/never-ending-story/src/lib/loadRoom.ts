import { validateRoom } from './catalog';
import type { PlayerRoom } from './types';
import { t } from './i18n/core.ts';

export async function loadPlayerRoom(): Promise<PlayerRoom> {
  const url = `${import.meta.env.BASE_URL}data/player-room.json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(t('game.error.roomFetch', { status: response.status }));
  const data: unknown = await response.json();
  return openRoom(data);
}

/** Validate identity fields and return a room whose objects can be looked up by id or slug. */
export function openRoom(data: unknown): PlayerRoom {
  const catalog = validateRoom(data);
  const room = data as PlayerRoom;
  const bySlug = catalog.getBySlug(room.slug);
  if (!bySlug || bySlug.id !== room.id) throw new Error(t('game.error.roomIndex'));
  const hinted = catalog.getById(room.hud.hintTarget);
  if (!hinted || hinted.kind !== 'hotspot') throw new Error(t('game.error.hintTarget'));
  return room;
}
