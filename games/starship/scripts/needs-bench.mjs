// Needs benchmark: default layout, 6 crew, 60× for N sim days (stepped synchronously), Surface and Cruise.
// Prints average needs (awake+asleep), average Work during the work shift, and the design issues.
// Usage: node scripts/needs-bench.mjs [days=2] [url]
import { chromium } from 'playwright';
const DAYS = Number(process.argv[2] ?? 2);
const URL = process.argv[3] ?? 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1000, height: 700 } })).newPage();
page.setDefaultTimeout(180000);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(URL, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__crew && !!window.__game);
const out = {};
for (const mission of ['surface', 'cruise']) {
	out[mission] = await page.evaluate(({ mission, days }) => {
		const c = window.__crew, g = window.__game;
		g.setMission(mission);
		c.start();
		c.speed = 60;
		c.running = true;
		for (let i = 0; i < 8; i++) c.step(0.25); // let rebuild happen
		c.reset();
		c.speed = 60;
		const ids = ['energy', 'hunger', 'hygiene', 'bladder', 'fitness', 'fun', 'work', 'comfort'];
		const sum = Object.fromEntries(ids.map((n) => [n, 0]));
		let n = 0, ws = 0, wn = 0, maxOver = 0;
		const per = c.agents.map(() => 0);
		const steps = Math.round((days * 1440) / 15);
		for (let i = 0; i < steps; i++) {
			c.step(0.25);
			const h = (c.clock % 1440) / 60;
			const shift = h >= c.settings.workStart && h < c.settings.workEnd;
			for (const a of c.agents) {
				for (const k of ids) sum[k] += a.needs[k];
				per[a.id] += a.needs.work;
				n++;
				if (shift) (ws += a.needs.work), wn++;
			}
			// capacity check: occupants in 'use' per item never exceed its slots
			for (const it of c.items) {
				const users = c.agents.filter((a) => a.item === it && a.state === 'use').length;
				maxOver = Math.max(maxOver, users - it.slots.length);
			}
		}
		const avg = Object.fromEntries(ids.map((k) => [k, +(sum[k] / n).toFixed(1)]));
		const rep = c.analytics();
		c.stop();
		const steps1 = Math.max(1, n / per.length);
		return { avg, workPerAgent: per.map((v, i) => `${c.roster[i].role}:${(v / steps1).toFixed(0)}`).join(' '), serviced: c.items.reduce((s2, i) => s2 + i.serviced, 0), workShift: +(ws / Math.max(1, wn)).toFixed(1), overCap: maxOver, issues: rep.issues.slice(0, 8).map((i) => i.sev + ': ' + i.text) };
	}, { mission, days: DAYS });
	console.log(mission.toUpperCase(), JSON.stringify(out[mission], null, 1));
}
console.log('errors', errors.slice(0, 3));
await browser.close();
