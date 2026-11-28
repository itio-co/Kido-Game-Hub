/** Client side of the God Mode Wish: build the payload and post it. The server redacts and stamps the date. */
import { appBase } from '../../lib/deployment';
import { inspectDocument, redact, type InspectPage } from './inspect';

export const WISH_MAX_TEXT = 2000;

export type WishPayload = {
  text: string;
  screenshot: string | null;
  state: Record<string, unknown>;
  route: string;
  appVersion: string;
};

export type WishSent = { id: string; createdAt: string; dayBangkok: string; inspectUrl: string | null; hasScreenshot: boolean };

export type WishFailure = 'empty' | 'too-long' | 'unauthorized' | 'forbidden' | 'rate-limited' | 'too-large' | 'network' | 'error';

export function wishPayload(page: InspectPage, text: string, screenshot: string | null): WishPayload {
  const state = inspectDocument(page);
  const versions = (state.versions ?? {}) as { app?: unknown };
  return {
    text: text.trim(),
    screenshot,
    // Redacted here and again on the server.
    state: redact(state) as Record<string, unknown>,
    route: page.page.route,
    appVersion: typeof versions.app === 'string' ? versions.app : '',
  };
}

export function wishProblem(text: string): WishFailure | null {
  const trimmed = text.trim();
  if (!trimmed) return 'empty';
  if (trimmed.length > WISH_MAX_TEXT) return 'too-long';
  return null;
}

/** Map a server error code to the copy key suffix. */
export function failureOf(status: number, code: string): WishFailure {
  if (status === 0) return 'network';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 429) return 'rate-limited';
  if (status === 413) return 'too-large';
  if (code === 'empty-text') return 'empty';
  return 'error';
}

export async function sendWish(payload: WishPayload, fetcher: typeof fetch = fetch, extraHeaders: Record<string, string> = {}): Promise<{ ok: true; wish: WishSent } | { ok: false; failure: WishFailure }> {
  const problem = wishProblem(payload.text);
  if (problem) return { ok: false, failure: problem };
  let res: Response;
  try {
    const url = new URL('api/wishes', `${location.origin}${appBase()}/`).href;
    res = await fetcher(url, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', ...extraHeaders }, body: JSON.stringify(payload) });
  } catch {
    return { ok: false, failure: 'network' };
  }
  let data: { ok?: boolean; error?: string; wish?: Record<string, unknown> } = {};
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok || data.ok !== true || !data.wish) return { ok: false, failure: failureOf(res.status, String(data.error ?? '')) };
  const w = data.wish;
  return {
    ok: true,
    wish: {
      id: String(w.id),
      createdAt: String(w.createdAt),
      dayBangkok: String(w.dayBangkok),
      inspectUrl: typeof w.inspectUrl === 'string' ? w.inspectUrl : null,
      hasScreenshot: typeof w.screenshotUrl === 'string',
    },
  };
}

/** Date stamp shown to the user, always in Bangkok time. */
export function stampText(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' });
}

export const WISH_PAGE_SIZE = 20;

export type WishRow = {
  id: string;
  createdAt: string;
  createdMs: number;
  dayBangkok: string;
  text: string;
  route: string | null;
  screen: string | null;
  title: string | null;
  appVersion: string | null;
  playerId: string | null;
  role: string | null;
  inspectUrl: string | null;
  screenshotUrl: string | null;
  readAt: string | null;
};

export type WishPage = { wishes: WishRow[]; total: number; page: number; pageSize: number };

function asRow(raw: Record<string, unknown>): WishRow {
  return {
    id: String(raw.id ?? ''),
    createdAt: String(raw.createdAt ?? ''),
    createdMs: typeof raw.createdMs === 'number' ? raw.createdMs : 0,
    dayBangkok: String(raw.dayBangkok ?? ''),
    text: String(raw.text ?? ''),
    route: typeof raw.route === 'string' ? raw.route : null,
    screen: typeof raw.screen === 'string' ? raw.screen : null,
    title: typeof raw.title === 'string' ? raw.title : null,
    appVersion: typeof raw.appVersion === 'string' ? raw.appVersion : null,
    playerId: typeof raw.playerId === 'string' ? raw.playerId : null,
    role: typeof raw.role === 'string' ? raw.role : null,
    inspectUrl: typeof raw.inspectUrl === 'string' ? raw.inspectUrl : null,
    screenshotUrl: typeof raw.screenshotUrl === 'string' ? raw.screenshotUrl : null,
    readAt: typeof raw.readAt === 'string' ? raw.readAt : null,
  };
}

/** Newest first, one page of `WISH_PAGE_SIZE`. `fetcher` is for tests. */
export async function fetchWishPage(
  page: number,
  fetcher: typeof fetch = fetch,
  extraHeaders: Record<string, string> = {},
  origin = (typeof location !== 'undefined' ? location.origin : ''),
  base = (typeof document !== 'undefined' ? appBase() : '/never'),
): Promise<{ ok: true; page: WishPage } | { ok: false; failure: WishFailure }> {
  const n = Math.max(1, Math.floor(page) || 1);
  const root = base.endsWith('/') ? base : `${base}/`;
  const url = new URL(`api/god/wishes?order=desc&limit=${WISH_PAGE_SIZE}&page=${n}`, `${origin}${root}`).href;
  let res: Response;
  try {
    res = await fetcher(url, { credentials: 'same-origin', headers: extraHeaders });
  } catch {
    return { ok: false, failure: 'network' };
  }
  let data: { ok?: boolean; error?: string; wishes?: unknown; total?: unknown; page?: unknown; pageSize?: unknown } = {};
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok || data.ok !== true || !Array.isArray(data.wishes)) return { ok: false, failure: failureOf(res.status, String(data.error ?? '')) };
  const rows = data.wishes.filter((w): w is Record<string, unknown> => !!w && typeof w === 'object').map(asRow);
  return {
    ok: true,
    page: {
      wishes: rows,
      total: typeof data.total === 'number' ? data.total : rows.length,
      page: typeof data.page === 'number' ? data.page : n,
      pageSize: typeof data.pageSize === 'number' ? data.pageSize : WISH_PAGE_SIZE,
    },
  };
}

/** Load a wish screenshot with the same session cookie / bearer as other God calls. Returns a blob URL, or null. */
export async function fetchWishShotUrl(
  pathOrUrl: string,
  fetcher: typeof fetch = fetch,
  extraHeaders: Record<string, string> = {},
): Promise<string | null> {
  const path = pathOrUrl.startsWith('http') ? pathOrUrl : pathOrUrl;
  let res: Response;
  try {
    res = await fetcher(path, { credentials: 'same-origin', headers: extraHeaders });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const type = res.headers.get('content-type') ?? '';
  if (!type.startsWith('image/')) return null;
  try {
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}
