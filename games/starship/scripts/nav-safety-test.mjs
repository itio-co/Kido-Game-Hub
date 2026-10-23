// Containment test: default + random layouts (seeded), Surface (gravity) and Cruise (micro-g), crew sim at 60×.
// Asserts no agent ends a tick in invalid space (inside equipment, outside the hull, in a slab, in an
// unreachable pocket) and reports the watchdog's unstuck count (target 0 on the default layout).
// Usage: node scripts/nav-safety-test.mjs [hours=8] [layouts=3] [url]
import { chromium } from 'playwright';
const HOURS = Number(process.argv[2] ?? 8);
const LAYOUTS = Number(process.argv[3] ?? 3);
const URL = process.argv[4] ?? 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 900, height: 600 } })).newPage();
page.setDefaultTimeout(600000);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(URL, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__crew && !!window.__game);
let fails = 0;
const rows = [];
for (let L = 0; L <= LAYOUTS; L++) {
	for (const mission of ['surface', 'cruise']) {
		const r = await page.evaluate(({ L, mission, hours }) => {
			const g = window.__game, c = window.__crew;
			// layout: 0 = default; otherwise default + random extra equipment (seeded)
			g.resetStarter();
			let s = 1000 + L * 7919;
			const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
			let added = 0;
			if (L > 0) {
				const types = ['locker', 'workstation', 'galleytable', 'chair', 'trash', 'fridge', 'partition', 'hydroponics', 'treadmill', 'crewpod', 'handrail', 'footrestraint', 'sleepingbag', 'ared', 'zerogtoilet', 'prepcounter'];
				for (let k = 0; k < g.decks.length; k++) {
					g.selectDeck(k);
					for (let t = 0; t < 40 && added < 14 * (k + 1); t++) {
						g.selectedModule = types[Math.floor(rnd() * types.length)];
						g.rotation = Math.round(rnd() * 8) * 45;
						g.mountMode = rnd() < 0.3 ? 'wall' : 'floor';
						const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * 4.2;
						if (g.placeAt({ x: Math.sin(a) * rr, z: Math.cos(a) * rr })) added++;
					}
				}
				g.mountMode = 'floor';
				g.selectDeck(0);
			}
			g.setMission(mission);
			c.seed(42 + L);
			c.start();
			c.speed = 60;
			c.running = true;
			for (let i = 0; i < 4; i++) c.step(0.25);
			c.reset();
			c.seed(42 + L);
			c.speed = 60;
			let worstInvalid = 0, ex = null;
			const steps = Math.round((hours * 60) / 3);
			for (let i = 0; i < steps; i++) {
				c.step(0.05);
				const bad = c.invalidAgents();
				if (bad.length > worstInvalid) (worstInvalid = bad.length), (ex = bad[0]);
			}
			const out = { layout: L, mission, added, modules: g.decks.reduce((n, d) => n + d.modules.length, 0), invalidEndOfTick: worstInvalid, example: ex, unstuck: c.safety.unstuck, stalls: c.safety.stalls, events: c.safety.events.slice(0, 3), unreachable: g.unreachable.length };
			c.stop();
			return out;
		}, { L, mission, hours: HOURS });
		rows.push(r);
		const ok = r.invalidEndOfTick === 0 && (L > 0 || r.unstuck === 0);
		if (!ok) fails++;
		console.log(`${ok ? 'PASS' : 'FAIL'} layout ${L} ${mission}: ${JSON.stringify(r)}`);
	}
}
// watchdog sanity: a body forced inside equipment / outside the hull is snapped back and counted
for (const mission of ['surface', 'cruise']) {
	const w = await page.evaluate((mission) => {
		const g = window.__game, c = window.__crew;
		g.resetStarter();
		g.setMission(mission);
		c.start();
		c.speed = 1;
		for (let i = 0; i < 4; i++) c.step(0.05);
		c.reset();
		c.step(0.05);
		const a = c.agents[0];
		const lk = g.decks[0].modules.find((m) => m.type === 'pantry');
		c.think(0);
		a.state = 'idle';
		a.idleLeft = 99;
		a.deck = 0;
		if (a.m) a.m.p.set(lk.x, (g.floorY[0] ?? 0) + 1.0, lk.z);
		else (a.x = lk.x), (a.z = lk.z);
		const before = c.invalidAgents().length;
		c.step(0.05);
		const after = c.invalidAgents().length;
		// outside the hull
		c.think(0);
		a.state = 'idle';
		a.idleLeft = 99;
		if (a.m) a.m.p.set(6, (g.floorY[0] ?? 0) + 1.0, 0);
		else (a.x = 6), (a.z = 0);
		c.step(0.05);
		const r = { before, after, after2: c.invalidAgents().length, unstuck: c.safety.unstuck, state: a.state, ev: c.safety.events.map((e) => e.why) };
		c.stop();
		return r;
	}, mission);
	const ok = w.before === 1 && w.after === 0 && w.after2 === 0 && w.unstuck === 2;
	if (!ok) fails++;
	console.log(`${ok ? 'PASS' : 'FAIL'} watchdog snaps a body out of equipment / outside the hull (${mission}) ${JSON.stringify(w)}`);
}
console.log('errors', errors.slice(0, 3));
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
