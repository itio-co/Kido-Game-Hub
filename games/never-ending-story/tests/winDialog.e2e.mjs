// Shared win dialog on stir-fry (rhythm pack) and challenge mode.
// Not in `npm test` (needs a browser and a static server):
//   BASE=http://127.0.0.1:4173/ CHROME=/usr/bin/google-chrome-stable SHOTS=/workspace/nes-windlg-shots \
//     node tests/winDialog.e2e.mjs
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4173/';
const SHOTS = process.env.SHOTS ?? '/workspace/nes-windlg-shots';

const playerSave = JSON.stringify({
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
    mapUnlocked: false,
    difficulty: 'ง่าย',
    played: [],
    seen: [],
    levels: { cross: [], jig: [], slide: [] },
    bag: [],
    nav: {
      screen: 'player-room',
      history: ['player-room'],
      slot: 'now',
      page: 0,
      talkSlug: null,
      context: 'hub',
      schema: 2,
      practice: false,
    },
  },
});

const playerId = JSON.stringify({ playerId: 'e2e-win-dialog', nickname: 'Tester' });

const stirfryRun = JSON.stringify({
  phase: 'result',
  timeLeft: 12,
  score: 1520,
  combo: 6,
  heat: 50,
  progress: 100,
  stirBeat: 0,
  ingredientDue: null,
  ingredientHits: 4,
  ingredientMiss: 1,
  startedAt: Date.now() - 48000,
  bestScore: 1520,
  bestStars: 3,
  endReason: 'done',
  difficulty: 'easy',
  seed: 4242,
  cue: 0,
  bests: { easy: { bestScore: 1520, bestStars: 3 } },
});

const challengeRun = JSON.stringify({
  id: 'slide|easy|1|||',
  game: 'slide',
  difficulty: 'easy',
  seed: 1,
  from: null,
  phase: 'result',
  board: null,
  tally: { correct: 15, mistakes: 0, hints: 0, maxCombo: 0 },
  combo: 0,
  elapsedMs: 28000,
  score: 1260,
  sessionId: 'e2e-challenge',
});

mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
  args: ['--no-sandbox', '--use-gl=swiftshader'],
});

async function open(hash, extraInit) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await page.route('**/api/**', (route) => route.abort());
  await page.addInitScript(([save, id, extra]) => {
    localStorage.setItem('nesg.player.v1', save);
    localStorage.setItem('nesg.playerId.v1', id);
    sessionStorage.setItem('seeded', '1');
    if (extra) {
      for (const [key, value] of Object.entries(extra)) localStorage.setItem(key, value);
    }
  }, [playerSave, playerId, extraInit ?? null]);
  const url = new URL(BASE);
  url.hash = hash;
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  return { ctx, page };
}

async function expectWinDialog(page, { game, difficulty, score, record }) {
  const dialog = page.locator('[data-testid="minigame-win-dialog"]');
  await dialog.waitFor({ state: 'visible', timeout: 15000 });
  assert.ok((await page.locator('[data-testid="minigame-win-title"]').innerText()).includes('เยี่ยมมาก'), 'win title');
  assert.ok((await page.locator('[data-testid="minigame-win-game"]').innerText()).length > 0, 'game label');
  if (game) assert.ok((await page.locator('[data-testid="minigame-win-game"]').innerText()).includes(game), `game ${game}`);
  if (difficulty) assert.ok((await page.locator('[data-testid="minigame-win-difficulty"]').innerText()).includes(difficulty), `difficulty ${difficulty}`);
  const stars = await page.locator('[data-testid="minigame-win-stars"]').getAttribute('data-stars');
  assert.ok(stars === '1' || stars === '2' || stars === '3', `stars ${stars}`);
  if (score != null) {
    assert.equal((await page.locator('[data-testid="minigame-win-score"]').innerText()).trim(), String(score), 'score');
    const best = (await page.locator('[data-testid="minigame-win-best"]').innerText()).trim();
    assert.ok(best.length > 0 && best !== '—', `best ${best}`);
  }
  const timeText = (await page.locator('[data-testid="minigame-win-time"]').innerText()).trim();
  assert.match(timeText, /\d{2}:\d{2}/, `time ${timeText}`);
  await page.locator('[data-testid="minigame-win-replay"]').waitFor({ state: 'visible' });
  await page.locator('[data-testid="minigame-win-close"]').waitFor({ state: 'visible' });
  assert.equal(await page.locator('[data-testid="minigame-win-continue"]').count(), 0, 'standalone dialog has no continue');
  const recordBadge = page.locator('[data-testid="minigame-win-record"]');
  if (record) await recordBadge.waitFor({ state: 'visible' });
  else assert.equal(await recordBadge.count(), 0, 'restored result is not a new record');
}

const { ctx: stirCtx, page: stirPage } = await open('#/play/stirfry', { 'nesg.stirfry.v1': stirfryRun });
await expectWinDialog(stirPage, { game: 'ผัด', difficulty: 'ง่าย', score: 1520, record: false });
assert.equal(await stirPage.locator('[data-testid="minigame-win-stars"]').getAttribute('data-stars'), '3', 'stirfry three stars');
await stirPage.waitForTimeout(600);
await stirPage.screenshot({ path: join(SHOTS, 'stirfry-win-dialog.png'), type: 'png' });

await stirPage.locator('[data-testid="minigame-win-replay"]').click();
await stirPage.locator('[data-testid="minigame-win-dialog"]').waitFor({ state: 'detached', timeout: 8000 });
assert.equal(await stirPage.locator('.play').count(), 1, 'replay starts a new stir-fry run');
await stirCtx.close();

const { ctx: stirCloseCtx, page: stirClosePage } = await open('#/play/stirfry', { 'nesg.stirfry.v1': stirfryRun });
await expectWinDialog(stirClosePage, { score: 1520, record: false });
await stirClosePage.locator('[data-testid="minigame-win-close"]').click();
await stirClosePage.locator('[data-testid="minigame-win-dialog"]').waitFor({ state: 'detached', timeout: 8000 });
await stirCloseCtx.close();

const { ctx: chalCtx, page: chalPage } = await open('#/challenge/slide/easy/1', { 'nesg.challenge.run.v1': challengeRun });
await expectWinDialog(chalPage, { difficulty: 'ง่าย', score: 1260, record: false });
assert.equal(await chalPage.locator('[data-testid="minigame-win-stars"]').getAttribute('data-stars'), '3', 'no-hint challenge is three stars');
assert.ok((await chalPage.locator('[data-testid="minigame-win-hints"]').innerText()).includes('ไม่ใช้คำใบ้'), 'hints none');
await chalPage.waitForTimeout(600);
await chalPage.screenshot({ path: join(SHOTS, 'challenge-win-dialog.png'), type: 'png' });

await chalPage.locator('[data-testid="minigame-win-replay"]').click();
await chalPage.locator('[data-testid="minigame-win-dialog"]').waitFor({ state: 'detached', timeout: 8000 });
await chalPage.waitForSelector('.hud, .sg', { timeout: 8000 });
await chalCtx.close();

const { ctx: chalCloseCtx, page: chalClosePage } = await open('#/challenge/slide/easy/1', { 'nesg.challenge.run.v1': challengeRun });
await expectWinDialog(chalClosePage, { score: 1260, record: false });
await chalClosePage.locator('[data-testid="minigame-win-close"]').click();
await chalClosePage.locator('[data-testid="minigame-win-dialog"]').waitFor({ state: 'detached', timeout: 8000 });
await chalCloseCtx.close();

await browser.close();
console.log(`winDialog e2e: passed (shots in ${SHOTS})`);
