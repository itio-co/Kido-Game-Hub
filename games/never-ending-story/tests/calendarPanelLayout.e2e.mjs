// Headless layout check for the calendar panel (needs a browser, so not in `npm test`).
//   npx vite preview --port 4173 &   (or any static server on dist/)
//   BASE=http://127.0.0.1:4173/ CHROME=/usr/bin/google-chrome SHOTS=/tmp node tests/calendarPanelLayout.e2e.mjs
// For every viewport × lock state × collapsed/expanded: the close button never overlaps the
// visible scroll body, and once expanded the take-down button is fully visible above it.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4173/';
const SHOTS = process.env.SHOTS ?? '';
const VIEWPORTS = [[390, 844], [360, 640]];
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
const seed = (solved) => JSON.stringify({
  version: 1,
  player: { onboardingComplete: true, prologueSeen: true, textSize: 'md', soundEnabled: false, calendarTheme: null, decor: {}, room: { calendar: 'original' } },
  knowledge: { evidence: [], solvedCaseIds: solved, exploreHints: 0 },
  caseState: { facts: {} },
});
const box = (loc) => loc.boundingBox();
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
let checks = 0;
for (const [width, height] of VIEWPORTS) {
  for (const locked of [true, false]) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.route('**/api/**', (route) => route.abort());
    await page.addInitScript(([s]) => {
      if (!sessionStorage.getItem('seeded')) { localStorage.setItem('nesg.player.v1', s); sessionStorage.setItem('seeded', '1'); }
    }, [seed(locked ? [] : ['case-01'])]);
    await page.goto(BASE);
    await page.waitForSelector('.room .backdrop');
    await page.waitForTimeout(800);
    const spot = page.locator('.spot[aria-label="ปฏิทิน"]');
    await spot.click();
    await spot.click();
    await page.waitForSelector('[data-testid="calendar-change-toggle"]');
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".scrim")).opacity === "1"); // scrim fade-in done
    const scroll = page.locator('[data-testid="calendar-scroll"]');
    const close = page.locator('[data-testid="calendar-close"]');
    const tag = `${width}x${height}-${locked ? 'locked' : 'unlocked'}`;
    for (const state of ['collapsed', 'expanded']) {
      if (state === 'expanded') {
        await page.locator('[data-testid="calendar-change-toggle"]').click();
        await page.waitForTimeout(700); // smooth scroll
      }
      const [s, c] = [await box(scroll), await box(close)];
      assert.ok(s.y + s.height <= c.y + 0.5, `${tag} ${state}: scroll body ends above close (${s.y + s.height} > ${c.y})`);
      assert.ok(c.y + c.height <= height, `${tag} ${state}: close fully on screen`);
      if (state === 'expanded') {
        const take = page.getByRole('button', { name: 'เก็บปฏิทินลงจากผนัง' });
        const tb = await box(take);
        assert.ok(!overlaps(tb, c), `${tag}: take-down overlaps close`);
        assert.ok(tb.y >= s.y - 0.5 && tb.y + tb.height <= s.y + s.height + 0.5, `${tag}: take-down fully visible in scroll body`);
        // reachable: the element at its centre is the button itself
        const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.textContent?.trim(), [tb.x + tb.width / 2, tb.y + tb.height / 2]);
        assert.equal(hit, 'เก็บปฏิทินลงจากผนัง', `${tag}: take-down is the hit target`);
        const night = await page.getByRole('button', { name: /ท้องฟ้ายามค่ำ/ }).innerText();
        assert.equal(night.includes('ล็อก'), locked, `${tag}: lock label`);
      }
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/v28-${tag}-${state}.png` });
      checks++;
    }
    await ctx.close();
  }
}
await browser.close();
console.log(`calendarPanelLayout: ${checks} checks passed`);
