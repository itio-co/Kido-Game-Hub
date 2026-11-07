/** Hand-written proto3 codec for proto/challenge_run.proto (no dependency, ~1 KB). */
export type ChallengeRunPb = {
  sessionId: string; playerId: string; nickname: string; game: string; difficulty: string;
  seed: number; score: number; timeMs: number; version: string; timestampMs: number;
  challengerSessionId: string; challengerNickname: string; challengerScore: number; challengerTimeMs: number;
  /** Canonical gameplay ruleset (`rhythm@1.1.0+stirfry@1.2.0`). Empty on tokens from before 0.6.11. */
  ruleset: string;
};

const STR: [number, keyof ChallengeRunPb][] = [[1, 'sessionId'], [2, 'playerId'], [3, 'nickname'], [4, 'game'], [5, 'difficulty'], [9, 'version'], [11, 'challengerSessionId'], [12, 'challengerNickname'], [15, 'ruleset']];
const INT: [number, keyof ChallengeRunPb][] = [[6, 'seed'], [7, 'score'], [8, 'timeMs'], [10, 'timestampMs'], [13, 'challengerScore'], [14, 'challengerTimeMs']];

function varint(out: number[], n: number): void {
  let v = Math.max(0, Math.floor(n));
  while (v >= 0x80) {
    out.push((v % 0x80) | 0x80);
    v = Math.floor(v / 0x80);
  }
  out.push(v);
}

export function encodeRun(run: ChallengeRunPb): Uint8Array {
  const out: number[] = [];
  const fields = [...STR.map(([f, k]) => [f, k, 's'] as const), ...INT.map(([f, k]) => [f, k, 'i'] as const)].sort((a, b) => a[0] - b[0]);
  for (const [f, k, t] of fields) {
    const v = run[k];
    if (t === 's') {
      if (!v) continue;
      const bytes = new TextEncoder().encode(String(v));
      varint(out, (f << 3) | 2);
      varint(out, bytes.length);
      out.push(...bytes);
    } else {
      if (!v) continue;
      varint(out, f << 3);
      varint(out, Number(v));
    }
  }
  return new Uint8Array(out);
}

export function emptyRun(): ChallengeRunPb {
  return { sessionId: '', playerId: '', nickname: '', game: '', difficulty: '', seed: 0, score: 0, timeMs: 0, version: '', timestampMs: 0, challengerSessionId: '', challengerNickname: '', challengerScore: 0, challengerTimeMs: 0, ruleset: '' };
}

export function decodeRun(buf: Uint8Array): ChallengeRunPb {
  const run = emptyRun() as Record<string, string | number>;
  let i = 0;
  const read = () => {
    let v = 0, mul = 1, b = 0;
    do {
      if (i >= buf.length) throw new Error('truncated');
      b = buf[i++];
      v += (b & 0x7f) * mul;
      mul *= 0x80;
    } while (b & 0x80);
    return v;
  };
  while (i < buf.length) {
    const tag = read();
    const f = Math.floor(tag / 8), wt = tag & 7;
    if (wt === 0) {
      const v = read();
      const k = INT.find(([n]) => n === f)?.[1];
      if (k) run[k] = v;
    } else if (wt === 2) {
      const len = read();
      const bytes = buf.slice(i, i + len);
      i += len;
      const k = STR.find(([n]) => n === f)?.[1];
      if (k) run[k] = new TextDecoder().decode(bytes);
    } else throw new Error('wire type');
  }
  return run as unknown as ChallengeRunPb;
}

export function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function unb64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  return Uint8Array.from(atob(pad), (c) => c.charCodeAt(0));
}

/** Integrity tag: first 6 bytes of SHA-256("nesg-run-v1" || bytes). Detects edits; NOT tamper-proof. */
const SALT = new TextEncoder().encode('nesg-run-v1');
export async function tagFor(bytes: Uint8Array): Promise<string> {
  const data = new Uint8Array(SALT.length + bytes.length);
  data.set(SALT);
  data.set(bytes, SALT.length);
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', data)).slice(0, 6));
}

/** `<base64url protobuf>.<tag>` */
export async function packRun(run: ChallengeRunPb): Promise<string> {
  const bytes = encodeRun(run);
  return `${b64url(bytes)}.${await tagFor(bytes)}`;
}

export async function unpackRun(token: string): Promise<{ run: ChallengeRunPb; valid: boolean } | null> {
  try {
    const [body, tag] = token.split('.');
    const bytes = unb64url(body);
    const run = decodeRun(bytes);
    const valid = typeof crypto !== 'undefined' && !!crypto.subtle ? (await tagFor(bytes)) === tag : false;
    return { run, valid };
  } catch {
    return null;
  }
}
