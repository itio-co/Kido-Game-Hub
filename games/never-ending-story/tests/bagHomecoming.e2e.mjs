// Secret sticker goes in the bag; returning home summarizes loot and stores it.
//   BASE=http://127.0.0.1:4173/ CHROME=/usr/bin/google-chrome-stable SHOTS=/workspace/nes-038-shots node tests/bagHomecoming.e2e.mjs
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4173/';
const SHOTS = process.env.SHOTS ?? '';
const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
  args: ['--no-sandbox', '--use-gl=swiftshader'],
});

function save(flowExtra, screen, history) {
  return JSON.stringify({
    version: 1,
    player: {
      onboardingComplete: true,
      prologueSeen: true,
      textSize: 'md',
      soundEnabled: false,
      calendarTheme: null,
      decor: { '6bb33448-6b61-4564-91e1-125bae9cf57c': '📷 รูปปู่' },
      room: { calendar: 'original', grandpaPhoto: 'shelf' },
    },
    knowledge: { evidence: ['E01'], solvedCaseIds: [], exploreHints: 0 },
    caseState: { facts: {} },
    flow: {
      evidence: ['E01'],
      solved: false,
      deduced: false,
      reward: false,
      poster: false,
      caseDone: false,
      cleared: false,
      difficulty: 'ปานกลาง',
      played: [],
      seen: [],
      levels: { cross: [], jig: [], slide: [] },
      bag: [],
      storage: [],
      tripLoot: [],
      nav: {
        screen,
        history,
        slot: 'now',
        page: 0,
        talkSlug: null,
        context: screen === 'player-room' ? 'hub' : 'event',
        schema: 2,
        practice: false,
      },
      ...flowExtra,
    },
  });
}

async function open(saveJson, eggs = null) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const page = await ctx.newPage();
  await page.route('**/api/**', (route) => route.abort());
  await page.addInitScript(([s, egg]) => {
    localStorage.setItem('nesg.player.v1', s);
    sessionStorage.setItem('seeded', '1');
    if (egg) localStorage.setItem('nesg.eggs.v1', egg);
  }, [saveJson, eggs]);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  return { ctx, page };
}

async function shot(page, name) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, name), type: 'png' });
}

async function activate(page, label) {
  const spot = page.getByRole('button', { name: label });
  await spot.click();
  await page.waitForTimeout(200);
  await spot.click();
}

let checks = 0;

{
  const { ctx, page } = await open(
    save({}, 'living-room', ['player-room', 'event-select', 'living-room']),
    JSON.stringify({ fanSticker: true, fanTaps: 5 }),
  );
  await activate(page, 'พัดลมตั้งโต๊ะ');
  await page.waitForSelector('.egg-modal', { timeout: 8000 });
  await page.locator('.egg-modal button').click();
  await page.waitForTimeout(400);
  await page.locator('[data-testid="bag-btn"]').click();
  await page.waitForSelector('[data-testid="bag-panel"]');
  const bagText = await page.locator('[data-testid="bag-panel"]').innerText();
  assert.ok(bagText.includes('สติกเกอร์'), `bag should contain the sticker: ${bagText}`);
  await shot(page, 'neg20-bag-sticker.png');
  await ctx.close();
  checks += 1;
  console.log('ok sticker in bag');
}

{
  const { ctx, page } = await open(
    save(
      {
        bag: ['fan-sticker'],
        tripLoot: ['fan-sticker'],
        caseDone: true,
        cleared: true,
        reward: true,
        poster: true,
      },
      'ending-comic',
      ['player-room', 'event-select', 'living-room'],
    ),
  );
  await page.locator('[data-testid="comic-skip"]').click();
  await page.waitForSelector('[data-testid="trip-summary"]', { timeout: 20000 });
  const summary = await page.locator('[data-testid="trip-summary"]').innerText();
  assert.ok(summary.includes('สติกเกอร์'), `trip summary lists sticker: ${summary}`);
  await shot(page, 'neg20-homecoming-summary.png');
  await page.locator('[data-testid="trip-continue"]').click();
  await page.waitForTimeout(500);
  assert.equal(await page.locator('[data-testid="trip-summary"]').count(), 0, 'summary closes');
  await activate(page, 'กล่องเก็บของ');
  await page.waitForSelector('[data-testid="storage-panel"]', { timeout: 8000 });
  const stored = await page.locator('[data-testid="storage-panel"]').innerText();
  assert.ok(stored.includes('สติกเกอร์'), `storage has the sticker: ${stored}`);
  await shot(page, 'neg20-storage-box.png');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('nesg.player.v1') || '{}'));
  assert.ok((saved.flow?.storage || []).includes('fan-sticker'), 'storage persisted');
  assert.ok(!(saved.flow?.bag || []).includes('fan-sticker'), 'sticker left the bag');
  await ctx.close();
  checks += 1;
  console.log('ok homecoming storage');
}

await browser.close();
console.log(`bagHomecoming: ${checks} checks passed`);
