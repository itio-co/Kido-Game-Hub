// God Mode Wish client helpers: payload redaction, text rules, failure mapping, request shape. No browser.
import assert from 'node:assert/strict';
import { rolldown } from 'rolldown';

async function load(input) {
  const bundle = await rolldown({ input });
  const { output } = await bundle.generate({ format: 'esm' });
  await bundle.close();
  return import('data:text/javascript;base64,' + Buffer.from(output[0].code).toString('base64'));
}
const wish = await load('src/modules/god-mode/wish.ts');
const capture = await load('src/modules/god-mode/capture.ts');

const page = {
  page: { screen: 'player-room', title: 'ห้องของฉัน', route: '#/play' },
  room: null, scene: null, hotspots: [], event: {},
  save: { player: { textSize: 'md' }, playerToken: 'SECRET', cookie: 'c=1', password: 'pw' },
  versions: { app: '0.6.39', modules: { core: '0.6.39' } },
};
const payload = wish.wishPayload(page, '  อยากได้ปุ่มใหม่  ', 'data:image/jpeg;base64,/9j/');
assert.equal(payload.text, 'อยากได้ปุ่มใหม่', 'text is trimmed');
assert.equal(payload.route, '#/play');
assert.equal(payload.appVersion, '0.6.39');
assert.equal(payload.state.save.playerToken, '[redacted]');
assert.equal(payload.state.save.cookie, '[redacted]');
assert.equal(payload.state.save.password, '[redacted]');
assert.equal(payload.state.save.player.textSize, 'md');
assert.ok(!JSON.stringify(payload).includes('SECRET'));

assert.equal(wish.wishProblem('   '), 'empty');
assert.equal(wish.wishProblem('x'.repeat(wish.WISH_MAX_TEXT + 1)), 'too-long');
assert.equal(wish.wishProblem('ok'), null);
assert.equal(wish.failureOf(0, ''), 'network');
assert.equal(wish.failureOf(401, 'unauthorized'), 'unauthorized');
assert.equal(wish.failureOf(403, 'forbidden'), 'forbidden');
assert.equal(wish.failureOf(429, 'rate-limited'), 'rate-limited');
assert.equal(wish.failureOf(413, 'too-large'), 'too-large');
assert.equal(wish.failureOf(400, 'empty-text'), 'empty');
assert.equal(wish.failureOf(500, 'x'), 'error');
assert.match(wish.stampText('2026-11-28T17:30:00.000Z'), /29/, 'Bangkok date, not UTC');

// sendWish posts to <base>/api/wishes with the session cookie, the player bearer token, and maps the reply
globalThis.location = { origin: 'https://games.itio.space' };
globalThis.document = { querySelector: () => null };
let seen = null;
const headers = { authorization: 'Bearer test-only-player-token' };
const ok = await wish.sendWish(payload, async (url, init) => {
  seen = { url, init };
  return new Response(JSON.stringify({ ok: true, wish: { id: 'abc', createdAt: '2026-11-28T01:00:00.000Z', dayBangkok: '2026-11-28', inspectUrl: 'https://x/y', screenshotUrl: 'https://x/s' } }), { status: 200 });
}, headers);
assert.equal(seen.url, 'https://games.itio.space/never/api/wishes');
assert.equal(seen.init.method, 'POST');
assert.equal(seen.init.credentials, 'same-origin');
assert.equal(seen.init.headers.authorization, 'Bearer test-only-player-token');
assert.equal(JSON.parse(seen.init.body).text, 'อยากได้ปุ่มใหม่');
assert.deepEqual(ok, { ok: true, wish: { id: 'abc', createdAt: '2026-11-28T01:00:00.000Z', dayBangkok: '2026-11-28', inspectUrl: 'https://x/y', hasScreenshot: true } });
const limited = await wish.sendWish(payload, async () => new Response('{"ok":false,"error":"rate-limited"}', { status: 429 }));
assert.deepEqual(limited, { ok: false, failure: 'rate-limited' });
const forbidden = await wish.sendWish(payload, async () => new Response('{"ok":false,"error":"forbidden"}', { status: 403 }));
assert.deepEqual(forbidden, { ok: false, failure: 'forbidden' });
const offline = await wish.sendWish(payload, async () => { throw new TypeError('offline'); });
assert.deepEqual(offline, { ok: false, failure: 'network' });
let called = false;
const blank = await wish.sendWish({ ...payload, text: ' ' }, async () => { called = true; return new Response('{}'); });
assert.deepEqual(blank, { ok: false, failure: 'empty' });
assert.equal(called, false, 'an empty wish never reaches the network');

assert.equal(capture.dataUrlBytes('data:image/jpeg;base64,QUJD'), 3);
assert.equal(capture.dataUrlBytes('data:image/jpeg;base64,QUI='), 2);
console.log('god wish client helpers passed');
