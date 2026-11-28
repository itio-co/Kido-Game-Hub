// Change the player display name in Settings, including a common-name random pick.
// Local preview only — /api/ is mocked and never hits production.
//   BASE=http://127.0.0.1:4256/never/ CHROME=/usr/bin/google-chrome-stable \
//     SHOTS=/workspace/nes-rename-shots node tests/rename.e2e.mjs
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4256/never/';
const SHOTS = process.env.SHOTS ?? '/workspace/nes-rename-shots';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome-stable';
mkdirSync(SHOTS, { recursive: true });

const nickSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/lib/nickname.ts'), 'utf8');
const thaiNames = [...nickSource.matchAll(/'([^']+)'/g)]
  .map((m) => m[1])
  .filter((n) => /[\u0E00-\u0E7F]/.test(n));

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
const START_NICK = 'นักสืบ100';
const playerId = JSON.stringify({ playerId: 'e2e-rename', nickname: START_NICK });

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=swiftshader'] });

async function openSettings(page) {
  await page.locator('[data-testid="hud-settings"]').click();
  await page.waitForSelector('[data-testid="settings-name"]');
  await page.locator('.scrim').evaluate((el) => el.getAnimations().forEach((a) => a.finish()));
}

async function storedNick(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('nesg.playerId.v1');
    return raw ? JSON.parse(raw).nickname : null;
  });
}

async function runAt(viewport, prefix) {
  const patches = [];
  const registers = [];
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: viewport.width < 700 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { throw e; });
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.pathname.endsWith('/api/players/register') && method === 'POST') {
      registers.push(true);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, token: 'e2e-local-token' }),
      });
    }
    if (method === 'PATCH' && /\/api\/players\/e2e-rename$/.test(url.pathname)) {
      const body = route.request().postDataJSON();
      patches.push(body?.nickname ?? null);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, nickname: body?.nickname }),
      });
    }
    return route.abort();
  });
  await page.addInitScript(([save, id]) => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.setItem('nesg.player.v1', save);
    localStorage.setItem('nesg.playerId.v1', id);
    localStorage.setItem('nesg.playerToken.v1', 'e2e-local-token');
    sessionStorage.setItem('seeded', '1');
  }, [playerSave, playerId]);

  const url = new URL(BASE);
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="hud-settings"]', { timeout: 20000 });
  await openSettings(page);
  assert.equal(await page.locator('[data-testid="settings-name-value"]').innerText(), START_NICK);
  await page.screenshot({ path: join(SHOTS, `${prefix}-settings.png`), type: 'png' });

  await page.locator('[data-testid="settings-name-edit"]').click();
  const input = page.locator('[data-testid="settings-name-input"]');
  await input.fill('');
  await input.blur();
  // trigger validation by attempting save? input empty should disable save
  const save = page.locator('[data-testid="settings-name-save"]');
  assert.equal(await save.isDisabled(), true, 'empty name cannot be saved');

  const waitPatch = (expected) => page.waitForResponse((res) => {
    const u = new URL(res.url());
    return res.request().method() === 'PATCH' && /\/api\/players\/e2e-rename$/.test(u.pathname) && res.ok();
  }, { timeout: 8000 }).then(async (res) => {
    assert.equal((await res.request().postDataJSON())?.nickname, expected);
    return res;
  });

  const typed = 'ต้นไม้';
  await input.fill(typed);
  const typedPatch = waitPatch(typed);
  await save.click();
  await typedPatch;
  await page.waitForSelector('[data-testid="settings-name-value"]');
  assert.equal(await page.locator('[data-testid="settings-name-value"]').innerText(), typed);
  assert.equal(await storedNick(page), typed);
  assert.ok(patches.includes(typed), `PATCH should send the typed name, got ${JSON.stringify(patches)}`);

  await page.locator('[data-testid="settings-name-edit"]').click();
  await page.locator('[data-testid="settings-name-random"]').click();
  const rolled = (await input.inputValue()).trim();
  assert.ok(thaiNames.includes(rolled), `random pick should be a common Thai nickname, got ${rolled}`);
  assert.notEqual(rolled, typed, 'random should change the current name');
  const rolledPatch = waitPatch(rolled);
  await save.click();
  await rolledPatch;
  await page.waitForSelector('[data-testid="settings-name-value"]');
  assert.equal(await page.locator('[data-testid="settings-name-value"]').innerText(), rolled);
  assert.equal(await storedNick(page), rolled);
  await page.screenshot({ path: join(SHOTS, `${prefix}-renamed.png`), type: 'png' });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="hud-settings"]', { timeout: 20000 });
  await openSettings(page);
  assert.equal(await page.locator('[data-testid="settings-name-value"]').innerText(), rolled, 'name must persist after reload');
  assert.equal(await storedNick(page), rolled);
  await page.screenshot({ path: join(SHOTS, `${prefix}-reloaded.png`), type: 'png' });
  await ctx.close();
  return rolled;
}

const phone = await runAt({ width: 390, height: 844 }, '390x844');
const tablet = await runAt({ width: 1180, height: 820 }, '1180x820');
await browser.close();
console.log(`rename e2e passed (phone=${phone}, tablet=${tablet})`);
