import { appStorage } from './deployment';
const KEY = 'nesg.playerId.v1';

export type PlayerIdState = {
  playerId: string;
  nickname: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `p-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

export function readPlayerId(): PlayerIdState {
  try {
    const raw = appStorage.getItem(KEY);
    if (!raw) {
      const fresh = { playerId: uuid(), nickname: null };
      appStorage.setItem(KEY, JSON.stringify(fresh));
      return fresh;
    }
    const data: unknown = JSON.parse(raw);
    if (!isRecord(data) || typeof data.playerId !== 'string') {
      const fresh = { playerId: uuid(), nickname: null };
      appStorage.setItem(KEY, JSON.stringify(fresh));
      return fresh;
    }
    return {
      playerId: data.playerId,
      nickname: typeof data.nickname === 'string' && data.nickname.trim() ? data.nickname.trim() : null,
    };
  } catch {
    const fresh = { playerId: uuid(), nickname: null };
    appStorage.setItem(KEY, JSON.stringify(fresh));
    return fresh;
  }
}

export function setNickname(nickname: string): PlayerIdState {
  const state = readPlayerId();
  state.nickname = nickname.trim().slice(0, 24) || null;
  appStorage.setItem(KEY, JSON.stringify(state));
  if (state.nickname) void import('./cloudSync').then((m) => m.pushNickname(state.nickname as string));
  return state;
}
