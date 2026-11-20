/**
 * Time-limited God Inspect snapshots.
 * The link is `/god/snapshot/<id>?t=<exp>.<sig>`. The signature is enough to read it;
 * the God session cookie is not required. KV TTL drops the body when it expires.
 */

const SECRET_KEY = /token|password|secret|authorization|cookie|credential/i;
const JWT = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const enc = new TextEncoder();

export const SNAPSHOT_TTLS = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
} as const;

export type SnapshotTtl = keyof typeof SNAPSHOT_TTLS;
export const DEFAULT_SNAPSHOT_TTL: SnapshotTtl = '24h';
export const SNAPSHOT_INDEX_KEY = 'god-snap-index';
export const MAX_SNAPSHOT_BYTES = 200_000;

export type SnapshotRecord = {
  id: string;
  exp: number;
  created: number;
  title: string;
  document: unknown;
};

export type SnapshotIndexEntry = { id: string; exp: number; created: number; title: string };

export type SnapshotStore = {
  get(key: string, type?: 'json'): Promise<unknown>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
};

export function snapshotKey(id: string): string {
  return `god-snap:${id}`;
}

export function isSnapshotTtl(value: string): value is SnapshotTtl {
  return Object.prototype.hasOwnProperty.call(SNAPSHOT_TTLS, value);
}

/** Same redaction as the in-game inspect panel, applied again on the server. */
export function redactSnapshot(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redactSnapshot(item));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEY.test(key) ? '[redacted]' : redactSnapshot(child);
    }
    return out;
  }
  if (typeof value === 'string' && (JWT.test(value) || /^Bearer\s+\S+/i.test(value))) return '[redacted]';
  return value;
}

export function snapshotId(bytes: Uint8Array = crypto.getRandomValues(new Uint8Array(32))): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function snapshotTitle(document: unknown): string {
  const page = (document as { page?: { title?: unknown; screen?: unknown } } | null)?.page;
  const title = typeof page?.title === 'string' ? page.title : '';
  const screen = typeof page?.screen === 'string' ? page.screen : '';
  return (title || screen || 'snapshot').slice(0, 80);
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(`nes-god-snapshot:${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sameText(a: string, b: string): boolean {
  const left = enc.encode(a);
  const right = enc.encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

export async function signSnapshot(secret: string, id: string, exp: number): Promise<string> {
  return `${exp}.${await hmac(secret, `${id}.${exp}`)}`;
}

export async function checkSnapshotToken(secret: string, id: string, token: string, now: number): Promise<'ok' | 'expired' | 'bad-token'> {
  const dot = token.indexOf('.');
  if (dot <= 0) return 'bad-token';
  const exp = Number(token.slice(0, dot));
  const sig = token.slice(dot + 1);
  if (!sig || !Number.isFinite(exp)) return 'bad-token';
  const want = await hmac(secret, `${id}.${exp}`);
  if (!sameText(sig, want)) return 'bad-token';
  if (exp <= now) return 'expired';
  return 'ok';
}

export function snapshotPath(base: string, id: string, token: string): string {
  const root = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${root}/god/snapshot/${id}?t=${encodeURIComponent(token)}`;
}

async function readIndex(store: SnapshotStore): Promise<SnapshotIndexEntry[]> {
  const raw = await store.get(SNAPSHOT_INDEX_KEY, 'json');
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is SnapshotIndexEntry => !!item && typeof item === 'object' && typeof (item as SnapshotIndexEntry).id === 'string');
}

async function writeIndex(store: SnapshotStore, entries: SnapshotIndexEntry[]): Promise<void> {
  await store.put(SNAPSHOT_INDEX_KEY, JSON.stringify(entries.slice(0, 40)));
}

export async function createSnapshot(store: SnapshotStore, secret: string, document: unknown, ttl: string, now = Date.now()): Promise<{ id: string; expiresAt: number; token: string } | { error: 'bad-ttl' | 'too-large' }> {
  if (!isSnapshotTtl(ttl)) return { error: 'bad-ttl' };
  const redacted = redactSnapshot(document);
  const body = JSON.stringify(redacted);
  if (enc.encode(body).length > MAX_SNAPSHOT_BYTES) return { error: 'too-large' };
  const id = snapshotId();
  const exp = now + SNAPSHOT_TTLS[ttl];
  const record: SnapshotRecord = { id, exp, created: now, title: snapshotTitle(redacted), document: redacted };
  const ttlSec = Math.max(60, Math.ceil((exp - now) / 1000));
  await store.put(snapshotKey(id), JSON.stringify(record), { expirationTtl: ttlSec });
  const index = (await readIndex(store)).filter((item) => item.exp > now && item.id !== id);
  index.unshift({ id, exp, created: now, title: record.title });
  await writeIndex(store, index);
  return { id, expiresAt: exp, token: await signSnapshot(secret, id, exp) };
}

export async function readSnapshot(store: SnapshotStore, secret: string, id: string, token: string, now = Date.now()): Promise<{ ok: true; document: unknown; expiresAt: number; title: string } | { ok: false; error: 'expired' | 'bad-token' | 'revoked' }> {
  const gate = await checkSnapshotToken(secret, id, token, now);
  if (gate !== 'ok') return { ok: false, error: gate };
  const raw = await store.get(snapshotKey(id), 'json') as SnapshotRecord | null;
  if (!raw || typeof raw !== 'object' || raw.document === undefined) return { ok: false, error: 'revoked' };
  if (typeof raw.exp === 'number' && raw.exp <= now) return { ok: false, error: 'expired' };
  return { ok: true, document: raw.document, expiresAt: raw.exp, title: raw.title || snapshotTitle(raw.document) };
}

export async function listSnapshots(store: SnapshotStore, now = Date.now()): Promise<SnapshotIndexEntry[]> {
  const entries = (await readIndex(store)).filter((item) => item.exp > now);
  return entries;
}

export async function revokeSnapshot(store: SnapshotStore, id: string, now = Date.now()): Promise<boolean> {
  const before = await store.get(snapshotKey(id));
  await store.delete(snapshotKey(id));
  const index = (await readIndex(store)).filter((item) => item.id !== id && item.exp > now);
  await writeIndex(store, index);
  return before != null;
}
