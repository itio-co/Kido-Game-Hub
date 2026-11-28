import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4178/';
const SHOTS = process.env.SHOTS ?? '/workspace/nes-typing-shots';
const REMOTE = 'https://raw.githubusercontent.com/rawitat/gtypist_lessons/main/programming_quotes.typ';
const FILE = process.env.TYPIST_FILE ?? '/workspace/typist-real/programming_quotes.typ';
import { readFileSync, existsSync } from 'node:fs';
const body = existsSync(FILE) ? readFileSync(FILE, 'utf8') : '';
assert.ok(body.length > 1000, 'need the real typ file for author previews');

const AUTHORS = [
  { name: 'Linus Torvalds', file: 'preview-author-1.png' },
  { name: 'Donald E. Knuth', file: 'preview-author-2.png' },
  { name: 'Bjarne Stroustrup', file: 'preview-author-3.png' },
];

const playerSave = JSON.stringify({
  version: 1,
  player: { onboardingComplete: true, prologueSeen: true, textSize: 'md', soundEnabled: false, calendarTheme: null, decor: {}, room: { calendar: 'original' } },
  knowledge: { evidence: [], solvedCaseIds: [], exploreHints: 0 },
  caseState: { facts: {} },
  flow: {
    evidence: [], solved: false, deduced: false, reward: false, poster: false, caseDone: false, cleared: false, mapUnlocked: false,
    difficulty: 'ง่าย', played: [], seen: [], levels: { cross: [], jig: [], slide: [] }, bag: [],
    nav: { screen: 'player-room', history: ['player-room'], slot: 'now', page: 0, talkSlug: null, context: 'hub', schema: 2, practice: false },
  },
});
const playerId = JSON.stringify({ playerId: 'e2e-typing-preview', nickname: 'Tester' });

mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome-stable', args: ['--no-sandbox', '--use-gl=swiftshader'] });
const credits = [];

for (const a of AUTHORS) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2, hasTouch: false, isMobile: false });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route('**/api/**', (route) => route.abort());
  await page.route(REMOTE, (route) => route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', headers: { 'access-control-allow-origin': '*' }, body }));
  await page.addInitScript(([save, id]) => {
    localStorage.setItem('nesg.player.v1', save);
    localStorage.setItem('nesg.playerId.v1', id);
    sessionStorage.setItem('seeded', '1');
  }, [playerSave, playerId]);
  const url = new URL(BASE);
  url.hash = '#/play/typing';
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="typing"]', { timeout: 15000 });
  await page.locator('[data-testid="typing-typist"]').click();
  await page.waitForSelector('[data-testid="typing-lessons"]', { timeout: 15000 });
  const lessons = page.locator('[data-testid^="typing-lesson-"]');
  const n = await lessons.count();
  let found = false;
  for (let i = 0; i < n; i++) {
    await lessons.nth(i).click();
    const drill = page.locator('[data-testid^="typing-drill-"]').filter({ hasText: a.name }).first();
    if (await drill.count()) {
      await drill.click();
      found = true;
      break;
    }
  }
  assert.ok(found, 'no drill for ' + a.name);
  await page.waitForSelector('[data-testid="typing-quote-card"]');
  const author = await page.locator('[data-testid="typing"]').getAttribute('data-author');
  const kind = await page.locator('[data-testid="typing-portrait"]').getAttribute('data-kind');
  const credit = (await page.locator('[data-testid="typing-photo-credit"]').textContent())?.trim() ?? '';
  assert.ok(author && author.includes(a.name.split(' ')[0]), `author attr ${author}`);
  assert.equal(kind, 'photo', `${a.name} should use a catalog photo, got ${kind}`);
  assert.ok(credit.length > 5, 'credit visible');
  const typed = (await page.locator('[data-testid="typing-text"] .ch').allTextContents()).join('').replaceAll('\u00a0', ' ');
  // type a bit with one typo so the overlay is visible, without covering the portrait
  const prefix = typed.slice(0, Math.min(24, Math.floor(typed.length * 0.35)));
  await page.keyboard.type(prefix.slice(0, -1), { delay: 20 });
  await page.keyboard.type('#');
  await page.screenshot({ path: join(SHOTS, a.file), type: 'png' });
  credits.push({ name: a.name, shownAs: author, file: join(SHOTS, a.file), typable: typed, credit, portrait: kind });
  assert.deepEqual(errors, [], errors.join('\n'));
  await ctx.close();
  console.log('ok', a.name, kind, credit);
}

writeFileSync(join(SHOTS, 'preview-author-credits.md'), credits.map((c, i) =>
  `## ${i + 1}. ${c.name}\n- screenshot: \`${c.file}\`\n- shown author: ${c.shownAs}\n- typable text: ${c.typable}\n- credit line: ${c.credit}\n- portrait: ${c.portrait}\n`
).join('\n'));
await browser.close();
console.log('wrote credits');
