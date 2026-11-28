// God Mode Wish: FAB menu item, screenshot + state capture, the sheet, send, and the failure paths.
// The API is mocked; nothing reaches a server. Not in `npm test` (needs a browser and a static server):
//   BASE=http://127.0.0.1:4173/ CHROME=/usr/bin/google-chrome-stable SHOTS=/workspace/nes-wish-shots node tests/godWish.e2e.mjs
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4173/';
const SHOTS = process.env.SHOTS ?? '';
const FAKE_BEARER = 'e2e-fake-bearer-not-real';

const seed = JSON.stringify({
  version: 1,
  player: { onboardingComplete: true, prologueSeen: true, textSize: 'md', soundEnabled: false, calendarTheme: null, decor: {}, room: { calendar: 'original', grandpaPhoto: 'shelf' } },
  knowledge: { evidence: [], solvedCaseIds: [], exploreHints: 0 },
  caseState: { facts: {} },
  flow: {
    evidence: [], solved: false, deduced: false, reward: false, poster: false, caseDone: false, cleared: false, mapUnlocked: false,
    difficulty: 'ง่าย', played: [], seen: [], levels: { cross: [], jig: [], slide: [] }, bag: [],
    nav: { slot: 'now', page: 0, talkSlug: null, schema: 2, practice: false, screen: 'player-room', history: [], context: 'hub' },
  },
});

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox', '--use-gl=swiftshader'] });

async function shot(page, name) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, name), type: 'png', fullPage: false });
}

async function open({ reply, breakCapture = false, mine = null, session = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const page = await ctx.newPage();
  const seen = { wishes: [], wishAuth: [] };
  if (process.env.DEBUG_CONSOLE) page.on('console', (m) => console.log('console', m.type(), m.text().slice(0, 400)));
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname.endsWith('/api/god/me')) return session ? json(200, { ok: true, role: 'super_god', via: 'password' }) : json(401, { ok: false, error: 'unauthorized' });
    if (url.pathname.endsWith('/api/players/me')) return json(200, { ok: true, playerId: 'e2e-wish-god-0001', role: mine ?? 'player' });
    if (url.pathname.endsWith('/api/wishes') && route.request().method() === 'POST') {
      seen.wishAuth.push(route.request().headers().authorization ?? null);
      seen.wishes.push(route.request().postDataJSON());
      return reply ? reply(json) : json(200, {
        ok: true,
        wish: {
          id: 'AbCdEfGhIjKlMnOpQr', createdAt: '2026-11-28T01:23:00.000Z', dayBangkok: '2026-11-28', text: 'x',
          inspectUrl: 'https://games.itio.space/never/god/snapshot/' + 'a'.repeat(43) + '?t=1.sig', screenshotUrl: 'https://games.itio.space/never/api/god/wishes/AbCdEfGhIjKlMnOpQr/screenshot',
        },
      });
    }
    return route.abort();
  });
  await page.addInitScript(([s, token, broken]) => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.setItem('nesg.player.v1', s);
    localStorage.setItem('nesg.playerToken.v1', token);
    localStorage.setItem('nesg.god.float.v1', JSON.stringify({ on: true, x: 0.78, y: 0.62 }));
    sessionStorage.setItem('seeded', '1');
    if (broken) HTMLCanvasElement.prototype.toDataURL = () => { throw new Error('tainted'); };
  }, [seed, FAKE_BEARER, breakCapture]);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="god-float"]').waitFor({ timeout: 20000 });
  await page.waitForTimeout(600);
  return { ctx, page, seen };
}

async function openSheet(page) {
  await page.locator('[data-testid="god-float"]').click();
  await page.locator('[data-testid="god-float-menu"]').waitFor();
  await page.locator('[data-testid="god-float-wish"]').click();
  await page.locator('[data-testid="wish-sheet"]').waitFor({ timeout: 20000 });
}

// 1. Menu item, capture, thumbnail, send, confirmation.
{
  const { ctx, page, seen } = await open();
  await page.locator('[data-testid="god-float"]').click();
  const menu = page.locator('[data-testid="god-float-menu"]');
  await menu.waitFor();
  assert.equal(await menu.locator('button').count(), 3, 'Admin, Inspect, Wish');
  assert.ok((await page.locator('[data-testid="god-float-wish"]').innerText()).trim().length > 0);
  await shot(page, 'wish-1-menu.png');
  await page.locator('[data-testid="god-float-wish"]').click();
  await page.locator('[data-testid="wish-sheet"]').waitFor({ timeout: 20000 });
  assert.equal(await page.locator('[data-testid="god-float"]').count(), 1);
  const thumb = page.locator('[data-testid="wish-thumb"]');
  await thumb.waitFor({ timeout: 5000 });
  const src = await thumb.getAttribute('src');
  assert.match(src, /^data:image\/jpeg;base64,/);
  const bytes = Math.floor((src.length * 3) / 4);
  assert.ok(bytes > 3000 && bytes <= 150_000, `screenshot size ${bytes}`);
  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true });
    writeFileSync(join(SHOTS, 'wish-captured.jpg'), Buffer.from(src.split(',')[1], 'base64'));
  }
  assert.equal(await page.locator('[data-testid="wish-send"]').isDisabled(), true, 'empty text cannot be sent');
  await page.locator('[data-testid="wish-text"]').fill('อยากได้ปุ่มกลับบ้านที่ใหญ่ขึ้นตรงนี้');
  assert.equal(await page.locator('[data-testid="wish-send"]').isDisabled(), false);
  await shot(page, 'wish-2-sheet.png');
  await page.locator('[data-testid="wish-send"]').click();
  await page.locator('[data-testid="wish-sent"]').waitFor({ timeout: 5000 });
  assert.equal(seen.wishes.length, 1);
  const body = seen.wishes[0];
  assert.equal(body.text, 'อยากได้ปุ่มกลับบ้านที่ใหญ่ขึ้นตรงนี้');
  assert.match(body.screenshot, /^data:image\/jpeg;base64,/);
  assert.equal(body.screenshot, src, 'the previewed image is the one sent');
  assert.equal(body.state.page.screen, 'player-room');
  assert.ok(body.state.versions?.app, 'state carries the app version');
  assert.equal(body.appVersion, body.state.versions.app);
  assert.ok(!JSON.stringify(body).includes(FAKE_BEARER), 'player token never leaves the device in a wish');
  assert.equal(await page.locator('[data-testid="wish-sent-id"]').innerText(), 'AbCdEfGh');
  assert.match(await page.locator('[data-testid="wish-sent-link"]').getAttribute('href'), /\/god\/snapshot\//);
  assert.ok((await page.locator('[data-testid="wish-sent"]').innerText()).includes('28'), 'Bangkok date stamp shown');
  await shot(page, 'wish-3-sent.png');
  await page.locator('[data-testid="wish-done"]').click();
  assert.equal(await page.locator('[data-testid="wish-sheet"]').count(), 0);
  assert.deepEqual(seen.wishAuth, [`Bearer ${FAKE_BEARER}`], 'the wish is posted with this device token as well as the session cookie');
  await ctx.close();
}

// 1b. A god player (no admin session) sees Inspect + Wish, not Admin.
{
  const { ctx, page } = await open({ session: false, mine: 'god' });
  await page.locator('[data-testid="god-float"]').click();
  await page.locator('[data-testid="god-float-menu"]').waitFor();
  assert.equal(await page.locator('[data-testid="god-float-wish"]').count(), 1, 'Wish is offered to a god player');
  assert.equal(await page.locator('[data-testid="god-float-inspect"]').count(), 1);
  assert.equal(await page.locator('[data-testid="god-float-admin"]').count(), 0, 'a god player has no Admin item');
  await shot(page, 'wish-1b-god-player-menu.png');
  await ctx.close();
}

// 2. Cancel closes without sending.
{
  const { ctx, page, seen } = await open();
  await openSheet(page);
  await page.locator('[data-testid="wish-text"]').fill('draft');
  await page.locator('[data-testid="wish-cancel"]').click();
  assert.equal(await page.locator('[data-testid="wish-sheet"]').count(), 0);
  assert.equal(seen.wishes.length, 0);
  await ctx.close();
}

// 3. Server refusal keeps the text so the user can retry.
{
  const { ctx, page, seen } = await open({ reply: (json) => json(429, { ok: false, error: 'rate-limited' }) });
  await openSheet(page);
  await page.locator('[data-testid="wish-text"]').fill('คำขอที่ต้องไม่หาย');
  await page.locator('[data-testid="wish-send"]').click();
  await page.locator('[data-testid="wish-error"]').waitFor({ timeout: 5000 });
  assert.equal(await page.locator('[data-testid="wish-text"]').inputValue(), 'คำขอที่ต้องไม่หาย');
  assert.equal(await page.locator('[data-testid="wish-send"]').isDisabled(), false, 'can retry');
  assert.equal(seen.wishes.length, 1);
  await shot(page, 'wish-4-error.png');
  await ctx.close();
}

// 4. A browser that cannot take the screenshot still opens the sheet and sends the data.
{
  const { ctx, page, seen } = await open({ breakCapture: true });
  await openSheet(page);
  await page.locator('[data-testid="wish-noshot"]').waitFor({ timeout: 5000 });
  await page.locator('[data-testid="wish-text"]').fill('no image');
  await page.locator('[data-testid="wish-send"]').click();
  await page.locator('[data-testid="wish-sent"]').waitFor({ timeout: 5000 });
  assert.equal(seen.wishes[0].screenshot, null);
  assert.ok(seen.wishes[0].state?.page, 'state still sent');
  await ctx.close();
}

await browser.close();
console.log('god wish e2e passed');
