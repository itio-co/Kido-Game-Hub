// Streak board in the player room: chip, board states (active, battery-saved day, reset, offline),
// and a story jigsaw win that reports to POST players/me/streak/win. The API is mocked; nothing reaches a server.
// Not in `npm test` (needs a browser and a static server):
//   BASE=http://127.0.0.1:4173/ CHROME=/usr/bin/google-chrome-stable SHOTS=/workspace/nes-streak-shots node tests/streakBoard.e2e.mjs
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4173/';
const SHOTS = process.env.SHOTS ?? '';
const FAKE_BEARER = 'e2e-fake-bearer-not-real';
const FAKE_STREAK = 'st1.e2e.fake';

function seed(nav = { screen: 'player-room', history: [], context: 'hub' }, difficulty = 'ง่าย') {
  return JSON.stringify({
    version: 1,
    player: { onboardingComplete: true, prologueSeen: true, textSize: 'md', soundEnabled: false, calendarTheme: null, decor: {}, room: { calendar: 'original', grandpaPhoto: 'shelf' } },
    knowledge: { evidence: [], solvedCaseIds: [], exploreHints: 0 },
    caseState: { facts: {} },
    flow: {
      evidence: [], solved: false, deduced: false, reward: false, poster: false, caseDone: false, cleared: false, mapUnlocked: false,
      difficulty, played: [], seen: [], levels: { cross: [], jig: [], slide: [] }, bag: [],
      nav: { slot: 'now', page: 0, talkSlug: null, schema: 2, practice: false, ...nav },
    },
  });
}

/** Week of Mon 2026-11-23 … Sun 2026-11-29; "today" is Thursday 2026-11-26. */
const VIEWS = {
  active: {
    count: 12, best: 12, batteries: 2, maxBatteries: 2, totalWins: 31, today: '2026-11-26', state: 'done', refillIn: 0,
    days: [{ date: '2026-11-23', kind: 'win' }, { date: '2026-11-24', kind: 'win' }, { date: '2026-11-25', kind: 'win' }, { date: '2026-11-26', kind: 'win' }],
  },
  saved: {
    count: 5, best: 9, batteries: 1, maxBatteries: 2, totalWins: 14, today: '2026-11-26', state: 'open', refillIn: 2,
    days: [{ date: '2026-11-23', kind: 'win' }, { date: '2026-11-24', kind: 'saved' }, { date: '2026-11-25', kind: 'win' }],
  },
  reset: {
    count: 0, best: 12, batteries: 0, maxBatteries: 2, totalWins: 31, today: '2026-11-26', state: 'reset', refillIn: 0,
    days: [{ date: '2026-11-23', kind: 'win' }],
  },
};

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox', '--use-gl=swiftshader'] });

async function shot(page, name) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, name), type: 'png', fullPage: false });
}

async function open({ view = null, bearer = true, nav, difficulty, onWin } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const page = await ctx.newPage();
  const seen = { getTokens: [], wins: [] };
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname.endsWith('/api/players/me/streak') && view) {
      seen.getTokens.push(route.request().headers()['x-streak-token'] ?? null);
      return json({ ok: true, streak: { view, token: FAKE_STREAK, check: 'ok', counted: false, refilled: false } });
    }
    if (url.pathname.endsWith('/api/players/me/streak/win') && onWin) {
      seen.wins.push(JSON.parse(route.request().postData() ?? '{}'));
      return json({ ok: true, streak: { view: onWin, token: FAKE_STREAK, check: 'ok', counted: true, refilled: false } });
    }
    return route.abort();
  });
  await page.addInitScript(([s, token]) => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.setItem('nesg.player.v1', s);
    if (token) localStorage.setItem('nesg.playerToken.v1', token);
    sessionStorage.setItem('seeded', '1');
  }, [seed(nav, difficulty), bearer ? FAKE_BEARER : null]);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  return { ctx, page, seen };
}

async function openBoard(page) {
  await page.locator('[data-testid="streak-btn"]').click();
  await page.locator('[data-testid="streak-panel"]').waitFor({ timeout: 5000 });
  await page.waitForTimeout(350);
}

const kinds = (page) => page.locator('[data-testid="streak-week"] li').evaluateAll((els) => els.map((e) => e.getAttribute('data-kind')));

// 1. Active streak: chip in the room, big count, four lit days, two full batteries.
{
  const { ctx, page, seen } = await open({ view: VIEWS.active });
  const chip = page.locator('[data-testid="streak-btn"]');
  await chip.waitFor({ timeout: 20000 });
  await page.waitForFunction(() => document.querySelector('[data-testid="streak-btn-count"]')?.textContent?.trim() === '12', null, { timeout: 5000 });
  const box = await chip.boundingBox();
  const back = await page.locator('button.back').boundingBox();
  assert.ok(box && back && Math.abs(box.y + box.height - (back.y + back.height)) <= 2, 'chip sits on the back button baseline');
  assert.ok(box.x + box.width <= 390 - 8, 'chip inside the screen');
  await shot(page, 'streak-room-chip.png');
  await openBoard(page);
  const panel = page.locator('[data-testid="streak-panel"]');
  assert.equal(await panel.getAttribute('data-state'), 'done');
  assert.equal((await page.locator('[data-testid="streak-count"]').innerText()).trim(), '12');
  assert.equal(await page.locator('[data-testid="streak-batteries"]').getAttribute('data-count'), '2');
  assert.deepEqual(await kinds(page), ['win', 'win', 'win', 'win', '', '', '']);
  assert.ok((await page.locator('[data-testid="streak-status"]').innerText()).includes('เล่นชนะแล้ว'));
  assert.ok((await page.locator('[data-testid="streak-best"]').innerText()).includes('12 วัน'));
  assert.ok((await page.locator('[data-testid="streak-wins"]').innerText()).includes('31 เกม'));
  assert.equal(await page.locator('[data-testid="streak-offline"]').count(), 0);
  assert.equal(await page.locator('.streak-sheet .day.today').getAttribute('data-date'), '2026-11-26');
  assert.ok(seen.getTokens.length >= 1, 'board fetched from the server');
  assert.ok(seen.getTokens.at(-1) === FAKE_STREAK, 'stored streak token is sent back');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('nesg.streak.v1') ?? 'null'));
  assert.equal(stored?.token, FAKE_STREAK, 'token kept in localStorage');
  await shot(page, 'streak-active.png');
  await page.locator('[data-testid="streak-close"]').click();
  assert.equal(await panel.count(), 0, 'close hides the board');
  await ctx.close();
}

// 2. A day saved by a battery.
{
  const { ctx, page } = await open({ view: VIEWS.saved });
  await page.locator('[data-testid="streak-btn"]').waitFor({ timeout: 20000 });
  await openBoard(page);
  assert.equal(await page.locator('[data-testid="streak-panel"]').getAttribute('data-state'), 'open');
  assert.deepEqual(await kinds(page), ['win', 'saved', 'win', '', '', '', '']);
  assert.equal(await page.locator('[data-testid="streak-batteries"]').getAttribute('data-count'), '1');
  assert.ok((await page.locator('[data-testid="streak-refill"]').innerText()).includes('อีก 2 วัน'));
  await shot(page, 'streak-battery-saved.png');
  await ctx.close();
}

// 3. Reset: batteries ran out.
{
  const { ctx, page } = await open({ view: VIEWS.reset });
  await page.locator('[data-testid="streak-btn"]').waitFor({ timeout: 20000 });
  await openBoard(page);
  assert.equal(await page.locator('[data-testid="streak-panel"]').getAttribute('data-state'), 'reset');
  assert.equal((await page.locator('[data-testid="streak-count"]').innerText()).trim(), '0');
  assert.equal(await page.locator('[data-testid="streak-batteries"]').getAttribute('data-count'), '0');
  assert.ok((await page.locator('[data-testid="streak-status"]').innerText()).includes('เริ่มนับใหม่'));
  assert.ok((await page.locator('[data-testid="streak-best"]').innerText()).includes('12 วัน'));
  await shot(page, 'streak-reset.png');
  await ctx.close();
}

// 4. Offline, never registered: empty board with an offline note.
{
  const { ctx, page } = await open({ bearer: false });
  await page.locator('[data-testid="streak-btn"]').waitFor({ timeout: 20000 });
  assert.equal((await page.locator('[data-testid="streak-btn-count"]').innerText()).trim(), '0');
  await openBoard(page);
  assert.equal(await page.locator('[data-testid="streak-panel"]').getAttribute('data-state'), 'new');
  assert.equal(await page.locator('[data-testid="streak-offline"]').count(), 1);
  await shot(page, 'streak-offline-new.png');
  await ctx.close();
}

// 5. Winning a story jigsaw reports the win and refreshes the stored board.
{
  const { ctx, page, seen } = await open({
    nav: { screen: 'jigsaw', history: ['player-room', 'event-select', 'living-room', 'tray'], context: 'event' },
    onWin: { ...VIEWS.active, count: 13, best: 13 },
  });
  await page.waitForSelector('[data-testid="jigsaw-board"]', { timeout: 20000 });
  await page.waitForTimeout(400);
  for (let pass = 0; pass < 4; pass += 1) {
    for (let id = 0; id < 9; id += 1) {
      const piece = page.locator(`[data-testid="jigsaw-piece-${id}"]`);
      if ((await piece.getAttribute('data-locked')) === 'true') continue;
      await piece.dragTo(page.locator(`[data-testid="jigsaw-slot-${id}"]`), { force: true, targetPosition: { x: 8, y: 8 } });
      await page.waitForTimeout(120);
    }
    if ((await page.locator('[data-testid^="jigsaw-piece-"][data-locked="true"]').count()) === 9) break;
  }
  await page.locator('[data-testid="minigame-win-dialog"]').waitFor({ timeout: 15000 });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('nesg.streak.v1') ?? 'null')?.view?.count === 13, null, { timeout: 5000 });
  assert.equal(seen.wins.length, 1, 'one win report');
  assert.equal(seen.wins[0].game, 'jig');
  assert.equal(seen.wins[0].streakToken, FAKE_STREAK, 'stored token sent with the win');
  assert.equal(await page.evaluate(() => localStorage.getItem('nesg.streakPending.v1')), null, 'pending cleared after send');
  await ctx.close();
}

await browser.close();
console.log('streak board e2e passed');
