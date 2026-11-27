// Case board footer/header must not overlap questions, the confirm button, or FABs.
//   BASE=http://127.0.0.1:4173/ CHROME=/usr/bin/google-chrome-stable SHOTS=/workspace/nes-038-shots node tests/caseBoard.e2e.mjs
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4173/';
const SHOTS = process.env.SHOTS ?? '';
const overlaps = (a, b) =>
  a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;

const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
  args: ['--no-sandbox', '--use-gl=swiftshader'],
});

const save = JSON.stringify({
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
  knowledge: { evidence: ['E01', 'E02', 'E03', 'E04', 'E06'], solvedCaseIds: [], exploreHints: 0 },
  caseState: { facts: {} },
  flow: {
    evidence: ['E01', 'E02', 'E03', 'E04', 'E06'],
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
      screen: 'case-board',
      history: ['player-room', 'event-select', 'living-room', 'notebook'],
      slot: 'now',
      page: 0,
      talkSlug: null,
      context: 'event',
      schema: 2,
      practice: false,
    },
  },
});

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.route('**/api/**', (route) => route.abort());
await page.addInitScript(([s]) => {
  localStorage.setItem('nesg.player.v1', s);
  sessionStorage.setItem('seeded', '1');
}, [save]);
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="case-board"]', { timeout: 20000 });
await page.waitForTimeout(500);

const board = await page.locator('[data-testid="case-board"]').boundingBox();
const footer = await page.locator('[data-testid="case-board-footer"]').boundingBox();
const hint = await page.locator('[data-testid="case-board-hint"]').boundingBox();
const confirm = await page.locator('[data-testid="case-board-confirm"]').boundingBox();
const header = await page.locator('header.hud').boundingBox();
const badge = await page.locator('.version-badge, [data-testid="version-badge"]').boundingBox().catch(() => null);
const back = await page.locator('button.back').boundingBox();
const bag = await page.locator('[data-testid="bag-btn"]').boundingBox();
const notebook = await page.locator('[data-testid="case-notebook"]').boundingBox();
const firstSection = await page.locator('.deduce section').first().boundingBox();
const flowSub = await page.locator('.flow-sub').count();

assert.ok(board && footer && hint && confirm, 'case board, footer, hint, and confirm are present');
assert.equal(flowSub, 0, 'global subtitle is hidden on the case board');
assert.match(await page.locator('[data-testid="case-board-hint"]').innerText(), /ตอบ 3 ข้อ/);
assert.ok(hint.y + hint.height <= confirm.y + 1, 'hint sits above the confirm button');
assert.ok(header && firstSection && firstSection.y >= header.y + header.height - 1, 'questions start below the header');
if (badge) assert.ok(firstSection.y >= badge.y + badge.height - 1, 'questions start below the version badge');

const named = { footer, hint, confirm, header, back, bag, notebook };
if (badge) named.badge = badge;
for (const [a, b] of [
  ['hint', 'confirm'],
  ['confirm', 'back'],
  ['confirm', 'bag'],
  ['confirm', 'notebook'],
  ['hint', 'back'],
  ['hint', 'bag'],
  ['hint', 'notebook'],
  ['header', 'first'],
]) {
  const left = a === 'header' ? header : named[a];
  const right = b === 'first' ? firstSection : named[b];
  if (!left || !right) continue;
  if (b === 'first' || a === 'header') {
    assert.ok(left.y + left.height <= right.y + 1, `${a} must sit above ${b}`);
    continue;
  }
  assert.ok(!overlaps(left, right), `${a} overlaps ${b}`);
}

if (SHOTS) {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, 'neg22-case-board-after.png'), type: 'png' });
}

await ctx.close();
await browser.close();
console.log('caseBoard: overlap checks passed');
