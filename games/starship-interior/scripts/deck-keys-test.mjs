// Headless test: deck changes with Q/E (by KeyboardEvent.code) in build, walk and possessed modes,
// including an event whose `key` is Thai (Kedmanee layout: E key → 'ำ', Q key → 'ๆ') but code KeyE/KeyQ.
// Usage: node scripts/deck-keys-test.mjs [url]   (dev server running)
import { chromium } from 'playwright';

const URL = process.argv[2] ?? 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
let fails = 0;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, ok, info) => {
	if (!ok) fails++;
	console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info !== undefined ? ' ' + JSON.stringify(info) : ''}`);
};
async function until(page, fn, arg, ms = 45000) {
	const t0 = Date.now();
	for (;;) {
		const v = await page.evaluate(fn, arg);
		if (v || Date.now() - t0 > ms) return v;
		await wait(150);
	}
}
const thai = (page, code, key) =>
	page.evaluate(([code, key]) => {
		for (const type of ['keydown', 'keyup']) window.dispatchEvent(new KeyboardEvent(type, { key, code, bubbles: true }));
	}, [code, key]);

const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
page.setDefaultTimeout(90000);
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(URL, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__game && !!window.__crew);
await wait(1500);

// ---------- build mode ----------
await page.evaluate(() => { const g = window.__game; g.tool = 'select'; g.selectedUid = null; g.selectDeck(0); });
await page.keyboard.press('KeyE');
const b1 = await page.evaluate(() => window.__game.current);
await page.keyboard.press('KeyQ');
const b2 = await page.evaluate(() => window.__game.current);
await page.getByRole('button', { name: 'Deck up' }).click();
const b3 = await page.evaluate(() => window.__game.current);
await page.keyboard.press('PageDown');
const b4 = await page.evaluate(() => window.__game.current);
check('build: E / Q / ▲ button / PgDn switch the viewed deck', b1 === 1 && b2 === 0 && b3 === 1 && b4 === 0, { b1, b2, b3, b4 });
await page.evaluate(() => { const g = window.__game; g.tool = 'select'; g.selectedUid = g.decks[0].modules[0].uid; });
const a0 = await page.evaluate(() => window.__game.decks[0].modules[0].angle);
await page.keyboard.press('KeyE');
const a1 = await page.evaluate(() => [window.__game.decks[0].modules[0].angle, window.__game.current]);
check('build: E rotates when a module is selected (deck unchanged)', a1[0] !== a0 && a1[1] === 0, { a0, a1 });
await page.evaluate(() => { window.__game.selectedUid = null; });

// ---------- walk mode (gravity): the embodied avatar ----------
await page.getByRole('button', { name: '🚶 Walk', exact: true }).click(); // focus must not stay on the button
await page.waitForFunction(() => !!window.__walk && window.__game.mode === 'walk');
// the avatar moves in real time; pause the AI so nobody else is on the ladders (no waiting in this test)
await page.evaluate(() => { window.__crew.running = false; window.__game.quality = 'low'; });
await wait(800);
// far from any ladder: hint
await page.evaluate(() => { const g = window.__game; const s = g.shafts.find((x) => x.from === 0); window.__walk.face(s.x, s.z); });
const far = await page.evaluate(() => { const g = window.__game, s = g.shafts.find((x) => x.from === 0), p = window.__walk.pos(); return Math.hypot(p[0] - s.x, p[2] - s.z); });
if (far > 1.5) {
	await page.keyboard.press('Space'); // the avatar: Space = climb up → not at a ladder → hint + ring
	const hint = await page.evaluate(() => ({ toast: window.__game.toast, ring: !!window.__game.ladderHint }));
	check('walk: away from a ladder Space shows "Go to a ladder" + ring', /Go to a ladder/.test(hint.toast) && hint.ring, hint);
}
// walk to the ladder
await page.keyboard.down('KeyW');
const reached = await until(page, () => { const g = window.__game; return g.hatchHere.up; }, null, 20000);
await page.keyboard.up('KeyW');
await wait(400);
const prompt = await page.getByTestId('interact-prompt').textContent().catch(() => '');
check('walk: at the ladder the prompt offers "E  Climb up to Deck 2"', reached && /E\s+Climb up to Deck 2/.test(prompt ?? ''), { prompt });
await page.keyboard.press('KeyE');
const up = await until(page, () => window.__game.walkDeck === 1 && !window.__walk.climbing());
check('walk: KeyE climbs to the upper deck', !!up, { deck: await page.evaluate(() => window.__game.walkDeck) });
await page.keyboard.press('KeyQ');
const down = await until(page, () => window.__game.walkDeck === 0 && !window.__walk.climbing());
check('walk: KeyQ climbs back down', !!down, { deck: await page.evaluate(() => window.__game.walkDeck) });
// E follows the look direction: up, then look down + E comes back down
await page.keyboard.press('KeyE');
await until(page, () => window.__game.walkDeck === 1 && !window.__walk.climbing());
await page.evaluate(() => window.__walk.look(-1.0));
await wait(400);
const downPrompt = await page.getByTestId('interact-prompt').textContent().catch(() => '');
await page.keyboard.press('KeyE');
const downE = await until(page, () => window.__game.walkDeck === 0 && !window.__walk.climbing());
check('walk: looking down, E climbs down ("E  Climb down to Deck 1")', !!downE && /Climb down to Deck 1/.test(downPrompt ?? ''), { downPrompt });
await page.evaluate(() => window.__walk.look(0));
await thai(page, 'KeyE', 'ำ');
const up2 = await until(page, () => window.__game.walkDeck === 1 && !window.__walk.climbing());
await thai(page, 'KeyQ', 'ๆ');
const down2 = await until(page, () => window.__game.walkDeck === 0 && !window.__walk.climbing());
check('walk: Thai-layout events (key ำ / ๆ, code KeyE / KeyQ) climb', !!up2 && !!down2);
await page.getByRole('button', { name: 'Deck up' }).click();
const up3 = await until(page, () => window.__game.walkDeck === 1 && !window.__walk.climbing());
check('walk: on-screen ▲ button climbs (desktop)', !!up3);
await page.keyboard.press('KeyF');
await page.waitForFunction(() => window.__game.mode === 'build');

// ---------- possessed crew (gravity) ----------
await page.evaluate(() => { window.__crew.start(); window.__crew.running = false; });
await page.waitForFunction(() => window.__crew.agents.length > 0 && !!window.__crew.world);
await page.evaluate(() => {
	const c = window.__crew;
	const p = c.world.portals.find((x) => x.bottom.deck === 0);
	c.teleport(0, 0, p.bottom.x + 1.6, p.bottom.z + 0.4);
	c.possess(0);
});
await wait(500);
// walk (WASD) towards the ladder
const aim = () => page.evaluate(() => { const c = window.__crew, a = c.agents[0], p = c.world.portals.find((x) => x.bottom.deck === 0); c.input.yaw = Math.atan2(-(p.bottom.x - a.x), -(p.bottom.z - a.z)); });
await aim();
await page.keyboard.down('KeyW');
const near = await until(page, () => window.__crew.canClimb(true), null, 15000);
await page.keyboard.up('KeyW');
const pp = await until(page, () => { const p = window.__crew.ui.prompt; return p && /E\s+Climb up/.test(p) ? p : null; }, null, 8000);
check('possessed: near the ladder, prompt "E  Climb up to Deck 2"', !!near && /E\s+Climb up to Deck 2/.test(pp ?? ''), { pp });
// Shift+E opens the action list, Esc closes it without releasing the crew member
await page.keyboard.press('Shift+KeyE');
const menuOpen = await page.getByTestId('interact-menu').isVisible().catch(() => false);
const items = menuOpen ? await page.getByTestId('interact-menu').getByRole('menuitem').allTextContents() : [];
await page.keyboard.press('Escape');
await wait(200);
const menuClosed = !(await page.getByTestId('interact-menu').isVisible().catch(() => false));
check('possessed: Shift+E opens the action list, Esc closes it (still possessed)', menuOpen && items.some((t) => /Climb up/.test(t)) && menuClosed && (await page.evaluate(() => window.__crew.possessed)) === 0, { items });
// holding E 0.5 s also opens it (and does not climb) – with a choice of actions; a single action acts on key-down
const nActs = await page.evaluate(() => window.__crew.actions().length);
await page.keyboard.down('KeyE');
await wait(550);
await page.keyboard.up('KeyE');
const held = await page.getByTestId('interact-menu').isVisible().catch(() => false);
const stillDeck0 = await page.evaluate(() => window.__crew.agents[0].deck === 0 && window.__crew.agents[0].state !== 'move');
if (nActs > 1) {
	await page.keyboard.press('KeyE'); // E closes the list
	check('possessed: holding E opens the list instead of acting', held && stillDeck0, { held, stillDeck0, nActs });
	await wait(400);
	await page.keyboard.press('KeyE');
} else check('possessed: single action → E acts on key-down (no list)', !held && !stillDeck0, { held, stillDeck0, nActs });
// one retry: a press can land on a stalled software-rendered frame while the list is refreshing
if (!(await until(page, () => window.__crew.agents[0].state !== 'idle' || window.__crew.agents[0].deck === 1, null, 2000))) await page.keyboard.press('KeyE');
const pu = await until(page, () => { const a = window.__crew.agents[0]; return a.deck === 1 && a.state !== 'move'; }, null, 40000);
check('possessed: KeyE climbs to the upper deck (ladder in reach, facing it)', !!pu, await page.evaluate(() => window.__crew.agentSnapshot(0)));
await wait(400);
await page.keyboard.press('KeyQ');
const pd = await until(page, () => { const a = window.__crew.agents[0]; return a.deck === 0 && a.state !== 'move'; }, null, 40000);
check('possessed: KeyQ climbs back down', !!pd, await page.evaluate(() => window.__crew.agentSnapshot(0)));
await wait(400);
await thai(page, 'KeyE', 'ำ');
const pt = await until(page, () => { const a = window.__crew.agents[0]; return a.deck === 1 && a.state !== 'move'; }, null, 40000);
check('possessed: Thai-layout KeyE event climbs', !!pt);

// ---------- cruise: PgUp auto-fly ----------
await page.evaluate(() => { window.__crew.possess(null); window.__game.setMission('cruise'); });
await page.waitForFunction(() => !!window.__crew.vox && window.__crew.agents[0].m);
await page.evaluate(() => { const c = window.__crew; c.teleport(0, 0, 0.8, 0.8); c.possess(0); });
await wait(400);
await page.keyboard.press('PageUp');
const cf = await until(page, () => window.__crew.agents[0].deck === 1 && window.__crew.agents[0].state !== 'move', null, 90000);
check('cruise: PgUp auto-flies through the hatch to the next deck', !!cf, { deck: await page.evaluate(() => window.__crew.agents[0].deck) });
check('no console errors', errors.length === 0, errors.slice(0, 5));
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
