// God Mode Wish: validation helpers plus the Worker endpoints against a real SQLite (node:sqlite) standing in for D1.
// Role gate: a player is 403; a god can post, list and read, but not mark-read; a super god (or the admin password session) can also mark-read.
// Run by `npm test`. Uses a test-only password and tokens; never a real secret.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { rolldown } from 'rolldown';

async function load(input) {
  const bundle = await rolldown({ input });
  const { output } = await bundle.generate({ format: 'esm' });
  await bundle.close();
  return import('data:text/javascript;base64,' + Buffer.from(output[0].code).toString('base64'));
}
const { default: worker } = await load('worker/index.ts');
const wish = await load('src/modules/god/wish.ts');

const sha = (s) => createHash('sha256').update(s).digest('hex');
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const jpegOf = (n) => 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(n - 4, 1)]).toString('base64');

// ---- pure helpers
assert.equal(wish.parseSince(null), 0);
assert.equal(wish.parseSince(''), 0);
assert.equal(wish.parseSince('2026-11-28T00:00:00Z'), Date.parse('2026-11-28T00:00:00Z'));
assert.equal(wish.parseSince('2026-11-28'), Date.parse('2026-11-27T17:00:00Z'), 'a bare date is Bangkok midnight');
assert.equal(wish.parseSince('2026-11-28T08:00:00+07:00'), Date.parse('2026-11-28T01:00:00Z'));
assert.equal(wish.parseSince('yesterday'), null);
assert.equal(wish.parseSince('2026-13-45'), null);
assert.equal(wish.wishDay(Date.parse('2026-11-28T17:30:00Z')), '2026-11-29', 'Bangkok day rolls at 17:00 UTC');
assert.equal(wish.readShot(null), null);
assert.equal(wish.readShot(PNG).mime, 'image/png');
assert.equal(wish.readShot('data:image/gif;base64,R0lGODlh'), 'bad');
assert.equal(wish.readShot('data:image/jpeg;base64,' + Buffer.from('not a jpeg at all....').toString('base64')), 'bad', 'magic bytes must match');
assert.equal(wish.readShot(jpegOf(wish.WISH_MAX_SHOT_BYTES + 100)), 'too-large');
assert.equal(wish.readShot(jpegOf(wish.WISH_MAX_SHOT_BYTES)).bytes, wish.WISH_MAX_SHOT_BYTES);
assert.equal(wish.parseWish({ text: '   ' }, 'ua', 1).status, 400);
assert.equal(wish.parseWish({ text: 'x'.repeat(wish.WISH_MAX_TEXT + 1) }, 'ua', 1).status, 413);

// ---- Worker over SQLite
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(`CREATE TABLE players (
  playerId TEXT PRIMARY KEY, nickname TEXT NOT NULL DEFAULT '', token_hash TEXT,
  created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'player', role_updated_at INTEGER, role_updated_by TEXT
)`);
const TOKENS = { player: 'test-only-player-token', god: 'test-only-god-token', super_god: 'test-only-super-token' };
const IDS = { player: 'wish-player-0001', god: 'wish-god-00000001', super_god: 'wish-super-000001' };
for (const role of ['player', 'god', 'super_god']) {
  sqlite.prepare('INSERT INTO players (playerId, nickname, token_hash, created_at, last_seen, role) VALUES (?,?,?,?,?,?)')
    .run(IDS[role], role, sha(TOKENS[role]), 1, 1, role);
}

const db = {
  prepare(sql) {
    let args = [];
    return {
      bind(...a) { args = a; return this; },
      async first() { return sqlite.prepare(sql).get(...args) ?? null; },
      async all() { return { results: sqlite.prepare(sql).all(...args) }; },
      async run() { const r = sqlite.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
    };
  },
  async batch() { return []; },
};
const kvValues = new Map();
const kv = {
  async getWithMetadata() { return { value: null, metadata: null }; },
  async get(key, type) { const raw = kvValues.get(key); return raw == null ? null : type === 'json' ? JSON.parse(raw) : raw; },
  async put(key, value) { kvValues.set(key, value); },
  async delete(key) { kvValues.delete(key); },
};
const env = { APP_BASE: '/never', ASSETS_KV: kv, DB: db, GOD_ADMIN_PASSWORD: 'test-only-password' };
const req = (path, init) => new Request('https://games.itio.space/never' + path, init);
const j = (headers = {}) => ({ 'content-type': 'application/json', ...headers });
const bearer = (role) => ({ authorization: `Bearer ${TOKENS[role]}` });

const login = await worker.fetch(req('/api/god/login', { method: 'POST', headers: j(), body: JSON.stringify({ password: 'test-only-password' }) }), env);
assert.equal(login.status, 200);
const cookie = login.headers.get('set-cookie').split(';')[0];
const post = (body, headers = { cookie }) => worker.fetch(req('/api/wishes', { method: 'POST', headers: j(headers), body: JSON.stringify(body) }), env);
const get = (path, headers = { cookie }) => worker.fetch(req(path, { headers }), env);

const state = {
  page: { screen: 'player-room', title: 'ห้องของฉัน', route: '#/play' },
  save: { player: { textSize: 'md' }, playerToken: 'SECRET-PLAYER-TOKEN', note: 'keep' },
  versions: { app: '0.6.39', modules: { core: '0.6.39', 'god-mode': '1.3.0' } },
  header: 'Bearer abc.def.ghi',
};

// ---- auth and role gates
assert.equal((await post({ text: 'hi' }, {})).status, 401, 'post without a God session or token');
for (const path of ['/api/god/wishes', '/api/god/wishes/abcdefghijklmnop', '/api/god/wishes/abcdefghijklmnop/screenshot']) {
  assert.equal((await get(path, {})).status, 401, path);
}
assert.equal((await worker.fetch(req('/api/god/wishes/mark-read', { method: 'POST', headers: j({}), body: '{"ids":["abcdefghijklmnop"]}' }), env)).status, 401);
assert.equal((await post({ text: 'hi' }, { cookie: 'nes_god=1.bad' })).status, 401, 'forged cookie');
assert.equal((await worker.fetch(req('/api/wishes', { method: 'POST', headers: { cookie, origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{"text":"hi"}' }), env)).status, 403, 'cross-origin write');

assert.equal((await post({ text: 'nope' }, bearer('player'))).status, 403, 'a player cannot post a wish');
assert.equal((await get('/api/god/wishes', bearer('player'))).status, 403, 'a player cannot read wishes');

const realNowForGod = Date.now;
Date.now = () => Date.parse('2026-11-01T12:00:00Z');
const asGod = await post({ text: 'from a god player', state, route: '#/play', appVersion: '0.6.39' }, bearer('god'));
Date.now = realNowForGod;
assert.equal(asGod.status, 200, 'a god player can post');
const godWish = await asGod.json();
assert.equal(godWish.wish.playerId, IDS.god);
assert.equal(godWish.wish.role, 'god');
const listedByGod = await get('/api/god/wishes', bearer('god'));
assert.equal(listedByGod.status, 200, 'a god player can list wishes');
assert.equal((await listedByGod.json()).wishes[0].playerId, IDS.god);
assert.equal((await get(`/api/god/wishes/${godWish.wish.id}`, bearer('god'))).status, 200, 'a god player can read a wish');
assert.equal((await get(`/api/god/wishes/${godWish.wish.id}/screenshot`, bearer('god'))).status, 404, 'this god-posted wish has no screenshot, but the endpoint is allowed');
assert.equal((await worker.fetch(req('/api/god/wishes/mark-read', { method: 'POST', headers: j(bearer('god')), body: JSON.stringify({ ids: [godWish.wish.id] }) }), env)).status, 403, 'a god player cannot mark-read');

assert.equal((await get('/api/god/wishes', bearer('super_god'))).status, 200, 'a super god token can list');
const listedBySuper = await (await get('/api/god/wishes', bearer('super_god'))).json();
assert.equal(listedBySuper.count, 1);
assert.equal(listedBySuper.wishes[0].playerId, IDS.god);
assert.equal(listedBySuper.wishes[0].role, 'god');

// admin password session is super_god: can read and post, and stores no playerId
assert.equal((await get('/api/god/wishes')).status, 200);
assert.equal((await (await get('/api/god/wishes')).json()).count, 1);

// ---- validation (admin session)
assert.equal((await post({ text: '' })).status, 400);
assert.equal((await post({ text: 'x', screenshot: 'data:image/gif;base64,R0lGODlh' })).status, 400);
assert.equal((await post({ text: 'x', screenshot: jpegOf(wish.WISH_MAX_SHOT_BYTES + 10) })).status, 413);
assert.equal((await worker.fetch(req('/api/wishes', { method: 'POST', headers: j({ cookie }), body: '{nope' }), env)).status, 400);
assert.equal((await post({ text: 'x', state: { big: 'y'.repeat(wish.WISH_MAX_STATE_BYTES) } })).status, 413);
const huge = await worker.fetch(req('/api/wishes', { method: 'POST', headers: j({ cookie, 'content-length': String(wish.WISH_MAX_BODY_BYTES + 1) }), body: '{}' }), env);
assert.equal(huge.status, 413);

// create three wishes with controlled time (admin session: role super_god, no playerId)
const realNow = Date.now;
const stamps = ['2026-11-26T10:00:00Z', '2026-11-27T10:00:00Z', '2026-11-28T10:00:00Z'];
const ids = [];
for (const [i, at] of stamps.entries()) {
  Date.now = () => Date.parse(at);
  const res = await post({ text: `wish ${i}`, state: i === 0 ? state : undefined, screenshot: i === 0 ? PNG : undefined, route: '#/play', appVersion: '0.6.39' });
  assert.equal(res.status, 200, await res.clone().text());
  const body = await res.json();
  ids.push(body.wish.id);
  assert.equal(body.wish.createdAt, new Date(at).toISOString());
  assert.equal(body.wish.readAt, null);
  assert.equal(body.wish.playerId, null, 'password session has no player id');
  assert.equal(body.wish.role, 'super_god');
}
Date.now = realNow;

const first = await (await get(`/api/god/wishes/${ids[0]}`)).json();
assert.equal(first.wish.dayBangkok, '2026-11-26');
assert.equal(first.wish.screen, 'player-room');
assert.equal(first.wish.appVersion, '0.6.39');
assert.equal(first.wish.modules['god-mode'], '1.3.0');
assert.match(first.wish.inspectUrl, /^https:\/\/games\.itio\.space\/never\/god\/snapshot\/[A-Za-z0-9_-]+\?t=/);
assert.match(first.wish.screenshotUrl, /\/never\/api\/god\/wishes\/.+\/screenshot$/);
assert.equal((await (await get(`/api/god/wishes/${ids[1]}`)).json()).wish.inspectUrl, null, 'no state, no inspect link');

// redaction: stored state and the linked snapshot never hold the player token or bearer header
assert.equal(first.state.save.playerToken, '[redacted]');
assert.equal(first.state.header, '[redacted]');
assert.equal(first.state.save.note, 'keep');
const stored = sqlite.prepare('SELECT state_json FROM god_wishes WHERE id=?').get(ids[0]).state_json;
assert.ok(!stored.includes('SECRET-PLAYER-TOKEN') && !stored.includes('abc.def.ghi'), 'D1 row is redacted');
const link = new URL(first.wish.inspectUrl);
const snap = await (await worker.fetch(req(`/api/god/snapshots/${link.pathname.split('/').pop()}${link.search}`), env)).json();
assert.equal(snap.document.save.playerToken, '[redacted]');
assert.ok(!JSON.stringify(first).includes('test-only-password'));

// screenshot download
const shot = await get(first.wish.screenshotUrl.replace('https://games.itio.space/never', ''));
assert.equal(shot.status, 200);
assert.equal(shot.headers.get('content-type'), 'image/png');
assert.equal(Buffer.from(await shot.arrayBuffer()).toString('base64'), PNG.split(',')[1]);
assert.equal((await get(`/api/god/wishes/${ids[1]}/screenshot`)).status, 404, 'a wish without an image');

// list payloads never carry image bytes or state
const listBody = await (await get('/api/god/wishes')).text();
assert.ok(!listBody.includes(PNG.split(',')[1]) && !listBody.includes('"state"'), 'list is metadata only');

// since filter (inclusive, oldest first) and unread — the earlier god-player wish is also in the table
const list = async (q) => (await (await get('/api/god/wishes' + q)).json());
assert.deepEqual((await list('?since=2026-11-26T10:00:00Z')).wishes.map((w) => w.id), ids, 'since is inclusive of the three stamped wishes');
assert.deepEqual((await list('?since=2026-11-27T10:00:00Z')).wishes.map((w) => w.id), ids.slice(1));
assert.deepEqual((await list('?since=2026-11-27T10:00:01Z')).wishes.map((w) => w.id), ids.slice(2));
assert.deepEqual((await list('?since=2026-11-28')).wishes.map((w) => w.id), ids.slice(2), 'bare date = Bangkok midnight');
assert.deepEqual((await list('?since=2026-11-29')).wishes, []);
assert.equal((await get('/api/god/wishes?since=nope')).status, 400);
assert.equal((await list('?since=2026-11-26T10:00:00Z&limit=2')).wishes.length, 2);
assert.equal((await list('?since=2026-11-26T10:00:00Z&limit=2')).total, 3);
assert.deepEqual((await list('?since=2026-11-26T10:00:00Z&order=desc')).wishes.map((w) => w.id), [...ids].reverse(), 'order=desc is newest first (admin page)');
const page1 = await list('?since=2026-11-26T10:00:00Z&limit=2&page=1');
assert.equal(page1.page, 1);
assert.equal(page1.pageSize, 2);
assert.deepEqual(page1.wishes.map((w) => w.id), ids.slice(0, 2), 'page 1 is the first two (oldest first)');
assert.equal(page1.total, 3);
const page2 = await list('?since=2026-11-26T10:00:00Z&limit=2&page=2');
assert.equal(page2.page, 2);
assert.deepEqual(page2.wishes.map((w) => w.id), ids.slice(2), 'page 2 is the remainder');

// mark-read
assert.equal((await worker.fetch(req('/api/god/wishes/mark-read', { method: 'POST', headers: j({ cookie }), body: '{}' }), env)).status, 400);
assert.equal((await worker.fetch(req('/api/god/wishes/mark-read', { method: 'POST', headers: j({ cookie }), body: JSON.stringify({ ids: ['../x'] }) }), env)).status, 400);
const marked = await worker.fetch(req('/api/god/wishes/mark-read', { method: 'POST', headers: j({ cookie }), body: JSON.stringify({ ids: [ids[0], ids[1], 'doesnotexist-0000000'] }) }), env);
assert.equal(marked.status, 200);
assert.equal((await marked.json()).marked, 2);
assert.deepEqual((await list('?unread=1&since=2026-11-26T10:00:00Z')).wishes.map((w) => w.id), [ids[2]]);
assert.deepEqual((await list('?unread=1&since=2026-11-27T10:00:00Z')).wishes.map((w) => w.id), [ids[2]]);
assert.equal((await list('?since=2026-11-26T10:00:00Z')).wishes.length, 3, 'read wishes stay listed without unread=1');
const again = await (await worker.fetch(req('/api/god/wishes/mark-read', { method: 'POST', headers: j({ cookie }), body: JSON.stringify({ ids: [ids[0]] }) }), env)).json();
assert.equal(again.marked, 0, 'marking twice changes nothing');
assert.ok((await list('?since=2026-11-26T10:00:00Z')).wishes[0].readAt, 'readAt is stamped');

// super god token can mark-read too
const superMarked = await worker.fetch(req('/api/god/wishes/mark-read', { method: 'POST', headers: j(bearer('super_god')), body: JSON.stringify({ ids: [ids[2]] }) }), env);
assert.equal(superMarked.status, 200);
assert.equal((await superMarked.json()).marked, 1);

// rate limit: a fixed clock far from the back-dated wishes above
Date.now = () => Date.parse('2027-01-01T00:00:00Z');
const late = await worker.fetch(req('/api/god/login', { method: 'POST', headers: j({}), body: JSON.stringify({ password: 'test-only-password' }) }), env);
const lateCookie = late.headers.get('set-cookie').split(';')[0];
const postLate = (body) => post(body, { cookie: lateCookie });
for (let i = 0; i < wish.WISH_RATE_MAX; i++) assert.equal((await postLate({ text: `burst ${i}` })).status, 200);
const limited = await postLate({ text: 'one too many' });
assert.equal(limited.status, 429);
assert.equal((await limited.json()).error, 'rate-limited');
Date.now = () => Date.parse('2027-01-01T00:10:01Z');
assert.equal((await postLate({ text: 'window passed' })).status, 200, 'the window slides');
Date.now = realNow;

console.log('wish helpers, roles (player 403, god lists/reads, mark-read is super god), paging, validation, redaction, since/unread and rate limit passed');
