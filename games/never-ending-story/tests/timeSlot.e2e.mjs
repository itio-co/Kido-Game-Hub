// Time travel stays in the chosen slot when moving rooms; only the clock returns to now.
// Kitchen past has no vase/towel. Aborts /api/.
//   BASE=http://127.0.0.1:4173/ CHROME=/usr/bin/google-chrome-stable SHOTS=/workspace/nes-038-shots node tests/timeSlot.e2e.mjs
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

function save(evidence, screen, slot = 'now', history = ['player-room', 'event-select', 'living-room']) {
  return JSON.stringify({
    version: 1,
    player: {
      onboardingComplete: true,
      prologueSeen: true,
      textSize: 'md',
      soundEnabled: false,
      calendarTheme: null,
      decor: {},
      room: { calendar: 'original' },
    },
    knowledge: { evidence: [...evidence], solvedCaseIds: [], exploreHints: 0 },
    caseState: { facts: {} },
    flow: {
      evidence: [...evidence],
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
      nav: {
        screen,
        history,
        slot,
        page: 0,
        talkSlug: null,
        context: 'event',
        schema: 2,
        practice: false,
      },
    },
  });
}

async function open(saveJson) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: false });
  const page = await ctx.newPage();
  await page.route('**/api/**', (route) => route.abort());
  await page.addInitScript(([s]) => {
    localStorage.setItem('nesg.player.v1', s);
    sessionStorage.setItem('seeded', '1');
  }, [saveJson]);
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
  const spot = page.locator(`[role="button"][aria-label="${label}"]`);
  await spot.click();
  await page.waitForTimeout(200);
  await spot.click();
}

function sceneSrc(page) {
  return page.locator('.flow img').first().getAttribute('src');
}

let checks = 0;

{
  const { ctx, page } = await open(save(['E01'], 'kitchen', 'now'));
  const src = await sceneSrc(page);
  assert.ok(src && src.includes('kitchen-wide.jpg') && !src.includes('kitchen-wide-past'), `present kitchen src ${src}`);
  assert.equal(await page.locator('[role="button"][aria-label="แจกันเติมน้ำใหม่"]').count(), 1, 'vase in the present');
  assert.equal(await page.locator('[role="button"][aria-label="ผ้าเปียกบนราว"]').count(), 1, 'towel in the present');
  await shot(page, 'neg21-kitchen-now.png');
  await ctx.close();
  checks += 1;
}

{
  const { ctx, page } = await open(save(['E01'], 'kitchen', 'afternoon'));
  const src = await sceneSrc(page);
  assert.ok(src && src.includes('kitchen-wide-past'), `past kitchen src ${src}`);
  assert.equal(await page.locator('[role="button"][aria-label="แจกันเติมน้ำใหม่"]').count(), 0, 'no vase in the past');
  assert.equal(await page.locator('[role="button"][aria-label="ผ้าเปียกบนราว"]').count(), 0, 'no towel in the past');
  const sub = (await page.locator('.flow-sub').innerText().catch(() => '')).replace(/\s+/g, ' ');
  assert.ok(sub.includes('บ่าย'), `HUD shows past time: ${sub}`);
  await shot(page, 'neg21-kitchen-past.png');
  await ctx.close();
  checks += 1;
}

{
  const { ctx, page } = await open(save(['E01'], 'kitchen', 'afternoon'));
  await page.locator('button.back').click();
  await page.waitForTimeout(800);
  const src = await sceneSrc(page);
  assert.ok(src && src.includes('living-wide-afternoon'), `living room stays in the afternoon: ${src}`);
  const sub = (await page.locator('.flow-sub').innerText().catch(() => '')).replace(/\s+/g, ' ');
  assert.ok(sub.includes('บ่าย'), `HUD still afternoon after back: ${sub}`);
  await shot(page, 'neg21-back-still-past.png');
  await activate(page, 'นาฬิกา');
  await page.waitForSelector('[data-testid="clock-panel"]');
  await page.locator('[data-testid="clock-slot-now"]').click();
  await page.waitForTimeout(600);
  const nowSrc = await sceneSrc(page);
  assert.ok(nowSrc && src && !nowSrc.includes('afternoon'), `clock returns to now: ${nowSrc}`);
  await shot(page, 'neg21-clock-back-to-now.png');
  await ctx.close();
  checks += 1;
}

await browser.close();
console.log(`timeSlot: ${checks} checks passed`);
