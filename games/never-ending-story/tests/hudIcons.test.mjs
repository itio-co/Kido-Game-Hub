// HUD bag/notebook/map icon buttons: `node --experimental-strip-types tests/hudIcons.test.mjs`
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isMinigameHudScreen,
  showBagAndNotebook,
  showHouseMapHud,
} from '../src/lib/hudIcons.ts';

let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL ${name}: ${e.message}`);
  }
}
function ok(c, msg) {
  if (!c) throw new Error(msg);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(join(root, 'src/App.svelte'), 'utf8');
const css = readFileSync(join(root, 'src/app.css'), 'utf8');

test('bag, notebook, and house map stay hidden during every minigame', () => {
  for (const screen of ['crossword', 'jigsaw', 'slide']) {
    ok(isMinigameHudScreen(screen), screen);
    ok(showBagAndNotebook(true, screen) === false, `bag hidden on ${screen}`);
    ok(showHouseMapHud({
      screen,
      showHouseMapButton: true,
      showCaseUi: true,
      sceneHasMap: true,
    }) === false, `map hidden on ${screen} even if unlocked`);
  }
  ok(showBagAndNotebook(true, 'living-room') === true, 'visible in living room');
  ok(showBagAndNotebook(true, 'table') === true, 'visible on a close-up');
  ok(showBagAndNotebook(false, 'living-room') === false, 'hidden when case UI is off');
  ok(isMinigameHudScreen('kitchen') === false, 'kitchen is not a minigame');
});

test('house map icon is shown locked on map scenes and unlocked when the gate opens', () => {
  ok(showHouseMapHud({
    screen: 'living-room',
    showHouseMapButton: false,
    showCaseUi: true,
    sceneHasMap: true,
  }) === true, 'locked map still visible on a map scene');
  ok(showHouseMapHud({
    screen: 'living-room',
    showHouseMapButton: true,
    showCaseUi: true,
    sceneHasMap: true,
  }) === true, 'unlocked map visible');
  ok(showHouseMapHud({
    screen: 'house-map',
    showHouseMapButton: false,
    showCaseUi: true,
    sceneHasMap: false,
  }) === false, 'hidden on the map screen itself');
  ok(showHouseMapHud({
    screen: 'living-room',
    showHouseMapButton: false,
    showCaseUi: false,
    sceneHasMap: true,
  }) === false, 'hidden in the hub');
});

test('App uses icon buttons with Thai locale labels and keeps pulses', () => {
  ok(app.includes('data-testid="bag-btn"'), 'bag test id');
  ok(app.includes('data-testid="case-notebook"'), 'notebook test id');
  ok(app.includes('data-testid="house-map-btn"'), 'map test id');
  ok(app.includes('showBagAndNotebook(session.showCaseUi, session.screen)'), 'bag minigame gate');
  ok(app.includes('showHouseMapHud({'), 'map minigame/lock gate');
  ok(app.includes("t('hud.bag')") && app.includes("t('hud.notebook')"), 'bag/notebook labels');
  ok(app.includes("t('hud.houseMap')") && app.includes("t('hud.houseMapLocked')"), 'map labels');
  ok(app.includes("aria-label={session.mapUnlocked ? t('hud.houseMap') : t('hud.houseMapLocked')}"), 'map a11y');
  ok(app.includes('class:fresh={session.bagPulse}'), 'bag pulse kept');
  ok(app.includes('class:fresh={session.mapUnlockPulse}'), 'map unlock pulse kept');
  ok(app.includes('onclick={() => session.openHouseMap()}'), 'map click uses openHouseMap');
  ok(app.includes('class:locked={!session.mapUnlocked}'), 'badge and handler share mapUnlocked');
  ok(app.includes('class="lock-badge"'), 'lock badge');
  const mapAt = app.indexOf('data-testid="house-map-btn"');
  ok(app.slice(mapAt - 200, mapAt + 1200).includes('<svg') && app.slice(mapAt - 400, mapAt + 200).includes('class="hud-icon"'), 'map SVG icon');
  ok(!/data-testid="house-map-btn"[^>]*>\s*\{t\('hud\.houseMap'\)\}/.test(app), 'map is not a text label');
});

test('icon buttons are round, cyan-ringed, and at least 44px', () => {
  ok(/\.hud-icon\s*\{[^}]*width:\s*64px/.test(css), 'width 64');
  ok(/\.hud-icon\s*\{[^}]*height:\s*64px/.test(css), 'height 64');
  ok(/\.hud-icon\s*\{[^}]*min-width:\s*44px/.test(css), 'min-width 44');
  ok(/\.hud-icon\s*\{[^}]*min-height:\s*44px/.test(css), 'min-height 44');
  ok(/\.hud-icon\s*\{[^}]*border-radius:\s*50%/.test(css), 'round');
  ok(/\.back,\s*\.case,\s*\.hud-icon\s*\{[^}]*border:\s*3px solid var\(--cyan\)/.test(css.replace(/\n/g, ' ')), 'cyan ring with back button');
});


test('bottom-right icons share the back-button baseline and messages sit above the row', () => {
  ok(css.includes('--hud-btn-bottom: 14px'), 'btn bottom token');
  ok(css.includes('--hud-btn-size: 64px'), 'btn size token');
  ok(css.includes('--hud-msg-gap: 16px'), 'message gap token');
  ok(css.includes('--hud-msg-bottom: calc(var(--hud-btn-bottom) + var(--hud-btn-size) + var(--hud-msg-gap))'), 'message sits 14+64+16 above the edge');
  ok(/\.back,\s*\.case,\s*\.hud-icon\s*\{[^}]*bottom:\s*calc\(var\(--hud-btn-bottom\) \+ env\(safe-area-inset-bottom\)\)/.test(css.replace(/\n/g, ' ')), 'shared button baseline');
  ok(/\.toast\.toast-low\s*\{[^}]*bottom:\s*calc\(var\(--hud-msg-bottom\) \+ env\(safe-area-inset-bottom\)\)/.test(css.replace(/\n/g, ' ')), 'low toast uses message token');
  ok(app.includes('.bottom-actions .hud-icon'), 'row icons are in the action bar');
  const row = app.slice(app.indexOf('.bottom-actions .hud-icon'), app.indexOf('.bottom-actions .hud-icon') + 180);
  ok(row.includes('position: relative') && row.includes('bottom: auto'), 'row icons drop inherited absolute bottom');
  ok(app.includes('bottom: calc(var(--hud-msg-bottom) + env(safe-area-inset-bottom))'), 'flow-sub uses message token');
});

test('locale strings for the HUD icons', () => {
  const th = JSON.parse(readFileSync(join(root, 'src/locales/th.json'), 'utf8'));
  const en = JSON.parse(readFileSync(join(root, 'src/locales/en.json'), 'utf8'));
  ok(th['hud.bag'] === 'กระเป๋า', th['hud.bag']);
  ok(th['hud.notebook'] === 'สมุดคดี', th['hud.notebook']);
  ok(th['hud.houseMap'] === 'แผนผังบ้าน', th['hud.houseMap']);
  ok(th['hud.houseMapLocked'] === 'แผนผังบ้าน (ล็อกอยู่)', th['hud.houseMapLocked']);
  ok(en['hud.bag'] === 'Bag', en['hud.bag']);
  ok(en['hud.notebook'] === 'Case notebook', en['hud.notebook']);
  ok(en['hud.houseMap'] === 'House map', en['hud.houseMap']);
  ok(en['hud.houseMapLocked'] === 'House map (locked)', en['hud.houseMapLocked']);
});

if (failed) process.exitCode = 1;
