// Electrical load profiles + live power bus: shedding order by priority, unavailable items never used,
// possessed prompt, brownout, deficit issue, CSV. Screenshot: screenshot-power.png
// Usage: node scripts/power-test.mjs [url]
import { chromium } from 'playwright';
const URL = process.argv[2] ?? 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
page.setDefaultTimeout(300000);
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
await page.getByRole('button', { name: /Start crew sim/ }).click();
await page.waitForFunction(() => window.__crew.enabled && window.__crew.agents.length > 0);

// default supply (surface: 12 kW solar day/night + 60 kWh battery): no shedding over 2 days
const n = await G(() => {
	const c = window.__crew;
	window.__game.setMission('surface');
	c.running = true;
	c.seed(5);
	c.reset();
	c.speed = 60;
	let minSoc = 1;
	for (let k = 0; k < 2 * 1440 / 15; k++) {
		c.step(0.25);
		minSoc = Math.min(minSoc, c.bus.soc / c.settings.batteryKWh);
	}
	c.settings.surfaceSource = 'nuclear';
	const r = c.powerReport();
	return { minSocPct: Math.round(minSoc * 100), shedEvents: c.bus.shedEvents, peak: Math.round(r.peakLoad), kwh: +r.items.reduce((s, i) => s + i.kwh, 0).toFixed(1), top: r.items.slice(0, 3).map((i) => `${i.name} ${i.kwh} kWh`) };
});
check('default solar + battery: no load shedding over 2 days (night on battery)', n.shedEvents === 0, n);

// low supply: 2.0 kW, no battery → shedding order Deferrable → Normal → Essential, never Critical
const low = await G(() => {
	const c = window.__crew;
	c.settings.powerSurfaceKW = 2.0;
	c.settings.batteryKWh = 0;
	c.seed(6);
	c.reset();
	c.speed = 60;
	c.ui.log = [];
	c.step(0.25);
	const rank = { Critical: 0, Essential: 1, Normal: 2, Deferrable: 3 };
	const order = c.ui.log
		.slice()
		.reverse()
		.filter((l) => /Load shed/.test(l.text))
		.map((l) => /\((Critical|Essential|Normal|Deferrable)\)/.exec(l.text)?.[1]);
	let sorted = true;
	for (let i = 1; i < order.length; i++) if (rank[order[i]] > rank[order[i - 1]]) sorted = false;
	let viol = 0, maxShed = 0, critShed = 0;
	const names = new Set();
	for (let k = 0; k < 1440 / 15; k++) {
		c.step(0.25);
		for (const a of c.agents) if (a.state === 'use' && a.item && (a.item.shed || a.item.brown) && a.aff?.id !== 'repair') viol++;
		const shed = c.items.filter((i) => i.shed);
		maxShed = Math.max(maxShed, shed.length);
		for (const i of shed) (names.add(i.def.name), c.prioOf(i) === 'Critical' && critShed++);
	}
	const issue = c.analytics().issues.find((i) => /Power deficit|Power was short/.test(i.text))?.text;
	const csv = c.csv();
	const eclss = c.items.find((i) => i.def.id === 'eclss');
	return { order, sorted, viol, maxShed, critShed, names: [...names], issue, csv: /POWER/.test(csv) && /energy_kwh,unavailable_min/.test(csv), eclssOn: eclss && !eclss.shed, unavail: c.powerReport().items.filter((i) => i.unavailMin > 0).length };
});
console.log(JSON.stringify(low));
check('low supply: items shed', low.order.length > 0 && low.maxShed > 0, low.order);
check('shedding order: Deferrable first, then Normal, then Essential', low.sorted, low.order);
check('critical loads (life support) never shed', low.critShed === 0 && low.eclssOn);
check('unavailable (no power) items never used', low.viol === 0, { viol: low.viol });
check('issue "Power deficit … unavailable"', /Power deficit .*kW: .*unavailable|Power was short/.test(low.issue ?? ''), low.issue);
check('CSV has per-item kWh / unavailable minutes / peak load', low.csv);

// possessed prompt next to an unpowered item + brownout
const p = await G(() => {
	const c = window.__crew;
	const it = c.items.find((i) => i.shed && i.slots.length) ?? c.items.find((i) => i.def.id === 'treadmill');
	it.shed = true;
	const a = c.agents[0];
	c.possess(0);
	c.release(a, false);
	a.state = 'idle';
	a.deck = it.deck;
	a.x = it.slots[0].ax;
	a.z = it.slots[0].az;
	const prompt = c.promptFor(a);
	const used = c.interact();
	c.possess(null);
	// brownout: treadmill peak 1.5 kW cannot start on a 2 kW bus already carrying life support
	c.settings.surfaceSource = 'nuclear';
	c.settings.powerSurfaceKW = 10;
	c.seed(11);
	c.reset();
	c.step(0.25);
	c.step(0.25);
	const tm0 = c.items.find((i) => i.def.id === 'treadmill');
	for (const a of c.agents) a.needs.fitness = 100;
	for (const a of c.agents.filter((x) => x.item === tm0)) (c.release(a, false), (a.state = 'idle'));
	c.step(0.05);
	// leave ~1 kW headroom: treadmill (active 600 W) would fit, its 1.5 kW start-up peak does not
	c.settings.powerSurfaceKW = (c.bus.load + 1000) / 1000;
	c.speed = 1;
	c.step(0.05);
	const tm = c.items.find((i) => i.def.id === 'treadmill');
	const bl = c.agents.filter((a) => a.state === 'use' && a.item?.brown).length;
	return { bl, prompt, used, item: it.label, brown: tm.brown, tmState: tm.pstate, usable: tm.base.some((af) => c.usable(tm, af)) };
});
check('possessed: prompt "Unavailable (no power)" and use refused', /Unavailable \(no power/.test(p.prompt ?? '') && p.used === false, p);
check('brownout: treadmill peak cannot start → unusable', p.brown && !p.usable, p);

// screenshot: deficit scenario, power drawer open, badges
await G(() => {
	const c = window.__crew;
	c.settings.powerSurfaceKW = 2.3;
	c.settings.batteryKWh = 2;
	c.seed(9);
	c.reset();
	c.speed = 60;
	for (let k = 0; k < (16 * 60) / 15; k++) c.step(0.25);
	c.speed = 1;
	c.badges = true;
	window.__game.selectDeck(0);
	window.__rig.animateTo({ az: 0.7, polar: 0.8, dist: 10 }, [0.5, 0, 0], 10);
});
await page.locator('[data-testid=power-meter]').click();
await wait(2500);
const rows = await page.locator('[data-testid=power-row]').count();
const chart = await page.locator('[data-testid=power-chart]').count();
const pwBadges = await page.locator('[data-occ][data-power]').count();
check('power drawer: per-item rows + 24 h chart', rows > 5 && chart === 1, { rows, chart });
check('badges show power-off icon on shed items', pwBadges >= 1, { pwBadges });
await page.screenshot({ path: 'screenshot-power.png' });
check('no page errors', errors.length === 0, errors.slice(0, 3));
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
