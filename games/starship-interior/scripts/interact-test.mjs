// Headless test: E = context interact. Walk mode embodies a crew member (avatar walks to the use point, sits, needs
// change, ladder walk+climb), possessed crew (gravity) and cruise, desktop + iPhone 13. Screenshot: screenshot-walk-use.png
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
	// walk = embodied avatar: F takes over a crew member (3rd person), E walks to the use point and uses it
	await page.evaluate(() => { window.__game.selectDeck(0); window.__game.quality = 'low'; });
	await page.keyboard.press('KeyF');
	await page.waitForFunction(() => !!window.__walk?.avatar && window.__game.mode === 'walk');
	const emb = await page.evaluate(() => ({ embodied: window.__crew.embodied, id: window.__crew.possessed, fp: window.__crew.firstPerson, sim: window.__crew.enabled }));
	check('walk: F embodies a crew member as your avatar (3rd person, sim on)', emb.embodied && emb.id !== null && emb.fp === false && emb.sim, emb);
	await page.evaluate(() => (window.__crew.running = false));
	// stand 2–2.6 m from a free galley-table chair, facing it
	const seat = await page.evaluate(() => {
		const c = window.__crew, id = c.possessed, nav = c.world.navs[0];
		const it = c.items.find((i) => i.deck === 0 && /Galley Table|Table/.test(i.label) && i.slots.some((s) => s.occ === null));
		if (!it) return null;
		const k = it.slots.findIndex((s) => s.occ === null), s = it.slots[k];
		for (let r = 2.6; r >= 1.9; r -= 0.1)
			for (let a = 0; a < 6.28; a += 0.15) {
				const x = s.ax + Math.cos(a) * r, z = s.az + Math.sin(a) * r;
				if (!nav.isFree(x, z)) continue;
				c.teleport(id, 0, x, z);
				window.__walk.face(s.x, s.z);
				if (window.__walk.actions().some((l) => /^Sit – Meal at table/.test(l))) return { label: it.label, key: it.key, r };
			}
		return null;
	});
	const all = await page.evaluate(() => window.__walk.actions());
	check('walk: E never means Inspect', !all.some((l) => /Inspect/i.test(l)), all);
	if (seat) {
		const idx = all.findIndex((l) => /^Sit – Meal at table/.test(l));
		if (idx === 0) await page.keyboard.press('KeyE');
		else {
			await page.keyboard.press('Shift+KeyE');
			await page.keyboard.press(`Digit${idx + 1}`);
		}
		await wait(400);
		const going = await page.evaluate(() => window.__walk.info());
		const status = await until(page, () => document.querySelector('[data-testid=interact-status]')?.textContent ?? '', null, 5000);
		check('walk: E on a chair 2+ m away → avatar walks there ("Walking to … (move to cancel)")', going.state === 'move' && /Walking to .*Table.*move to cancel/.test(status), { going: going.state, status, r: seat.r });
		await until(page, () => window.__walk.info().state !== 'move', null, 90000);
		await wait(1500); // settle (dock blend)
		const end = await page.evaluate(() => {
			const c = window.__crew, a = c.agents[c.possessed], s = a.item?.slots[a.slot];
			const dyaw = s ? Math.abs(Math.atan2(Math.sin(a.av.yaw - s.yaw), Math.cos(a.av.yaw - s.yaw))) : 9;
			return { state: a.state, pose: a.av.pose, item: a.item?.label, d: s ? Math.hypot(a.av.x - s.x, a.av.z - s.z) : 9, dyaw: (dyaw * 180) / Math.PI, hunger: a.needs.hunger };
		});
		check('walk: avatar ends at the chair (≤ 5 cm, ≤ 10°), state = using, eat pose', end.state === 'use' && end.item === seat.label && end.d <= 0.05 && end.dyaw <= 10 && end.pose === 'eat', end);
		await page.evaluate(() => window.__walk.look(-0.55));
		await wait(1200);
		await page.screenshot({ path: 'screenshot-walk-use.png' }); // avatar seated at the galley table
		await page.evaluate(() => { window.__crew.speed = 16; window.__crew.running = true; });
		await wait(2500);
		const h1 = await page.evaluate(() => window.__crew.agents[window.__crew.possessed].needs.hunger);
		await page.evaluate(() => (window.__crew.running = false));
		check('walk: the meal raises hunger while seated (item rates apply)', h1 > end.hunger + 1, { before: end.hunger, after: h1 });
		await page.keyboard.down('KeyW');
		await wait(700);
		await page.keyboard.up('KeyW');
		const up = await page.evaluate(() => window.__walk.info());
		check('walk: a movement key stands the avatar up', up.state === 'idle' && up.item === null, up);
	} else console.log('SKIP walk-to-use (no free table chair on deck 1)');
	// ladder: E walks to the ladder base, then climbs (animation) to the next deck
	const lad = await page.evaluate(() => {
		const c = window.__crew, id = c.possessed, p = c.world.portals.find((q) => q.bottom.deck === 0);
		if (!p) return null;
		const nav = c.world.navs[0];
		for (let r = 1.3; r >= 0.6; r -= 0.1)
			for (let a = 0; a < 6.28; a += 0.2) {
				const x = p.bottom.x + Math.cos(a) * r, z = p.bottom.z + Math.sin(a) * r;
				if (!nav.isFree(x, z)) continue;
				c.teleport(id, 0, x, z);
				window.__walk.face(p.shaft.x, p.shaft.z);
				window.__walk.look(0.3);
				if (/^Climb up/.test(window.__walk.actions()[0] ?? '')) return { to: p.top.deck, d: Math.hypot(x - p.bottom.x, z - p.bottom.z) };
			}
		return null;
	});
	if (lad) {
		await page.evaluate(() => (window.__crew.running = true)); // a crew member already on the ladder must be able to finish
		await page.keyboard.press('KeyE');
		await wait(300);
		if (await page.getByTestId('interact-menu').isVisible().catch(() => false)) await page.keyboard.press('Digit1'); // slow frame → read as a hold
		// one retry: on a stalled software-rendered frame the press can land before the HUD list refreshed
		if (!(await until(page, () => window.__walk.info().state !== 'idle', null, 1500))) {
			await page.keyboard.press('KeyE');
			await wait(300);
			if (await page.getByTestId('interact-menu').isVisible().catch(() => false)) await page.keyboard.press('Digit1');
		}
		const climbing = await until(page, () => window.__walk.climbing(), null, 8000);
		const arrived = await until(page, (to) => window.__walk.info().deck === to && window.__walk.info().state === 'idle', lad.to, 60000);
		check('walk: E at a ladder (≤ 1.5 m) walks to its base and climbs to the next deck', !!climbing && !!arrived, { lad, climbing, info: await page.evaluate(() => window.__walk.info()) });
		await page.evaluate(() => (window.__crew.running = false));
	} else console.log('SKIP ladder climb (no ladder from deck 1)');
	await page.keyboard.press('KeyF');
	await page.waitForFunction(() => window.__game.mode === 'build');
	check('walk: F back to build releases the avatar (and stops the sim walk mode started)', await page.evaluate(() => window.__crew.possessed === null && !window.__crew.embodied && !window.__crew.enabled));

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
