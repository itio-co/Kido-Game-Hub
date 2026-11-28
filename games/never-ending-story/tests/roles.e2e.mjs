// Roles in the browser at 390x844: God admin players list with role badges, the promote/demote confirmation,
// and who sees the in-game GOD float (player: never; god: Inspect and Wish; super god / admin session: Admin too).
// The API is mocked; nothing reaches a server. Not in `npm test` (needs a browser and a static server):
//   BASE=http://127.0.0.1:4173/ CHROME=/usr/bin/google-chrome-stable SHOTS=/workspace/nes-roles-shots node tests/roles.e2e.mjs
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4173/';
const SHOTS = process.env.SHOTS ?? '';
const FAKE_BEARER = 'e2e-fake-bearer-not-real';

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox', '--use-gl=swiftshader'] });
async function shot(page, name) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, name), type: 'png', fullPage: false });
}
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

// ---------------------------------------------------------------- God admin
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const page = await ctx.newPage();
  const players = [
    { playerId: 'e2e-player-aaaa0001', nickname: 'มะลิ', created_at: 1_700_000_000_000, last_seen: 1_700_100_000_000, registered: 1, role: 'player', runs: 4, best: 2100, events: null },
    { playerId: 'e2e-player-bbbb0002', nickname: 'ข้าวเหนียว', created_at: 1_700_000_000_000, last_seen: 1_700_100_000_000, registered: 1, role: 'god', runs: 9, best: 3400, events: null },
    { playerId: 'e2e-player-cccc0003', nickname: 'ช่างภาพ', created_at: 1_700_000_000_000, last_seen: 1_700_100_000_000, registered: 1, role: 'super_god', runs: 1, best: 900, events: null },
    { playerId: 'e2e-player-dddd0004', nickname: 'แขกไม่ลงชื่อ', created_at: 1_700_000_000_000, last_seen: 1_700_100_000_000, registered: 0, role: 'player', runs: 1, best: 100, events: null },
  ];
  const posts = [];
  await page.route('**/api/god/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^.*\/api\/god\//, '');
    if (path === 'me') return json(route, { ok: true, role: 'super_god', via: 'password' });
    if (path === 'players') return json(route, { ok: true, players, total: players.length, page: 1, pageSize: 20 });
    let m = /^players\/([^/]+)\/role$/.exec(path);
    if (m && route.request().method() === 'POST') {
      const body = JSON.parse(route.request().postData() ?? '{}');
      posts.push({ id: decodeURIComponent(m[1]), ...body });
      const p = players.find((x) => x.playerId === decodeURIComponent(m[1]));
      p.role = body.role;
      return json(route, { ok: true, playerId: p.playerId, role: p.role, changed: true });
    }
    m = /^players\/([^/]+)$/.exec(path);
    if (m) {
      const p = players.find((x) => x.playerId === decodeURIComponent(m[1]));
      return json(route, { ok: true, player: { ...p, role_updated_at: 1_700_050_000_000, role_updated_by: 'password' }, runs: [], events: [], state: null, home: null });
    }
    return json(route, { ok: false, error: 'no-such-endpoint' }, 404);
  });
  await page.goto(new URL('god.html#/players', BASE).href, { waitUntil: 'domcontentloaded' });
  const badges = page.locator('[data-testid="role-badge"]');
  await badges.first().waitFor({ timeout: 20000 });
  assert.deepEqual(await badges.evaluateAll((els) => els.map((e) => e.getAttribute('data-role'))), ['player', 'god', 'super_god', 'player'], 'role badge per row');
  assert.deepEqual(await badges.evaluateAll((els) => els.map((e) => e.textContent.trim())), ['ผู้เล่น', 'GOD', 'SUPER GOD', 'ผู้เล่น'], 'Thai labels');
  const acts = await page.locator('[data-testid="role-action"]').allInnerTexts();
  assert.deepEqual(acts, ['เลื่อนเป็น GOD', 'ลดเป็นผู้เล่น', 'ลดเป็น GOD'], 'one action per registered row, none for the unclaimed player');
  await shot(page, 'admin-players-roles.png');

  // Cancel changes nothing.
  await page.locator('[data-testid="role-action"]').first().click();
  const sheet = page.locator('[data-testid="role-confirm"]');
  await sheet.waitFor({ timeout: 5000 });
  const body = await page.locator('[data-testid="role-confirm-body"]').innerText();
  assert.ok(body.includes('มะลิ') && body.includes('ผู้เล่น') && body.includes('GOD'), body);
  await shot(page, 'admin-promote-confirm.png');
  await page.locator('[data-testid="role-confirm-no"]').click();
  assert.equal(await sheet.count(), 0, 'cancel closes the sheet');
  assert.equal(posts.length, 0, 'cancel sends nothing');

  // Confirm promotes.
  await page.locator('[data-testid="role-action"]').first().click();
  await page.locator('[data-testid="role-confirm-yes"]').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="role-badge"]')[0]?.getAttribute('data-role') === 'god', null, { timeout: 5000 });
  assert.deepEqual(posts, [{ id: 'e2e-player-aaaa0001', role: 'god', confirmSuperGod: false }], 'promote request');

  // Demoting a super god sends the explicit confirmation flag, from the detail page.
  await page.goto(new URL('god.html#/players/e2e-player-cccc0003', BASE).href, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="role-panel"]').waitFor({ timeout: 10000 });
  assert.deepEqual(await page.locator('[data-testid="role-panel"] button').allInnerTexts(), ['ลดเป็น GOD']);
  await page.locator('[data-testid="role-action-god"]').click();
  assert.ok((await page.locator('[data-testid="role-confirm"]').innerText()).includes('สิทธิ์แอดมินทั้งหมด'), 'warns that admin access is lost');
  await shot(page, 'admin-demote-super-confirm.png');
  await page.locator('[data-testid="role-confirm-yes"]').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="role-badge"]')?.getAttribute('data-role') === 'god', null, { timeout: 5000 });
  assert.deepEqual(posts.at(-1), { id: 'e2e-player-cccc0003', role: 'god', confirmSuperGod: true }, 'demote super god request');

  // A god can be made super god (admin password session) or demoted.
  await page.goto(new URL('god.html#/players/e2e-player-bbbb0002', BASE).href, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="role-panel"]').waitFor({ timeout: 10000 });
  assert.deepEqual(await page.locator('[data-testid="role-panel"] button').allInnerTexts(), ['ลดเป็นผู้เล่น', 'ตั้งเป็น SUPER GOD']);
  // The unclaimed player cannot be promoted.
  await page.goto(new URL('god.html#/players/e2e-player-dddd0004', BASE).href, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="role-panel"]').waitFor({ timeout: 10000 });
  assert.equal(await page.locator('[data-testid="role-action-god"]').isDisabled(), true, 'unregistered player cannot be promoted');
  await ctx.close();
}

// ---------------------------------------------------------------- In-game GOD float
function seed() {
  return JSON.stringify({
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
}

/** `mine`: this device's role from GET /players/me (null = no token). `session`: an accepted God admin cookie. */
async function openGame({ mine = null, session = false }) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const page = await ctx.newPage();
  const seen = { godMe: 0, playersMe: 0, snapshotAuth: [] };
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const req = route.request();
    if (url.pathname.endsWith('/api/god/me')) {
      seen.godMe++;
      return session ? json(route, { ok: true, role: 'super_god', via: 'password' }) : json(route, { ok: false, error: 'unauthorized' }, 401);
    }
    if (url.pathname.endsWith('/api/players/me')) {
      seen.playersMe++;
      assert.equal(req.headers().authorization, `Bearer ${FAKE_BEARER}`, 'role asked with this device token');
      return json(route, { ok: true, playerId: 'e2e-player-aaaa0001', role: mine });
    }
    if (url.pathname.endsWith('/api/god/snapshots') && req.method() === 'POST') {
      seen.snapshotAuth.push(req.headers().authorization ?? null);
      return json(route, { ok: true, id: 'x', expiresAt: 1, url: 'https://example.invalid/never/god/snapshot/x?t=1.y' });
    }
    return route.abort();
  });
  await page.addInitScript(([s, token]) => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.setItem('nesg.player.v1', s);
    localStorage.setItem('nesg.god.float.v1', JSON.stringify({ on: true, x: 0.78, y: 0.62 }));
    if (token) localStorage.setItem('nesg.playerToken.v1', token);
    sessionStorage.setItem('seeded', '1');
  }, [seed(), mine ? FAKE_BEARER : null]);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.locator('button.back').first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  return { ctx, page, seen };
}

const FAB = '[data-testid="god-float"]';

// A plain player never sees it, even with the float preference switched on in their own storage.
{
  const { ctx, page, seen } = await openGame({ mine: 'player' });
  assert.ok(seen.playersMe >= 1, 'the server was asked for the role');
  assert.equal(await page.locator(FAB).count(), 0, 'no GOD float for role player');
  await shot(page, 'fab-player-hidden.png');
  await ctx.close();
}
// No token and no session: nothing to ask, nothing shown.
{
  const { ctx, page, seen } = await openGame({ mine: null });
  assert.equal(seen.playersMe, 0, 'no token, no role request');
  assert.equal(await page.locator(FAB).count(), 0);
  await ctx.close();
}
// A god player sees the float without any password; Inspect yes, Admin page no; the share call carries their token.
{
  const { ctx, page, seen } = await openGame({ mine: 'god' });
  await page.locator(FAB).waitFor({ timeout: 10000 });
  await page.locator(FAB).click();
  await page.locator('[data-testid="god-float-menu"]').waitFor();
  assert.equal(await page.locator('[data-testid="god-float-inspect"]').count(), 1, 'Inspect is offered');
  assert.equal(await page.locator('[data-testid="god-float-wish"]').count(), 1, 'Wish is offered to a god player');
  assert.equal(await page.locator('[data-testid="god-float-admin"]').count(), 0, 'the admin page needs the password, so a god player is not offered it');
  await shot(page, 'fab-god-player.png');
  await page.locator('[data-testid="god-float-inspect"]').click();
  await page.locator('[data-testid="god-inspect-share"]').click();
  await page.locator('[data-testid="god-share-url"]').waitFor({ timeout: 5000 });
  assert.deepEqual(seen.snapshotAuth, [`Bearer ${FAKE_BEARER}`], 'share link is made with this player token');
  await ctx.close();
}
// A super god player: Inspect, Wish and Admin.
{
  const { ctx, page } = await openGame({ mine: 'super_god' });
  await page.locator(FAB).waitFor({ timeout: 10000 });
  await page.locator(FAB).click();
  assert.equal(await page.locator('[data-testid="god-float-admin"]').count(), 1);
  assert.equal(await page.locator('[data-testid="god-float-inspect"]').count(), 1);
  assert.equal(await page.locator('[data-testid="god-float-wish"]').count(), 1, 'Wish is offered to a super god');
  await ctx.close();
}
// The existing password unlock keeps working: an accepted admin session acts as super god even for a plain player.
{
  const { ctx, page } = await openGame({ mine: 'player', session: true });
  await page.locator(FAB).waitFor({ timeout: 10000 });
  await page.locator(FAB).click();
  assert.equal(await page.locator('[data-testid="god-float-admin"]').count(), 1, 'admin session is super god');
  assert.equal(await page.locator('[data-testid="god-float-wish"]').count(), 1, 'Wish is offered on an admin session');
  await shot(page, 'fab-admin-session.png');
  await ctx.close();
}

await browser.close();
console.log('roles e2e: admin list + confirm, god float by role passed');
