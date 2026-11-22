// Play partway through a cleared case, tap the event card to replay, and assert
// the saved run state equals a fresh start (permanent unlocks kept).
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4173/';
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
const leftover = JSON.stringify({
  version: 1,
  player: { onboardingComplete: true, prologueSeen: true, textSize: 'md', soundEnabled: false, calendarTheme: null, decor: {}, room: { calendar: 'original', grandpaPhoto: 'shelf' } },
  knowledge: { evidence: ['E01', 'E02', 'E04'], solvedCaseIds: ['case-01'], exploreHints: 0 },
  caseState: { facts: {} },
  flow: {
    evidence: ['E01', 'E02', 'E04'],
    solved: true,
    deduced: true,
    reward: true,
    poster: true,
    caseDone: true,
    cleared: true,
    difficulty: 'ยาก',
    played: ['flow/practice/cross'],
    seen: ['flow/practice/cross'],
    levels: { cross: [3, 2], jig: [1], slide: [] },
    bag: ['item-leftover'],
    nav: {
      screen: 'living-room',
      history: ['player-room', 'event-select'],
      slot: 'afternoon',
      page: 2,
      talkSlug: null,
      context: 'event',
      schema: 2,
      practice: false,
    },
  },
});

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: false });
const page = await ctx.newPage();
await page.route('**/api/**', (route) => route.abort());
await page.addInitScript(([s]) => {
  if (!sessionStorage.getItem('seeded')) {
    localStorage.setItem('nesg.player.v1', s);
    sessionStorage.setItem('seeded', '1');
  }
}, [leftover]);
await page.goto(BASE);
await page.waitForTimeout(1200);
// Mid-event leftover should have landed in the living room; back out to the event list or the door.
for (let i = 0; i < 8; i++) {
  if (await page.locator('.evcard').count()) break;
  const door = page.locator('.spot[aria-label="ประตู"]');
  if (await door.count() && await door.isVisible()) break;
  const back = page.locator('button.back');
  if (await back.count() && await back.isVisible()) {
    await back.click();
    await page.waitForTimeout(700);
    continue;
  }
  break;
}
if (!(await page.locator('.evcard').count())) {
  const door = page.locator('.spot[aria-label="ประตู"]');
  await door.click();
  await door.click();
  await page.waitForSelector('.evcard');
}
await page.locator('.evcard').first().click();
await page.waitForSelector('[data-testid="comic-panel"]');
await page.waitForTimeout(900);

const dot = await page.evaluate(() => [...document.querySelectorAll('[data-testid="comic-dots"] i')].findIndex((el) => el.classList.contains('on')));
assert.equal(dot, 0, 'replay starts on page 1');
const caption = await page.locator('[data-testid="comic-caption"]').innerText();
assert.match(caption, /คืนวันศุกร์/, 'replay shows the first-page caption');

const flow = await page.evaluate(() => JSON.parse(localStorage.getItem('nesg.player.v1')).flow);
assert.deepEqual(flow.evidence, [], 'evidence reset');
assert.equal(flow.solved, false, 'solved reset');
assert.equal(flow.deduced, false, 'deduced reset');
assert.equal(flow.poster, false, 'poster reset');
assert.equal(flow.caseDone, false, 'this-run caseDone reset');
assert.equal(flow.cleared, true, 'cleared kept');
assert.deepEqual(flow.bag ?? [], [], 'bag reset');
assert.equal(flow.nav?.page, 0, 'page reset');
assert.equal(flow.difficulty, 'ปานกลาง', 'difficulty back to default');
assert.deepEqual(flow.played, ['flow/practice/cross'], 'practice unlocks kept');
assert.deepEqual(flow.levels.cross, [3, 2], 'high scores kept');
assert.equal(await page.getByText('ข้ามเรื่องเปิด').count(), 1, 'skip intro still available after a cleared replay');

await ctx.close();
await browser.close();
console.log('replayReset e2e: passed');
