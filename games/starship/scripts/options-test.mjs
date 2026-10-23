// Options menu: ⚙ opens it, tabs switch, settings change and persist across reload, Controls page lists E interact,
// search filter, sim pauses while open (and resumes), Esc / F10 / O open & close rules, mobile full-screen layout.
// Screenshots: screenshot-options-controls.png, screenshot-mobile-options.png. Usage: node scripts/options-test.mjs [url]
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
	await page.waitForFunction(() => !!window.__crew && !!window.__game && !!window.__options);
	return page;
}

// ---------- desktop ----------
let page = await open({ viewport: { width: 1440, height: 900 } });
const G = (fn, a) => page.evaluate(fn, a);
const menu = page.locator('[data-testid=options-menu]');
await G(() => window.__crew.start());
await page.locator('[data-testid=options-btn]').click();
await menu.waitFor();
check('⚙ opens the Options menu on the Controls page', (await menu.isVisible()) && (await page.locator('[data-testid=opt-page-controls]').isVisible()));
check('sim paused while the menu is open', await G(() => window.__crew.running === false));
const eRow = page.locator('[data-testid=ctl-group-walk] [data-testid=binding]').filter({ has: page.locator('kbd', { hasText: /^E$/ }) }).filter({ hasText: 'Interact' });
check('Controls page lists E interact (walk)', (await eRow.count()) >= 1);
const groups = await page.locator('[data-testid^=ctl-group-]').evaluateAll((els) => els.map((e) => e.dataset.testid.replace('ctl-group-', '')));
check('Controls grouped by mode', ['build', 'walk', 'crew', 'cruise', 'designer', 'camera', 'touch'].every((g) => groups.includes(g)), groups);
check('desktop lists keyboard groups before touch', groups.indexOf('build') < groups.indexOf('touch'), groups);
await page.screenshot({ path: 'screenshot-options-controls.png' });
await page.locator('[data-testid=options-search]').fill('climb');
const filtered = await page.locator('[data-testid=binding]').count();
check('search filter narrows the list', filtered > 0 && filtered < 15 && (await page.locator('[data-testid=binding]').allInnerTexts()).every((t) => /climb/i.test(t)), { filtered });
// game keys must not leak through while the menu is open
const deck0 = await G(() => window.__game.current);
const tool0 = await G(() => window.__game.tool);
await page.locator('[data-testid=options-search]').fill('');
await page.locator('[data-testid=opt-tab-graphics]').click();
check('switch to Graphics tab', await page.locator('[data-testid=opt-page-graphics]').isVisible());
await page.keyboard.press('KeyE');
await page.keyboard.press('Digit3');
check('game keys are swallowed while the menu is open', (await G(() => window.__game.current)) === deck0 && (await G(() => window.__game.tool)) === tool0);
await page.locator('[data-testid=opt-guides]').click();
await page.locator('[data-testid=opt-quality-low]').click();
check('Graphics: guides off + quality low applied', await G(() => window.__game.guides === false && window.__game.quality === 'low'));
await page.locator('[data-testid=opt-tab-simulation]').click();
await page.locator('[data-testid=opt-speed-16]').click();
await page.locator('[data-testid=opt-seed-fixed]').click();
await page.locator('[data-testid=opt-seed]').fill('1234');
check('Simulation: speed 16× and seed 1234', await G(() => window.__crew.speed === 16 && window.__options.seed === 1234 && window.__crew.seedOnStart === 1234));
await page.locator('[data-testid=opt-keep-running]').click();
check('Keep running resumes the sim while open', await G(() => window.__crew.running === true));
await page.locator('[data-testid=opt-keep-running]').click();
check('Keep running off pauses it again', await G(() => window.__crew.running === false));
await page.locator('[data-testid=opt-tab-gameplay]').click();
await page.locator('[data-testid=opt-snap]').click();
check('Building: snap on', await G(() => window.__game.snap === true));
await page.locator('[data-testid=opt-tab-about]').click();
const about = await page.locator('[data-testid=opt-page-about]').innerText();
check('About: disclaimer, sources doc and version', /Concept-planning/.test(about) && /starship-reference\.md/.test(about) && /Version \d/.test(about), about.slice(0, 120));
await page.keyboard.press('Escape');
await wait(200);
check('Esc closes the menu and the sim resumes', !(await menu.isVisible()) && (await G(() => window.__crew.running === true)));

// Esc rules in build mode
await G(() => (window.__game.pending = null));
await G(() => { const g = window.__game; g.tool = 'select'; g.selectedUid = g.modules[0].uid; });
await page.keyboard.press('Escape');
check('Esc with a selection only deselects', !(await menu.isVisible()) && (await G(() => window.__game.selectedUid === null)));
await G(() => { window.__game.tool = 'module'; window.__game.selectedModule = 'locker'; });
await page.keyboard.press('Escape');
check('Esc in Place tool returns to Select (no menu)', !(await menu.isVisible()) && (await G(() => window.__game.tool === 'select')));
await page.keyboard.press('Escape');
check('Esc when idle in Select opens the menu', await menu.isVisible());
await page.keyboard.press('KeyO');
check('O closes it', !(await menu.isVisible()));
await page.keyboard.press('F10');
check('F10 opens it', await menu.isVisible());
await page.keyboard.press('F10');
// walk mode: Esc does not open the menu, O does
await page.keyboard.press('KeyF');
await page.waitForFunction(() => window.__game.mode === 'walk');
await page.keyboard.press('Escape');
check('walk: Esc does not open the menu', !(await menu.isVisible()));
await page.keyboard.press('KeyO');
check('walk: O opens the menu', await menu.isVisible());
await page.keyboard.press('Escape');
await page.keyboard.press('KeyF');

// persistence
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__options);
const kept = await G(() => ({ guides: window.__game.guides, quality: window.__game.quality, snap: window.__game.snap, speed: window.__crew.speed, seed: window.__options.seed }));
check('settings persist across reload', kept.guides === false && kept.quality === 'low' && kept.snap === true && kept.speed === 16 && kept.seed === 1234, kept);
await page.locator('[data-testid=options-btn]').click();
await page.locator('[data-testid=opt-tab-graphics]').click();
check('persisted toggle shows in the menu after reload', (await page.locator('[data-testid=opt-guides]').isChecked()) === false);
await page.locator('[data-testid=opt-tab-about]').click();
page.once('dialog', (d) => d.accept());
await page.locator('[data-testid=opt-reset]').click();
check('reset restores defaults', await G(() => window.__game.guides === true && window.__game.quality === 'high' && window.__options.seed === null));
await page.close();

// ---------- mobile ----------
page = await open({ ...devices['iPhone 13'] });
await page.locator('[data-testid=hud-topbar] [data-testid=options-btn]').tap();
await page.locator('[data-testid=options-menu]').waitFor();
const box = await page.locator('[data-testid=options-menu]').boundingBox();
const vp = page.viewportSize();
check('mobile: menu is full screen', box && box.width >= vp.width - 1 && box.height >= vp.height - 1, { box, vp });
const tabsBox = await page.locator('[data-testid=opt-tab-controls]').boundingBox();
const tabsBox2 = await page.locator('[data-testid=opt-tab-graphics]').boundingBox();
check('mobile: tabs are a top row', tabsBox && tabsBox2 && Math.abs(tabsBox.y - tabsBox2.y) < 2 && tabsBox.y < 140, { tabsBox, tabsBox2 });
const mg = await page.locator('[data-testid^=ctl-group-]').evaluateAll((els) => els.map((e) => e.dataset.testid.replace('ctl-group-', '')));
check('mobile: Controls page shows touch gestures first', mg[0] === 'touch', mg);
await page.screenshot({ path: 'screenshot-mobile-options.png' });
await page.locator('[data-testid=opt-tab-gameplay]').tap();
await page.locator('[data-testid=opt-2f-pan]').tap();
check('mobile: change 2-finger mode', await page.evaluate(() => window.__game.twoFingerMode === 'pan'));
await page.locator('[data-testid=options-close]').tap();
check('mobile: ✕ closes', !(await page.locator('[data-testid=options-menu]').isVisible()));

check('no page errors', errors.length === 0, errors.slice(0, 3));
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
