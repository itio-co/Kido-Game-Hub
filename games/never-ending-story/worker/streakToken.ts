/**
 * Sealed streak token: AES-256-GCM over JSON {v, pid, streakCount, date}.
 * The key comes from the Worker secret STREAK_TOKEN_KEY (any string; SHA-256 makes the 256-bit key).
 * The client cannot read or forge it; it only stores it and sends it back. Never log the key or a token.
 */
export type StreakClaim = { pid: string; streakCount: number; date: string };
export type TokenCheck = 'ok' | 'missing' | 'invalid' | 'stale' | 'nokey';

const VERSION = 'st1';
const keys = new Map<string, Promise<CryptoKey>>();

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(pad + '='.repeat((4 - (pad.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function aesKey(secret: string): Promise<CryptoKey> {
  let k = keys.get(secret);
  if (!k) {
    k = crypto.subtle.digest('SHA-256', new TextEncoder().encode(`nes-streak-token:${secret}`))
      .then((raw) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']));
    keys.clear();
    keys.set(secret, k);
  }
  return k;
}

export async function sealStreak(secret: string, claim: StreakClaim): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify({ v: 1, pid: claim.pid, streakCount: claim.streakCount, date: claim.date }));
  const aad = new TextEncoder().encode(VERSION);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, await aesKey(secret), plain));
  return `${VERSION}.${b64url(iv)}.${b64url(ct)}`;
}

/** Decrypt and authenticate; null on any failure (wrong key, edited bytes, bad shape). */
export async function openStreak(secret: string, token: string): Promise<StreakClaim | null> {
  try {
    if (token.length > 512) return null;
    const [v, ivPart, ctPart, extra] = token.split('.');
    if (v !== VERSION || !ivPart || !ctPart || extra !== undefined) return null;
    const iv = unb64(ivPart);
    if (iv.length !== 12) return null;
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(VERSION) }, await aesKey(secret), unb64(ctPart));
    const data = JSON.parse(new TextDecoder().decode(plain)) as Record<string, unknown>;
    if (data.v !== 1 || typeof data.pid !== 'string' || typeof data.streakCount !== 'number' || typeof data.date !== 'string') return null;
    return { pid: data.pid, streakCount: data.streakCount, date: data.date };
  } catch {
    return null;
  }
}

/** Compare a client token with the server's record. The server record always wins; this is only reported. */
export async function checkStreak(secret: string | undefined, token: unknown, expected: StreakClaim): Promise<TokenCheck> {
  if (!secret) return 'nokey';
  if (typeof token !== 'string' || !token) return 'missing';
  const claim = await openStreak(secret, token);
  if (!claim || claim.pid !== expected.pid) return 'invalid';
  return claim.streakCount === expected.streakCount && claim.date === expected.date ? 'ok' : 'stale';
}
