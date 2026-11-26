// HUD bottom-row alignment and locked/unlocked house-map taps.
// Not in `npm test` (needs a browser and a static server):
//   BASE=http://127.0.0.1:4173/ CHROME=/usr/bin/google-chrome-stable node tests/hudBottomAlign.e2e.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4173/';
const SHOTS = process.env.SHOTS ?? '';
const VIEWPORTS = [
  [360, 800],
  [390, 844],
  [412, 915],
];
const LOCK_TOAST = 'ต่อแผนผังบ้านให้เสร็จก่อน';
const MIN_MSG_GAP = 16;
const CENTER_TOL = 2;

function seed({ screen, evidence, cleared }) {
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
    knowledge: { evidence, solvedCaseIds: cleared ? ['case-01'] : [], exploreHints: 0 },
    caseState: { facts: {} },
    flow: {
      evidence,
      solved: false,
      deduced: false,
      reward: false,
      poster: false,
      caseDone: false,
      cleared,
      mapUnlocked: evidence.includes('E04'),
      difficulty: 'ปานกลาง',
      played: [],
      seen: [],
      levels: { cross: [], jig: [], slide: [] },
      bag: [],
      nav: {
        screen,
        history: ['player-room', 'event-select', 'living-room'],
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

async function openSeeded(browser, { width, height, screen, evidence, cleared }) {
  const ctx = await browser.newContext({
    viewport: { width, height },
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
  }, [seed({ screen, evidence, cleared })]);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button.back, .flow', { timeout: 15000 });
  await page.waitForTimeout(700);
  return { ctx, page };
}

function navScreen(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('nesg.player.v1') || '{}').flow?.nav?.screen ?? null);
}

function box(rect) {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    top: rect.y,
    bottom: rect.y + rect.height,
    cy: rect.y + rect.height / 2,
  };
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
  args: ['--no-sandbox', '--use-gl=swiftshader'],
});

let checks = 0;

for (const [width, height] of VIEWPORTS) {
  const { ctx, page } = await openSeeded(browser, {
    width,
    height,
    screen: 'table',
    evidence: ['E01'],
    cleared: false,
  });
  const landed = await navScreen(page);
  assert.equal(landed, 'table', `${width}x${height} should open the table`);
  const backBox = await page.locator('button.back').boundingBox();
  assert.ok(backBox, `${width}x${height} back button`);
  const back = box(backBox);
  const icons = page.locator('.bottom-actions .hud-icon');
  const iconCount = await icons.count();
  assert.ok(iconCount >= 2, `${width}x${height} expected HUD icons, got ${iconCount}`);
  for (let i = 0; i < iconCount; i++) {
    const ib = await icons.nth(i).boundingBox();
    assert.ok(ib, `${width}x${height} icon ${i}`);
    const icon = box(ib);
    assert.ok(
      Math.abs(icon.cy - back.cy) <= CENTER_TOL,
      `${width}x${height} icon ${i} center ${icon.cy.toFixed(1)} vs back ${back.cy.toFixed(1)}`,
    );
    assert.ok(
      Math.abs(icon.bottom - back.bottom) <= CENTER_TOL,
      `${width}x${height} icon ${i} baseline ${icon.bottom.toFixed(1)} vs back ${back.bottom.toFixed(1)}`,
    );
  }
  const pill = page.locator('.flow-sub');
  assert.equal(await pill.count(), 1, `${width}x${height} evidence pill`);
  const pb = await pill.boundingBox();
  assert.ok(pb, `${width}x${height} pill box`);
  const pillBox = box(pb);
  const rowTop = Math.min(
    back.top,
    ...(await Promise.all([...Array(iconCount).keys()].map(async (i) => box(await icons.nth(i).boundingBox()).top))),
  );
  const gap = rowTop - pillBox.bottom;
  assert.ok(
    gap + 0.5 >= MIN_MSG_GAP,
    `${width}x${height} pill gap ${gap.toFixed(1)}px should be at least ${MIN_MSG_GAP}`,
  );
  if (SHOTS) {
    await page.screenshot({ path: `${SHOTS}/align-table-${width}x${height}.png`, fullPage: false });
  }
  await ctx.close();
  checks += 1;
}

// Locked tap: replay mid-run (cleared kept, no E04) on the tray. Must not open the map.
{
  const { ctx, page } = await openSeeded(browser, {
    width: 390,
    height: 844,
    screen: 'tray',
    evidence: ['E01', 'E02', 'E03', 'E06'],
    cleared: true,
  });
  assert.equal(await navScreen(page), 'tray', 'locked seed lands on the tray');
  const mapBtn = page.locator('[data-testid="house-map-btn"]');
  await mapBtn.waitFor({ state: 'visible' });
  assert.equal(await mapBtn.getAttribute('data-locked'), 'true', 'lock badge state is locked');
  assert.equal(await page.locator('[data-testid="map-floor-1"]').count(), 0, 'map is not open before the tap');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/tray-locked-before-tap.png`, fullPage: false });
  await mapBtn.click();
  await page.waitForTimeout(900);
  assert.equal(await navScreen(page), 'tray', 'locked tap must stay on the tray');
  assert.equal(await page.locator('[data-testid="map-floor-1"]').count(), 0, 'locked tap must not open the house map');
  const toast = page.locator('.toast');
  await toast.waitFor({ state: 'visible', timeout: 3000 });
  assert.match(await toast.innerText(), new RegExp(LOCK_TOAST), 'locked tap shows the lock message');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/tray-locked-after-tap.png`, fullPage: false });
  await ctx.close();
  checks += 1;
}

// Unlocked tap: same tray once E04 is in the save. Must open the map.
{
  const { ctx, page } = await openSeeded(browser, {
    width: 390,
    height: 844,
    screen: 'tray',
    evidence: ['E01', 'E02', 'E03', 'E04', 'E06'],
    cleared: true,
  });
  assert.equal(await navScreen(page), 'tray', 'unlocked seed lands on the tray');
  const mapBtn = page.locator('[data-testid="house-map-btn"]');
  await mapBtn.waitFor({ state: 'visible' });
  assert.equal(await mapBtn.getAttribute('data-locked'), 'false', 'map button is unlocked');
  await mapBtn.click();
  await page.waitForSelector('[data-testid="map-floor-1"]', { timeout: 8000 });
  assert.equal(await navScreen(page), 'house-map', 'unlocked tap opens the house map');
  assert.equal(await page.locator('[data-testid="house-map-btn"]').count(), 0, 'map button hides on the map screen');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/tray-unlocked-after-tap.png`, fullPage: false });
  await ctx.close();
  checks += 1;
}

await browser.close();
console.log(`hudBottomAlign e2e: passed (${checks} cases)`);
