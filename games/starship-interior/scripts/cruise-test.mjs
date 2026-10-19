// Short headless test of the Cruise (micro-g) phase + screenshots.
// Usage: node scripts/cruise-test.mjs [url]   (dev server running)
import { chromium, devices } from 'playwright';

const URL = process.argv[2] ?? 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
let fails = 0;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, ok, info) => {
	if (!ok) fails++;
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
	await wait(2000);
}
async function until(page, fn, arg, ms = 40000) {
	const t0 = Date.now();
	for (;;) {
		const v = await page.evaluate(fn, arg);
		if (v || Date.now() - t0 > ms) return v;
		await wait(400);
	}
}


/** orient the possessed body: face the deck centre, look down a bit, rolled (for a readable tilted POV shot) */
const tiltPOV = (page, id) => page.evaluate((id) => {
	const a = window.__crew.agents[id], g = window.__game;
	const m = a.m;
	const mul = (p, q) => [p[3] * q[0] + p[0] * q[3] + p[1] * q[2] - p[2] * q[1], p[3] * q[1] - p[0] * q[2] + p[1] * q[3] + p[2] * q[0], p[3] * q[2] + p[0] * q[1] - p[1] * q[0] + p[2] * q[3], p[3] * q[3] - p[0] * q[0] - p[1] * q[1] - p[2] * q[2]];
	const ax = (x, y, z, t) => [x * Math.sin(t / 2), y * Math.sin(t / 2), z * Math.sin(t / 2), Math.cos(t / 2)];
	m.p.set(m.p.x, g.floorY[a.deck] + 1.45, m.p.z);
	const yaw = Math.atan2(-m.p.x, -m.p.z);
	const q = mul(mul(ax(0, 1, 0, yaw), ax(1, 0, 0, 0.45)), ax(0, 0, 1, 0.5));
	m.q.set(q[0], q[1], q[2], q[3]);
	m.v.set(0, 0, 0);
}, id);

// ---------------- desktop ----------------
{
	const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const page = await ctx.newPage();
	await prep(page);
	// micro-g furniture on deck 2: wall sleeping bags, handrails, zero-g toilet
	const placed = await page.evaluate(() => {
		const g = window.__game;
		g.selectDeck(1);
		const out = [];
		const put = (type, x, z, rot, mode, h) => {
			g.selectedModule = type;
			g.tool = 'module';
			g.rotation = rot;
			g.mountMode = mode;
			if (h !== undefined) g.mountHeight = h;
			const ok = g.placeAt({ x, z });
			const m = g.decks[1].modules.at(-1);
			out.push({ type, ok, mount: m?.mount ?? 'floor', y: m?.y ?? 0, a: m?.angle });
		};
		put('sleepingbag', -4.4, 0.6, 0, 'wall', 0.2);
		put('sleepingbag', -4.3, -0.4, 0, 'wall', 0.2);
		put('handrail', -4.3, 1.6, 0, 'wall', 1.2);
		put('handrail', -1.0, -3.0, 0, 'ceiling');
		g.mountMode = 'floor';
		for (const [x, z] of [[3.2, -2.6], [2.6, 2.8], [-2.8, -2.8], [-1.5, 3.2], [3.4, 0.5], [0.5, -3.4]]) {
			const n = g.decks[1].modules.length;
			put('zerogtoilet', x, z, (Math.atan2(-x, -z) * 180) / Math.PI, 'floor');
			if (g.decks[1].modules.length > n) break;
			out.pop();
		}
		g.mountMode = 'floor';
		g.tool = 'select';
		return out;
	});
	check('wall-mount placement (sleeping bag snaps to hull, raised)', placed[0].ok && placed[0].mount === 'wall' && placed[0].y > 0.1, placed);
	check('ceiling mount placement', placed.some((p) => p.type === 'handrail' && p.mount === 'ceiling' && p.y > 2), placed[3]);
	await page.evaluate(() => window.__rig.animateTo({ az: 1.2, polar: 0.95, dist: 6.5 }));
	await wait(2500);
	await page.screenshot({ path: 'screenshot-wall-mount.png' });

	// switch to Cruise
	await page.getByRole('button', { name: /Start crew sim/ }).click();
	await page.getByRole('button', { name: /Cruise/ }).first().click();
	await page.waitForFunction(() => !!window.__crew.vox && window.__game.microG);
	check('mission = cruise (micro-g)', await page.evaluate(() => window.__game.mission === 'cruise'));
	await page.getByRole('button', { name: '16×' }).click();
	// content crew: let them drift / float around
	await page.evaluate(() => {
		const c = window.__crew;
		for (const a of c.agents) for (const n of ['energy', 'hunger', 'hygiene', 'bladder', 'fitness', 'fun', 'work', 'comfort']) c.setNeed(a.id, n, 100);
		for (const a of c.agents) c.think(a.id);
	});
	await wait(5000);
	const fl = await page.evaluate(() => {
		const c = window.__crew, g = window.__game;
		const fa = c.agents.filter((a) => a.av.q && !a.hidden);
		const lifted = fa.filter((a) => a.av.y - g.floorY[a.deck] > 0.5).length;
		let maxAng = 0;
		for (let i = 0; i < fa.length; i++)
			for (let j = i + 1; j < fa.length; j++) {
				const p = fa[i].av.q, q = fa[j].av.q;
				const dot = Math.abs(p[0] * q[0] + p[1] * q[1] + p[2] * q[2] + p[3] * q[3]);
				maxAng = Math.max(maxAng, 2 * Math.acos(Math.min(1, dot)));
			}
		const ups = fa.map((a) => { const [x, y, z, w] = a.av.q; return +(1 - 2 * (x * x + z * z)).toFixed(2); });
		return { floating: fa.length, lifted, maxAngDeg: Math.round((maxAng * 180) / Math.PI), ups };
	});
	check('crew float (off the floor)', fl.lifted >= 2, fl);
	check('orientations vary', fl.maxAngDeg > 30, { maxAngDeg: fl.maxAngDeg });

	// hatch passage: agent 0 from deck 1 → deck 3 centre
	const route = await page.evaluate(() => {
		const c = window.__crew, g = window.__game;
		c.teleport(0, 0, 0.8, 0.8);
		const ok = c.flyTo(0, 0, g.floorY[2] + 1.05, 0);
		return { ok, passes: [...c.hatchStats.values()].reduce((s, h) => s + h.passes, 0) };
	});
	const reached = await until(page, (p0) => { const c = window.__crew; const a = c.agents[0]; const passes = [...c.hatchStats.values()].reduce((s, h) => s + h.passes, 0); return a.deck === 2 && passes >= p0 + 2 ? { deck: a.deck, passes } : null; }, route.passes, 60000);
	check('agent flies through hatches between decks', route.ok && !!reached, { route, reached });

	// crew screenshot: deck with most floating crew
	await page.evaluate(() => {
		const c = window.__crew, g = window.__game;
		const cnt = g.decks.map((_, k) => c.agents.filter((a) => a.deck === k && a.av.visible).length);
		g.selectDeck(cnt.indexOf(Math.max(...cnt)));
		g.tool = 'select';
		window.__rig.animateTo({ az: 0.5, polar: 1.05, dist: 6.2 });
	});
	await wait(3000);
	await page.screenshot({ path: 'screenshot-cruise-crew.png' });

	// possession 6-DOF
	await page.getByRole('button', { name: '1×' }).click();
	await page.evaluate(() => { window.__crew.teleport(1, 1, 0.5, 1.5); window.__crew.possess(1); window.__crew.agents[1].m.p.y = window.__game.floorY[1] + 0.55; });
	await page.keyboard.press('KeyZ'); // reorient to deck-up (feet near the floor → can push off)
	await wait(1500);
	const st = () => page.evaluate(() => { const a = window.__crew.agents[1]; return { p: a.m.p.toArray(), q: a.m.q.toArray(), fp: window.__crew.firstPerson }; });
	const s0 = await st();
	await page.keyboard.down('KeyR');
	await page.keyboard.down('KeyW');
	await wait(1600);
	await page.keyboard.up('KeyW');
	await page.keyboard.up('KeyR');
	await page.keyboard.down('KeyE');
	await wait(2200);
	await page.keyboard.up('KeyE');
	await page.mouse.move(800, 450);
	await page.mouse.down();
	await page.mouse.move(760, 420, { steps: 6 });
	await page.mouse.up();
	await page.keyboard.press('KeyG');
	await wait(600);
	const s1 = await st();
	const moved = Math.hypot(s1.p[0] - s0.p[0], s1.p[1] - s0.p[1], s1.p[2] - s0.p[2]);
	const dq = Math.abs(s0.q.reduce((s, v, i) => s + v * s1.q[i], 0));
	const rollDeg = Math.round(2 * Math.acos(Math.min(1, dq)) * 180 / Math.PI);
	check('possession: 6-DOF translate (push-off + coast)', moved > 0.2, { moved: +moved.toFixed(2) });
	check('possession: roll / look rotates the body', rollDeg > 20, { rollDeg, firstPerson: s1.fp });
	await page.evaluate(() => window.__crew.teleport(1, 1, 2.2, 2.2));
	await tiltPOV(page, 1);
	await wait(1500);
	await page.screenshot({ path: 'screenshot-cruise-possess.png' });
	const rep = await page.evaluate(() => window.__crew.analytics().micro);
	check('cruise analytics available', rep && typeof rep.coveragePct === 'number' && rep.hatches.length > 0, { trips: rep.trips, cov: Math.round(rep.coveragePct), toilet: rep.toilet, exercise: rep.exercise, unusable: rep.unusable.length });
	await ctx.close();
}

// ---------------- mobile ----------------
{
	const ctx = await browser.newContext({ ...devices['iPhone 13'] });
	const page = await ctx.newPage();
	await prep(page);
	await page.evaluate(() => { window.__crew.start(); window.__game.setMission('cruise'); });
	await page.waitForFunction(() => !!window.__crew.vox);
	await page.evaluate(() => { window.__crew.teleport(0, 1, 0.5, 1.5); window.__crew.possess(0); });
	await wait(1500);
	const vis = {};
	for (const n of ['Move up', 'Move down', 'Roll left', 'Roll right', 'Grab', 'Reorient to deck up', 'Release']) vis[n] = await page.getByRole('button', { name: n }).isVisible();
	check('mobile micro-g controls', Object.values(vis).every(Boolean), vis);
	const q0 = await page.evaluate(() => window.__crew.agents[0].m.q.toArray());
	const b = await page.getByRole('button', { name: 'Roll right' }).boundingBox();
	await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
	await page.mouse.down();
	await wait(800);
	await page.mouse.up();
	const q1 = await page.evaluate(() => window.__crew.agents[0].m.q.toArray());
	check('mobile roll button rolls', Math.abs(q0.reduce((s, v, i) => s + v * q1[i], 0)) < 0.995);
	await page.evaluate(() => window.__crew.teleport(0, 1, 2.2, 2.2));
	await tiltPOV(page, 0);
	await wait(1500);
	await page.screenshot({ path: 'screenshot-mobile-cruise.png' });
	await ctx.close();
}
check('no console errors', errors.length === 0, errors.slice(0, 5));
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
