// Game HUD: top resource bar (power meter, clearances toggle, sim clock), bottom build bar (tabs + cards → placement),
// contextual selection card (rotate / duplicate / delete), side-panel drawer, ⚙ Options button, mobile layout.
// Screenshots: screenshot-hud-desktop.png, screenshot-hud-mobile.png. Usage: node scripts/hud-test.mjs [url]
import { chromium, devices } from 'playwright';
const URL = process.argv[2] ?? 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, info) => {
	if (!ok) fails++;
	console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info !== undefined ? ' ' + JSON.stringify(info) : ''}`);
};
const errors = [];
async function open(ctxOpts) {
	const page = await (await browser.newContext(ctxOpts)).newPage();
	page.setDefaultTimeout(120000);
	page.on('pageerror', (e) => errors.push(String(e)));
	await page.goto(URL, { waitUntil: 'networkidle' });
	await page.evaluate(() => localStorage.clear());
	await page.reload({ waitUntil: 'networkidle' });
	await page.waitForFunction(() => !!window.__crew && !!window.__game);
	return page;
}
const overlap = (a, b) => a && b && !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);

// ---------- desktop ----------
let page = await open({ viewport: { width: 1440, height: 900 } });
const G = (fn, a) => page.evaluate(fn, a);
const top = page.locator('[data-testid=hud-topbar]');
const bar = page.locator('[data-testid=build-bar]');
check('top bar + build bar visible', (await top.isVisible()) && (await bar.isVisible()));
check('top bar has the ⚙ Options button', await top.locator('[data-testid=options-btn]').isVisible());
check('sidebar no longer lists Controls (moved to Options)', (await page.locator('aside h2', { hasText: /^Controls$/ }).count()) === 0 && (await page.locator('[data-testid=sidebar-options]').isVisible()));
check('top bar shows static power budget before the sim', await page.locator('[data-testid=hud-power-budget]').isVisible());
await page.getByRole('button', { name: /Start crew sim/ }).click();
await page.waitForFunction(() => window.__crew.enabled);
check('power meter + sim clock move into the top bar', (await top.locator('[data-testid=power-meter]').count()) === 1 && (await top.getByRole('button', { name: 'Sim speed' }).count()) === 1);
await top.locator('[data-testid=show-clearances]').click();
check('clearances toggle in top bar', await G(() => window.__game.showClearances));
await top.locator('[data-testid=show-clearances]').click();

// build bar: galley tab → card → placement tool armed
await bar.locator('[data-testid=build-tab]', { hasText: 'Galley' }).click();
const cards = await bar.locator('[data-testid=build-card]').evaluateAll((els) => els.map((e) => e.dataset.id));
check('galley tab lists galley items', cards.includes('fridge') && cards.includes('galleytable') && !cards.includes('bunk'), cards);
await bar.locator('[data-testid=build-card][data-id=fridge]').click();
check('card arms placement', await G(() => window.__game.tool === 'module' && window.__game.selectedModule === 'fridge'));
const tabs = await bar.locator('[data-testid=build-tab]').count();
check('category tabs', tabs >= 5, { tabs });

// selection card on a placed item
const uid = await G(() => {
	const g = window.__game;
	const m = g.modules.find((x) => x.type === 'locker') ?? g.modules[0];
	g.tool = 'select';
	g.selectedUid = m.uid;
	return m.uid;
});
await wait(700);
const card = page.locator('[data-testid=selection-card]');
check('selection card shows for selection', await card.isVisible());
check('selection card has life info while sim runs', await card.locator('[data-testid=selcard-life]').isVisible());
const n0 = await G(() => window.__game.modules.length);
await card.locator('[data-testid=selcard-duplicate]').click();
const n1 = await G(() => window.__game.modules.length);
check('duplicate adds a copy', n1 === n0 + 1, { n0, n1 });
const a0 = await G(() => window.__game.selected?.angle);
await card.getByRole('button', { name: 'Rotate 90°' }).click();
const a1 = await G(() => window.__game.selected?.angle);
check('rotate from the card', a0 !== a1, { a0, a1 });
await card.locator('[data-testid=selcard-delete]').click();
check('delete from the card', (await G(() => window.__game.modules.length)) === n0);
await G((u) => (window.__game.selectedUid = u), uid);
await wait(300);
await page.screenshot({ path: 'screenshot-hud-desktop.png' });
const cb = await card.boundingBox(), bb = await bar.boundingBox(), tb = await top.boundingBox();
check('desktop: selection card / build bar / top bar do not overlap', !overlap(cb, bb) && !overlap(cb, tb) && !overlap(bb, tb), { cb, bb, tb });

// drawer toggle collapses the side panel and widens the viewport
const w0 = (await page.locator('.viewport').boundingBox()).width;
await page.locator('[data-testid=drawer-toggle]').click();
await wait(300);
const w1 = (await page.locator('.viewport').boundingBox()).width;
check('drawer toggle hides side panel', w1 > w0 + 200 && (await G(() => !window.__game.sidebarOpen)), { w0, w1 });
await page.locator('[data-testid=drawer-toggle]').click();
await page.close();

// ---------- mobile ----------
page = await open({ ...devices['iPhone 13'] });
const M = (fn, a) => page.evaluate(fn, a);
await M(() => window.__crew.start());
await page.waitForTimeout(500);
const mb = page.locator('[data-testid=build-bar]');
check('mobile: build bar visible', await mb.isVisible());
check('mobile: ⚙ Options button visible in the top bar', await page.locator('[data-testid=hud-topbar] [data-testid=options-btn]').isVisible());
await mb.locator('[data-testid=build-tab]').nth(1).tap();
const mc = mb.locator('[data-testid=build-card]').first();
await mc.tap();
check('mobile: tap a card arms placement', await M(() => window.__game.tool === 'module'));
const rect = () =>
	page.evaluate(() => {
		const r = (q) => {
			const b = document.querySelector(q)?.getBoundingClientRect();
			return b ? { x: b.left, y: b.top, width: b.width, height: b.height } : null;
		};
		return { top: r('[data-testid=hud-topbar]'), bar: r('[data-testid=build-bar]'), card: r('[data-testid=selection-card]'), sheet: r('.sheet, .mobile-sheet, aside.mobile'), w: innerWidth, h: innerHeight };
	});
const inside = (b, v) => b && b.x >= -1 && b.y >= -1 && b.x + b.width <= v.w + 1 && b.y + b.height <= v.h + 1;
let v = await rect();
check('mobile: top bar + build bar on screen, not overlapping', inside(v.top, v) && inside(v.bar, v) && !overlap(v.top, v.bar), v);
await page.screenshot({ path: 'screenshot-hud-mobile.png' });
await M(() => {
	const g = window.__game;
	g.tool = 'select';
	g.selectedUid = g.modules[0].uid;
});
await wait(500);
v = await rect();
check('mobile: selection card replaces the build bar (bottom sheet)', inside(v.card, v) && !v.bar && !overlap(v.card, v.top), v);
await page.screenshot({ path: '/tmp/hud-mobile-selected.png' });
check('no page errors', errors.length === 0, errors.slice(0, 3));
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
