import { floatDragged, godAdminLinkVisible, godWishVisible, godAdminUrl, leftoverMenuClick, godButtonVisible, godFloatVisible, loadFloatPrefs, nextFloatPosition, parseFloatPrefs, saveFloatPrefs, FLOAT_TAP_SLOP_PX, GOD_FLOAT_KEY } from '../src/modules/god-mode/floatState.ts';
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

test('the Admin menu entry is for a super god only', () => {
  ok(godAdminLinkVisible('super_god') === true, 'super god');
  ok(godAdminLinkVisible('god') === false, 'god player has no admin page');
  ok(godAdminLinkVisible('player') === false, 'player');
  ok(godAdminLinkVisible(null) === false, 'nobody');

test('Wish is offered to a god or super god, including the admin session', () => {
  ok(godWishVisible('god') === true, 'god');
  ok(godWishVisible('super_god') === true, 'super god / admin session');
  ok(godWishVisible('player') === false, 'player');
  ok(godWishVisible(null) === false, 'nobody');
});
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

test('dragging keeps the grab point under the pointer', () => {
  const stage = { width: 390, height: 844 };
  const origin = { x: 0.5, y: 0.4 };
  const delta = { x: 39, y: -84.4 };
  const next = nextFloatPosition(origin, delta, stage);
  ok(Math.abs(next.x - 0.6) < 1e-12 && Math.abs(next.y - 0.3) < 1e-12, JSON.stringify(next));
  ok(Math.abs((next.x - origin.x) * stage.width - delta.x) < 1e-9, 'x tracks the pointer');
  ok(Math.abs((next.y - origin.y) * stage.height - delta.y) < 1e-9, 'y tracks the pointer');
  const bubble = 64;
  const raced = origin.x + delta.x / bubble;
  ok(Math.abs(next.x - raced) > 0.2, 'the bubble box is not the stage');
});

test('a scaled stage uses the visual box, not the layout size', () => {
  const visual = { width: 195, height: 422 };
  const layout = { width: 390, height: 844 };
  const delta = { x: 19.5, y: 42.2 };
  const tracked = nextFloatPosition({ x: 0.2, y: 0.5 }, delta, visual);
  ok(Math.abs((tracked.x - 0.2) * visual.width - delta.x) < 1e-9, 'visual x');
  ok(Math.abs((tracked.y - 0.5) * visual.height - delta.y) < 1e-9, 'visual y');
  const lagged = nextFloatPosition({ x: 0.2, y: 0.5 }, delta, layout);
  ok(Math.abs((lagged.x - 0.2) * visual.width - delta.x / 2) < 1e-9, 'layout size would lag');
});

test('the bubble stays inside the phone and a short move is still a tap', () => {
  const next = nextFloatPosition({ x: 0.9, y: 0.05 }, { x: 800, y: -800 }, { width: 390, height: 844 });
  ok(next.x === 0.92 && next.y === 0.04, JSON.stringify(next));
  const held = nextFloatPosition({ x: 0.4, y: 0.6 }, { x: 0, y: 0 }, { width: 0, height: 0 });
  ok(held.x === 0.4 && held.y === 0.6, 'empty stage does not jump');
  ok(floatDragged(FLOAT_TAP_SLOP_PX, 0) === false, 'slop is still a tap');
  ok(floatDragged(FLOAT_TAP_SLOP_PX + 0.1, 0) === true, 'past the slop is a drag');
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


test('a leftover click from the same tap does not activate a menu item', () => {
  ok(leftoverMenuClick(true, false) === true, 'click with no new pointerdown is leftover');
  ok(leftoverMenuClick(true, true) === false, 'a later pointerdown on the menu may choose an item');
  ok(leftoverMenuClick(false, false) === false, 'menu was not just opened by this gesture');
  ok(leftoverMenuClick(false, true) === false, 'an already-armed menu accepts a click');
});

if (failed) process.exitCode = 1;
