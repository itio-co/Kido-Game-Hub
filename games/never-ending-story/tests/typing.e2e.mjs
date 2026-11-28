// Typing minigame in a real browser: menu, error marks, backspace/hard mode, soft-keyboard style input, result dialog,
// Typist lessons (online file, failure UI, bundled fallback), tablet + phone landscape, reduced motion.
// Not in `npm test` (needs a browser and a static server):
//   BASE=http://127.0.0.1:4177/never/ CHROME=/usr/bin/google-chrome-stable SHOTS=/workspace/nes-typing-shots \
//     TYPIST_FILE=/path/to/programming_quotes.typ node tests/typing.e2e.mjs
// Serve the preview build under /never/ (same path prefix as production) so root-absolute
// /img/... portrait URLs would 404. TYPIST_FILE is optional; without it a small inline
// lesson file stands in for the online course.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4177/';
const SHOTS = process.env.SHOTS ?? '/workspace/nes-typing-shots';
const REMOTE = 'https://raw.githubusercontent.com/rawitat/gtypist_lessons/main/programming_quotes.typ';
const INLINE_TYP = `# stand-in course
*:MENU
B:Stand-in course
M:"Lessons"
 :ALPHA   "Alpha lesson      First stand-in lesson"
 :BETA    "Beta lesson       Second stand-in lesson"

*:ALPHA
B:Alpha banner

*:A_1
I:[1] Ada Lovelace
S:Keep it simple and keep it small.

*:A_2
I:[2] Alan Turing
S:Short drills build fast fingers.
Q:Do you want to continue to next lesson [Y/N] ?
N:MENU

*:BETA
B:Beta banner

*:B_1
I:[3] Grace Hopper
S:Read the error message first.
G:MENU
`;
const remoteBody = process.env.TYPIST_FILE && existsSync(process.env.TYPIST_FILE) ? readFileSync(process.env.TYPIST_FILE, 'utf8') : INLINE_TYP;
const real = remoteBody !== INLINE_TYP;

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
const playerId = JSON.stringify({ playerId: 'e2e-typing', nickname: 'Tester' });

mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox', '--use-gl=swiftshader'] });

/** remote: 'ok' serves the course, 'fail' drops the connection, 'slow' answers after `delay` ms. */
async function open(hash, { viewport, touch = false, reduced = false, remote = 'ok', extra = null } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: touch, isMobile: touch, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const requests = [];
  await page.route('**/api/**', (route) => route.abort());
  await page.route(REMOTE, async (route) => {
    requests.push(route.request().url());
    if (remote === 'fail') return route.abort('internetdisconnected');
    return route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', headers: { 'access-control-allow-origin': '*' }, body: remoteBody });
  });
  await page.addInitScript(([save, id, ex]) => {
    localStorage.setItem('nesg.player.v1', save);
    localStorage.setItem('nesg.playerId.v1', id);
    sessionStorage.setItem('seeded', '1');
    if (ex) for (const [k, v] of Object.entries(ex)) localStorage.setItem(k, v);
  }, [playerSave, playerId, extra]);
  const url = new URL(BASE);
  url.hash = hash;
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="typing"]', { timeout: 15000 });
  return { ctx, page, errors, requests };
}
const shot = (page, name) => page.screenshot({ path: join(SHOTS, name), type: 'png' });
const q = (page, id) => page.locator(`[data-testid="${id}"]`);
const attr = (page, id, name) => q(page, id).getAttribute(name);
const marks = (page) => page.locator('[data-testid="typing-text"] .ch').evaluateAll((els) => els.map((e) => e.dataset.mark));
const root = (page, name) => attr(page, 'typing', name);
const text = async (page, id) => (await q(page, id).textContent())?.trim();
const typeSlow = async (page, s, delay = 25) => { await page.keyboard.type(s, { delay }); };

const DESKTOP = { width: 1280, height: 720 };
const TABLET = { width: 1180, height: 820 };
const PHONE = { width: 740, height: 360 };
let step = 0;
const ok = (msg) => console.log(`ok ${++step} ${msg}`);

/** Open a typist drill whose label contains `name`. */
async function openAuthorDrill(page, name, useTap = false) {
  const go = async (loc) => (useTap ? loc.tap() : loc.click());
  if (await page.locator('[data-testid="typing-typist"]').count()) await go(q(page, 'typing-typist'));
  await page.waitForSelector('[data-testid="typing-lessons"]', { timeout: 15000 });
  const lessons = page.locator('[data-testid^="typing-lesson-"]');
  const n = await lessons.count();
  for (let i = 0; i < n; i++) {
    await go(lessons.nth(i));
    const drill = page.locator('[data-testid^="typing-drill-"]').filter({ hasText: name }).first();
    if (await drill.count()) {
      await go(drill);
      await page.waitForSelector('[data-testid="typing-quote-card"]');
      return;
    }
  }
  throw new Error('no typist drill for ' + name);
}

async function typableText(page) {
  return (await page.locator('[data-testid="typing-text"] .ch').allTextContents()).join('').replaceAll(' ', ' ');
}

/** Portrait <img> must be under the app base (not a root-absolute /img/...) and actually decode. */
async function assertPortraitLoaded(page, author) {
  const img = page.locator('[data-testid="typing-portrait"] img');
  await img.waitFor({ state: 'visible', timeout: 10000 });
  const src = await img.getAttribute('src');
  assert.ok(src, `${author}: missing portrait src`);
  assert.ok(!src.startsWith('/img/'), `${author}: portrait src is root-absolute ${src}`);
  const abs = new URL(src, page.url());
  const basePath = new URL(BASE).pathname.endsWith('/') ? new URL(BASE).pathname : new URL(BASE).pathname + '/';
  const expectedPrefix = basePath + 'img/typing/portraits/';
  assert.ok(
    abs.pathname.startsWith(expectedPrefix),
    `${author}: resolved path ${abs.pathname} should start with ${expectedPrefix} (src=${src})`,
  );
  await img.evaluate((el) => (el.complete ? null : new Promise((resolve, reject) => {
    el.addEventListener('load', resolve, { once: true });
    el.addEventListener('error', () => reject(new Error('portrait image error ' + el.src)), { once: true });
  })));
  const naturalWidth = await img.evaluate((el) => el.naturalWidth);
  assert.ok(naturalWidth > 0, `${author}: portrait did not load (naturalWidth=${naturalWidth}, src=${src}, resolved=${abs.href})`);
}

async function assertSideBySide(page, where) {
  const card = await q(page, 'typing-quote-card').boundingBox();
  const quote = await q(page, 'typing-quote').boundingBox();
  const port = await q(page, 'typing-portrait').boundingBox();
  assert.ok(quote && port && card, `${where}: quote and portrait visible`);
  assert.ok(port.x >= quote.x + quote.width - 8, `${where}: portrait should sit to the right of the quote ${JSON.stringify({ quote, port })}`);
  assert.ok(port.height >= card.height * 0.9, `${where}: portrait fills the card height ${JSON.stringify({ card, port })}`);
  const ratio = port.width / card.width;
  assert.ok(ratio >= 0.28 && ratio <= 0.48, `${where}: portrait should be ~35-40% of the card width, got ${ratio.toFixed(2)} ${JSON.stringify({ card, port })}`);
}


async function assertBackgroundPortrait(page, where) {
  const card = await q(page, 'typing-quote-card').boundingBox();
  const panel = await q(page, 'typing-text').boundingBox();
  const port = await q(page, 'typing-portrait').boundingBox();
  assert.ok(panel && port && card, `${where}: quote panel and portrait visible`);
  assert.ok(Math.abs(port.x - card.x) <= 2 && Math.abs(port.width - card.width) <= 4, `${where}: portrait should span the card width ${JSON.stringify({ card, port })}`);
  assert.ok(port.height >= card.height * 0.9, `${where}: portrait should fill the card height ${JSON.stringify({ card, port })}`);
  assert.ok(panel.y >= port.y - 1 && panel.y + panel.height <= port.y + port.height + 4, `${where}: quote panel should sit over the portrait ${JSON.stringify({ panel, port })}`);
  const title = await page.locator('.ttl').boundingBox();
  const stat = await page.locator('.stat').boundingBox();
  assert.ok(title && stat && stat.y >= title.y + title.height - 2, `${where}: HUD should sit on its own row under the title ${JSON.stringify({ title, stat })}`);
}

/** The current caret character must stay inside the visible viewport, below the header and above the footer. */
async function assertCaretInView(page, where) {
  const cur = page.locator('[data-testid="typing-text"] .ch.cursor').first();
  await cur.waitFor({ state: 'visible' });
  const box = await cur.boundingBox();
  const header = await page.locator('.top').boundingBox();
  const foot = await page.locator('.foot').boundingBox();
  const vp = page.viewportSize();
  assert.ok(box && vp, `${where}: caret and viewport`);
  assert.ok(box.y >= 0 && box.y + box.height <= vp.height, `${where}: caret outside viewport ${JSON.stringify({ box, vp })}`);
  assert.ok(box.x >= 0 && box.x + box.width <= vp.width, `${where}: caret outside viewport x ${JSON.stringify({ box, vp })}`);
  if (header) assert.ok(box.y + 0.5 >= header.y + header.height, `${where}: caret is under the header ${JSON.stringify({ box, header })}`);
  if (foot) assert.ok(box.y + box.height <= foot.y + 0.5, `${where}: caret is under the footer ${JSON.stringify({ box, foot })}`);
}

// ---- 1. menu + practice card data ----
{
  const { ctx, page, errors } = await open('#/play/typing', { viewport: DESKTOP });
  assert.equal(await root(page, 'data-screen'), 'menu');
  assert.equal(await page.locator('[data-testid^="typing-set-"]').count(), 4, 'four sets');
  assert.equal(await page.locator('[data-testid^="typing-diff-"]').count(), 3, 'three levels');
  assert.match(await text(page, 'typing-levelhelp'), /80/, 'easy help shows its accuracy floor');
  await q(page, 'typing-diff-hard').click();
  assert.match(await text(page, 'typing-levelhelp'), /97/, 'hard help changes');
  await q(page, 'typing-diff-easy').click();
  await shot(page, '01-menu-desktop.png');
  const flow = await page.evaluate((base) => fetch(new URL('data/case-flow.json', base).href).then((r) => r.json()), BASE);
  const card = flow.practice.find((g) => g.game === 'typing');
  assert.ok(card && card.route === '#/play/typing' && card.group === 'ฝีมือ' && card.future === false, 'practice card present');
  assert.equal(new Set(flow.practice.map((g) => g.id)).size, flow.practice.length, 'practice ids unique');
  assert.deepEqual(errors, []);
  await ctx.close();
  ok('menu: four sets, three levels, level help, practice card');
}

// ---- 2. core typing: marks, backspace, finish, result, streak report, bests ----
{
  const { ctx, page, errors } = await open('#/play/typing', { viewport: DESKTOP });
  await q(page, 'typing-set-sentences').click();
  await q(page, 'typing-start').click();
  assert.equal(await root(page, 'data-screen'), 'play');
  const target = await attr(page, 'typing-text', 'data-len');
  assert.equal(Number(target), 'The quick brown fox jumps over the lazy dog.'.length);
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-testid')), 'typing-input', 'input is focused');
  assert.equal(await attr(page, 'typing-text', 'data-started'), '0');
  assert.equal((await marks(page))[0], 'cursor');
  await typeSlow(page, 'The qxick br', 130);
  let m = await marks(page);
  assert.equal(m[5], 'bad', 'wrong character is marked');
  assert.deepEqual([m[0], m[4], m[11], m[12]], ['ok', 'ok', 'ok', 'cursor']);
  assert.equal(await attr(page, 'typing-text', 'data-errors'), '1');
  assert.equal(await attr(page, 'typing-text', 'data-started'), '1');
  assert.ok(Number(await text(page, 'typing-wpm')) > 0, 'live wpm');
  assert.equal(await text(page, 'typing-combo'), 'x6', 'combo reset by the miss, then 6 right (o→r)... ');
  await shot(page, '02-typing-midrun-error-desktop.png');
  // backspace back to the error and fix it
  await page.keyboard.press('Backspace', { delay: 10 });
  for (let i = 0; i < 6; i++) await page.keyboard.press('Backspace');
  assert.equal(await attr(page, 'typing-text', 'data-pos'), '5');
  await typeSlow(page, 'uick brown fox jumps over the lazy dog');
  assert.equal(await attr(page, 'typing-text', 'data-errors'), '0');
  assert.equal(await root(page, 'data-phase'), 'play', 'one character short, not finished');
  await typeSlow(page, '.');
  await page.waitForSelector('[data-testid="minigame-win-dialog"]');
  assert.equal(await root(page, 'data-phase'), 'done');
  const stars = Number(await attr(page, 'minigame-win-stars', 'data-stars'));
  assert.ok(stars >= 1, `won with ${stars} stars`);
  assert.match(await text(page, 'minigame-win-game'), /Typing|พิมพ์ดีด/);
  assert.match((await page.locator('.win-card').textContent()) ?? '', /WPM/, 'result shows WPM');
  await page.waitForTimeout(900);
  await shot(page, '03-result-desktop.png');
  const store = await page.evaluate(() => ({
    best: JSON.parse(localStorage.getItem('nesg.minigame-best.v1') ?? '{}'),
    pending: JSON.parse(localStorage.getItem('nesg.streakPending.v1') ?? 'null'),
    prefs: JSON.parse(localStorage.getItem('nesg.typing.v1') ?? 'null'),
  }));
  assert.ok(store.best['typing-sentences:easy']?.stars >= 1 && store.best['typing-sentences:easy'].score > 0, 'best saved');
  assert.equal(store.pending?.game, 'typing', 'streak win reported for typing');
  assert.equal(store.prefs?.plays?.home, undefined);
  assert.equal(store.prefs?.plays?.sentences, 1, 'run counter advanced');
  // replay restarts the same text; close returns to the menu
  await page.getByRole('button', { name: /เล่นอีกครั้ง|Play again|Replay/i }).first().click().catch(async () => { await page.locator('.win-card button').first().click(); });
  await page.waitForSelector('[data-testid="typing-text"]');
  assert.equal(await root(page, 'data-phase'), 'play');
  assert.equal(await attr(page, 'typing-text', 'data-pos'), '0');
  await page.keyboard.press('Escape');
  assert.equal(await root(page, 'data-screen'), 'menu', 'Esc leaves to the menu');
  assert.deepEqual(errors, []);
  await ctx.close();
  ok(`core typing: marks, backspace fix, finish (${stars}★), result dialog, bests, streak report, replay, Esc`);
}

// ---- 3. hard mode: no backspace; ends at full length even with errors ----
{
  const { ctx, page } = await open('#/play/typing', { viewport: DESKTOP, extra: { 'nesg.typing.v1': JSON.stringify({ difficulty: 'hard', set: 'home', source: 'quotes', plays: {} }) } });
  await q(page, 'typing-start').click();
  assert.notEqual(await text(page, 'typing-hint'), '', 'hard mode hint before the first key');
  await page.keyboard.type('as');
  await page.keyboard.press('Backspace');
  assert.equal(await attr(page, 'typing-text', 'data-pos'), '2', 'backspace ignored on hard');
  const len = Number(await attr(page, 'typing-text', 'data-len'));
  await page.keyboard.type('~'.repeat(len - 2));
  await page.waitForSelector('[data-testid="minigame-win-dialog"]');
  assert.equal(Number(await attr(page, 'minigame-win-stars', 'data-stars')), 0, 'all wrong earns no star');
  assert.match((await text(page, 'minigame-win-subtitle')) ?? '', /92/, 'retry line names the accuracy floor');
  await ctx.close();
  ok('hard mode: backspace ignored, finishes at full length, 0 stars on bad accuracy');
}

// ---- 4. soft-keyboard style input: value changes diffed against what is typed ----
{
  const { ctx, page } = await open('#/play/typing', { viewport: PHONE, touch: true });
  await q(page, 'typing-start').tap();
  const set = (v) => page.evaluate((value) => {
    const el = document.querySelector('[data-testid="typing-input"]');
    el.value = value;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    return el.value;
  }, v);
  assert.equal(await set('asd'), 'asd');
  assert.equal(await attr(page, 'typing-text', 'data-pos'), '3');
  assert.equal(await set('as'), 'as', 'shorter value = backspace');
  assert.equal(await attr(page, 'typing-text', 'data-pos'), '2');
  assert.equal(await set('asXY'), 'asXY');
  assert.equal(await attr(page, 'typing-text', 'data-errors'), '2');
  const len = Number(await attr(page, 'typing-text', 'data-len'));
  const trimmed = await set('asXY' + 'q'.repeat(len + 20));
  assert.equal(Array.from(trimmed).length, len, 'typing past the end is trimmed back to the line');
  assert.equal(await attr(page, 'typing-text', 'data-pos'), String(len));
  assert.equal(await root(page, 'data-phase'), 'play', 'full line with errors is not finished on easy');
  // paste is blocked
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="typing-input"]');
    el.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: new DataTransfer() }));
  });
  await ctx.close();
  ok('soft-keyboard input: value diff = type/backspace, trimmed at the end');
}

// ---- 5. Thai set ----
{
  const { ctx, page } = await open('#/play/typing', { viewport: DESKTOP });
  await q(page, 'typing-set-thai').click();
  await q(page, 'typing-start').click();
  const first = 'ฉันชอบพิมพ์ดีดทุกวัน';
  assert.equal(await text(page, 'typing-instruction'), 'ต้องสลับคีย์บอร์ดเป็นภาษาไทย');
  const joined = (await page.locator('[data-testid="typing-text"] .ch').allTextContents()).join('');
  assert.equal(joined, first, 'Thai text from locale, one cell per base character with its marks');
  assert.ok((await marks(page)).length < Array.from(first).length, 'combining marks share a cell');
  await shot(page, '04-thai-set-desktop.png');
  await page.keyboard.type(first, { delay: 10 });
  await page.waitForSelector('[data-testid="minigame-win-dialog"]');
  assert.ok(Number(await attr(page, 'minigame-win-stars', 'data-stars')) >= 1);
  await ctx.close();
  ok('Thai set: text from locale, marks grouped, finishes');
}

// ---- 6. Typist lessons: online file ----
{
  const { ctx, page, errors, requests } = await open('#/play/typing', { viewport: DESKTOP });
  await q(page, 'typing-typist').click();
  await page.waitForSelector('[data-testid="typing-lessons"]');
  assert.equal(await root(page, 'data-screen'), 'typist');
  assert.equal(await root(page, 'data-load'), 'ready');
  assert.deepEqual(requests, [REMOTE], 'fetched the course file once');
  const lessons = await page.locator('[data-testid^="typing-lesson-"]').count();
  if (real) assert.equal(lessons, 25, 'real course has 25 lessons');
  else assert.equal(lessons, 2);
  assert.match((await text(page, 'typing-credit')) ?? '', /raw\.githubusercontent\.com\/rawitat\/gtypist_lessons/);
  const first = real ? 'GENERAL' : 'ALPHA';
  await q(page, `typing-lesson-${first}`).click();
  const drills = await page.locator('[data-testid^="typing-drill-"]').count();
  assert.ok(drills >= 2, 'drills listed');
  await shot(page, '05-typist-lessons-desktop.png');
  const drillId = real ? 'G_3' : 'A_1';
  await q(page, `typing-drill-${drillId}`).click();
  assert.equal(await root(page, 'data-screen'), 'play');
  assert.equal(await root(page, 'data-card'), 'quote');
  assert.equal(await root(page, 'data-author'), real ? 'Olin Shivers' : 'Ada Lovelace');
  assert.equal(await page.locator('[data-testid="typing-instruction"]').count(), 0, 'instruction is not shown on the quote card (it is not typable)');
  assert.ok(await q(page, 'typing-quote-card').count());
  const typed = (await page.locator('[data-testid="typing-text"] .ch').allTextContents()).join('').replaceAll('\u00a0', ' ');
  assert.ok(typed.length > 10 && !typed.includes('\n'));
  const expected = real ? '"I object to doing things that computers can do." - Olin Shivers' : '"Keep it simple and keep it small." - Ada Lovelace';
  assert.equal(typed, expected);
  await q(page, 'typing-text').click();
  await typeSlow(page, typed.slice(0, Math.floor(typed.length / 2)), 110);
  await page.keyboard.type('#');
  await shot(page, '06-typist-drill-midrun-desktop.png');
  await page.keyboard.press('Backspace');
  await typeSlow(page, typed.slice(Math.floor(typed.length / 2)));
  await page.waitForSelector('[data-testid="minigame-win-dialog"]');
  assert.match((await text(page, 'minigame-win-game')) ?? '', /Typist/);
  const best = await page.evaluate(() => JSON.parse(localStorage.getItem('nesg.minigame-best.v1') ?? '{}'));
  assert.ok(best[`typist-quotes-${drillId}:easy`]?.stars >= 1, 'Typist best saved under its own key');
  // close → back to the lesson list with a star on the drill
  await page.locator('.win-card button').last().click();
  assert.equal(await root(page, 'data-screen'), 'typist');
  assert.match((await q(page, `typing-drill-${drillId}`).textContent()) ?? '', /★/);
  assert.deepEqual(errors, []);
  await ctx.close();
  ok(`Typist online: ${lessons} lessons, ${drills} drills in the first, drill played and saved`);
}

// ---- 6b. Quote card desktop (Stroustrup when the real course is present, else Ada Lovelace) ----
{
  const { ctx, page, errors } = await open('#/play/typing', { viewport: DESKTOP });
  const author = real ? 'Bjarne Stroustrup' : 'Ada Lovelace';
  await openAuthorDrill(page, author, false);
  assert.equal(await root(page, 'data-card'), 'quote');
  assert.equal(await q(page, 'typing-portrait').getAttribute('data-kind'), 'photo', author + ' uses a catalog photo');
  await assertPortraitLoaded(page, author);
  await assertSideBySide(page, 'desktop');
  await q(page, 'typing-text').click();
  await shot(page, 'quote-desktop.png');
  const typed = await typableText(page);
  const prefix = typed.slice(0, Math.min(28, Math.max(8, Math.floor(typed.length * 0.3))));
  await typeSlow(page, prefix.slice(0, -1), 20);
  await page.keyboard.type('#');
  const marksNow = await marks(page);
  assert.ok(marksNow.includes('bad'), 'error highlight mid-typing');
  await shot(page, 'quote-midrun-error.png');
  assert.deepEqual(errors, []);
  await ctx.close();
  ok('quote card desktop + mid-typing error');
}

// ---- 7. Typist lessons: failure UI, retry, bundled fallback ----
{
  const { ctx, page } = await open('#/play/typing', { viewport: DESKTOP, remote: 'fail' });
  await q(page, 'typing-typist').click();
  await page.waitForSelector('[data-testid="typing-error"]');
  assert.equal(await root(page, 'data-load'), 'error');
  assert.match((await text(page, 'typing-error')) ?? '', /./);
  await shot(page, '07-typist-error-desktop.png');
  await q(page, 'typing-retry').click();
  await page.waitForSelector('[data-testid="typing-error"]');
  await q(page, 'typing-use-sample').click();
  await page.waitForSelector('[data-testid="typing-lessons"]');
  assert.equal(await root(page, 'data-source'), 'sample');
  assert.equal(await page.locator('[data-testid^="typing-lesson-"]').count(), 2, 'sample lessons');
  assert.ok(await page.locator('[data-testid="typing-lesson-KEYS"]').count());
  await q(page, 'typing-lesson-KEYS').click();
  assert.ok(await page.locator('[data-testid="typing-drills"] [data-kind="drill"]').count(), 'drill kind present');
  await q(page, 'typing-lesson-TIPS').click();
  assert.ok(await page.locator('[data-testid="typing-drills"] [data-kind="speed"]').count(), 'speed kind present');
  // switching back to the online source and retrying works once the network is back
  await page.unroute(REMOTE);
  await page.route(REMOTE, (route) => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'access-control-allow-origin': '*' }, body: remoteBody }));
  await q(page, 'typing-source-quotes').click();
  await page.waitForSelector('[data-testid="typing-lessons"]');
  assert.equal(await root(page, 'data-source'), 'quotes');
  await ctx.close();
  ok('Typist failure: error UI, retry, bundled sample fallback, back online');
}

// ---- 8. tablet and phone landscape layouts + reduced motion ----
{
  const { ctx, page, errors } = await open('#/play/typing', { viewport: TABLET, touch: true });
  await shot(page, '08-menu-tablet-landscape.png');
  await q(page, 'typing-set-words').tap();
  await q(page, 'typing-start').tap();
  await page.keyboard.type('type write quiet power water to', { delay: 120 });
  const box = await q(page, 'typing-text').boundingBox();
  assert.ok(box.width > 900 && box.height > 250, `text area uses the tablet screen ${JSON.stringify(box)}`);
  await shot(page, '09-typing-midrun-tablet-landscape.png');
  await q(page, 'typing-exit').tap();
  await q(page, 'typing-typist').tap();
  await page.waitForSelector('[data-testid="typing-lessons"]');
  await shot(page, '10-typist-lessons-tablet-landscape.png');
  const tabletAuthor = real ? 'Bjarne Stroustrup' : 'Ada Lovelace';
  await openAuthorDrill(page, tabletAuthor, true);
  assert.equal(await root(page, 'data-card'), 'quote');
  await assertSideBySide(page, 'tablet');
  await q(page, 'typing-text').tap();
  await shot(page, 'quote-tablet-landscape.png');
  assert.deepEqual(errors, []);
  await ctx.close();
}
{
  const { ctx, page, errors } = await open('#/play/typing', { viewport: PHONE, touch: true });
  await shot(page, '11-menu-phone-landscape.png');
  await q(page, 'typing-set-sentences').tap();
  await q(page, 'typing-start').tap();
  await page.keyboard.type('The quick brown fox jum', { delay: 120 });
  await page.keyboard.type('x');
  const box = await q(page, 'typing-text').boundingBox();
  assert.ok(box.height >= 80, `text area stays usable on a short phone screen ${JSON.stringify(box)}`);
  const stat = await q(page, 'typing-score').boundingBox();
  assert.ok(stat && stat.y >= 0 && stat.x + stat.width <= PHONE.width, 'score fits in the header');
  const docOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(docOverflow <= 0, 'no horizontal overflow');
  await shot(page, '12-typing-midrun-phone-landscape.png');
  // a soft keyboard in landscape leaves roughly half the height: the cursor line must stay visible
  await page.setViewportSize({ width: PHONE.width, height: 190 });
  await page.keyboard.type('s over the');
  const small = await q(page, 'typing-text').boundingBox();
  const cur = await page.locator('.ch.cursor').first().boundingBox();
  assert.ok(small.height >= 60 && cur && cur.y >= small.y && cur.y + cur.height <= small.y + small.height + 1, `cursor visible with the keyboard open ${JSON.stringify([small, cur])}`);
  await shot(page, '14-typing-phone-landscape-keyboard-open.png');
  await page.setViewportSize(PHONE);
  await q(page, 'typing-exit').tap();
  await q(page, 'typing-typist').tap();
  await page.waitForSelector('[data-testid="typing-lessons"]');
  await q(page, 'typing-lesson-' + (real ? 'GENERAL' : 'ALPHA')).tap();
  await shot(page, '13-typist-lessons-phone-landscape.png');
  const phoneAuthor = real ? 'Bjarne Stroustrup' : 'Ada Lovelace';
  await openAuthorDrill(page, phoneAuthor, true);
  assert.equal(await root(page, 'data-card'), 'quote');
  await assertSideBySide(page, 'phone landscape');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 0, 'quote card has no horizontal overflow on phone');
  await q(page, 'typing-text').tap();
  await shot(page, 'quote-phone-landscape.png');
  assert.deepEqual(errors, []);
  await ctx.close();
}

// ---- 9. narrow portrait: background photo + caret stays in view when the keyboard shrinks the viewport ----
const PORTRAIT_PHONE = { width: 390, height: 844 };
{
  const { ctx, page, errors } = await open('#/play/typing', { viewport: PORTRAIT_PHONE, touch: true });
  await q(page, 'typing-typist').tap();
  await page.waitForSelector('[data-testid="typing-lessons"]');
  const firstLesson = real ? 'GENERAL' : 'ALPHA';
  await q(page, 'typing-lesson-' + firstLesson).tap();
  await page.locator('[data-testid^="typing-drill-"]').first().tap();
  await page.waitForSelector('[data-testid="typing-quote-card"]');
  await page.locator('[data-testid="typing-input"]').evaluate((el) => el.focus());
  await assertBackgroundPortrait(page, '390x844');
  await assertCaretInView(page, '390x844');
  assert.deepEqual(errors, []);
  await ctx.close();
}
for (const vp of [{ width: 390, height: 420, name: '390x420' }, { width: 412, height: 480, name: '412x480' }]) {
  const { ctx, page, errors } = await open('#/play/typing', { viewport: vp, touch: true });
  await q(page, 'typing-typist').tap();
  await page.waitForSelector('[data-testid="typing-lessons"]');
  await q(page, 'typing-lesson-' + (real ? 'GENERAL' : 'ALPHA')).tap();
  await page.locator('[data-testid^="typing-drill-"]').first().tap();
  await page.waitForSelector('[data-testid="typing-quote-card"]');
  await page.locator('[data-testid="typing-input"]').evaluate((el) => el.focus());
  await assertBackgroundPortrait(page, vp.name);
  await assertCaretInView(page, vp.name);
  assert.deepEqual(errors, []);
  await ctx.close();
}
ok('narrow portrait: background photo, HUD on its own row, caret in view at 390x420 and 412x480');

if (real) {
  const { ctx, page, errors } = await open('#/play/typing', { viewport: { width: 390, height: 420 }, touch: true });
  await openAuthorDrill(page, 'Smalltalk Best Practice Patterns', true);
  await page.locator('[data-testid="typing-input"]').evaluate((el) => el.focus());
  await assertBackgroundPortrait(page, 'long quote 390x420');
  await assertCaretInView(page, 'long quote 390x420');
  const quoteH = await q(page, 'typing-quote').evaluate((el) => el.scrollHeight);
  assert.ok(quoteH > 200, `long quote should be taller than the short panel, scrollHeight=${quoteH}`);
  assert.deepEqual(errors, []);
  await ctx.close();
  ok('narrow portrait: long quote caret stays in view at 390x420');
}


// wide / landscape keeps the photo on the right (844x390 no-regression)
{
  const WIDE = { width: 844, height: 390 };
  const { ctx, page, errors } = await open('#/play/typing', { viewport: WIDE, touch: true });
  const author = real ? 'Bjarne Stroustrup' : 'Ada Lovelace';
  await openAuthorDrill(page, author, true);
  assert.equal(await root(page, 'data-card'), 'quote');
  await assertSideBySide(page, '844x390 landscape');
  await assertCaretInView(page, '844x390 landscape');
  assert.deepEqual(errors, []);
  await ctx.close();
}
ok('wide landscape 844x390 keeps the photo on the right');

{
  const { ctx, page } = await open('#/play/typing', { viewport: DESKTOP, reduced: true });
  await q(page, 'typing-start').click();
  const anim = await page.locator('.ch.cursor').first().evaluate((el) => getComputedStyle(el).animationName);
  assert.equal(anim, 'none', 'cursor blink is off with reduced motion');
  await ctx.close();
  const normal = await open('#/play/typing', { viewport: DESKTOP });
  await q(normal.page, 'typing-start').click();
  assert.notEqual(await normal.page.locator('.ch.cursor').first().evaluate((el) => getComputedStyle(el).animationName), 'none', 'blink on by default');
  await normal.ctx.close();
}
ok('tablet landscape, phone landscape, reduced motion');

await browser.close();
console.log(`typing e2e: ${step} groups passed (${real ? 'real course file' : 'inline stand-in course'})`);
