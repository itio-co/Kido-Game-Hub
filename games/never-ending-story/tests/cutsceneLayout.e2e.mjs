// Headless layout + swipe check for the event opening comic (needs a browser, so not in `npm test`).
//   static server on dist/, then:
//   BASE=http://127.0.0.1:4173/never/ CHROME=/usr/bin/google-chrome SHOTS=/tmp node tests/cutsceneLayout.e2e.mjs
// 390×844, 360×740 and a wide desktop viewport, first play and replay (case done): caption, page pill (if any),
// dots, tap hint, the single skip button and the app's bottom-left back button never overlap; the scene caption
// sits in a reserved band above the panel art (never overlaps the art or a face) and above every speech bubble
// on every page; bubbles stay inside the art; there is no "previous" button and no second skip label; swiping
// left/right changes the page, a tap still advances.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4173/';
const SHOTS = process.env.SHOTS ?? '';
const VIEWPORTS = [[390, 844], [360, 740], [1280, 800]];
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
const seed = (caseDone) => JSON.stringify({
  version: 1,
  player: { onboardingComplete: true, prologueSeen: true, textSize: 'md', soundEnabled: false, calendarTheme: null, decor: {}, room: { calendar: 'original', grandpaPhoto: 'shelf' } },
  knowledge: { evidence: [], solvedCaseIds: caseDone ? ['case-01'] : [], exploreHints: 0 },
  caseState: { facts: {} },
  flow: { caseDone, solved: caseDone, cleared: caseDone },
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
    for (let p = 0; p < 3; p++) {
      if (p) { await page.locator('[data-testid="comic-tap"]').click({ position: { x: Math.min(200, width / 2), y: Math.min(400, height / 2) } }); await page.waitForTimeout(700); }
      const cap = await page.locator('[data-testid="comic-caption"]').boundingBox();
      const art = await page.locator('[data-testid="comic-art"]').boundingBox();
      assert.ok(cap && art, `${tag} p${p + 1}: caption and art exist`);
      assert.ok(cap.y + cap.height < height * 0.35, `${tag} p${p + 1}: caption at the top`);
      assert.ok(!overlaps(cap, art), `${tag} p${p + 1}: caption does not overlap the art`);
      assert.ok(cap.y + cap.height <= art.y + 0.5, `${tag} p${p + 1}: caption sits above the art`);
      const ver = page.locator('[data-testid="version-badge"]');
      const top = [await page.locator('header.hud').boundingBox()];
      if (await ver.count()) top.push(await ver.boundingBox());
      for (const b of top) assert.ok(b && !overlaps(cap, b), `${tag} p${p + 1}: caption clear of HUD/version badge`);
      const foot = await page.locator('[data-testid="comic-dots"]').boundingBox();
      for (const bub of await page.locator('.bub').all()) {
        const b = await bub.boundingBox();
        assert.ok(b.y >= cap.y + cap.height, `${tag} p${p + 1}: bubble below the caption`);
        assert.ok(b.y + b.height <= foot.y, `${tag} p${p + 1}: bubble above the bottom bar`);
        assert.ok(b.x >= art.x - 0.5 && b.x + b.width <= art.x + art.width + 0.5, `${tag} p${p + 1}: bubble horizontally inside the art`);
        assert.ok(b.y >= art.y - 0.5 && b.y + b.height <= art.y + art.height + 0.5, `${tag} p${p + 1}: bubble vertically inside the art`);
      }
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/v34-${tag}-p${p + 1}.png` });
    }
    await swipe(page, 0.2, 0.8);
    await swipe(page, 0.2, 0.8);
    assert.equal(await activeDot(page), 0, `${tag}: swiped back to page 1`);
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
    await page.locator('[data-testid="comic-tap"]').click({ position: { x: Math.min(200, width / 2), y: 120 } });
    await page.waitForTimeout(500);
    assert.equal(await activeDot(page), 2, `${tag}: tap still advances`);
    checks++;
    await ctx.close();
  }
}
await browser.close();
console.log(`cutsceneLayout: ${checks} checks passed`);
