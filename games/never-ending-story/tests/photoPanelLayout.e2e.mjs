// Headless layout + behaviour check for Grandpa's photo panel (needs a browser, so not in `npm test`).
//   static server on dist/, then:
//   BASE=http://127.0.0.1:4173/ CHROME=/usr/bin/google-chrome SHOTS=/tmp node tests/photoPanelLayout.e2e.mjs
// For every viewport × photo state × collapsed/expanded: the close bar never overlaps the scroll body;
// once expanded the put-away / put-back button is fully visible and tappable; tapping it flips
// player.room.grandpaPhoto, shows/hides the shelf layer, and never touches the placed decor.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4173/';
const SHOTS = process.env.SHOTS ?? '';
const VIEWPORTS = [[390, 844], [360, 640]];
const SHELF = '6bb33448-6b61-4564-91e1-125bae9cf57c';
const PHOTO = '📷 รูปปู่';
const LABEL = { shelf: 'เก็บรูปลง', stored: 'วางรูปกลับบนชั้น' };
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
const seed = (grandpaPhoto) => JSON.stringify({
  version: 1,
  player: { onboardingComplete: true, prologueSeen: true, textSize: 'md', soundEnabled: false, calendarTheme: null, decor: { [SHELF]: PHOTO }, room: { calendar: 'original', grandpaPhoto } },
  knowledge: { evidence: [], solvedCaseIds: ['case-01'], exploreHints: 0 },
  caseState: { facts: {} },
});
const box = (loc) => loc.boundingBox();
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const layerCount = (page) => page.locator('.room img[data-layer="grandpa-photo"]').count();
let checks = 0;
for (const [width, height] of VIEWPORTS) {
  for (const start of ['shelf', 'stored']) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.route('**/api/**', (route) => route.abort());
    await page.addInitScript(([s]) => {
      if (!sessionStorage.getItem('seeded')) { localStorage.setItem('nesg.player.v1', s); sessionStorage.setItem('seeded', '1'); }
    }, [seed(start)]);
    await page.goto(BASE);
    await page.waitForSelector('.room .backdrop');
    await page.waitForTimeout(800);
    const tag = `${width}x${height}-${start}`;
    assert.equal(await layerCount(page), start === 'shelf' ? 1 : 0, `${tag}: shelf layer on load`);
    const spot = page.locator('.spot[aria-label="ชั้นของที่ระลึก"]');
    await spot.click();
    await spot.click();
    await page.waitForSelector('[data-testid="photo-manage-toggle"]');
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.scrim')).opacity === '1');
    assert.equal(await page.locator('[data-testid="photo-manage-options"]').count(), 0, `${tag}: menu starts collapsed`);
    const scroll = page.locator('[data-testid="photo-scroll"]');
    const close = page.locator('[data-testid="photo-close"]');
    for (const state of ['collapsed', 'expanded']) {
      if (state === 'expanded') {
        await page.locator('[data-testid="photo-manage-toggle"]').click();
        await page.waitForTimeout(700); // smooth scroll
      }
      const [s, c] = [await box(scroll), await box(close)];
      assert.ok(s.y + s.height <= c.y + 0.5, `${tag} ${state}: scroll body ends above close (${s.y + s.height} > ${c.y})`);
      assert.ok(c.y + c.height <= height, `${tag} ${state}: close fully on screen`);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/v31-${tag}-${state}.png` });
      if (state === 'expanded') {
        const action = page.getByRole('button', { name: LABEL[start] });
        const ab = await box(action);
        assert.ok(!overlaps(ab, c), `${tag}: action overlaps close`);
        assert.ok(ab.y >= s.y - 0.5 && ab.y + ab.height <= s.y + s.height + 0.5, `${tag}: action fully visible in scroll body`);
        const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.textContent?.trim(), [ab.x + ab.width / 2, ab.y + ab.height / 2]);
        assert.equal(hit, LABEL[start], `${tag}: action is the hit target`);
        await action.click();
        await page.waitForTimeout(300);
        const next = start === 'shelf' ? 'stored' : 'shelf';
        const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('nesg.player.v1')).player);
        assert.equal(saved.room.grandpaPhoto, next, `${tag}: saved state flips`);
        assert.equal(saved.decor[SHELF], PHOTO, `${tag}: placed photo (story record) untouched`);
        assert.equal(await layerCount(page), next === 'shelf' ? 1 : 0, `${tag}: shelf layer follows`);
        await page.getByRole('button', { name: LABEL[next] }).waitFor();
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/v31-${tag}-after-tap.png` });
      }
      checks++;
    }
    await ctx.close();
  }
}
await browser.close();
console.log(`photoPanelLayout: ${checks} checks passed`);
