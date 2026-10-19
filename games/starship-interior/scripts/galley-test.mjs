// Galley set + group tables / chairs + strict capacity & occupancy badges. Screenshots: screenshot-galley.png, screenshot-occupancy.png
// Usage: node scripts/galley-test.mjs [url]
import { chromium } from 'playwright';
const URL = process.argv[2] ?? 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
page.setDefaultTimeout(120000);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const G = (fn, arg) => page.evaluate(fn, arg);
let fails = 0;
const check = (name, ok, info) => {
	if (!ok) fails++;
	console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info !== undefined ? ' ' + JSON.stringify(info) : ''}`);
};
await page.goto(URL, { waitUntil: 'networkidle' });
await G(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__crew && !!window.__game);
await wait(1500);

const lay = await G(() => {
	const g = window.__game;
	const d0 = g.decks[0].modules.map((m) => m.type);
	const t = g.decks[0].modules.find((m) => m.type === 'galleytable');
	return { d0, seats: t ? g.seatsOf(t.uid).length : -1, tuid: t?.uid };
});
for (const t of ['pantry', 'fridge', 'waterdispenser', 'foodwarmer', 'prepcounter', 'trash', 'foodstation', 'galleytable'])
	check(`default Deck 1 has ${t}`, lay.d0.includes(t));
check('galley table has 4 chairs (group seats)', lay.seats === 4, lay);

// snap: a chair dropped near a fresh table snaps to a table side facing it; "Add seats" fills free sides
const snap = await G(() => {
	const g = window.__game;
	g.selectDeck(2);
	const uid = g.nextUid;
	g.selectedModule = 'galleytable';
	g.rotation = 0;
	const ok = g.placeAt({ x: -1.2, z: 1.6 });
	const p = g.placementFor('chair', { x: -1.15, z: 2.2 });
	g.altHeld = true;
	const free = g.placementFor('chair', { x: -1.15, z: 2.2 });
	g.altHeld = false;
	const n = g.addSeats(uid);
	const seats = g.seatsOf(uid).length;
	// remove again
	g.decks[2].modules = g.decks[2].modules.filter((m) => m.uid !== uid && !(m.type === 'chair'));
	g.selectDeck(0);
	return { ok, p, free, n, seats };
});
check('chair snaps to table side facing it', snap.ok && Math.abs(snap.p.z - (1.6 + 0.4 + 0.275)) < 0.01 && Math.abs(Math.abs(snap.p.angle) - 180) < 1, snap);
check('Alt places the chair freely', Math.abs(snap.free.z - 2.2) < 0.06, snap.free);
check('"Add seats" places chairs that join the table', snap.n >= 4 && snap.seats === snap.n, snap);

// sim: 60× for 1.5 days, strict capacity, multi-step meals
await page.getByRole('button', { name: /Start crew sim/ }).click();
await page.waitForFunction(() => window.__crew.enabled && window.__crew.agents.length > 0);
const sim = await G(() => {
	const c = window.__crew;
	c.speed = 60;
	c.running = true;
	let worst = 0, plans = 0;
	const seen = new Set();
	for (let i = 0; i < (1.5 * 1440) / 15; i++) {
		c.step(0.25);
		worst = Math.max(worst, c.overCapacity());
		for (const a of c.agents) if (a.plan) seen.add(a.plan.phase + ':' + a.plan.tags.join(','));
		plans += c.agents.filter((a) => a.plan).length;
	}
	const uses = Object.fromEntries(c.items.filter((i) => !i.virtual).map((i) => [i.def.id, (i.uses ?? 0)]));
	const tbl = c.items.find((i) => i.def.id === 'galleytable');
	const rep = c.galleyReport();
	return { worst, plans, phases: [...seen].slice(0, 10), uses, tableCap: tbl?.slots.length, seatsUsed: tbl?.slots.filter((s) => s.seat !== undefined).length, steps: rep.steps, crewDays: rep.crewDays, days: +rep.days.toFixed(0), issues: c.analytics().issues.map((i) => i.text).filter((t) => /water|food|seat|Galley|trash|Bottleneck/i.test(t)) };
});
check('no item exceeded capacity (60×, 1.5 days)', sim.worst === 0, { worst: sim.worst });
check('meal flow: food → rehydrate → heat → eat → trash used', sim.uses.pantry + sim.uses.fridge > 0 && sim.uses.waterdispenser > 0 && sim.uses.foodwarmer > 0 && sim.uses.trash > 0 && sim.uses.galleytable + sim.uses.foodstation > 0, sim.uses);
check('galley table capacity = 4 chairs', sim.tableCap === 4 && sim.seatsUsed === 4, { cap: sim.tableCap });
console.log('galley report', JSON.stringify({ steps: sim.steps, crewDays: sim.crewDays, days: sim.days, phases: sim.phases, issues: sim.issues }));

// possessed avatar blocked at a full item
const full = await G(() => {
	const c = window.__crew;
	c.running = false;
	const it = c.items.find((i) => i.def.id === 'trash');
	const other = c.agents[1];
	for (const s of it.slots) s.occ = other.id;
	c.possess(0);
	const a = c.agents[0];
	c.teleport(0, it.deck, it.slots[0].ax, it.slots[0].az);
	a.possessed = true;
	const p = c.promptFor(a);
	const used = c.interact();
	for (const s of it.slots) s.occ = null;
	c.possess(null);
	c.running = true;
	return { p, used };
});
check('possessed: full item shows "Full (1/1)" and blocks use', /Full \(1\/1\)/.test(full.p ?? '') && !full.used, full);

// missing water dispenser → issue + meals blocked
const miss = await G(() => {
	const g = window.__game, c = window.__crew;
	const saved = g.decks[0].modules.filter((m) => m.type === 'waterdispenser' || m.type === 'galleytable');
	g.decks[0].modules = g.decks[0].modules.filter((m) => m.type !== 'waterdispenser');
	c.rebuild(true);
	const iss = c.analytics().issues.map((i) => i.text);
	// table without chairs
	g.decks[0].modules = g.decks[0].modules.filter((m) => m.type !== 'chair');
	c.rebuild(true);
	const iss2 = c.analytics().issues.map((i) => i.text);
	return { water: iss.find((t) => /No water dispenser/.test(t)), seats: iss2.find((t) => /has no seats/.test(t)), n: saved.length };
});
check('issue: "No water dispenser: crew can\'t rehydrate food"', !!miss.water, miss);
check('issue: "Galley Table … has no seats"', !!miss.seats, miss);
await page.reload({ waitUntil: 'networkidle' });
await G(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__crew && !!window.__game);
await wait(1500);

// screenshot-galley: build view of the galley cluster on Deck 1
await G(() => {
	const g = window.__game;
	g.selectDeck(0);
	g.tool = 'select';
	g.pending = null;
	const t = g.decks[0].modules.find((m) => m.type === 'galleytable');
	g.selectedUid = t.uid;
	g.setCamera?.({ target: [2.4, 0.6, -0.3], position: [-1.6, 5.4, -4.6] });
});
await wait(2500);
await page.screenshot({ path: 'screenshot-galley.png' });

// screenshot-occupancy: crew at meal time with badges
await page.getByRole('button', { name: /Start crew sim/ }).click();
await page.waitForFunction(() => window.__crew.enabled && window.__crew.agents.length > 0);
await G(() => {
	const c = window.__crew;
	window.__game.selectedUid = null;
	c.badges = true;
	for (const a of c.agents) { c.setNeed(a.id, 'hunger', 18); c.setNeed(a.id, 'bladder', 90); c.setNeed(a.id, 'energy', 90); c.think(a.id); }
	c.speed = 16;
});
const seated = await (async () => {
	const t0 = Date.now();
	for (;;) {
		const n = await G(() => { const c = window.__crew; const t = c.items.find((i) => i.def.id === 'galleytable'); return t.slots.filter((s) => s.occ !== null && c.agents[s.occ].state === 'use').length; });
		if (n >= 2 || Date.now() - t0 > 60000) return n;
		await wait(500);
	}
})();
await G(() => (window.__crew.speed = 1));
await wait(1500);
const badges = await page.locator('[data-occ]').count();
check('occupancy badges rendered', badges > 5, { badges, seated });
await page.screenshot({ path: 'screenshot-occupancy.png' });
check('no page errors', errors.length === 0, errors.slice(0, 3));
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
