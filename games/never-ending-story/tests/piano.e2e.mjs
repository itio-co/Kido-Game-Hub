// Piano minigame in a real browser: landscape phone, portrait rotation, two-hand keyboard, polyphony, song run.
// Not in `npm test` (needs a browser and a static server):
//   BASE=http://127.0.0.1:4175/ CHROME=/usr/bin/google-chrome-stable SHOTS=/workspace/nes-piano-shots \
//     node tests/piano.e2e.mjs
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4175/';
const SHOTS = process.env.SHOTS ?? '/workspace/nes-piano-shots';

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
const playerId = JSON.stringify({ playerId: 'e2e-piano', nickname: 'Tester' });

mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox', '--use-gl=swiftshader', '--autoplay-policy=no-user-gesture-required'] });

/** Counts oscillators so polyphony and release are observable without a sound card. */
const audioSpy = () => {
  const log = { started: 0, stopped: 0, freqs: [] };
  window.__audio = log;
  class Param { constructor() { this.value = 0; } setValueAtTime() {} exponentialRampToValueAtTime() {} cancelScheduledValues() {} }
  class Node { connect() {} disconnect() {} }
  class Gain extends Node { constructor() { super(); this.gain = new Param(); } }
  class Osc extends Node {
    constructor() { super(); this.frequency = new Param(); this.type = 'sine'; }
    start() { log.started += 1; log.freqs.push(this.frequency.value); }
    stop() { log.stopped += 1; }
  }
  window.AudioContext = class {
    constructor() { this.state = 'running'; this.currentTime = 0; this.destination = new Node(); }
    createGain() { return new Gain(); }
    createOscillator() { return new Osc(); }
    createDynamicsCompressor() { return new Node(); }
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  };
};

async function open(hash, { viewport, touch = true, mobile = touch, reduced = false, extra = null } = {}) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    hasTouch: touch,
    isMobile: mobile,
    reducedMotion: reduced ? 'reduce' : 'no-preference',
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route('**/api/**', (route) => route.abort());
  await page.addInitScript(audioSpy);
  await page.addInitScript(([save, id, ex]) => {
    localStorage.setItem('nesg.player.v1', save);
    localStorage.setItem('nesg.playerId.v1', id);
    sessionStorage.setItem('seeded', '1');
    if (ex) for (const [k, v] of Object.entries(ex)) localStorage.setItem(k, v);
  }, [playerSave, playerId, extra]);
  const url = new URL(BASE);
  url.hash = hash;
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="piano"]', { timeout: 15000 });
  return { ctx, page, errors };
}
const shot = (page, name) => page.screenshot({ path: join(SHOTS, name), type: 'png' });
const q = (page, id) => page.locator(`[data-testid="${id}"]`);
const rootAttr = (page, name) => q(page, 'piano').getAttribute(name);
const audio = (page) => page.evaluate(() => ({ ...window.__audio }));

const PHONE_LAND = { width: 844, height: 390 };

// ---------------------------------------------------------------- landscape phone: menu, difficulty, song run
{
  const { ctx, page, errors } = await open('#/play/piano', { viewport: PHONE_LAND });
  assert.equal(await rootAttr(page, 'data-screen'), 'menu');
  assert.equal(await rootAttr(page, 'data-version'), '1.0.0');
  const box = await q(page, 'piano').boundingBox();
  assert.ok(box.width >= 843 && box.height >= 389, `fills the landscape screen ${JSON.stringify(box)}`);
  assert.ok(box.width > box.height, 'landscape');
  assert.equal(await page.locator('button[data-song]').count() >= 4, true, 'four songs');
  await page.locator('[data-diff="normal"]').click();
  assert.equal(await rootAttr(page, 'data-difficulty'), 'normal');
  await page.waitForTimeout(150);
  await shot(page, '1-difficulty-select.png');
  await page.locator('[data-diff="easy"]').click();

  await q(page, 'piano-start').click();
  assert.equal(await rootAttr(page, 'data-screen'), 'song');
  assert.equal(await rootAttr(page, 'data-span'), '1', 'song mode shows one octave');
  assert.equal(await q(page, 'piano-oct-up').count(), 0, 'no octave shift in song mode');
  assert.equal(await page.locator('[data-testid="piano-keys"] .key.white').count(), 8);
  assert.equal(await page.locator('[data-testid="piano-keys"] .key.black').count(), 5);
  // one-hand reach: the whole keyboard is no wider than the screen, every white key is a big touch target
  const kb = await q(page, 'piano-keys').boundingBox();
  const k0 = await page.locator('[data-midi="60"]').boundingBox();
  assert.ok(kb.width <= 844 && k0.width >= 70 && k0.height >= 100, `big keys ${JSON.stringify(k0)}`);

  // Auto-player: tap the lane of every note as it reaches the hit line.
  await page.evaluate(() => {
    const midiOfCol = [60, 62, 64, 65, 67, 69, 71, 72];
    const done = new Set();
    const tap = (midi) => {
      const el = document.querySelector(`[data-testid="piano-keys"] [data-midi="${midi}"]`);
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7, pointerType: 'touch' }));
      setTimeout(() => el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7, pointerType: 'touch' })), 40);
    };
    const loop = () => {
      const fall = document.querySelector('[data-testid="piano-fall"]');
      if (fall) {
        const H = fall.clientHeight;
        for (const n of fall.querySelectorAll('.note')) {
          const id = n.dataset.note;
          if (done.has(id)) continue;
          const y = new DOMMatrix(getComputedStyle(n).transform).m42;
          const bottom = y + n.offsetHeight;
          if (bottom >= H - 3) {
            done.add(id);
            const col = Math.round((parseFloat(n.style.left) + parseFloat(n.style.width) / 2 - 6.25) / 12.5);
            tap(midiOfCol[col]);
          }
        }
      }
      requestAnimationFrame(loop);
    };
    loop();
  });
  await page.waitForFunction(() => Number(document.querySelector('[data-testid="piano-progress"]')?.dataset.pct) >= 45, null, { timeout: 40000 });
  await shot(page, '2-gameplay-mid-song.png');
  const mid = Number((await q(page, 'piano-score').innerText()).trim());
  assert.ok(mid > 0, `score grows mid-song (${mid})`);
  await q(page, 'minigame-win-dialog').waitFor({ state: 'visible', timeout: 40000 });
  assert.equal(await rootAttr(page, 'data-phase'), 'done');
  const stars = await q(page, 'minigame-win-stars').getAttribute('data-stars');
  assert.ok(Number(stars) >= 2, `bot gets at least two stars (${stars})`);
  assert.ok(Number((await q(page, 'minigame-win-score').innerText()).trim()) > 0);
  assert.ok((await q(page, 'minigame-win-game').innerText()).includes('เปียโน'), 'game label');
  await page.waitForTimeout(700);
  await shot(page, '3-result-screen.png');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('nesg.minigame-best.v1') ?? '{}'));
  assert.ok(stored['piano-twinkle:easy']?.score > 0, 'best score stored per song and level');
  await q(page, 'minigame-win-close').click();
  assert.equal(await rootAttr(page, 'data-screen'), 'menu');
  assert.ok((await page.locator('button[data-song="twinkle"] i').innerText()).includes('★'), 'menu shows earned stars');
  assert.deepEqual(errors, [], 'no page errors');
  await ctx.close();
}

// ---------------------------------------------------------------- free play on a landscape phone: one octave + shift
{
  const { ctx, page, errors } = await open('#/play/piano', { viewport: PHONE_LAND });
  await q(page, 'piano-free').click();
  assert.equal(await rootAttr(page, 'data-screen'), 'free');
  assert.equal(await rootAttr(page, 'data-span'), '1', 'touch device starts with one octave');
  assert.equal(await q(page, 'piano-range').innerText(), 'C4–C5');
  await q(page, 'piano-oct-up').click();
  assert.equal(await q(page, 'piano-range').innerText(), 'C5–C6');
  assert.equal(await q(page, 'piano-oct-up').isDisabled(), true, 'top of the range is C6');
  await q(page, 'piano-oct-down').click();
  await q(page, 'piano-oct-down').click();
  assert.equal(await q(page, 'piano-range').innerText(), 'C3–C4');
  assert.equal(await q(page, 'piano-oct-down').isDisabled(), true, 'bottom of the range is C3');
  await q(page, 'piano-oct-up').click();
  assert.equal(await q(page, 'piano-range').innerText(), 'C4–C5');
  // two fingers at once
  const a = await page.locator('[data-midi="60"]').boundingBox();
  const b = await page.locator('[data-midi="67"]').boundingBox();
  await page.evaluate(([x1, y1, x2, y2]) => {
    const fire = (x, y, id, type) => {
      const el = document.elementFromPoint(x, y);
      el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: id, pointerType: 'touch', clientX: x, clientY: y }));
    };
    fire(x1, y1, 11, 'pointerdown');
    fire(x2, y2, 12, 'pointerdown');
    window.__fire = fire;
  }, [a.x + a.width / 2, a.y + a.height - 20, b.x + b.width / 2, b.y + b.height - 20]);
  assert.equal(await page.locator('[data-testid="piano-keys"] .key.down').count(), 2, 'two touches are two held keys');
  assert.equal((await audio(page)).started, 4, 'two voices (two oscillators each)');
  await shot(page, '4-free-play-shift-controls.png');
  await page.evaluate(([x1, y1, x2, y2]) => { window.__fire(x1, y1, 11, 'pointerup'); window.__fire(x2, y2, 12, 'pointerup'); }, [a.x + a.width / 2, a.y + a.height - 20, b.x + b.width / 2, b.y + b.height - 20]);
  assert.equal(await page.locator('[data-testid="piano-keys"] .key.down').count(), 0, 'released');
  // first physical key switches to two octaves with letters
  await page.keyboard.down('KeyZ');
  assert.equal(await rootAttr(page, 'data-span'), '2', 'keyboard use shows two octaves');
  assert.equal(await rootAttr(page, 'data-labels'), 'on');
  await page.keyboard.up('KeyZ');
  assert.deepEqual(errors, [], 'no page errors');
  await ctx.close();
}

// ---------------------------------------------------------------- desktop with a physical keyboard: two octaves, labels, chords
{
  const { ctx, page, errors } = await open('#/play/piano', { viewport: { width: 1280, height: 640 }, touch: false, mobile: false });
  await q(page, 'piano-free').click();
  assert.equal(await rootAttr(page, 'data-span'), '2', 'desktop shows two octaves');
  assert.equal(await rootAttr(page, 'data-labels'), 'on', 'desktop shows letters');
  assert.equal(await page.locator('[data-testid="piano-keys"] .key.white').count(), 15);
  assert.equal(await page.locator('[data-testid="piano-keys"] .key.black').count(), 10);
  assert.equal(await page.locator('[data-midi="60"] .lb').innerText(), 'Z');
  assert.equal(await page.locator('[data-midi="61"] .lb').innerText(), 'S');
  assert.equal(await page.locator('[data-midi="72"] .lb').innerText(), 'Q');
  assert.equal(await page.locator('[data-midi="73"] .lb').innerText(), '2');
  assert.equal(await page.locator('[data-midi="83"] .lb').innerText(), 'U');
  assert.equal(await page.locator('[data-midi="84"] .lb').innerText(), 'I');
  // two-handed chord: left hand C major (Z C B), right hand E minor an octave up (Q? E T)
  await page.keyboard.down('KeyZ');
  await page.keyboard.down('KeyC');
  await page.keyboard.down('KeyB');
  await page.keyboard.down('KeyE');
  await page.keyboard.down('KeyT');
  assert.equal(await page.locator('[data-testid="piano-keys"] .key.down').count(), 5, 'five keys held together');
  const held = await q(page, 'piano-held').innerText();
  assert.ok(held.includes('C4') && held.includes('E4') && held.includes('G4') && held.includes('E5') && held.includes('G5'), `held notes ${held}`);
  assert.equal((await audio(page)).started, 10, 'five voices');
  await shot(page, '5-desktop-two-octaves-keyboard-labels.png');
  // key repeat is ignored: a repeated keydown does not restart the voice
  await page.keyboard.down('KeyZ');
  await page.keyboard.down('KeyZ');
  assert.equal((await audio(page)).started, 10, 'repeat ignored');
  await page.keyboard.up('KeyZ');
  await page.keyboard.up('KeyC');
  assert.equal(await page.locator('[data-testid="piano-keys"] .key.down').count(), 3, 'keyup releases only that key');
  assert.ok((await audio(page)).stopped >= 4, 'released voices stop');
  await page.keyboard.up('KeyB');
  await page.keyboard.up('KeyE');
  await page.keyboard.up('KeyT');
  assert.equal(await page.locator('[data-testid="piano-keys"] .key.down').count(), 0);
  // octave shift by keys: ArrowUp / Period up, ArrowDown / Comma down (two octaves: C3-C5, C4-C6)
  assert.equal(await q(page, 'piano-range').innerText(), 'C4–C6');
  await page.keyboard.press('ArrowDown');
  assert.equal(await q(page, 'piano-range').innerText(), 'C3–C5');
  await page.keyboard.press('Comma');
  assert.equal(await q(page, 'piano-range').innerText(), 'C3–C5', 'clamped at C3');
  await page.keyboard.press('Period');
  assert.equal(await q(page, 'piano-range').innerText(), 'C4–C6');
  await page.keyboard.press('ArrowUp');
  assert.equal(await q(page, 'piano-range').innerText(), 'C4–C6', 'clamped at C6');
  // the lower row follows the shift
  await page.keyboard.press('ArrowDown');
  await page.keyboard.down('KeyZ');
  assert.ok((await q(page, 'piano-held').innerText()).includes('C3'), 'Z plays C3 after shifting down');
  await page.keyboard.up('KeyZ');
  // labels toggle
  await q(page, 'piano-labels').click();
  assert.equal(await page.locator('[data-testid="piano-keys"] .lb').count(), 0, 'letters hidden');
  await q(page, 'piano-labels').click();
  // mute: no new voices
  const before = (await audio(page)).started;
  await q(page, 'piano-mute').click();
  await page.keyboard.down('KeyX');
  await page.keyboard.up('KeyX');
  assert.equal((await audio(page)).started, before, 'muted');
  assert.deepEqual(errors, [], 'no page errors');
  await ctx.close();
}

// ---------------------------------------------------------------- song mode takes keyboard input
{
  const { ctx, page } = await open('#/play/piano', { viewport: { width: 1280, height: 640 }, touch: false, mobile: false });
  await q(page, 'piano-start').click();
  assert.equal(await rootAttr(page, 'data-span'), '1', 'song mode is one octave even on desktop');
  assert.equal(await page.locator('[data-midi="72"] .lb').innerText(), 'Q', 'high C is Q');
  await ctx.close();
}

// ---------------------------------------------------------------- portrait phone: layout rotates to landscape
{
  const { ctx, page, errors } = await open('#/play/piano', { viewport: { width: 390, height: 844 } });
  await q(page, 'piano-free').click();
  const box = await page.evaluate(() => {
    const r = document.querySelector('[data-testid="piano"]').getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), left: Math.round(r.left), top: Math.round(r.top) };
  });
  assert.ok(Math.abs(box.w - 390) <= 1 && Math.abs(box.h - 844) <= 1 && box.left >= -1 && box.top >= -1, `rotated box fills the portrait screen ${JSON.stringify(box)}`);
  assert.ok(await q(page, 'piano-rotate').isVisible(), 'rotate hint shows in portrait');
  await page.waitForTimeout(150);
  await shot(page, '6-portrait-rotated-layout.png');
  // a tap on the rotated key still lands on the right key
  const k = await page.locator('[data-midi="64"]').boundingBox();
  await page.touchscreen.tap(k.x + k.width / 2, k.y + k.height - 10);
  assert.ok((await audio(page)).freqs.some((f) => Math.abs(f - 329.63) < 0.1), 'E4 sounded');
  assert.deepEqual(errors, [], 'no page errors');
  await ctx.close();
}

// ---------------------------------------------------------------- reduced motion: no key transitions
{
  const { ctx, page } = await open('#/play/piano', { viewport: PHONE_LAND, reduced: true });
  await q(page, 'piano-free').click();
  const dur = await page.locator('[data-midi="60"]').evaluate((el) => getComputedStyle(el).transitionDuration);
  assert.ok(dur === '0s', `no transition under reduced motion (${dur})`);
  await ctx.close();
}

// ---------------------------------------------------------------- practice card opens the game; exiting returns to practice
{
  const { ctx, page } = await open('#/play/piano', { viewport: PHONE_LAND });
  await q(page, 'piano-exit').click();
  await page.waitForFunction(() => !document.querySelector('[data-testid="piano"]'));
  await page.waitForTimeout(400);
  const card = page.locator('.gcard', { hasText: 'เปียโน' });
  await card.waitFor({ state: 'visible', timeout: 10000 });
  assert.ok((await card.innerText()).includes('⭐'), 'card shows stars');
  await card.click();
  await page.waitForSelector('[data-testid="piano"]', { timeout: 8000 });
  assert.equal(await page.evaluate(() => location.hash), '#/play/piano');
  await shot(page, '0-practice-card-opens-piano.png');
  await ctx.close();
}

await browser.close();
console.log(`piano e2e: passed (shots in ${SHOTS})`);
