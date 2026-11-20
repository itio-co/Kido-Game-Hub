import assert from 'node:assert/strict';
import { rolldown } from 'rolldown';

const bundle = await rolldown({ input: 'worker/index.ts' });
const { output } = await bundle.generate({ format: 'esm' });
await bundle.close();
const { default: worker } = await import('data:text/javascript;base64,' + Buffer.from(output[0].code).toString('base64'));

const values = new Map();
const kv = {
  async getWithMetadata() { return { value: null, metadata: null }; },
  async get(key, type) {
    const raw = values.get(key);
    if (raw == null) return null;
    return type === 'json' ? JSON.parse(raw) : raw;
  },
  async put(key, value) { values.set(key, value); },
  async delete(key) { values.delete(key); },
};
const statement = { bind() { return this; }, async first() { return null; }, async run() { return { meta: { changes: 1 } }; } };
const env = { APP_BASE: '/never', ASSETS_KV: kv, DB: { prepare() { return statement; } }, GOD_ADMIN_PASSWORD: 'test-only-password' };
const req = (path, init) => new Request('https://games.itio.space/never' + path, init);

const login = await worker.fetch(req('/api/god/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'test-only-password' }) }), env);
assert.equal(login.status, 200);
const cookie = login.headers.get('set-cookie').split(';')[0];
const body = { ttl: '24h', document: { page: { title: 'กล่องรูปดาว', screen: 'star-box' }, save: { password: 'hunter2', note: 'keep' } } };
const created = await worker.fetch(req('/api/god/snapshots', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body) }), env);
assert.equal(created.status, 200);
const made = await created.json();
assert.equal(made.ok, true);
assert.match(made.url, /^https:\/\/games\.itio\.space\/never\/god\/snapshot\/[A-Za-z0-9_-]+\?t=/);
const page = new URL(made.url);
const id = page.pathname.split('/').pop();
const open = await worker.fetch(req(`/api/god/snapshots/${id}${page.search}`), env);
assert.equal(open.status, 200);
const doc = await open.json();
assert.equal(doc.document.save.password, '[redacted]');
assert.equal(doc.document.save.note, 'keep');
const anon = await worker.fetch(req('/api/god/snapshots'), env);
assert.equal(anon.status, 401);
const listed = await worker.fetch(req('/api/god/snapshots', { headers: { cookie } }), env);
assert.equal((await listed.json()).snapshots.length, 1);
const removed = await worker.fetch(req(`/api/god/snapshots/${id}`, { method: 'DELETE', headers: { cookie } }), env);
assert.equal(removed.status, 200);
const after = await worker.fetch(req(`/api/god/snapshots/${id}${page.search}`), env);
assert.equal(after.status, 410);
assert.equal((await after.json()).error, 'revoked');
const bad = await worker.fetch(req(`/api/god/snapshots/${id}?t=1.nope`), env);
assert.equal(bad.status, 401);
console.log('snapshot share link, redaction, and revoke passed');
