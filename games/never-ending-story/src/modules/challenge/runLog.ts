/**
 * Encrypted-at-rest log of every challenge run, exportable for a future backend import.
 * Local-only history (no export UI); the share URL is the transport — see docs/challenge-links.md. NOTE: the key lives on the client,
 * so this protects against casual reading/editing only — the server must re-validate.
 */
export type RunRecord = {
  sessionId: string;
  playerId: string;
  nickname: string | null;
  game: string;
  difficulty: string;
  seed: number;
  score: number;
  timeMs: number;
  version: string;
  timestamp: string;
  challengeFrom: { nick: string; score: number; time: number; sessionId?: string } | null;
};

type Sealed = { iv: string; ct: string; sha256: string };

const KEY_KEY = 'nesg.runlog.key.v1';
const LOG_KEY = 'nesg.runlog.v1';

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function sha256(text: string): Promise<string> {
  return b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

async function getKey(): Promise<{ key: CryptoKey; jwk: JsonWebKey }> {
  const raw = localStorage.getItem(KEY_KEY);
  if (raw) {
    const jwk = JSON.parse(raw) as JsonWebKey;
    return { jwk, key: await crypto.subtle.importKey('jwk', jwk, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']) };
  }
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const jwk = await crypto.subtle.exportKey('jwk', key);
  localStorage.setItem(KEY_KEY, JSON.stringify(jwk));
  return { key, jwk };
}

function readSealed(): Sealed[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(LOG_KEY) ?? '[]');
    return Array.isArray(data) ? (data as Sealed[]) : [];
  } catch {
    return [];
  }
}

export function newSessionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `s-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

export async function appendRun(record: RunRecord): Promise<void> {
  const { key } = await getKey();
  const text = JSON.stringify(record);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
  const all = readSealed();
  all.push({ iv: b64(iv), ct: b64(ct), sha256: await sha256(text) });
  localStorage.setItem(LOG_KEY, JSON.stringify(all));
}

export function runCount(): number {
  return readSealed().length;
}

/** Decrypt + verify locally (AES-GCM tag and SHA-256 of plaintext). Bad records are skipped. */
export async function readRuns(): Promise<RunRecord[]> {
  const { key } = await getKey();
  const out: RunRecord[] = [];
  for (const rec of readSealed()) {
    try {
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(rec.iv) }, key, unb64(rec.ct));
      const text = new TextDecoder().decode(plain);
      if ((await sha256(text)) === rec.sha256) out.push(JSON.parse(text) as RunRecord);
    } catch {
      /* tampered or corrupt — skip */
    }
  }
  return out;
}

