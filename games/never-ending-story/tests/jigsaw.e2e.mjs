// Event jigsaw: per-difficulty piece count and rotation, drag-to-snap, map unlock.
// Not in `npm test` (needs a browser and a static server):
//   BASE=http://127.0.0.1:4173/ CHROME=/usr/bin/google-chrome-stable SHOTS=/workspace/nes-jigsaw-shots node tests/jigsaw.e2e.mjs
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4173/';
const SHOTS = process.env.SHOTS ?? '';

const DIFFS = [
  { label: 'ง่าย', id: 'easy', cols: 3, rows: 3, rotation: 'none', count: 9, rotationText: 'ไม่ต้องหมุน' },
  { label: 'ปานกลาง', id: 'medium', cols: 3, rows: 4, rotation: 'quarter', count: 12, rotationText: 'แตะเพื่อหมุน 90°' },
  { label: 'ยาก', id: 'hard', cols: 4, rows: 4, rotation: 'free', count: 16, rotationText: 'หมุนได้อิสระ' },
];

function seed(difficulty, screen = 'jigsaw') {
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
    knowledge: {
      evidence: [],
      solvedCaseIds: [],
      exploreHints: 0,
    },
    caseState: { facts: {} },
    flow: {
      evidence: [],
      solved: false,
      deduced: false,
      reward: false,
      poster: false,
      caseDone: false,
      cleared: false,
      mapUnlocked: false,
      difficulty,
      played: [],
      seen: [],
      levels: { cross: [], jig: [], slide: [] },
      bag: [],
      nav: {
        screen,
        history: ['player-room', 'event-select', 'living-room', 'tray'],
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

const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
  args: ['--no-sandbox', '--use-gl=swiftshader'],
});

async function openJigsaw(difficulty, opts = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await page.route('**/api/**', (route) => route.abort());
  await page.addInitScript(([s, best]) => {
    localStorage.setItem('nesg.player.v1', s);
    sessionStorage.setItem('seeded', '1');
    if (best) localStorage.setItem('nesg.minigame-best.v1', best);
  }, [seed(difficulty), opts.best ?? null]);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="jigsaw-board"]', { timeout: 20000 });
  await page.waitForTimeout(400);
  return { ctx, page };
}

async function completeEasy(page) {
  const count = 9;
  for (let pass = 0; pass < 4; pass += 1) {
    for (let id = 0; id < count; id += 1) {
      if ((await page.locator(`[data-testid="jigsaw-piece-${id}"]`).getAttribute('data-locked')) === 'true') continue;
      await snapOne(page, id, 'none');
    }
    if (await lockedCount(page) === count) break;
  }
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="jigsaw-board"]');
    return el?.getAttribute('data-complete') === 'true';
  }, null, { timeout: 15000 });
}

async function expectWinDialog(page, { record }) {
  const dialog = page.locator('[data-testid="minigame-win-dialog"]');
  await dialog.waitFor({ state: 'visible', timeout: 8000 });
  assert.ok((await page.locator('[data-testid="minigame-win-title"]').innerText()).includes('เยี่ยมมาก'), 'win title');
  assert.ok((await page.locator('[data-testid="minigame-win-subtitle"]').innerText()).includes('เล่นชนะแล้ว'), 'win subtitle');
  assert.equal(await page.locator('[data-testid="minigame-win-stars"]').getAttribute('data-stars'), '3', 'three stars');
  assert.ok((await page.locator('[data-testid="minigame-win-difficulty"]').innerText()).includes('ง่าย'), 'difficulty');
  const timeText = (await page.locator('[data-testid="minigame-win-time"]').innerText()).trim();
  assert.match(timeText, /^\d{2}:\d{2}$/, `time format ${timeText}`);
  const continueBtn = page.locator('[data-testid="minigame-win-continue"]');
  await continueBtn.waitFor({ state: 'visible' });
  await page.waitForTimeout(500);
  const recordBadge = page.locator('[data-testid="minigame-win-record"]');
  if (record) {
    await recordBadge.waitFor({ state: 'visible' });
    assert.ok((await recordBadge.innerText()).includes('สถิติใหม่'), 'new record badge');
  } else {
    assert.equal(await recordBadge.count(), 0, 'no record badge when standing best is faster');
  }
  return continueBtn;
}

async function shot(page, name) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, name), type: 'png', fullPage: false });
}

function normAngle(raw) {
  let a = Number(raw) % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  return a;
}

async function makeUpright(page, id, rotation) {
  const piece = page.locator(`[data-testid="jigsaw-piece-${id}"]`);
  if (rotation === 'none') return;
  if (rotation === 'quarter') {
    for (let i = 0; i < 5; i += 1) {
      const a = ((normAngle(await piece.getAttribute('data-angle')) % 360) + 360) % 360;
      if (a === 0) return;
      await piece.click({ force: true });
      await page.waitForTimeout(80);
    }
    return;
  }
  const box = await piece.boundingBox();
  if (!box) return;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(cx, cy - Math.max(40, box.height * 0.7), { steps: 10 });
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(80);
}

async function dragToSlot(page, id) {
  const piece = page.locator(`[data-testid="jigsaw-piece-${id}"]`);
  const slot = page.locator(`[data-testid="jigsaw-slot-${id}"]`);
  await piece.dragTo(slot, { force: true, targetPosition: { x: 8, y: 8 } });
  await page.waitForTimeout(120);
}

async function snapOne(page, id, rotation) {
  const piece = page.locator(`[data-testid="jigsaw-piece-${id}"]`);
  if ((await piece.getAttribute('data-locked')) === 'true') return;
  await makeUpright(page, id, rotation);
  await dragToSlot(page, id);
  // A second nudge if the first drag landed short.
  if ((await piece.getAttribute('data-locked')) !== 'true') {
    await makeUpright(page, id, rotation);
    const slot = await page.locator(`[data-testid="jigsaw-slot-${id}"]`).boundingBox();
    const box = await piece.boundingBox();
    if (slot && box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(slot.x + slot.width / 2, slot.y + slot.height / 2, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(150);
    }
  }
}

async function lockedCount(page) {
  return page.locator('[data-testid^="jigsaw-piece-"][data-locked="true"]').count();
}

const midCounts = { easy: 3, medium: 4, hard: 4 };

for (const diff of DIFFS) {
  const { ctx, page } = await openJigsaw(diff.label);
  const board = page.locator('[data-testid="jigsaw-board"]');
  assert.equal(await board.getAttribute('data-cols'), String(diff.cols), `${diff.id} cols`);
  assert.equal(await board.getAttribute('data-rows'), String(diff.rows), `${diff.id} rows`);
  assert.equal(await board.getAttribute('data-rotation'), diff.rotation, `${diff.id} rotation`);
  assert.equal(await board.getAttribute('data-diff'), diff.id, `${diff.id} profile`);
  assert.equal(await page.locator('[data-testid^="jigsaw-piece-"]').count(), diff.count, `${diff.id} piece count`);
  const subtitle = (await page.locator('.flow-sub').innerText()).replace(/\s+/g, ' ').trim();
  assert.ok(subtitle.includes(`${diff.count} ชิ้น`), `${diff.id} subtitle piece count: ${subtitle}`);
  assert.ok(subtitle.includes(diff.rotationText), `${diff.id} subtitle rotation: ${subtitle}`);
  assert.ok(!subtitle.includes('ชิ้นไม่ต้องหมุน') || diff.rotation === 'none', `${diff.id} stale hud: ${subtitle}`);
  if (diff.rotation !== 'none') {
    assert.ok(!subtitle.includes('ไม่ต้องหมุน'), `${diff.id} must not say no-rotation: ${subtitle}`);
  }
  await shot(page, `${diff.id}-subtitle.png`);
  assert.equal(await page.locator('[data-testid^="jigsaw-rotate-"]').count(), 0, `${diff.id} has no rotate icon`);
  const hud = await page.locator('.mgbar').innerText();
  assert.ok(!hud.includes('⭐') && !hud.includes('★') && !hud.includes('☆'), `${diff.id} hides stars at start: ${hud}`);
  assert.match(hud, /00:00/, `${diff.id} timer starts at 00:00: ${hud}`);

  await shot(page, `${diff.id}-scattered.png`);

  const mid = midCounts[diff.id];
  for (let id = 0; id < mid; id += 1) {
    await snapOne(page, id, diff.rotation);
  }
  const locked = await lockedCount(page);
  assert.ok(locked >= 1, `${diff.id} should snap at least one piece, got ${locked}`);
  await shot(page, `${diff.id}-mid.png`);

  if (diff.id === 'easy') {
    await completeEasy(page);
    await shot(page, 'completed.png');
    // Seeded with no prior best: the first finish is a new record.
    const continueBtn = await expectWinDialog(page, { record: true });
    await shot(page, 'easy-win-dialog.png');
    await continueBtn.click();
    await page.waitForFunction(() => {
      const save = JSON.parse(localStorage.getItem('nesg.player.v1') || '{}');
      return save.flow?.nav?.screen === 'tray' || save.flow?.mapUnlocked === true || (save.flow?.evidence || []).includes('E04');
    }, null, { timeout: 15000 });
    await page.waitForTimeout(400);
    const map = page.locator('[data-testid="house-map-btn"]');
    await map.waitFor({ state: 'visible', timeout: 8000 });
    assert.equal(await map.getAttribute('data-locked'), 'false', 'completing the jigsaw unlocks the house map');
    await page.locator('[data-testid="minigame-win-dialog"]').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    assert.equal(await page.locator('[data-testid="minigame-win-dialog"]').count(), 0, 'continue dismisses the win dialog');
    await shot(page, 'after-continue.png');
    await shot(page, 'completed-tray.png');
  }

  await ctx.close();
  console.log(`ok ${diff.id}`);
}

// New record: a slower standing best is beaten by a fresh easy run.
{
  const { ctx, page } = await openJigsaw('ง่าย', {
    best: JSON.stringify({ 'jig:ง่าย': { timeMs: 90_000, stars: 2 } }),
  });
  await completeEasy(page);
  await expectWinDialog(page, { record: true });
  const bestText = (await page.locator('[data-testid="minigame-win-best"]').innerText()).trim();
  const timeText = (await page.locator('[data-testid="minigame-win-time"]').innerText()).trim();
  assert.notEqual(bestText, '01:30', 'best should update to this run, not the old 90s');
  assert.equal(bestText, timeText, 'new best equals this run');
  await shot(page, 'new-record.png');
  await ctx.close();
  console.log('ok new-record');
}

// Standing best stays when this run is slower (seed an unreachable 1ms best).
{
  const { ctx, page } = await openJigsaw('ง่าย', {
    best: JSON.stringify({ 'jig:ง่าย': { timeMs: 1, stars: 3 } }),
  });
  await completeEasy(page);
  await expectWinDialog(page, { record: false });
  assert.equal((await page.locator('[data-testid="minigame-win-best"]').innerText()).trim(), '00:00');
  await page.locator('[data-testid="minigame-win-continue"]').click();
  await page.locator('[data-testid="house-map-btn"]').waitFor({ state: 'visible', timeout: 8000 });
  await ctx.close();
  console.log('ok standing-best');
}

// Per-difficulty isolation: a medium record must not appear on an easy HUD.
{
  const { ctx, page } = await openJigsaw('ง่าย', {
    best: JSON.stringify({ 'jig:medium': { timeMs: 1234, stars: 3 }, 'jig:ปานกลาง': { timeMs: 1234, stars: 3 } }),
  });
  const best = (await page.locator('[data-testid="minigame-hud-best"]').innerText()).trim();
  assert.equal(best, '—', `easy HUD ignores a medium best, got ${best}`);
  await shot(page, 'easy-isolated-best.png');
  await ctx.close();
  console.log('ok difficulty-isolation');
}

await browser.close();
console.log('ok jigsaw e2e');
