// Headless check for the case-01 photo placement scene (needs a browser, so not in `npm test`).
//   static server on dist/, then:
//   BASE=http://127.0.0.1:4173/never/ CHROME=/usr/bin/google-chrome SHOTS=/tmp node tests/photoPlacement.e2e.mjs
// 390×844: the keepsake shelf is empty before the case is cleared; after a clear the one-page
// placement comic plays (caption, art, no photo on the shelf yet); tapping it places the photo,
// persists it, and shows the overlay on the shelf. A later visit or a replay seed does not replay
// the scene. A full unset save is empty again.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4173/';
const SHOTS = process.env.SHOTS ?? '';
const VIEWPORT = { width: 390, height: 844 };
const SHELF = '6bb33448-6b61-4564-91e1-125bae9cf57c';
const PHOTO = '📷 รูปปู่';
const CAPTION = 'กลับถึงห้องแล้ว หนูวางรูปคุณปู่บนชั้นของที่ระลึก';

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });

function seed({ cleared, placed, stored = false }) {
  return JSON.stringify({
    version: 1,
    player: {
      onboardingComplete: true,
      prologueSeen: true,
      textSize: 'md',
      soundEnabled: false,
      calendarTheme: null,
      decor: placed ? { [SHELF]: PHOTO } : {},
      room: { calendar: 'original', grandpaPhoto: stored ? 'stored' : 'shelf' },
    },
    knowledge: { evidence: [], solvedCaseIds: cleared ? ['case-01'] : [], exploreHints: 0 },
    caseState: { facts: {} },
    flow: {
      evidence: [],
      solved: cleared,
      deduced: cleared,
      reward: cleared,
      poster: cleared,
      caseDone: cleared,
      cleared,
      difficulty: 'ปานกลาง',
      played: [],
      seen: [],
      levels: { cross: [], jig: [], slide: [] },
      bag: [],
    },
  });
}

async function open(save) {
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, hasTouch: false });
  const page = await ctx.newPage();
  await page.route('**/api/**', (route) => route.abort());
  await page.addInitScript(([s]) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('nesg.player.v1', s);
      sessionStorage.setItem('seeded', '1');
    }
  }, [save]);
  await page.goto(BASE);
  await page.waitForSelector('.room .backdrop');
  await page.waitForTimeout(800);
  return { ctx, page };
}

const layer = (page) => page.locator('.room img[data-layer="grandpa-photo"]');
const scene = (page) => page.locator('[data-testid="photo-placement"]');
const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('nesg.player.v1')));

// 1. Before the case is cleared: empty shelf, no placement scene.
{
  const { ctx, page } = await open(seed({ cleared: false, placed: false }));
  assert.equal(await scene(page).count(), 0, 'unsolved: no placement scene');
  assert.equal(await layer(page).count(), 0, 'unsolved: shelf overlay hidden');
  const save = await saved(page);
  assert.equal(save.player.decor[SHELF] ?? null, null, 'unsolved: decor empty');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/photo-placement-room-before.png` });
  await ctx.close();
}

// 2-3. After a clear, before the story has placed the photo: scene plays, then the photo appears.
{
  const { ctx, page } = await open(seed({ cleared: true, placed: false }));
  await page.waitForSelector('[data-testid="photo-placement"]');
  assert.equal(await layer(page).count(), 0, 'scene: overlay still hidden');
  const caption = await page.locator('[data-testid="comic-caption"]').innerText();
  assert.equal(caption, CAPTION, 'scene: Thai caption');
  assert.equal(await page.locator('[data-testid="comic-dots"] i').count(), 1, 'scene: one page');
  const img = await page.locator('[data-testid="comic-art"] img').getAttribute('src');
  assert.match(img ?? '', /photo-placement\.jpg/, 'scene: placement art');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/photo-placement-scene.png` });
  await page.locator('[data-testid="comic-tap"]').click({ position: { x: 200, y: 400 } });
  await page.waitForSelector('[data-testid="photo-placement"]', { state: 'detached' });
  await page.waitForTimeout(400);
  assert.equal(await layer(page).count(), 1, 'after: shelf overlay shown');
  const save = await saved(page);
  assert.equal(save.player.decor[SHELF], PHOTO, 'after: decor persisted');
  assert.equal(save.player.room.grandpaPhoto, 'shelf', 'after: state is shelf');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/photo-placement-room-after.png` });
  await ctx.close();
}

// 4. Already placed after a clear (including a replay that keeps the photo): no scene, overlay stays.
{
  const { ctx, page } = await open(seed({ cleared: true, placed: true }));
  assert.equal(await scene(page).count(), 0, 'placed: no placement scene');
  assert.equal(await layer(page).count(), 1, 'placed: overlay visible');
  await ctx.close();
}

// 5. Stored after a clear: still placed, so no scene, and the shelf stays empty.
{
  const { ctx, page } = await open(seed({ cleared: true, placed: true, stored: true }));
  assert.equal(await scene(page).count(), 0, 'stored: no placement scene');
  assert.equal(await layer(page).count(), 0, 'stored: overlay hidden');
  const save = await saved(page);
  assert.equal(save.player.decor[SHELF], PHOTO, 'stored: story record kept');
  await ctx.close();
}

await browser.close();
console.log('photoPlacement e2e: passed');
