// Equipment life cycle: deterministic wear/failure with a seed, broken items never used, maintenance
// restores condition, repairs consume spares, mission spares plan + CSV. Screenshot: screenshot-lifecycle.png
// Usage: node scripts/lifecycle-test.mjs [url]
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

// run 2 sim days at 60× with accelerated wear (MTBF 12 h, service every 3 h) on treadmill + toilets
const run = (seed) =>
	G((seed) => {
		const c = window.__crew;
		c.running = true;
		c.seed(seed);
		c.reset();
		c.speed = 60;
		const fast = (i) => (i.life = { ...i.life, mtbf: 12, service: 3 });
		for (const i of c.items) if (['treadmill', 'hygiene'].includes(i.def.id)) fast(i);
		let brokenUse = 0, maxBroken = 0, wasBroken = new Set();
		for (let k = 0; k < (2 * 1440) / 15; k++) {
			c.step(0.25);
			for (const a of c.agents) if (a.state === 'use' && a.item?.broken && a.aff?.id !== 'repair') brokenUse++;
			const b = c.items.filter((i) => i.broken);
			maxBroken = Math.max(maxBroken, b.length);
			for (const i of b) wasBroken.add(i.key);
		}
		const items = c.items.filter((i) => !i.virtual && (i.failures || i.serviced || i.repairs));
		return {
			sig: items.map((i) => `${i.def.id}:${i.failures}/${i.repairs}/${i.serviced}:${i.hours.toFixed(2)}`).join(' ') + ` spares=${c.sparesUsed}`,
			brokenUse,
			maxBroken,
			failures: items.reduce((s, i) => s + i.failures, 0),
			repairs: items.reduce((s, i) => s + i.repairs, 0),
			serviced: items.reduce((s, i) => s + i.serviced, 0),
			downtimeH: +(items.reduce((s, i) => s + i.downtime, 0) / 60).toFixed(1),
			sparesUsed: c.sparesUsed,
			log: c.ui.log.filter((l) => /💥|🛠|🔧/.test(l.text)).slice(0, 4).map((l) => l.text)
		};
	}, seed);
const r1 = await run(1234);
const r2 = await run(1234);
const r3 = await run(99);
console.log('run', JSON.stringify(r1));
check('failures happen with accelerated wear', r1.failures > 0, { failures: r1.failures });
check('broken items never used (except repair)', r1.brokenUse === 0 && r2.brokenUse === 0 && r3.brokenUse === 0, { b: [r1.brokenUse, r2.brokenUse, r3.brokenUse] });
check('same seed → identical wear/failure history', r1.sig === r2.sig, { a: r1.sig.slice(0, 160), b: r2.sig.slice(0, 160) });
check('different seed → different history', r1.sig !== r3.sig);
check('engineer repairs broken items using spares', r1.repairs > 0 && r1.sparesUsed > 0, { repairs: r1.repairs, spares: r1.sparesUsed });
check('maintenance done during the run', r1.serviced > 0, { serviced: r1.serviced });

// maintenance restores condition: wear one item down, wait for the engineer
const m = await G(() => {
	const c = window.__crew;
	c.running = true;
	c.seed(7);
	c.reset();
	c.speed = 60;
	const it = c.items.find((i) => i.def.id === 'treadmill');
	it.cond = 30;
	it.sinceService = it.life.service + 1;
	c.step(0.25);
	const state0 = it.lstate, has = it.affords.some((a) => a.id === 'service');
	let k = 0;
	while (it.serviced === 0 && k++ < (1440 / 15) * 1.5) c.step(0.25);
	return { state0, has, serviced: it.serviced, cond: Math.round(it.cond), state1: it.lstate };
});
check('worn item needs maintenance (task offered)', m.state0 === 'Needs maintenance' && m.has, m);
check('maintenance restores condition', m.serviced > 0 && m.cond > 80, m);

// broken item: issue text, repair, unusable meanwhile; usable() false
const b = await G(() => {
	const c = window.__crew;
	c.reset();
	c.speed = 60;
	const it = c.items.find((i) => i.def.id === 'hygiene');
	it.broken = true;
	c.step(0.25);
	const issue = c.analytics().issues.find((i) => /Hygiene \/ Toilet broken/.test(i.text))?.text;
	const usable = it.base.some((af) => c.usable(it, af));
	const left0 = c.sparesLeft();
	let k = 0;
	while (it.broken && k++ < 1440 / 15) c.step(0.25);
	const plan = c.sparesPlan();
	const csv = c.csv();
	return { issue, usable, left0, left1: c.sparesLeft(), fixed: !it.broken, cond: Math.round(it.cond), plan: { need: plan.need, pool: plan.pool, short: plan.short, top: plan.rows.slice(0, 4) }, csvLife: /LIFE CYCLE/.test(csv) && /mission_spares_needed/.test(csv), csvRow: csv.split('\n').find((l) => /Hygiene \/ Toilet.*Operational|Hygiene \/ Toilet.*New|Hygiene \/ Toilet.*Worn/.test(l) && /,\d+\.\d\d,/.test(l)) };
});
check('broken → issue "… broken, n spares left"', /broken.*\d+ spares? left/.test(b.issue ?? ''), b.issue);
check('broken item not usable', b.usable === false);
check('repair restores it and consumes a spare', b.fixed && b.left1 < b.left0, { left0: b.left0, left1: b.left1, cond: b.cond });
check('mission spares plan computed (180 d + 500 d)', b.plan.need > 0 && b.plan.pool > 0, b.plan);
check('CSV has per-item hours/failures/downtime + spares plan', b.csvLife, b.csvRow);
console.log('spares plan', JSON.stringify(b.plan));

// screenshot: a broken toilet + worn treadmill, badges on, life info of the selected toilet, issues tab
await G(() => {
	const c = window.__crew, g = window.__game;
	c.reset();
	c.speed = 1;
	c.running = true;
	c.badges = true;
	for (const i of c.items) {
		if (i.def.id === 'hygiene' && i.deck === 0) (i.broken = true), (i.failures = 1), (i.hours = 212.4), (i.cond = 18);
		if (i.def.id === 'treadmill') (i.cond = 41), (i.hours = 160), (i.sinceService = 38);
		if (i.def.id === 'foodwarmer') (i.cond = 28), (i.hours = 140), (i.sinceService = 151);
	}
	g.selectDeck(0);
	g.tool = 'select';
	const t = c.items.find((i) => i.def.id === 'hygiene' && i.deck === 0);
	g.selectedUid = t.uid;
	c.step(0.05);
});
await wait(300);
await page.getByRole('button', { name: /Issues/ }).click().catch(() => {});
await wait(2500);
const cond = await page.locator('[data-testid=sel-cond]').textContent().catch(() => null);
check('selection card shows condition', /Broken/.test(cond ?? ''), cond);
const st = await page.locator('[data-occ][data-state="Broken"]').count();
check('badge shows broken state', st >= 1, { st });
await page.screenshot({ path: 'screenshot-lifecycle.png' });
check('no page errors', errors.length === 0, errors.slice(0, 3));
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
