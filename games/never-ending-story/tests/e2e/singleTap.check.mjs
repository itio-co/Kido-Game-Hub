// Single tap: one touchscreen tap (Pixel 7, hasTouch/isMobile) or one desktop click opens a hotspot,
// in every living-room time view and after switching time. Needs Playwright (not a project dependency).
// Run: node tests/e2e/singleTap.check.mjs <URL> [screenshot-prefix] [th|en]
import { chromium, devices } from 'playwright';
import { labels, SEED, LAUNCH, open } from './labels.mjs';

const [url, out = '/tmp/single-tap-', lang = 'th'] = process.argv.slice(2);
const L = labels(lang);
const browser = await chromium.launch(LAUNCH);
const fails = [];
const check = (ok, message) => { console.log(ok ? 'PASS' : 'FAIL', message); if (!ok) fails.push(message); };

async function run(mode) {
  const mobile = mode === 'pixel7';
  const context = await browser.newContext(mobile ? { ...devices['Pixel 7'] } : { viewport: { width: 1366, height: 820 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  const wait = (ms = 700) => page.waitForTimeout(ms);
  // Exactly one tap (touchscreen) or one click at the element's centre, through the real hit test.
  const once = async (locator) => {
    const box = await locator.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    if (mobile) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
    await wait();
  };
  const hit = (slug) => page.locator(`circle.hit[aria-label="${L.spot(slug)}"]`);
  const place = async () => (await page.locator('.hud .place-sub, .hud .place').first().textContent().catch(() => '')) || '';
  const dialogOpen = async () => (await page.locator('.dlg').count()) > 0;
  const closeDialog = () => once(page.locator('.dlg button').first());

  await open(page, url);
  if (mobile) check(await page.evaluate(() => navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches), `${mode}: touch device emulated`);
  await page.evaluate(([seed, locale]) => { localStorage.clear(); localStorage.setItem('nes-locale-game', locale); localStorage.setItem('nesg.player.v1', seed); }, [SEED, lang]);
  await page.reload();
  await page.waitForSelector('.spot');
  await wait(1200);

  await once(page.locator(`.spot[aria-label="${L.door}"]`));
  check((await page.locator('.evcard').count()) > 0, `${mode}: one tap on the 3D room door opens event select`);
  await once(page.locator('.evcard').first());
  if (await page.locator('.skip').count()) await once(page.locator('.skip'));
  if (await page.locator('[data-difficulty]').count()) { await once(page.locator('[data-difficulty="easy"]')); await wait(600); }

  const before = await place();
  await once(hit('flow/house-map/living'));
  const living = await place();
  check(living !== before && (await hit('flow/living-room/clock').count()) > 0, `${mode}: one tap on the house map opens the living room`);

  await once(hit('flow/living-room/mek'));
  check((await place()) !== living, `${mode}: now view: one tap on Uncle Mek opens his scene`);
  for (let i = 0; i < 4 && (await place()) !== living; i++) {
    if (await page.locator('.dlg button').count()) await closeDialog(); else await once(page.locator('.back'));
  }

  await once(hit('flow/living-room/clock'));
  check((await page.locator('.calh').count()) > 0, `${mode}: now view: one tap on the clock opens the hour list`);
  await once(page.locator('.flow button', { hasText: L.slot('afternoon') }).first());
  await wait(600);
  await once(hit('flow/living-room/album-then'));
  check(await dialogOpen(), `${mode}: afternoon view (after switching time): one tap on the album opens its dialog`);
  if (mobile) await page.screenshot({ path: `${out}afternoon-album.png` });
  await closeDialog();
  await once(hit('flow/living-room/fallen-vase'));
  check(await dialogOpen(), `${mode}: afternoon view: one tap on the fallen vase opens its dialog`);
  await closeDialog();

  await once(hit('flow/living-room/calendar'));
  await once(page.locator('.flow button.link'));
  await once(page.locator('.flow button', { hasText: L.slot('yesterday') }).first());
  await wait(600);
  await once(hit('flow/living-room/album-shelf'));
  check(await dialogOpen(), `${mode}: yesterday view (after switching time): one tap on the shelf album opens its dialog`);
  if (mobile) await page.screenshot({ path: `${out}yesterday-shelf.png` });
  await closeDialog();
  await once(hit('flow/living-room/grandma-yesterday'));
  check(await dialogOpen(), `${mode}: yesterday view: one tap on Grandma (yesterday) opens her dialog`);

  check(errors.length === 0, `${mode}: no page errors ${errors.slice(0, 2).join(' | ')}`);
  await context.close();
}

await run('pixel7');
await run('desktop');
console.log(fails.length ? `FAILURES ${fails.length}` : 'ALL PASS');
await browser.close();
process.exit(fails.length ? 1 : 0);
