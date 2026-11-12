import { godAdminUrl, godButtonVisible, godFloatVisible, loadFloatPrefs, parseFloatPrefs, saveFloatPrefs, GOD_FLOAT_KEY } from '../src/modules/god-mode/floatState.ts';
import { inspectDocument, inspectText, redact } from '../src/modules/god-mode/inspect.ts';

declare const process: { exitCode?: number };
let failed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL ${name}: ${(e as Error).message}`);
  }
}
function ok(c: boolean, msg: string): void {
  if (!c) throw new Error(msg);
}

test('the GOD control is hidden without an admin session', () => {
  ok(godButtonVisible(false) === false, 'button off');
  ok(godButtonVisible(true) === true, 'button on');
  ok(godFloatVisible(false, true) === false, 'float stays hidden when the session is gone');
  ok(godFloatVisible(true, false) === false, 'float stays hidden while the toggle is off');
  ok(godFloatVisible(true, true) === true, 'float shows only when both are on');
});

test('the float toggle and position persist locally', () => {
  const mem = new Map<string, string>();
  const read = (key: string) => mem.get(key) ?? null;
  const write = (key: string, value: string) => { mem.set(key, value); };
  ok(loadFloatPrefs(read).on === false, 'default off');
  saveFloatPrefs(write, { on: true, x: 0.2, y: 1.4 });
  const saved = loadFloatPrefs(read);
  ok(saved.on === true && saved.x === 0.2 && saved.y === 0.92, JSON.stringify(saved));
  ok(mem.has(GOD_FLOAT_KEY), 'key');
  ok(parseFloatPrefs('not-json').on === false, 'bad json');
  ok(parseFloatPrefs(JSON.stringify({ on: 'yes', x: 'no' })).on === false, 'non-boolean on');
  saveFloatPrefs(write, { on: false, x: 0.4, y: 0.5 });
  ok(loadFloatPrefs(read).on === false, 'toggle off is stored');
});

test('the admin link stays on the deployment base', () => {
  ok(godAdminUrl('https://games.itio.space', '/never') === 'https://games.itio.space/never/god', 'prod');
  ok(godAdminUrl('https://games.itio.space', '/dev/never') === 'https://games.itio.space/dev/never/god', 'dev');
});

test('inspect redacts tokens and passwords and keeps game flags', () => {
  const page = {
    page: { screen: 'living-room', title: 'ห้องนั่งเล่น', route: '' },
    room: null,
    scene: { id: 'scene-1', spots: [{ title: 'ถาด' }] },
    hotspots: [{ id: 'spot-1' }],
    event: { mapUnlocked: false, evidence: ['E01', 'E02'], token: 'player-secret' },
    save: {
      flow: { mapUnlocked: true, evidence: ['E04'] },
      playerToken: 'abc',
      GOD_ADMIN_PASSWORD: 'hunter2',
      nested: { authorization: 'Bearer eyJaaa.bbb.ccc', note: 'ok' },
      pasted: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature',
    },
    versions: { app: '0.6.16', build: '0.6.16', modules: { god: '1.2.0' } },
  };
  const doc = inspectDocument(page);
  const text = inspectText(page);
  ok((doc.event as { mapUnlocked: boolean }).mapUnlocked === false, 'event flag');
  ok((doc.save as { flow: { mapUnlocked: boolean } }).flow.mapUnlocked === true, 'save flag');
  ok((doc.event as { token: string }).token === '[redacted]', 'event token');
  ok((doc.save as { playerToken: string }).playerToken === '[redacted]', 'player token');
  ok((doc.save as { GOD_ADMIN_PASSWORD: string }).GOD_ADMIN_PASSWORD === '[redacted]', 'password');
  ok((doc.save as { nested: { authorization: string; note: string } }).nested.authorization === '[redacted]', 'auth');
  ok((doc.save as { nested: { note: string } }).nested.note === 'ok', 'plain note');
  ok((doc.save as { pasted: string }).pasted === '[redacted]', 'jwt value');
  ok(!text.includes('hunter2') && !text.includes('player-secret') && !text.includes('eyJhbGci'), text);
  ok(text.includes('"mapUnlocked": true'), 'flag remains in the copy');
  const cookie = redact({ cookie: 'nes_god=1' }) as { cookie: string };
  ok(cookie.cookie === '[redacted]', 'cookie');
});

if (failed) process.exitCode = 1;
