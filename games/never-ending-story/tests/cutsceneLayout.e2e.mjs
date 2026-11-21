// Headless layout + swipe check for the event opening comic (needs a browser, so not in `npm test`).
//   static server on dist/, then:
//   BASE=http://127.0.0.1:4173/ CHROME=/usr/bin/google-chrome SHOTS=/tmp node tests/cutsceneLayout.e2e.mjs
// 390×844 and 360×780, first play and replay (case done): caption, page pill (if any), dots, tap hint,
// the single skip button and the app's bottom-left back button never overlap; there is no
// "previous" button and no second skip label; swiping left/right changes the page, a tap still advances.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4173/';
const SHOTS = process.env.SHOTS ?? '';
const VIEWPORTS = [[390, 844], [360, 780]];
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
const seed = (caseDone) => JSON.stringify({
  version: 1,
  player: { onboardingComplete: true, prologueSeen: true, textSize: 'md', soundEnabled: false, calendarTheme: null, decor: {}, room: { calendar: 'original', grandpaPhoto: 'shelf' } },
  knowledge: { evidence: [], solvedCaseIds: caseDone ? ['case-01'] : [], exploreHints: 0 },
  caseState: { facts: {} },
  flow: { caseDone, solved: caseDone },
});
const overlaps = (a, b) => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;
const activeDot = (page) => page.evaluate(() => [...document.querySelectorAll('[data-testid="comic-dots"] i')].findIndex((el) => el.classList.contains('on')));
async function swipe(page, from, to) {
  const panel = await page.locator('[data-testid="comic-panel"]').boundingBox();
  const y = panel.y + panel.height * 0.4;
  await page.mouse.move(panel.x + panel.width * from, y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(panel.x + panel.width * (from + ((to - from) * i) / 6), y);
  await page.mouse.up();
  await page.waitForTimeout(500);
}
let checks = 0;
for (const [width, height] of VIEWPORTS) {
  for (const caseDone of [false, true]) {
    const tag = `${width}x${height}-${caseDone ? 'replay' : 'first'}`;
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, hasTouch: false });
    const page = await ctx.newPage();
    await page.route('**/api/**', (route) => route.abort());
    await page.addInitScript(([s]) => {
      if (!sessionStorage.getItem('seeded')) { localStorage.setItem('nesg.player.v1', s); sessionStorage.setItem('seeded', '1'); }
    }, [seed(caseDone)]);
    await page.goto(BASE);
    await page.waitForSelector('.room .backdrop');
    await page.waitForTimeout(800);
    const door = page.locator('.spot[aria-label="ประตู"]');
    await door.click();
    await door.click();
    await page.locator('.evcard').first().click();
    await page.waitForSelector('[data-testid="comic-panel"]');
    await page.waitForTimeout(900); // screen fade
    assert.equal(await activeDot(page), 0, `${tag}: starts on page 1`);
    // swipe left → next, swipe right → previous, tap → next
    await swipe(page, 0.8, 0.2);
    assert.equal(await activeDot(page), 1, `${tag}: swipe left goes to the next page`);
    await swipe(page, 0.2, 0.8);
    assert.equal(await activeDot(page), 0, `${tag}: swipe right goes back`);
    await swipe(page, 0.8, 0.2);
    assert.equal(await activeDot(page), 1, `${tag}: swipe left again`);
    // layout on page 2 (where the old "previous" button used to appear)
    const parts = {
      caption: page.locator('[data-testid="comic-caption"]'),
      dots: page.locator('[data-testid="comic-dots"]'),
      tapHint: page.locator('[data-testid="comic-tapnext"]'),
      skip: page.locator('[data-testid="comic-skip"]'),
      back: page.locator('button.back'),
      pagePill: page.locator('.flow-sub'),
    };
    const boxes = {};
    for (const [name, loc] of Object.entries(parts)) {
      if (await loc.count()) boxes[name] = await loc.first().boundingBox();
    }
    assert.ok(boxes.caption && boxes.dots && boxes.back, `${tag}: caption, dots and back button exist`);
    assert.equal(!!boxes.skip, caseDone, `${tag}: skip only on replay`);
    const names = Object.keys(boxes);
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
      assert.ok(!overlaps(boxes[names[i]], boxes[names[j]]), `${tag}: ${names[i]} overlaps ${names[j]}`);
    }
    for (const [name, b] of Object.entries(boxes)) assert.ok(b.x >= -0.5 && b.x + b.width <= width + 0.5 && b.y + b.height <= height + 0.5, `${tag}: ${name} on screen`);
    assert.equal(await page.getByRole('button', { name: 'ก่อนหน้า' }).count(), 0, `${tag}: no previous button`);
    assert.equal(await page.getByText('ข้ามเรื่องเปิด').count(), caseDone ? 1 : 0, `${tag}: one skip label at most`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/v32-${tag}.png` });
    await page.locator('[data-testid="comic-tap"]').click({ position: { x: width / 2, y: 120 } });
    await page.waitForTimeout(500);
    assert.equal(await activeDot(page), 2, `${tag}: tap still advances`);
    checks++;
    await ctx.close();
  }
}
await browser.close();
console.log(`cutsceneLayout: ${checks} checks passed`);
