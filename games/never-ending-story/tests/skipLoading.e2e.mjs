// Skip the opening comic on a cleared replay: the loading dialog must appear
// immediately, then the difficulty screen.
//   BASE=http://127.0.0.1:4173/ CHROME=/usr/bin/google-chrome SHOTS=/workspace/nes-skip-shots \
//     node tests/skipLoading.e2e.mjs
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4173/';
const SHOTS = process.env.SHOTS ?? '/workspace/nes-skip-shots';
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
const leftover = JSON.stringify({
  version: 1,
  player: { onboardingComplete: true, prologueSeen: true, textSize: 'md', soundEnabled: false, calendarTheme: null, decor: {}, room: { calendar: 'original', grandpaPhoto: 'shelf' } },
  knowledge: { evidence: ['E01', 'E02', 'E04'], solvedCaseIds: ['case-01'], exploreHints: 0 },
  caseState: { facts: {} },
  flow: {
    evidence: [],
    solved: false,
    deduced: false,
    reward: false,
    poster: false,
    caseDone: false,
    cleared: true,
    difficulty: 'ปานกลาง',
    played: [],
    seen: [],
    levels: { cross: [], jig: [], slide: [] },
    bag: [],
    nav: {
      screen: 'event-select',
      history: ['player-room'],
      slot: 'now',
      page: 0,
      talkSlug: null,
      context: 'hub',
      schema: 2,
      practice: false,
    },
  },
});

mkdirSync(SHOTS, { recursive: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: false });
const page = await ctx.newPage();
await page.route('**/api/**', (route) => route.abort());
await page.addInitScript(([s]) => {
  if (!sessionStorage.getItem('seeded')) {
    localStorage.setItem('nesg.player.v1', s);
    sessionStorage.setItem('seeded', '1');
  }
}, [leftover]);
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.evcard, [data-testid="comic-panel"]', { timeout: 15000 });
if (await page.locator('.evcard').count()) {
  await page.locator('.evcard').first().click();
}
await page.waitForSelector('[data-testid="comic-panel"]');
await page.waitForTimeout(800);

const skip = page.locator('[data-testid="comic-skip"]');
assert.equal(await skip.count(), 1, 'skip intro is available on a cleared case');

// Page 2/3 (grandma at the door), matching the reported screen.
await page.locator('[data-testid="comic-panel"]').click();
await page.waitForFunction(() => {
  const dots = [...document.querySelectorAll('[data-testid="comic-dots"] i')];
  return dots.findIndex((el) => el.classList.contains('on')) === 1;
});
// Let the page-turn fade finish so the skip button is clickable.
await page.waitForTimeout(700);
const caption = await page.locator('[data-testid="comic-caption"]').innerText();
assert.match(caption, /เช้าวันเสาร์/, 'page 2 caption');

const dialog = page.locator('[data-testid="loading-dialog"]');
const appeared = dialog.waitFor({ state: 'visible', timeout: 3000 });
await Promise.all([appeared, skip.click()]);
assert.match(await dialog.innerText(), /กำลังโหลด/, 'loading dialog copy');
await page.screenshot({ path: join(SHOTS, 'skip-loading-dialog.png'), type: 'png' });

await dialog.waitFor({ state: 'hidden', timeout: 5000 });
await page.waitForSelector('[data-testid="difficulty-pick"]');
assert.equal(await page.locator('[data-testid="difficulty-pick"]').isVisible(), true, 'difficulty screen after skip');
await page.screenshot({ path: join(SHOTS, 'skip-after-difficulty.png'), type: 'png' });

await ctx.close();
await browser.close();
console.log('skipLoading e2e: passed');
