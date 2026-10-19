// Headless test: E = context interact in walk mode, possessed crew (gravity) and cruise, desktop + iPhone 13.
// Usage: node scripts/interact-test.mjs [url]   (dev server running)
import { chromium, devices } from 'playwright';

const URL = process.argv[2] ?? 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let fails = 0;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, ok, info) => {
	if (!ok) fails++;
	console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info !== undefined ? ' ' + JSON.stringify(info) : ''}`);
};
async function until(page, fn, arg, ms = 15000) {
	const t0 = Date.now();
	for (;;) {
		const v = await page.evaluate(fn, arg);
		if (v || Date.now() - t0 > ms) return v;
		await wait(150);
	}
}
async function open(ctxOpts) {
	const ctx = await browser.newContext(ctxOpts);
	const page = await ctx.newPage();
	page.setDefaultTimeout(90000);
	const errors = [];
	page.on('pageerror', (e) => errors.push(String(e)));
	page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
	await page.goto(URL, { waitUntil: 'networkidle' });
	await page.evaluate(() => localStorage.clear());
	await page.reload({ waitUntil: 'networkidle' });
	await page.waitForFunction(() => !!window.__game && !!window.__crew);
	await wait(1200);
	return { ctx, page, errors };
}
/** a free use-slot of a single-affordance item on deck 0, as {x,z,ax,az,label} */
const pickSlot = (page, re) =>
	page.evaluate((re) => {
		const c = window.__crew;
		const it = c.items.find((i) => i.deck === 0 && new RegExp(re).test(i.label) && i.slots.some((s) => s.occ === null) && !i.broken);
		if (!it) return null;
		const s = it.slots.find((s) => s.occ === null);
		return { x: s.x, z: s.z, ax: s.ax, az: s.az, label: it.label, key: it.key };
	}, re);

// ---------------- desktop ----------------
{
	const { ctx, page, errors } = await open({ viewport: { width: 1280, height: 800 } });
	// walk: sit on a chair / inspect equipment
	await page.evaluate(() => window.__game.selectDeck(0));
	await page.keyboard.press('KeyF');
	await page.waitForFunction(() => !!window.__walk && window.__game.mode === 'walk');
	const seat = await page.evaluate(() => {
		const g = window.__game;
		const m = g.decks[0].modules.find((x) => x.type === 'chair') ?? g.decks[0].modules.find((x) => /couch/.test(x.type));
		return m ? { x: m.x, z: m.z, type: m.type } : null;
	});
	if (seat) {
		// stand ~0.9 m away facing the seat (free spot on a ring)
		await page.evaluate((s) => {
			const w = window.__walk;
			for (let a = 0; a < Math.PI * 2; a += 0.3) {
				const x = s.x + Math.cos(a) * 0.9, z = s.z + Math.sin(a) * 0.9;
				w.place(x, z);
				const p = w.pos();
				if (Math.abs(p[0] - x) < 1e-6) { w.face(s.x, s.z); if (w.actions().some((l) => /^Sit/.test(l))) return; }
			}
		}, seat);
		await wait(400);
		const labels = await page.evaluate(() => window.__walk.actions());
		const y0 = await page.evaluate(() => window.__walk.pos()[1]);
		await page.keyboard.press('KeyE');
		await wait(300);
		const sat = await page.evaluate(() => ({ seated: window.__walk.seated(), y: window.__walk.pos()[1] }));
		check('walk: E on a chair/couch sits down (eye lowers)', /^Sit/.test(labels[0] ?? '') && sat.seated && sat.y < y0 - 0.3, { labels, y0, sat });
		const after = await page.evaluate(() => window.__walk.actions());
		await page.keyboard.press('KeyE');
		await wait(300);
		check('walk: E again stands up', /^Stand up/.test(after[0] ?? '') && !(await page.evaluate(() => window.__walk.seated())), { after });
		await page.keyboard.press('Shift+KeyE');
		const menu = await page.getByTestId('interact-menu').getByRole('menuitem').allTextContents().catch(() => []);
		const insp = menu.findIndex((t) => /Inspect/.test(t));
		if (insp >= 0) await page.keyboard.press(`Digit${insp + 1}`);
		await wait(200);
		const toast = await page.evaluate(() => window.__game.toast);
		check('walk: Shift+E lists actions; picking "Inspect" (digit) shows item info', insp >= 0 && /kg/.test(toast ?? ''), { menu, toast });
	} else console.log('SKIP walk sit (no chair/couch on deck 1)');
	await page.keyboard.press('KeyF');
	await page.waitForFunction(() => window.__game.mode === 'build');

	// possessed: E uses the item under the crosshair; X stops; item behind you is not picked
	await page.evaluate(() => { window.__crew.start(); window.__crew.running = false; });
	await page.waitForFunction(() => window.__crew.agents.length > 0 && !!window.__crew.world);
	const slot = await pickSlot(page, 'Locker|Galley|Water|Trash|Treadmill|Food');
	await page.evaluate((s) => {
		const c = window.__crew;
		c.teleport(0, 0, s.ax, s.az);
		c.possess(0);
		// face away first
		c.input.yaw = Math.atan2(s.x - s.ax, s.z - s.az);
	}, slot);
	await wait(600);
	const behind = await page.evaluate((key) => window.__crew.actions().filter((a) => !a.disabled).map((a) => a.label), slot.key);
	await page.evaluate((s) => { window.__crew.input.yaw = Math.atan2(-(s.x - s.ax), -(s.z - s.az)); }, slot);
	await wait(600);
	const front = await page.evaluate(() => window.__crew.actions().map((a) => a.label));
	check('possessed: the faced item is the primary action', front.length > 0 && front[0].includes(slot.label), { item: slot.label, front, behind });
	const prompt = await page.getByTestId('interact-prompt').textContent();
	await page.keyboard.press('KeyE');
	await wait(500);
	const st = await page.evaluate(() => ({ state: window.__crew.agents[0].state, item: window.__crew.agents[0].item?.label }));
	check('possessed: E uses it; HUD prompt "E  …" names it', st.state === 'use' && st.item === slot.label && prompt.includes(slot.label), { st, prompt });
	const stopLabel = await page.evaluate(() => window.__crew.actions()[0]?.label);
	await page.keyboard.press('KeyX');
	await wait(300);
	const st2 = await page.evaluate(() => window.__crew.agents[0].state);
	check('possessed: while using, E offers "Stop: …"; X stops the activity', /^Stop/.test(stopLabel ?? '') && st2 !== 'use', { stopLabel, st2 });
	await page.keyboard.press('Escape');
	await wait(300);
	check('Esc releases possession', (await page.evaluate(() => window.__crew.possessed)) === null);

	// cruise: E near a hatch flies through it; Z/C roll; T reorient
	await page.evaluate(() => window.__game.setMission('cruise'));
	await page.waitForFunction(() => !!window.__crew.vox && window.__crew.agents[0].m);
	await page.evaluate(() => {
		const c = window.__crew, g = window.__game;
		const s = g.shafts.find((x) => x.from === 0);
		c.teleport(0, 0, s.x + 0.6, s.z + 0.3);
		c.possess(0);
	});
	await wait(500);
	const cl = await page.evaluate(() => window.__crew.actions().map((a) => a.label));
	const q0 = await page.evaluate(() => window.__crew.agents[0].m.q.toArray());
	await page.keyboard.down('KeyZ');
	await wait(2200);
	await page.keyboard.up('KeyZ');
	const q1 = await page.evaluate(() => window.__crew.agents[0].m.q.toArray());
	const dq = Math.abs(q0.reduce((s, v, i) => s + v * q1[i], 0));
	check('cruise: Z rolls the body (E no longer rolls)', 2 * Math.acos(Math.min(1, dq)) > 0.25, { deg: Math.round((2 * Math.acos(Math.min(1, dq)) * 180) / Math.PI) });
	const hatchIdx = cl.findIndex((l) => /hatch to Deck 2/.test(l));
	if (hatchIdx === 0) await page.keyboard.press('KeyE');
	else if (hatchIdx > 0) { await page.keyboard.press('Shift+KeyE'); await page.keyboard.press(`Digit${hatchIdx + 1}`); }
	const flew = await until(page, () => window.__crew.agents[0].deck === 1 && window.__crew.agents[0].state !== 'move', null, 40000);
	check('cruise: E offers "Fly through hatch to Deck 2" and flies there', hatchIdx >= 0 && !!flew, { cl });
	check('desktop: no page errors', errors.length === 0, errors.slice(0, 5));
	await ctx.close();
}

// ---------------- mobile (iPhone 13) ----------------
{
	const { ctx, page, errors } = await open({ ...devices['iPhone 13'] });
	await page.evaluate(() => { window.__crew.start(); window.__crew.running = false; window.__game.isTouch = true; });
	await page.waitForFunction(() => window.__crew.agents.length > 0 && !!window.__crew.world);
	const slot = await pickSlot(page, 'Locker|Galley|Water|Trash|Treadmill|Food');
	await page.evaluate((s) => {
		const c = window.__crew;
		c.teleport(0, 0, s.ax, s.az);
		c.possess(0);
		c.input.yaw = Math.atan2(-(s.x - s.ax), -(s.z - s.az));
	}, slot);
	await wait(800);
	const btn = page.getByTestId('interact-btn');
	const label = await btn.textContent();
	await btn.tap();
	await wait(500);
	const st = await page.evaluate(() => window.__crew.agents[0].state);
	check('mobile: the Interact button shows the action and tapping uses it', /Interact/.test(label) && label.includes(slot.label) && st === 'use', { label, st });
	await page.screenshot({ path: 'screenshot-mobile-interact.png' });
	// hold → list
	const box = await btn.boundingBox();
	await page.evaluate(() => window.__crew.stopAction());
	await wait(300);
	const cdp = await ctx.newCDPSession(page);
	const pt = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
	await wait(600);
	const mid = await page.getByTestId('interact-menu').isVisible().catch(() => false);
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	await wait(200);
	const menu = await page.getByTestId('interact-menu').isVisible().catch(() => false);
	check('mobile: holding the Interact button opens the action list', menu, { mid, list: await page.evaluate(() => window.__crew.actions().map((a) => a.label)) });
	check('mobile: no page errors', errors.length === 0, errors.slice(0, 5));
	await ctx.close();
}
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
