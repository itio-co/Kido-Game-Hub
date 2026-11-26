// Item box: bag shows item icons, tap opens details, close returns to the grid.
// Not in `npm test` (needs a browser and a static server):
//   BASE=http://127.0.0.1:4173/ CHROME=/usr/bin/google-chrome-stable SHOTS=/workspace/nes-item-box node tests/itemBox.e2e.mjs
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4173/';
const SHOTS = process.env.SHOTS ?? '';
const PHOTO_TITLE = 'รูปปู่ตอนหนุ่ม';
const PHOTO_BODY = 'อยู่ในอัลบั้มจากกล่องรูปดาว พร้อมโปสเตอร์ เอาไปให้ย่าดู';

function seed() {
  return JSON.stringify({
    version: 1,
    player: {
      onboardingComplete: true,
      prologueSeen: true,
      textSize: 'md',
      soundEnabled: false,
      calendarTheme: null,
      decor: {},
      room: { calendar: 'original', grandpaPhoto: 'shelf' },
    },
    knowledge: {
      evidence: ['E01', 'E02', 'E03', 'E04', 'E06'],
      solvedCaseIds: [],
      exploreHints: 0,
    },
    caseState: { facts: {} },
    flow: {
      evidence: ['E01', 'E02', 'E03', 'E04', 'E06'],
      solved: true,
      deduced: true,
      reward: false,
      poster: false,
      caseDone: false,
      cleared: false,
      mapUnlocked: true,
      difficulty: 'ปานกลาง',
      played: [],
      seen: [],
      levels: { cross: [], jig: [], slide: [] },
      bag: ['album-photo'],
      nav: {
        screen: 'album',
        history: ['player-room', 'event-select', 'living-room', 'study', 'star-box'],
        slot: 'now',
        page: 0,
        talkSlug: null,
        context: 'event',
        schema: 2,
        practice: false,
      },
    },
  });
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
  args: ['--no-sandbox', '--use-gl=swiftshader'],
});

const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: true,
});
const page = await ctx.newPage();
await page.route('**/api/**', (route) => route.abort());
await page.addInitScript(([s]) => {
  if (!sessionStorage.getItem('seeded')) {
    localStorage.setItem('nesg.player.v1', s);
    sessionStorage.setItem('seeded', '1');
  }
}, [seed()]);
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('button.back, .flow', { timeout: 15000 });
await page.waitForTimeout(800);

const landed = await page.evaluate(
  () => JSON.parse(localStorage.getItem('nesg.player.v1') || '{}').flow?.nav?.screen ?? null,
);
assert.equal(landed, 'album', 'should open the album scene');

if (SHOTS) {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, 'album-scene.png'), type: 'png' });
}

await page.locator('[data-testid="bag-btn"]').click();
await page.waitForSelector('[data-testid="bag-panel"]', { timeout: 8000 });
const icon = page.locator('[data-testid="item-slot-album-photo"]');
await icon.waitFor({ state: 'visible', timeout: 5000 });
assert.equal(await page.locator('[data-testid="item-detail"]').count(), 0, 'details stay closed until the icon is tapped');
const bagText = await page.locator('[data-testid="bag-panel"]').innerText();
assert.ok(bagText.includes('กระเป๋า'), bagText);
assert.ok(!bagText.includes(PHOTO_BODY), 'bag grid must not show the item description yet');

if (SHOTS) {
  await page.screenshot({ path: join(SHOTS, 'bag-with-icon.png'), type: 'png' });
}

await icon.click();
const detail = page.locator('[data-testid="item-detail"]');
await detail.waitFor({ state: 'visible', timeout: 5000 });
const detailText = await detail.innerText();
assert.ok(detailText.includes(PHOTO_TITLE), detailText);
assert.ok(detailText.includes(PHOTO_BODY), detailText);
assert.ok(await page.locator('[data-testid="bag-panel"]').isVisible(), 'bag stays open on the detail view');

if (SHOTS) {
  await page.screenshot({ path: join(SHOTS, 'detail-open.png'), type: 'png' });
}

await page.locator('[data-testid="item-detail-close"]').click();
await detail.waitFor({ state: 'hidden', timeout: 5000 });
assert.ok(await page.locator('[data-testid="bag-panel"]').isVisible(), 'closing details leaves the bag open');
assert.ok(await icon.isVisible(), 'icon grid is back');

await page.locator('[data-testid="item-box-close"]').click();
await page.locator('[data-testid="bag-panel"]').waitFor({ state: 'hidden', timeout: 5000 });
const still = await page.evaluate(
  () => JSON.parse(localStorage.getItem('nesg.player.v1') || '{}').flow?.nav?.screen ?? null,
);
assert.equal(still, 'album', 'closing the bag stays on the album scene');

await ctx.close();
await browser.close();
console.log('ok itemBox e2e');
