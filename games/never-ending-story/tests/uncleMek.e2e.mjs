// Uncle Mek withholds the star-box clue until the crossword is won.
//   BASE=http://127.0.0.1:4173/ CHROME=/usr/bin/google-chrome-stable SHOTS=/workspace/nes-038-shots node tests/uncleMek.e2e.mjs
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

function save(clearedPuzzles = []) {
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
    knowledge: { evidence: [], solvedCaseIds: [], exploreHints: 0 },
    caseState: { facts: {} },
    flow: {
      evidence: [],
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
      clearedPuzzles,
      nav: {
        screen: 'uncle',
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

async function open(clearedPuzzles) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.route('**/api/**', (route) => route.abort());
  await page.addInitScript(([s]) => {
    localStorage.setItem('nesg.player.v1', s);
    sessionStorage.setItem('seeded', '1');
  }, [save(clearedPuzzles)]);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="dialog"]', { timeout: 15000 });
  return { ctx, page };
}

async function shot(page, name) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, name), type: 'png' });
}

{
  const { ctx, page } = await open([]);
  const text = await page.locator('[data-testid="dialog"]').innerText();
  assert.match(text, /ช่วยลุงหน่อยได้ไหม/);
  assert.doesNotMatch(text, /กล่องที่ติดรูปดาว/);
  assert.doesNotMatch(text, /เสริม/);
  assert.ok((await page.locator('[data-testid="dialog"]').innerText()).includes('ช่วยเติมครอสเวิร์ด'));
  await shot(page, 'neg18-mek-before-win.png');
  await ctx.close();
  console.log('ok pre-win');
}

{
  const { ctx, page } = await open(['crossword']);
  const text = await page.locator('[data-testid="dialog"]').innerText();
  assert.match(text, /กล่องที่ติดรูปดาว/);
  await shot(page, 'neg18-mek-after-win.png');
  await ctx.close();
  console.log('ok post-win');
}

await browser.close();
console.log('uncleMek e2e passed');
