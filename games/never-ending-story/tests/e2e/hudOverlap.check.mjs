// HUD vs hotspots: no HUD element may overlap a visible hotspot's tap area, HUD elements may not overlap each other,
// and nothing may sit under the DEMO ribbon. Every reachable scene and living-room time view, TH and EN,
// on mobile 360x780 and 412x915 (touch) and desktop. Needs Playwright (not a project dependency).
// Run: node tests/e2e/hudOverlap.check.mjs <URL> [mobile-screenshot-prefix]
import { chromium, devices } from 'playwright';
import { labels, SEED, LAUNCH, open } from './labels.mjs';

const [url, out = '/tmp/hud-'] = process.argv.slice(2);
const browser = await chromium.launch(LAUNCH);
const VIEWPORTS = [
  { name: '360x780', mobile: true, viewport: { width: 360, height: 780 } },
  { name: '412x915', mobile: true, viewport: { width: 412, height: 915 } },
  { name: 'desktop', mobile: false, viewport: { width: 1366, height: 820 } },
];
const fails = [];
const check = (ok, message) => { console.log(ok ? 'PASS' : 'FAIL', message); if (!ok) fails.push(message); };
const overlaps = [];
let views = 0;

const rectsMeet = (a, b) => !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
/** Circle (or box) tap area vs an axis-aligned rect. */
const spotMeetsRect = (spot, rect) => {
  if (!spot.round) return rectsMeet(spot, rect);
  const dx = Math.max(rect.x - spot.cx, 0, spot.cx - (rect.x + rect.w));
  const dy = Math.max(rect.y - spot.cy, 0, spot.cy - (rect.y + rect.h));
  return dx * dx + dy * dy < spot.r * spot.r;
};
/** Circle vs the ribbon's 45-degree band, clipped to its corner box. */
const spotUnderBand = (spot, band) => {
  if (!spotMeetsRect(spot, band.box)) return false;
  const c = Math.SQRT1_2;
  const x = spot.cx - band.cx;
  const y = spot.cy - band.cy;
  const along = x * c + y * c;
  const across = -x * c + y * c;
  const dx = Math.max(Math.abs(along) - band.w / 2, 0);
  const dy = Math.max(Math.abs(across) - band.h / 2, 0);
  return dx * dx + dy * dy < spot.r * spot.r;
};

async function measure(page, where) {
  views++;
  const m = await page.evaluate(() => {
    const visible = (el) => {
      const s = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0 && b.width > 0 && b.height > 0;
    };
    const rect = (el) => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; };
    const items = [];
    const add = (name, el) => {
      if (!el || !visible(el)) return;
      const round = parseFloat(getComputedStyle(el).borderTopLeftRadius) >= el.getBoundingClientRect().width / 2 - 1;
      items.push({ name, round, ...rect(el) });
    };
    const icons = [...document.querySelectorAll('.hud .icon')];
    if (icons.length > 1) add('hint', icons[0]);
    add('settings', icons[icons.length - 1]);
    add('status pill', document.querySelector('.hud .titles') || document.querySelector('.hud .place'));
    for (const [sel, name] of [['.back', 'back'], ['.case', 'case'], ['.mapbtn', 'map button'], ['.ver', 'version']]) add(name, document.querySelector(sel));
    const hud = [...items];
    for (const el of document.querySelectorAll('.hud .rule')) if (visible(el)) hud.push({ name: 'hud rule', ...rect(el) });
    const ribbon = document.querySelector('.demo-ribbon span');
    let band = null;
    if (ribbon && visible(ribbon)) {
      const b = ribbon.getBoundingClientRect();
      band = { cx: b.left + b.width / 2, cy: b.top + b.height / 2, w: ribbon.offsetWidth, h: ribbon.offsetHeight, box: rect(ribbon.parentElement) };
    }
    const spots = [];
    for (const el of document.querySelectorAll('circle.hit, .spot')) {
      if (!visible(el)) continue;
      const b = el.getBoundingClientRect();
      if (b.bottom < 0 || b.top > innerHeight || b.right < 0 || b.left > innerWidth) continue;
      spots.push({ label: el.getAttribute('aria-label'), cx: b.left + b.width / 2, cy: b.top + b.height / 2, r: Math.min(b.width, b.height) / 2, round: el.tagName.toLowerCase() === 'circle', ...rect(el) });
    }
    const status = document.querySelector('.hud .hud-status');
    return {
      items, hud, band, spots,
      title: (document.querySelector('.hud .place-sub') || document.querySelector('.hud .place'))?.textContent,
      status: status?.textContent ?? '',
      truncated: status ? status.scrollHeight > status.clientHeight + 3 || status.scrollWidth > status.clientWidth + 1 : false,
      lines: status ? Math.round(status.clientHeight / parseFloat(getComputedStyle(status).lineHeight)) : 0,
      pillBottom: Math.round(document.querySelector('.hud .titles')?.getBoundingClientRect().bottom ?? 0),
      font: status ? getComputedStyle(status).fontSize : '',
    };
  });
  for (const spot of m.spots) {
    for (const h of m.hud) if (spotMeetsRect(spot, h)) overlaps.push(`${where}: "${spot.label}" under ${h.name}`);
    if (m.band && spotUnderBand(spot, m.band)) overlaps.push(`${where}: "${spot.label}" under DEMO ribbon`);
  }
  for (let i = 0; i < m.items.length; i++) for (let j = i + 1; j < m.items.length; j++) {
    if (rectsMeet(m.items[i], m.items[j])) overlaps.push(`${where}: HUD ${m.items[i].name} overlaps ${m.items[j].name}`);
  }
  if (m.band) for (const item of m.items) {
    let under = false;
    for (let a = 0; a <= 8 && !under; a++) for (let c = 0; c <= 8 && !under; c++) {
      if (item.round && Math.hypot(a / 8 - 0.5, c / 8 - 0.5) > 0.5) continue;
      if (spotUnderBand({ cx: item.x + (item.w * a) / 8, cy: item.y + (item.h * c) / 8, r: 0.5, round: true }, m.band)) under = true;
    }
    if (under) overlaps.push(`${where}: HUD ${item.name} under DEMO ribbon`);
  }
  console.log(`  ${where} [${m.title}] spots=${m.spots.length} status="${m.status}" font=${m.font} lines=${m.lines} pillBottom=${m.pillBottom}${m.truncated ? ' (ellipsis)' : ''}`);
}

async function run(V, lang) {
  const L = labels(lang);
  const context = await browser.newContext(V.mobile ? { ...devices['Pixel 7'], viewport: V.viewport } : { viewport: V.viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  const wait = (ms = 500) => page.waitForTimeout(ms);
  const act = (locator) => (V.mobile ? locator.tap() : locator.click());
  const tag = `${V.name}/${lang}`;
  const place = async () => (await page.locator('.hud .place-sub, .hud .place').first().textContent().catch(() => '')) || '';
  const close = async () => { for (let i = 0; i < 3 && (await page.locator('.dlg button').count()); i++) { await act(page.locator('.dlg button').first()); await wait(300); } };
  const spot = async (slug) => { await act(page.locator(`circle.hit[aria-label="${L.spot(slug)}"]`)); await wait(1000); };
  // Back out to a known place; a talk scene may first show its dialogue (which can chain into a minigame).
  const back = async (to) => {
    for (let i = 0; i < 8; i++) {
      if ((await page.locator('.dlg button').count()) && i % 2 === 0) await close(); else await act(page.locator('.back'));
      await wait(900);
      if ((await place()) === to) return;
    }
    throw new Error(`${tag}: back did not reach ${to} (at ${await place()})`);
  };
  const shot = (name) => (V.mobile ? page.screenshot({ path: `${out}${V.name}-${lang}-${name}.png` }) : null);
  const view = async (name) => { await measure(page, `${tag} ${name}`); await shot(name.replace(/ /g, '-')); };

  await open(page, url);
  await page.evaluate(([seed, locale]) => { localStorage.clear(); localStorage.setItem('nes-locale-game', locale); localStorage.setItem('nesg.player.v1', seed); }, [SEED, lang]);
  await page.reload();
  await page.waitForSelector('.spot');
  await wait(1200);
  await view('player-room');
  await act(page.locator(`.spot[aria-label="${L.door}"]`)); await wait(800);
  await act(page.locator('.evcard').first()); await wait(800);
  if (await page.locator('.skip').count()) { await act(page.locator('.skip')); await wait(600); }
  if (await page.locator('[data-difficulty]').count()) { await act(page.locator('[data-difficulty="easy"]')); await wait(1200); }
  await view('house-map');
  await spot('flow/house-map/living');
  const living = await place();
  await view('living-now');
  const trips = [
    ['flow/living-room/table', 'table'],
    ['flow/living-room/tray', 'tray'],
    ['flow/living-room/mek', 'uncle'],
    ['flow/living-room/grandma', 'grandma'],
    ['flow/living-room/study-door', 'study', ['flow/study/star-box', 'star-box']],
    ['flow/living-room/kitchen-door', 'kitchen', ['flow/kitchen/cloth', 'kitchen-close']],
  ];
  for (const [slug, name, inner] of trips) {
    await spot(slug);
    check((await place()) !== living, `${tag}: tapping ${name} left the living room`);
    await view(name);
    if (inner) {
      const mid = await place();
      await spot(inner[0]);
      await view(inner[1]);
      await back(mid);
    }
    await back(living);
  }
  await spot('flow/living-room/clock');
  await act(page.locator('.flow button', { hasText: L.slot('afternoon') }).first()); await wait(1200);
  await view('living-afternoon');
  await spot('flow/living-room/calendar');
  await act(page.locator('.flow button.link')); await wait(400);
  await act(page.locator('.flow button', { hasText: L.slot('yesterday') }).first()); await wait(1200);
  await view('living-yesterday');
  check(errors.length === 0, `${tag}: no page errors ${errors.slice(0, 2).join(' | ')}`);
  await context.close();
}

for (const V of VIEWPORTS) for (const lang of ['th', 'en']) await run(V, lang);
check(views === 78, `visited ${views} scene/time views (13 per viewport and language)`);
check(overlaps.length === 0, `no HUD element overlaps a visible hotspot, another HUD element, or the DEMO ribbon (${overlaps.length} overlaps)`);
for (const line of overlaps) console.log('  OVERLAP', line);
console.log(fails.length ? `FAILURES ${fails.length}` : 'ALL PASS');
await browser.close();
process.exit(fails.length ? 1 : 0);
