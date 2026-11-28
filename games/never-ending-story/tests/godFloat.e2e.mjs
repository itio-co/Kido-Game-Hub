// God float: a short tap always opens the menu, not the last item (Inspect).
// Close Inspect, tap again, and the menu must show. Touch at 390x844.
// Not in `npm test` (needs a browser and a static or Vite server):
//   BASE=http://127.0.0.1:4173/ CHROME=/usr/bin/google-chrome-stable SHOTS=/workspace/nes-godtap-shots \
//     node tests/godFloat.e2e.mjs
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4173/';
const SHOTS = process.env.SHOTS ?? '';
const PREFIX = process.env.SHOT_PREFIX ?? 'after';

const seed = JSON.stringify({
  version: 1,
  player: { onboardingComplete: true, prologueSeen: true, textSize: 'md', soundEnabled: false, calendarTheme: null, decor: {}, room: { calendar: 'original', grandpaPhoto: 'shelf' } },
  knowledge: { evidence: [], solvedCaseIds: [], exploreHints: 0 },
  caseState: { facts: {} },
  flow: {
    evidence: [], solved: false, deduced: false, reward: false, poster: false, caseDone: false, cleared: false, mapUnlocked: false,
    difficulty: 'ง่าย', played: [], seen: [], levels: { cross: [], jig: [], slide: [] }, bag: [],
    nav: { slot: 'now', page: 0, talkSlug: null, schema: 2, practice: false, screen: 'player-room', history: [], context: 'hub' },
  },
});

function almostSame(a, b, label) {
  assert.ok(a && b, `${label}: missing box`);
  assert.ok(Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1, `${label}: bubble moved ${JSON.stringify({ a, b })}`);
}

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox', '--use-gl=swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();

await page.route('**/api/**', async (route) => {
  const url = new URL(route.request().url());
  if (url.pathname.endsWith('/api/god/me')) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  }
  return route.abort();
});

await page.addInitScript(([s]) => {
  if (sessionStorage.getItem('seeded')) return;
  localStorage.setItem('nesg.player.v1', s);
  localStorage.setItem('nesg.god.float.v1', JSON.stringify({ on: true, x: 0.78, y: 0.62 }));
  sessionStorage.setItem('seeded', '1');
}, [seed]);

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
const float = page.locator('[data-testid="god-float"]');
const menu = page.locator('[data-testid="god-float-menu"]');
const inspect = page.locator('[data-testid="god-inspect"]');
await float.waitFor({ timeout: 20000 });
await page.waitForTimeout(300);

async function shot(name) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  const path = join(SHOTS, `${PREFIX}-${name}.png`);
  await page.screenshot({ path, type: 'png', fullPage: false });
}

const idle = await float.boundingBox();
await shot('00-idle');

await float.tap();
await menu.waitFor({ state: 'visible', timeout: 3000 });
assert.equal(await inspect.isVisible().catch(() => false), false, 'first tap must not open inspect');
almostSame(idle, await float.boundingBox(), 'first tap');
await shot('01-menu');

await page.locator('[data-testid="god-float-inspect"]').tap();
await inspect.waitFor({ state: 'visible', timeout: 3000 });
assert.equal(await menu.isVisible().catch(() => false), false, 'inspect hides the menu');
await shot('02-inspect');

await page.locator('[data-testid="god-inspect-close"]').tap();
await inspect.waitFor({ state: 'hidden', timeout: 3000 });
await page.waitForTimeout(200);
await shot('03-closed');

const afterClose = await float.boundingBox();
await float.tap();
await menu.waitFor({ state: 'visible', timeout: 3000 });
assert.equal(await inspect.isVisible().catch(() => false), false, 'second tap must open the menu, not inspect');
almostSame(afterClose, await float.boundingBox(), 'second tap');
await shot('04-menu-again');

// Close the menu with a tap, then a long press should also open the menu (no separate long-press action).
await float.tap();
await menu.waitFor({ state: 'hidden', timeout: 3000 });
const box = await float.boundingBox();
assert.ok(box, 'bubble box for long press');
const session = await page.context().newCDPSession(page);
const x = box.x + box.width / 2;
const y = box.y + box.height / 2;
await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 0 }] });
await page.waitForTimeout(700);
await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await menu.waitFor({ state: 'visible', timeout: 3000 });
assert.equal(await inspect.isVisible().catch(() => false), false, 'long press opens the menu, not inspect');
await shot('05-long-press-menu');

await ctx.close();
await browser.close();
console.log('godFloat e2e: passed');
