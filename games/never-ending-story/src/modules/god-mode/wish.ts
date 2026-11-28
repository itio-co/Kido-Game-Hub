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
