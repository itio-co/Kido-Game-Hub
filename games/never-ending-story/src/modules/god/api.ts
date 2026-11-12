import { appBase } from '../../lib/deployment';
/** Admin API client. Session lives in an HttpOnly cookie; nothing secret is stored in JS. */
const API = new URL('api/god/', `${location.origin}${appBase()}/`).href;

export class ApiError extends Error {
  constructor(public status: number, public code: string, public data: Record<string, unknown> = {}) {
    super(code);
  }
}

export async function god<T = Record<string, unknown>>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API + path, { ...init, credentials: 'same-origin', headers: { 'content-type': 'application/json', ...(init.headers ?? {}) } });
  } catch {
    throw new ApiError(0, 'network');
  }
  let data: Record<string, unknown> = {};
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok || data.ok !== true) throw new ApiError(res.ok ? 503 : res.status, String(data.error ?? (res.ok ? 'no-api' : res.status)), data);
  return data as T;
}

export const fmtDate = (ms: unknown) => (typeof ms === 'number' && ms > 0 ? new Date(ms).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '–');
export const fmtTime = (ms: unknown) => (typeof ms === 'number' ? `${(ms / 1000).toFixed(1)}s` : '–');
export const short = (id: unknown) => String(id ?? '').slice(0, 8);
