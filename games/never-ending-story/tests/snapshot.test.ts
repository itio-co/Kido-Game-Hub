import {
  DEFAULT_SNAPSHOT_TTL,
  SNAPSHOT_TTLS,
  checkSnapshotToken,
  createSnapshot,
  readSnapshot,
  redactSnapshot,
  revokeSnapshot,
  snapshotPath,
  type SnapshotStore,
} from '../src/modules/god/snapshot.ts';

declare const process: { exitCode?: number };
let failed = 0;
async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`ok ${name}`);
  } catch (error) {
    failed++;
    console.error(`FAIL ${name}: ${(error as Error).message}`);
  }
}
function ok(c: boolean, msg: string): void {
  if (!c) throw new Error(msg);
}

function memory(): SnapshotStore & { ttl: Map<string, number> } {
  const values = new Map<string, string>();
  const ttl = new Map<string, number>();
  return {
    ttl,
    async get(key, type) {
      const raw = values.get(key);
      if (raw == null) return null;
      if (type === 'json') return JSON.parse(raw);
      return raw;
    },
    async put(key, value, options) {
      values.set(key, value);
      if (options?.expirationTtl) ttl.set(key, options.expirationTtl);
    },
    async delete(key) {
      values.delete(key);
      ttl.delete(key);
    },
  };
}

const secret = 'test-only-password';
const now = 1_700_000_000_000;
const page = {
  page: { screen: 'star-box', title: 'กล่องรูปดาว' },
  save: {
    password: 'hunter2',
    note: 'keep',
    token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature',
  },
};

await test('secrets are redacted and a 1h link dies when its token expires', async () => {
  const store = memory();
  const made = await createSnapshot(store, secret, page, '1h', now);
  if ('error' in made) throw new Error(made.error);
  ok(made.expiresAt === now + SNAPSHOT_TTLS['1h'], String(made.expiresAt));
  ok(store.ttl.get(`god-snap:${made.id}`) === 3600, 'kv ttl seconds');
  const fresh = await readSnapshot(store, secret, made.id, made.token, now + 1000);
  if (!fresh.ok) throw new Error(fresh.error);
  const text = JSON.stringify(fresh.document);
  ok(!text.includes('hunter2') && !text.includes('eyJhbGci') && text.includes('[redacted]') && text.includes('keep'), text);
  ok(snapshotPath('/never', made.id, made.token).startsWith(`/never/god/snapshot/${made.id}?t=`), snapshotPath('/never', made.id, made.token));
  const late = await readSnapshot(store, secret, made.id, made.token, now + SNAPSHOT_TTLS['1h']);
  ok(!late.ok && late.error === 'expired', JSON.stringify(late));
  ok(DEFAULT_SNAPSHOT_TTL === '24h', 'default');
});

await test('a revoked snapshot stays unreadable and a bad token is rejected', async () => {
  const store = memory();
  const made = await createSnapshot(store, secret, page, '24h', now);
  if ('error' in made) throw new Error(made.error);
  ok(await revokeSnapshot(store, made.id, now + 10) === true, 'revoked');
  const gone = await readSnapshot(store, secret, made.id, made.token, now + 10);
  ok(!gone.ok && gone.error === 'revoked', JSON.stringify(gone));
  const bad = await checkSnapshotToken(secret, made.id, `${made.expiresAt}.not-the-signature`, now + 10);
  ok(bad === 'bad-token', bad);
});

await test('redact walks nested secrets', async () => {
  const out = redactSnapshot({ cookie: 'a=b', nested: { authorization: 'Bearer abc' }, plain: 'ok' }) as {
    cookie: string;
    nested: { authorization: string };
    plain: string;
  };
  ok(out.cookie === '[redacted]' && out.nested.authorization === '[redacted]' && out.plain === 'ok', JSON.stringify(out));
});

if (failed) process.exitCode = 1;
