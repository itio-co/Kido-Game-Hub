// Local captures for the E02 rewind / note / clock-power work. Aborts /api/.
//   BASE=http://127.0.0.1:4173/never/ CHROME=/usr/bin/google-chrome SHOTS=/workspace/nes-e02-rewind node tests/e02Rewind.e2e.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4173/never/';
const SHOTS = process.env.SHOTS ?? '/workspace/nes-e02-rewind';
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });

function save(evidence, screen, slot = 'now') {
  return JSON.stringify({
    version: 1,
    player: { onboardingComplete: true, prologueSeen: true, textSize: 'md', soundEnabled: false, calendarTheme: null, decor: {}, room: { calendar: 'original', grandpaPhoto: 'shelf' } },
    knowledge: { evidence: [...evidence], solvedCaseIds: [], exploreHints: 0 },
    caseState: { facts: {} },
    flow: {
      evidence: [...evidence],
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
        screen,
        history: ['player-room', 'event-select', 'living-room'],
        slot,
        page: 0,
        talkSlug: null,
        context: 'event',
        schema: 2,
        practice: false,
      },
    },
  });
}

async function open(saveJson) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: false });
  const page = await ctx.newPage();
  await page.route('**/api/**', (route) => route.abort());
  await page.addInitScript(([s]) => {
    localStorage.setItem('nesg.player.v1', s);
    sessionStorage.setItem('seeded', '1');
  }, [saveJson]);
  await page.goto(BASE);
  await page.waitForTimeout(1200);
  return { ctx, page };
}


/** Scene hotspots need a select tap, then a confirm tap. */
async function activate(page, label) {
  const spot = page.locator(`[role="button"][aria-label="${label}"]`);
  await spot.click();
  await page.waitForTimeout(200);
  await spot.click();
}

let checks = 0;

// Present-day table: only the note, then handwritten note front/back, then bottom evidence.
{
  const { ctx, page } = await open(save([], 'table'));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/present-table.png`, type: 'png' });
  const toast = page.locator('.toast');
  assert.equal(await toast.count(), 0, 'no top toast on arrival');
  await activate(page, 'ข้อความของน้าริน');
  await page.waitForSelector('[data-testid="rin-note"]');
  assert.equal(await page.locator('[data-testid="bottom-notice"]').count(), 0, 'evidence waits until the note is closed');
  await page.screenshot({ path: `${SHOTS}/note-front.png`, type: 'png' });
  const front = await page.locator('[data-testid="rin-note-front"]').innerText();
  assert.match(front, /ขอย้ายเก็บก่อน/);
  assert.match(front, /ริน/);
  await page.locator('[data-testid="rin-note-front"]').click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOTS}/note-back.png`, type: 'png' });
  const back = await page.locator('[data-testid="rin-note-back"]').innerText();
  assert.match(back, /โต๊ะยังเปียกอยู่/);
  await page.locator('[data-testid="rin-note-close"]').click();
  await page.waitForSelector('[data-testid="bottom-notice"]');
  const notice = await page.locator('[data-testid="bottom-notice"]').innerText();
  assert.match(notice, /ได้หลักฐาน E01/);
  assert.equal(await toast.count(), 0, 'evidence message is not a top toast');
  await page.screenshot({ path: `${SHOTS}/note-close-bottom-evidence.png`, type: 'png' });
  await ctx.close();
  checks += 1;
}

// Clock power hidden before a clue; after E01 the clock panel opens without ??? hints.
{
  const { ctx, page } = await open(save([], 'living-room'));
  await activate(page, 'นาฬิกา');
  await page.waitForTimeout(400);
  assert.equal(await page.locator('[data-testid="clock-panel"]').count(), 0, 'no clock power UI before a clue');
  await page.screenshot({ path: `${SHOTS}/clock-before-clue.png`, type: 'png' });
  const hint = page.locator('[data-testid="bottom-notice"]');
  if (await hint.count()) {
    const text = await hint.innerText();
    assert.match(text, /เบาะแส/);
    assert.doesNotMatch(text, /\?\?\?/);
  }
  await ctx.close();
  checks += 1;
}

{
  const { ctx, page } = await open(save(['E01'], 'living-room'));
  await activate(page, 'นาฬิกา');
  await page.waitForSelector('[data-testid="clock-panel"]');
  const panel = await page.locator('[data-testid="clock-panel"]').innerText();
  assert.match(panel, /บ่ายนี้/);
  assert.doesNotMatch(panel, /\?\?\?/);
  await page.screenshot({ path: `${SHOTS}/clock-after-clue.png`, type: 'png' });
  await ctx.close();
  checks += 1;
}

// Calendar can open, but day-travel stays locked.
{
  const { ctx, page } = await open(save(['E01'], 'living-room'));
  await activate(page, 'ปฏิทินของย่า');
  await page.waitForSelector('[data-testid="calendar-panel"]');
  await page.locator('[data-testid="calendar-travel"]').click();
  await page.waitForSelector('[data-testid="bottom-notice"]');
  const text = await page.locator('[data-testid="bottom-notice"]').innerText();
  assert.match(text, /ปฏิทิน/);
  await page.screenshot({ path: `${SHOTS}/calendar-locked.png`, type: 'png' });
  await ctx.close();
  checks += 1;
}

// Afternoon rewind: Rin spilling; notebook locked without E02.
{
  const { ctx, page } = await open(save(['E01', 'E03', 'E04', 'E06'], 'living-room', 'afternoon'));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/rewind-afternoon-spill.png`, type: 'png' });
  await ctx.close();
  checks += 1;
}

{
  const { ctx, page } = await open(save(['E01', 'E03', 'E04', 'E06'], 'notebook'));
  await page.waitForTimeout(400);
  const body = await page.locator('.note-list').innerText();
  assert.match(body, /E02 ยังไม่พบ/);
  assert.equal(await page.locator('[data-testid="solve-case"]').count(), 0, 'สรุปคดี stays locked without E02');
  await page.screenshot({ path: `${SHOTS}/notebook-locked-before-rewind.png`, type: 'png' });
  await ctx.close();
  checks += 1;
}

{
  const { ctx, page } = await open(save(['E01', 'E02', 'E03', 'E04', 'E06'], 'notebook'));
  await page.waitForSelector('[data-testid="solve-case"]');
  await page.screenshot({ path: `${SHOTS}/notebook-ready-after-rewind.png`, type: 'png' });
  await ctx.close();
  checks += 1;
}

{
  const { ctx, page } = await open(save(['E06'], 'kitchen-close'));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/kitchen-e06.png`, type: 'png' });
  await ctx.close();
  checks += 1;
}

await browser.close();
console.log(`e02Rewind: ${checks} checks passed`);
