// Dev save API (scripts/editorFilesPlugin.mjs) + serialisation (src/lib/editor/editorFilesCore.mjs).
// Plain Node (no build step): node tests/editorFiles.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {
  canonicalize, editsFileName, fileKind, isValidItem, isValidVariant, itemOfSlug, normalizeText, sameData, stableStringify,
  MAX_JSON_BYTES,
} from '../src/lib/editor/editorFilesCore.mjs';
import {
  HttpError, atomicWrite, createEditorFilesHandler, hostName, isAllowedOrigin, isLocalHost, isLoopback, resolveEditorPath,
} from '../scripts/editorFilesPlugin.mjs';

let n = 0;
const ok = (name) => { n++; console.log(`ok ${n} - ${name}`); };
const throwsStatus = (fn, status, name) => {
  assert.throws(fn, (e) => e instanceof HttpError && e.status === status, name);
  ok(name);
};

// ---------- names ----------
assert.equal(itemOfSlug('player-room/nightstand'), 'nightstand');
assert.equal(itemOfSlug('a/../..'), null);
ok('itemOfSlug');
for (const bad of ['', '..', '.x', 'a/b', 'a\\b', 'A', 'x'.repeat(65), 'con.json', 'a b', 'a%2f', null, 3]) assert.equal(isValidItem(bad), false, String(bad));
for (const good of ['nightstand', 'desk-2', 'a_b', '0']) assert.equal(isValidItem(good), true, good);
assert.equal(isValidVariant('lowpoly'), true);
assert.equal(isValidVariant('../x'), false);
ok('item / variant whitelist');
assert.equal(fileKind('camera-match.json'), 'match');
assert.equal(fileKind('lowpoly.edits.json'), 'edits');
assert.equal(fileKind('master-edited.glb'), 'glb');
for (const bad of ['../camera-match.json', 'x.json', 'camera-match.json/', '.edits.json', 'a/b.edits.json', 'a\\b.edits.json', 'evil.js', 'Low.edits.json', 'lowpoly.edits.json\0'])
  assert.equal(fileKind(bad), null, bad);
assert.equal(editsFileName('master'), 'master.edits.json');
ok('file name whitelist');

// ---------- serialisation ----------
const a = { z: 1, a: { y: [1, 2, 3], b: -0, c: undefined }, m: [[1, 2], [3, 4]], s: 'ไทย', n: NaN };
const b = { s: 'ไทย', m: [[1, 2], [3, 4]], a: { b: 0, y: [1, 2, 3] }, z: 1, n: null };
assert.equal(stableStringify(a), stableStringify(b));
assert.ok(sameData(a, b));
const text = stableStringify(a);
assert.ok(text.endsWith('}\n') && !text.includes('\r'));
assert.deepEqual(Object.keys(JSON.parse(text)), ['a', 'm', 'n', 's', 'z']);
assert.ok(text.includes('"y": [1, 2, 3]'), 'flat arrays stay on one line');
assert.equal(stableStringify(JSON.parse(text)), text, 'parse → stringify is a fixed point');
assert.deepEqual(canonicalize({ b: [{ d: 1, c: 2 }], a: 1 }), { a: 1, b: [{ c: 2, d: 1 }] });
ok('stable key order, -0, undefined, NaN, round trip');
// whole-object placement block of <variant>.edits.json: vectors stay on one line, stable round trip, optional
const withPlacement = { format: 'kido-editor-edits@1', parts: [], placement: { positionCm: [12.5, -40, 0], rotationDeg: [0, 0, 15], scale: 1 } };
const placed = stableStringify(withPlacement);
assert.ok(placed.includes('"positionCm": [12.5, -40, 0]') && placed.includes('"rotationDeg": [0, 0, 15]'), placed);
assert.equal(stableStringify(JSON.parse(placed)), placed);
assert.ok(!sameData(withPlacement, { ...withPlacement, placement: undefined }), 'placement is part of the data');
assert.ok(sameData({ format: 'kido-editor-edits@1', parts: [] }, { ...withPlacement, placement: undefined }), 'no placement = older file');
ok('edits.json placement block round trip');
assert.equal(normalizeText('\uFEFF{\r\n  "a": 1\r\n}\r\n'), '{\n  "a": 1\n}\n');
assert.ok(sameData(JSON.parse(normalizeText(text.replace(/\n/g, '\r\n'))), a));
ok('CRLF / BOM normalised');

// ---------- request guards ----------
assert.ok(isLoopback('127.0.0.1') && isLoopback('::1') && isLoopback('::ffff:127.0.0.1') && isLoopback('127.0.0.2'));
assert.ok(!isLoopback('192.168.1.2') && !isLoopback('::ffff:10.0.0.1') && !isLoopback(undefined));
assert.equal(hostName('LocalHost:5173'), 'localhost');
assert.equal(hostName('[::1]:5173'), '[::1]');
assert.ok(isLocalHost('localhost:5173') && isLocalHost('127.0.0.1:5199') && isLocalHost('[::1]:80'));
assert.ok(!isLocalHost('evil.com') && !isLocalHost('localhost.evil.com:5173') && !isLocalHost('192.168.1.2:5173') && !isLocalHost(undefined));
assert.ok(isAllowedOrigin(undefined, 'localhost:5173'));
assert.ok(isAllowedOrigin('http://localhost:5173', 'localhost:5173'));
assert.ok(!isAllowedOrigin('http://localhost:5174', 'localhost:5173'), 'other local port');
assert.ok(!isAllowedOrigin('http://evil.com', 'localhost:5173'));
assert.ok(!isAllowedOrigin('null', 'localhost:5173'));
assert.ok(!isAllowedOrigin('file://', 'localhost:5173'));
ok('loopback / Host / Origin checks');

// ---------- paths (temp assets-src) ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kido-editor-files-'));
const assets = path.join(tmp, 'assets-src');
fs.mkdirSync(path.join(assets, 'nightstand'), { recursive: true });
fs.mkdirSync(path.join(tmp, 'outside'), { recursive: true });
const dir = path.join(assets, 'nightstand', 'editor');
assert.equal(resolveEditorPath(assets, 'nightstand'), dir);
assert.equal(resolveEditorPath(assets, 'nightstand', 'camera-match.json'), path.join(dir, 'camera-match.json'));
throwsStatus(() => resolveEditorPath(assets, '..', 'camera-match.json'), 400, 'item ".." rejected');
throwsStatus(() => resolveEditorPath(assets, 'nightstand', '../camera-match.json'), 400, 'name with ../ rejected');
throwsStatus(() => resolveEditorPath(assets, 'nightstand', '..\\..\\x.edits.json'), 400, 'name with ..\\ rejected');
throwsStatus(() => resolveEditorPath(assets, 'nightstand', '/etc/passwd'), 400, 'absolute name rejected');
throwsStatus(() => resolveEditorPath(assets, 'nightstand', 'notes.txt'), 400, 'unknown file type rejected');
throwsStatus(() => resolveEditorPath(assets, 'missing', 'camera-match.json'), 404, 'unknown asset folder → 404');
let symlinks = true;
try {
  fs.symlinkSync(path.join(tmp, 'outside'), path.join(assets, 'linked'), 'junction');
  fs.mkdirSync(path.join(assets, 'sneaky'));
  fs.symlinkSync(path.join(tmp, 'outside'), path.join(assets, 'sneaky', 'editor'), 'junction');
} catch {
  symlinks = false; // Windows without symlink rights
}
if (symlinks) {
  throwsStatus(() => resolveEditorPath(assets, 'linked', 'camera-match.json'), 400, 'symlinked asset folder rejected');
  throwsStatus(() => resolveEditorPath(assets, 'sneaky', 'camera-match.json'), 400, 'symlinked editor folder rejected');
}

// ---------- atomic write ----------
const f = path.join(dir, 'camera-match.json');
atomicWrite(f, Buffer.from('{"a":1}\n'));
atomicWrite(f, Buffer.from('{"a":2}\n'));
assert.equal(fs.readFileSync(f, 'utf8'), '{"a":2}\n');
assert.deepEqual(fs.readdirSync(dir), ['camera-match.json'], 'no temp files left');
ok('atomic write (temp + rename, overwrite, no leftovers)');

// ---------- real HTTP server ----------
const handler = createEditorFilesHandler({ assetsRoot: assets });
const server = http.createServer((req, res) => handler(req, res, () => { res.statusCode = 404; res.end('next'); }));
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const host = `localhost:${port}`;
function request(method, url, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: url, headers: { host, ...headers } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const t = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(t); } catch { /* not json */ }
        resolve({ status: res.statusCode, json, text: t });
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}
const post = (obj, headers = {}) =>
  request('POST', '/__editor/files', { headers: { 'content-type': 'application/json', 'x-kido-editor': '1', ...headers }, body: JSON.stringify(obj) });

try {
  fs.rmSync(dir, { recursive: true, force: true });
  let r = await request('GET', '/__editor/files?item=nightstand');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.files, {});
  ok('GET with no editor folder → empty');

  const match = { format: 'kido-camera-match-source/1', z: [1, 2], a: { y: 1, b: 2 } };
  r = await post({ item: 'nightstand', files: [{ name: 'camera-match.json', json: match }, { name: 'lowpoly.edits.json', json: { parts: [] } }] });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.json.written.map((w) => [w.name, w.changed]), [['camera-match.json', true], ['lowpoly.edits.json', true]]);
  assert.match(r.json.git, /^git add .*nightstand\/editor && git commit/);
  const onDisk = fs.readFileSync(path.join(dir, 'camera-match.json'), 'utf8');
  assert.equal(onDisk, stableStringify(match));
  assert.ok(onDisk.indexOf('"a"') < onDisk.indexOf('"format"') && onDisk.indexOf('"format"') < onDisk.indexOf('"z"'));
  ok('POST writes pretty, key-sorted JSON');

  r = await post({ item: 'nightstand', files: [{ name: 'camera-match.json', json: { a: { b: 2, y: 1 }, z: [1, 2], format: 'kido-camera-match-source/1' } }] });
  assert.equal(r.json.written[0].changed, false);
  ok('same data in another key order → unchanged (no rewrite)');

  fs.writeFileSync(path.join(dir, 'camera-match.json'), onDisk.replace(/\n/g, '\r\n'));
  r = await request('GET', '/__editor/files?item=nightstand');
  assert.deepEqual(r.json.files['camera-match.json'], JSON.parse(onDisk));
  r = await post({ item: 'nightstand', files: [{ name: 'camera-match.json', json: match }] });
  assert.equal(r.json.written[0].changed, false, 'CRLF checkout counts as the same file');
  ok('CRLF file (Windows checkout) reads + compares as LF');

  const glb = Buffer.alloc(20);
  glb.write('glTF', 0, 'latin1');
  r = await post({ item: 'nightstand', files: [{ name: 'lowpoly-edited.glb', base64: glb.toString('base64') }] });
  assert.equal(r.status, 200, r.text);
  assert.ok(fs.readFileSync(path.join(dir, 'lowpoly-edited.glb')).equals(glb));
  r = await post({ item: 'nightstand', files: [{ name: 'master-edited.glb', base64: Buffer.from('not a glb at all').toString('base64') }] });
  assert.equal(r.status, 400);
  ok('GLB written; non-glTF bytes rejected');

  const before = fs.readFileSync(path.join(dir, 'lowpoly.edits.json'), 'utf8');
  r = await post({ item: 'nightstand', files: [{ name: 'lowpoly.edits.json', json: { parts: [1] } }, { name: '../../escape.json', json: {} }] });
  assert.equal(r.status, 400);
  assert.equal(fs.readFileSync(path.join(dir, 'lowpoly.edits.json'), 'utf8'), before, 'nothing written when any entry is bad');
  assert.ok(!fs.existsSync(path.join(assets, 'escape.json')) && !fs.existsSync(path.join(tmp, 'escape.json')));
  ok('traversal in a batch → 400, nothing written');

  for (const [body, status, why] of [
    [{ item: '../outside', files: [{ name: 'camera-match.json', json: {} }] }, 400, 'bad item'],
    [{ item: 'nightstand', files: [] }, 400, 'empty list'],
    [{ item: 'nightstand', files: [{ name: 'camera-match.json', json: [1] }] }, 400, 'json must be an object'],
    [{ item: 'nightstand', files: [{ name: 'camera-match.json', json: {} }, { name: 'camera-match.json', json: {} }] }, 400, 'duplicates'],
    [{ item: 'nightstand', files: Array.from({ length: 17 }, (_, i) => ({ name: `v${i}.edits.json`, json: {} })) }, 400, 'too many files'],
  ]) {
    r = await post(body);
    assert.equal(r.status, status, `${why}: ${r.text}`);
  }
  ok('bad bodies rejected');

  r = await post({ item: 'nightstand', files: [{ name: 'camera-match.json', json: match }] }, { origin: 'http://evil.com' });
  assert.equal(r.status, 403);
  r = await post({ item: 'nightstand', files: [{ name: 'camera-match.json', json: match }] }, { host: 'evil.com' });
  assert.equal(r.status, 403, 'DNS rebinding: foreign Host');
  r = await post({ item: 'nightstand', files: [{ name: 'camera-match.json', json: match }] }, { 'sec-fetch-site': 'cross-site' });
  assert.equal(r.status, 403);
  r = await post({ item: 'nightstand', files: [{ name: 'camera-match.json', json: match }] }, { origin: `http://${host}` });
  assert.equal(r.status, 200, 'same local origin is fine');
  r = await request('POST', '/__editor/files', { headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(r.status, 403, 'missing x-kido-editor header');
  r = await request('POST', '/__editor/files', { headers: { 'content-type': 'text/plain', 'x-kido-editor': '1' }, body: '{}' });
  assert.equal(r.status, 415, 'form/text posts refused');
  r = await request('PUT', '/__editor/files', { headers: { 'x-kido-editor': '1' } });
  assert.equal(r.status, 405);
  r = await request('GET', '/other');
  assert.equal(r.text, 'next', 'other paths fall through');
  ok('Origin / Host / Sec-Fetch-Site / header / method guards');

  // non-loopback client (fake socket)
  const fake = await new Promise((resolve) => {
    const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(t) { resolve({ status: this.statusCode, t }); } };
    handler({ url: '/__editor/files?item=nightstand', method: 'GET', headers: { host }, socket: { remoteAddress: '192.168.1.20' } }, res, () => resolve({ status: 'next' }));
  });
  assert.equal(fake.status, 403);
  ok('non-loopback client → 403');

  const big = { format: 'x', blob: 'x'.repeat(MAX_JSON_BYTES + 10) };
  r = await post({ item: 'nightstand', files: [{ name: 'camera-match.json', json: big }] });
  assert.equal(r.status, 413);
  r = await request('POST', '/__editor/files', { headers: { 'content-type': 'application/json', 'x-kido-editor': '1', 'content-length': String(60 * 1024 * 1024) }, body: '{}' }).catch(() => ({ status: 413 }));
  assert.equal(r.status, 413);
  ok('size caps → 413');
} finally {
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(`editorFiles: ${n} passed`);
