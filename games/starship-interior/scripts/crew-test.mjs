// Headless crew-simulation test (desktop + iPhone 13) with screenshots.
// Usage: node scripts/crew-test.mjs [url]   (dev server running; `npx playwright install chromium`)
import { chromium, devices } from 'playwright';
import { writeFileSync } from 'node:fs';

const URL = process.argv[2] ?? 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
const results = {};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const G = (page, fn, arg) => page.evaluate(fn, arg);
const check = (name, ok, info) => {
	results[name] = ok;
	console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info !== undefined ? ' ' + JSON.stringify(info) : ''}`);
};
async function prep(page) {
	page.setDefaultTimeout(90000);
	page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
	page.on('pageerror', (e) => errors.push(String(e)));
	await page.goto(URL, { waitUntil: 'networkidle' });
	await page.evaluate(() => localStorage.clear());
	await page.reload({ waitUntil: 'networkidle' });
	await page.waitForFunction(() => !!window.__crew && !!window.__game);
	await wait(2500);
}
/** poll fn in the page until it returns truthy (or timeout) */
async function until(page, fn, arg, ms = 40000, step = 400) {
	const t0 = Date.now();
	for (;;) {
		const v = await G(page, fn, arg);
		if (v || Date.now() - t0 > ms) return v;
		await wait(step);
	}
}
const ALL_FULL = (c, id) => { for (const n of ['energy', 'hunger', 'hygiene', 'bladder', 'fitness', 'fun', 'work', 'comfort']) c.setNeed(id, n, 100); };

// ---------------- desktop ----------------
{
	const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
	const page = await ctx.newPage();
	await prep(page);
	await page.getByRole('button', { name: /Start crew sim/ }).click();
	await page.waitForFunction(() => window.__crew.enabled && window.__crew.agents.length > 0);
	const n = await G(page, () => window.__crew.agents.length);
	check('crew spawned (crew count)', n === (await G(page, () => window.__game.crew)), { agents: n });
	await page.getByRole('button', { name: '16×' }).click();

	// 1) agents move
	const p0 = await G(page, () => window.__crew.agents.map((a) => [a.deck, a.x, a.z]));
	await wait(5000);
	const moved = await G(page, (p0) => window.__crew.agents.filter((a, i) => a.deck !== p0[i][0] || Math.hypot(a.x - p0[i][1], a.z - p0[i][2]) > 0.5).length, p0);
	check('agents move', moved >= 2, { moved });

	// 2) agents use equipment
	const using = await until(page, () => { const u = window.__crew.agents.filter((a) => a.state === 'use'); return u.length ? u.map((a) => a.action) : null; });
	check('agents use equipment', !!using, using);

	// 3) ladder climb between decks: tired crew member on deck 1, bunks are on decks 2/3
	await G(page, () => {
		const c = window.__crew;
		window.__climbSeen = false;
		const nav = c.world.navs[0];
		const [x, z] = nav.pt(nav.mainCell());
		c.teleport(0, 0, x, z);
		for (const n of ['energy', 'hunger', 'hygiene', 'bladder', 'fitness', 'fun', 'work', 'comfort']) c.setNeed(0, n, 100);
		c.setNeed(0, 'energy', 3);
		c.think(0);
		window.__climbWatch = setInterval(() => { if (c.agents[0].climbPhase === 1) window.__climbSeen = true; }, 50);
	});
	const climbed = await until(page, () => window.__climbSeen && window.__crew.agents[0].deck !== 0 && window.__crew.agents[0].climbPhase === 0 ? { deck: window.__crew.agents[0].deck, action: window.__crew.agents[0].action } : null, null, 60000);
	await G(page, () => clearInterval(window.__climbWatch));
	check('agent climbs a ladder between decks', !!climbed, climbed ?? (await G(page, () => window.__crew.agentSnapshot(0))));

	// 4) queue at a busy item: four crew on deck 1 all need the single toilet
	await G(page, (fullSrc) => {
		const c = window.__crew;
		const full = new Function('c', 'id', `(${fullSrc})(c, id)`);
		const nav = c.world.navs[0];
		const toilet = c.items.find((i) => i.deck === 0 && /Toilet/.test(i.label));
		window.__queueSeen = null;
		const ids = [1, 2, 3, 4].filter((i) => i < c.agents.length);
		ids.forEach((id, k) => {
			const s = toilet.slots[0];
			const cc = nav.nearestFree(s.ax + (k - 1.5) * 0.6, s.az + 0.8, 2);
			const [x, z] = nav.pt(cc >= 0 ? cc : nav.mainCell());
			c.teleport(id, 0, x, z);
			full(c, id);
			c.setNeed(id, 'bladder', 2 + k);
		});
		ids.forEach((id) => c.think(id));
		window.__queueWatch = setInterval(() => {
			for (const it of c.items) if (it.queue.length && !window.__queueSeen) window.__queueSeen = { item: it.label, deck: it.deck, queue: it.queue.map((q) => c.name(q)) };
		}, 50);
	}, ALL_FULL.toString());
	const queued = await until(page, () => window.__queueSeen, null, 40000);
	await G(page, () => clearInterval(window.__queueWatch));
	const qlog = await G(page, () => window.__crew.ui.log.find((l) => /waiting for/.test(l.text))?.text ?? null);
	check('crew queue at a busy item', !!queued, { queued, log: qlog });

	// screenshot: several crew doing different things, inspect card open (picked by clicking an avatar)
	await G(page, () => {
		const c = window.__crew;
		// let the toilet queue dissolve so the crew spread over different activities
		const want = ['hunger', 'fitness', 'fun', 'work', 'hygiene'];
		let k = 0;
		for (const a of c.agents) if (a.state === 'queue') { c.setNeed(a.id, 'bladder', 70); c.setNeed(a.id, want[k++ % want.length], 15); c.think(a.id); }
		window.__game.selectDeck(0);
		window.__game.tool = 'select'; // no placement ghost under the cursor in the screenshot
		window.__game.pending = null;
		c.speed = 16;
	});
	await wait(3000);
	await G(page, () => (window.__crew.speed = 4));
	await wait(1000);
	const pickId = await G(page, () => {
		const c = window.__crew;
		const vis = c.agents.filter((a) => a.deck === 0 && a.av.visible && !a.hidden).map((a) => a.id);
		return vis[0] ?? null;
	});
	let picked = false;
	if (pickId !== null) {
		const p = await G(page, (id) => window.__crewDebug.screenOf(id), pickId);
		await page.mouse.click(p.x, p.y);
		await wait(500);
		picked = (await G(page, () => window.__crew.selected)) !== null;
	}
	check('click avatar opens inspect card', picked && (await page.locator('[data-testid=agent-card]').count()) === 1, { pickId, selected: await G(page, () => window.__crew.selected), selectedUid: await G(page, () => window.__game.selectedUid) });
	await wait(800);
	const acts = await G(page, () => window.__crew.ui.agents.map((u) => `${u.name}: ${u.action} (${u.where})`));
	console.log('activities', JSON.stringify(acts));
	await page.screenshot({ path: 'screenshot-crew-sim.png' });

	// analytics + heat map after fast-forwarding
	await page.getByRole('button', { name: '60×' }).click();
	await wait(12000);
	await page.getByRole('button', { name: 'Heat map' }).click();
	await page.getByRole('button', { name: /Issues/ }).click();
	await G(page, () => { window.__crew.selected = null; window.__rig.animateTo({ az: 0.3, polar: 0.35, dist: 11 }, [0, window.__game.floorY[0], 0], 10); });
	await wait(2000);
	const an = await G(page, () => { const a = window.__crew.analytics(); return { simHours: +a.simHours.toFixed(1), items: a.items.length, used: a.items.filter((i) => i.uses > 0).length, withWait: a.items.filter((i) => i.waits > 0).map((i) => `${i.name} ${i.avgWait.toFixed(1)}min`), issues: a.issues.map((i) => i.text), ladders: a.ladders }; });
	check('analytics populated', an.items > 0 && an.used > 0, an);
	await page.screenshot({ path: 'screenshot-crew-heatmap.png' });
	const dl = page.waitForEvent('download');
	await page.getByRole('button', { name: /⬇ CSV/ }).click();
	const csvPath = await (await dl).path();
	const csv = (await import('node:fs')).readFileSync(csvPath, 'utf8');
	writeFileSync('samples/crew-sim-analytics.csv', csv);
	check('CSV export', /EQUIPMENT/.test(csv) && /DESIGN ISSUES/.test(csv), { bytes: csv.length });
	// strict capacity: 1 sim day at 60× (stepped synchronously) – no item ever has more users than places
	const cap = await G(page, () => {
		const c = window.__crew;
		const sp = c.speed, run = c.running;
		c.speed = 60;
		c.running = true;
		let worst = 0, maxUsers = 0;
		for (let i = 0; i < 1440 / 15; i++) {
			c.step(0.25);
			worst = Math.max(worst, c.overCapacity());
			for (const it of c.items) maxUsers = Math.max(maxUsers, c.agents.filter((a) => a.item === it && a.state === 'use').length);
		}
		c.speed = sp;
		c.running = run;
		return { worst, maxUsers, csvUtil: /utilization_pct/.test(c.csv()) };
	});
	check('60× for 1 sim day: no item ever exceeds its capacity', cap.worst === 0 && cap.csvUtil, cap);
	await page.getByRole('button', { name: 'Heat map' }).click();

	// 5) possession: take control, walk with W, interact prompt
	await page.getByRole('button', { name: '4×' }).click();
	const pid = await G(page, () => {
		const c = window.__crew;
		const a = c.agents.find((a) => a.deck === 0 && !a.hidden && a.state !== 'use') ?? c.agents[0];
		c.selected = a.id;
		return a.id;
	});
	await wait(400);
	await page.getByRole('button', { name: /Take control/ }).click();
	await wait(1500);
	const before = await G(page, (id) => ({ x: window.__crew.agents[id].x, z: window.__crew.agents[id].z, deck: window.__crew.agents[id].deck }), pid);
	// try each direction (a wall may block one); track the farthest point from the start
	let maxD = 0;
	for (const key of ['KeyW', 'KeyD', 'KeyS', 'KeyA']) {
		await page.keyboard.down(key);
		for (let i = 0; i < 4; i++) {
			await wait(300);
			const p = await G(page, (id) => ({ x: window.__crew.agents[id].x, z: window.__crew.agents[id].z }), pid);
			maxD = Math.max(maxD, Math.hypot(p.x - before.x, p.z - before.z));
		}
		await page.keyboard.up(key);
		if (maxD > 0.6) break;
	}
	const after = { possessed: await G(page, () => window.__crew.possessed) };
	const dist = maxD;
	check('possessed avatar moves with WASD', after.possessed === pid && dist > 0.4, { dist: +dist.toFixed(2) });
	// walk to the nearest interactable to show an "E: …" prompt
	await G(page, (id) => {
		const c = window.__crew;
		const a = c.agents[id];
		const it = c.items.find((i) => i.deck === a.deck && i.slots.some((s) => s.occ === null) && /Table|Galley|Locker/.test(i.label));
		if (it) { const s = it.slots.find((s) => s.occ === null); a.x = s.ax; a.z = s.az; c.input.yaw = Math.atan2(a.x - s.x, a.z - s.z); }
	}, pid);
	await wait(1500);
	const prompt = await G(page, () => window.__crew.ui.prompt);
	check('possession interact prompt', !!prompt && /^E\s+\S/.test(prompt), { prompt });
	await page.screenshot({ path: 'screenshot-crew-possess.png' });
	await page.keyboard.press('KeyE');
	await wait(800);
	const used = await G(page, (id) => window.__crew.agents[id].state, pid);
	check('possessed interact (E) uses equipment', used === 'use', { state: used });
	await page.getByRole('button', { name: 'Release', exact: true }).click();
	await wait(500);
	check('release hands back to AI', (await G(page, () => window.__crew.possessed)) === null);

	// launch phase: crew strap in
	const seatRes = await G(page, () => {
		const g = window.__game;
		const cur = g.current;
		g.selectDeck(1);
		g.setPhase('launch');
		const put = (type, x, z, rot) => { g.selectedModule = type; g.tool = 'module'; g.rotation = rot; return g.placeAt({ x, z }) || g.toast; };
		const r = { pilot: put('pilotcouch', 2.3, -1.2, 270), row3: put('couchrow3', 0, 2.2, 180) };
		g.tool = 'select';
		g.selectDeck(cur);
		return r;
	});
	console.log('launch seats placed', JSON.stringify(seatRes));
	const strapped = await until(page, () => { const c = window.__crew; const s = c.agents.filter((a) => a.state === 'strapped').length; return s >= Math.min(c.agents.length, window.__game.seats) ? s : null; }, null, 60000);
	const noseat = await G(page, () => window.__crew.ui.log.find((l) => /no couch/i.test(l.text))?.text ?? null);
	await G(page, () => { const g = window.__game; g.selectDeck(1); window.__rig.animateTo({ az: 0.55, polar: 0.82, dist: 6.4 }, [0.4, g.floorY[1] + 0.3, 0.6], 10); });
	await wait(2000);
	await page.screenshot({ path: 'screenshot-crew-launch.png' });
	check('launch phase: crew strap into couches', !!strapped && (await G(page, () => window.__game.seats)) > 0, { strapped, seats: await G(page, () => window.__game.seats), log: noseat });
	await G(page, () => window.__game.setPhase('surface'));

	// save includes roster + settings
	const save = await G(page, () => { window.__crew.roster[0].name = 'Cmdr Ada'; return window.__game.toJSON().crewSim; });
	check('save includes crew roster + settings', save?.roster?.[0]?.name === 'Cmdr Ada' && !!save.settings, { roster: save?.roster?.length });

	// performance: 12 agents on desktop – CPU cost of the sim step (rendering excluded)
	const perf = await G(page, () => {
		const g = window.__game, c = window.__crew;
		g.crew = 12;
		c.step(0.6); // roster sync spawns the extra agents
		c.speed = 16;
		c.running = true;
		const t0 = performance.now();
		for (let i = 0; i < 300; i++) c.step(1 / 60);
		return { agents: c.agents.length, msPerFrame: +((performance.now() - t0) / 300).toFixed(3) };
	});
	check('12 agents: sim step cost per frame < 4 ms (16×)', perf.agents === 12 && perf.msPerFrame < 4, perf);

	// launch couch side view with a 1.75 m silhouette + seated occupant
	await G(page, () => { window.__crew.stop(); window.__game.designer = true; });
	await wait(1500);
	await G(page, () => window.__equip.select('couch'));
	await page.waitForFunction(() => !!window.__equip.builtinParts.couch);
	await G(page, () => window.__equip.setView('side'));
	await wait(1800);
	await page.screenshot({ path: 'screenshot-couch-side.png' });
	await ctx.close();
}

// ---------------- mobile (iPhone 13) ----------------
{
	const ctx = await browser.newContext({ ...devices['iPhone 13'] });
	const page = await ctx.newPage();
	await prep(page);
	await page.getByRole('button', { name: 'Crew sim' }).tap();
	await page.getByRole('button', { name: /Start crew sim/ }).tap();
	await page.waitForFunction(() => window.__crew.enabled && window.__crew.agents.length > 0);
	await page.getByRole('button', { name: '16×' }).tap();
	await wait(5000);
	await page.getByRole('button', { name: 'Close crew sheet' }).tap();
	await G(page, () => window.__game.selectDeck(0));
	await wait(1500);
	await G(page, () => { const g = window.__game; g.tool = 'select'; g.pending = null; });
	await G(page, () => (window.__crew.running = false)); // freeze so the tap target does not walk away
	await wait(400);
	// centre the camera on a visible crew member on deck 1, then tap its avatar
	const id = await G(page, () => window.__crew.agents.find((a) => a.deck === 0 && a.av.visible && !a.hidden)?.id ?? null);
	let tapped = false;
	if (id !== null) {
		await G(page, (id) => { const a = window.__crew.agents[id]; window.__rig.animateTo({ az: 0.4, polar: 0.85, dist: 6.5 }, [a.x, window.__game.floorY[0], a.z], 10); }, id);
		await wait(1800);
		const p = await G(page, (id) => window.__crewDebug.screenOf(id), id);
		await page.touchscreen.tap(p.x, p.y);
		await wait(600);
		tapped = (await G(page, () => window.__crew.selected)) === id;
	}
	if (!tapped) await G(page, (id) => (window.__crew.selected = id ?? 0), id);
	check('mobile: tap avatar opens card', tapped, { id });
	// frame the selected crew member and the deck around them
	await G(page, (id) => { const a = window.__crew.agents[id ?? 0]; window.__rig.animateTo({ az: 0.4, polar: 0.85, dist: 6.5 }, [a.x * 0.5, window.__game.floorY[0], a.z * 0.5], 10); }, id);
	await wait(1500);
	await G(page, () => (window.__crew.running = true));
	await wait(800);
	await page.screenshot({ path: 'screenshot-mobile-crew.png' });
	check('mobile: tap does not ghost-click the card', (await G(page, () => window.__crew.possessed)) === null);
	await page.getByRole('button', { name: /Take control/ }).tap();
	await wait(1200);
	const joy = await page.locator('.joystick, [aria-label*="oystick"]').count();
	const sel = await G(page, () => window.__crew.possessed);
	const b = await G(page, (id) => ({ x: window.__crew.agents[id].x, z: window.__crew.agents[id].z }), sel);
	let a = b;
	for (const j of [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }]) {
		await G(page, (j) => (window.__game.joystick = j), j);
		await wait(1200);
		a = await G(page, (id) => ({ x: window.__crew.agents[id].x, z: window.__crew.agents[id].z }), sel);
		if (Math.hypot(a.x - b.x, a.z - b.z) > 0.5) break;
	}
	await G(page, () => (window.__game.joystick = { x: 0, y: 0 }));
	check('mobile: possessed avatar moves with joystick', Math.hypot(a.x - b.x, a.z - b.z) > 0.3, { joystickEls: joy, d: +Math.hypot(a.x - b.x, a.z - b.z).toFixed(2) });
	await page.screenshot({ path: 'screenshot-mobile-crew-possess.png' });
	await ctx.close();
}

await browser.close();
const failed = Object.entries(results).filter(([, v]) => !v).map(([k]) => k);
console.log(failed.length ? `FAILED: ${failed.join(', ')}` : `all ${Object.keys(results).length} crew checks passed`);
console.log(errors.length ? 'console errors:\n' + errors.join('\n') : 'no console errors');
process.exit(failed.length || errors.length ? 1 : 0);
