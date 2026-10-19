// Need curves: 6 crew at 60× for 2 sim days (seeded). Reports typical activity durations, per-need gain
// rates, satiety re-eat check, trend-symbol coverage; draws one crew member's needs over day 2 plus the live
// AgentCard (trend symbols + status effects) → screenshot-need-curves.png
// Usage: node scripts/need-curves.mjs [url]
import { chromium } from 'playwright';
const URL = process.argv[2] ?? 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.setDefaultTimeout(300000);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
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
const R = await G(() => {
	const c = window.__crew;
	c.running = false;
	c.seed(2026);
	c.reset();
	c.speed = 60;
	const ids = ['energy', 'hunger', 'hygiene', 'bladder', 'fitness', 'fun', 'work', 'comfort'];
	const sess = {}; // label → durations
	const cur = c.agents.map(() => null);
	const series = [];
	const syms = Object.fromEntries(ids.map((n) => [n, new Set()]));
	let reEat = 0, meals = 0;
	const lastMeal = c.agents.map(() => -1e9);
	const sym = (r) => (Math.abs(r) < 2 ? '·' : r > 0 ? (r >= 10 ? '>>' : '>') : r <= -10 ? '<<' : '<');
	const steps = (2 * 1440) / 15;
	for (let k = 0; k < steps; k++) {
		c.step(0.25);
		c.agents.forEach((a, i) => {
			const key = a.state === 'use' && a.aff ? a.aff.label + (a.item?.virtual ? '' : ` @ ${a.item?.def.name}`) : null;
			if (cur[i] && cur[i].key !== key) {
				(sess[cur[i].key] ??= []).push(c.clock - cur[i].t);
				cur[i] = null;
			}
			if (key && !cur[i]) {
				cur[i] = { key, t: c.clock };
				if ((a.aff.needs.hunger ?? 0) >= 60) {
					meals++;
					if (c.clock - lastMeal[i] < 150) reEat++;
					lastMeal[i] = c.clock;
				}
			}
			for (const n of ids) syms[n].add(sym(a.rate[n]));
		});
		if (k >= 1440 / 15) {
			const a = c.agents[2];
			series.push({ t: c.clock, needs: { ...a.needs }, act: a.state === 'use' ? a.aff?.label : a.state, fx: a.effects.map((e) => e.id) });
		}
	}
	const durations = Object.entries(sess)
		.map(([k, v]) => ({ activity: k, n: v.length, avgMin: Math.round(v.reduce((s, x) => s + x, 0) / v.length) }))
		.sort((a, b) => b.n - a.n);
	return { durations, series, name: c.ui.agents[2]?.name ?? c.agents[2].id, syms: Object.fromEntries(ids.map((n) => [n, [...syms[n]]])), reEat, meals, avg: Object.fromEntries(ids.map((n) => [n, +(c.agents.reduce((s, a) => s + a.needs[n], 0) / c.agents.length).toFixed(0)])) };
});
console.log('ACTIVITY DURATIONS (sim min, 2 days, 6 crew)');
for (const d of R.durations.slice(0, 24)) console.log(`  ${String(d.avgMin).padStart(4)} min ×${String(d.n).padStart(3)}  ${d.activity}`);
const all = new Set(Object.values(R.syms).flat());
check('all four trend symbols appear in normal play', ['<<', '<', '>', '>>'].every((s) => all.has(s)), R.syms);
check('no re-eating while satiated (meal < 2.5 h after the last)', R.reEat === 0, { reEat: R.reEat, meals: R.meals });
const sleep = R.durations.find((d) => /Sleep/i.test(d.activity));
check('sleep takes ~7–8 h', sleep && sleep.avgMin >= 360 && sleep.avgMin <= 500, sleep);
const meal = R.durations.find((d) => /meal|Eat/i.test(d.activity) && d.avgMin > 10);
check('a meal takes ~20–30 min', meal && meal.avgMin >= 15 && meal.avgMin <= 35, meal);

// live AgentCard with trend symbols + effects (after a meal + exercise), cropped
await G(() => {
	const c = window.__crew;
	c.speed = 1;
	c.running = true;
	c.selected = 2;
	c.refreshUI();
});
await wait(1500);
const card = await page.locator('[data-testid=agent-card]').screenshot().then((b) => b.toString('base64')).catch(() => null);
const trends = await page.locator('[data-testid=agent-card] [data-testid=trend]').allTextContents();
check('AgentCard shows a trend symbol per need', trends.length === 8, trends);

// chart page
const chart = await ctx.newPage();
const colors = { energy: '#ffd34d', hunger: '#ff8a3d', hygiene: '#4fc3ff', bladder: '#b38cff', fitness: '#4be37a', fun: '#ff6fb5', work: '#e6e6e6', comfort: '#a0d2a0' };
await chart.setContent(`<html><body style="margin:0;background:#0a1020;color:#d6e2f5;font:13px system-ui">
<div style="display:flex;gap:16px;padding:14px">
<div><h3 style="margin:0 0 6px">Needs over one sim day – ${R.name} (seed 2026, 60×)</h3><canvas id=c width=1000 height=560></canvas>
<div id=leg style="display:flex;gap:12px;margin-top:6px"></div></div>
<div style="width:300px"><h3 style="margin:0 0 6px">Live AgentCard</h3>${card ? `<img src="data:image/png;base64,${card}" style="width:270px">` : ''}
<p style="font-size:12px;opacity:.8">Trend symbols: <b style="color:#ff5c5c">&lt;&lt;</b> fast fall (≤ −10/h) · <b style="color:#ff5c5c">&lt;</b> slow fall · · stable (|r| &lt; 2/h) · <b style="color:#4be37a">&gt;</b> slow rise · <b style="color:#4be37a">&gt;&gt;</b> fast rise (≥ 10/h). Net rate = item use + status effects − base decay. Tap/hover a symbol for the exact rate.</p>
<h4 style="margin:8px 0 4px">Typical activity durations</h4><div style="font-size:12px">${R.durations
	.slice(0, 12)
	.map((d) => `${d.avgMin} min · ${d.activity.replace(/</g, '')} (×${d.n})`)
	.join('<br>')}</div></div></div>
<script>
const S=${JSON.stringify(R.series)},C=${JSON.stringify(colors)};
const cv=document.getElementById('c'),x=cv.getContext('2d');const W=cv.width,H=cv.height,L=40,T=10,B=70,PW=W-L-10,PH=H-T-B;
x.fillStyle='#0d1626';x.fillRect(L,T,PW,PH);x.strokeStyle='#22324c';x.fillStyle='#8aa';x.font='11px system-ui';
for(let v=0;v<=100;v+=20){const y=T+PH*(1-v/100);x.beginPath();x.moveTo(L,y);x.lineTo(L+PW,y);x.stroke();x.fillText(v,8,y+4);}
const t0=S[0].t,t1=S[S.length-1].t,X=t=>L+PW*(t-t0)/(t1-t0);
for(let h=0;h<=24;h+=3){const t=t0+h*60;const xx=X(t);x.beginPath();x.moveTo(xx,T);x.lineTo(xx,T+PH);x.stroke();const hh=Math.floor((t/60)%24);x.fillText(String(hh).padStart(2,'0')+':00',xx-14,T+PH+14);}
// activity band
let prev=null,ps=0;const band=T+PH+22;const AC={};let ci=0;const pal=['#3b6ea5','#a5713b','#3ba56e','#a53b6e','#6e3ba5','#a5a53b','#3ba5a5','#777'];
S.forEach((s,i)=>{const k=s.act||'';if(k!==prev||i===S.length-1){if(prev!==null){AC[prev]??=pal[ci++%pal.length];x.fillStyle=AC[prev];x.fillRect(X(S[ps].t),band,X(s.t)-X(S[ps].t),14);if(X(s.t)-X(S[ps].t)>50){x.fillStyle='#fff';x.fillText(prev.slice(0,14),X(S[ps].t)+2,band+11);}}prev=k;ps=i;}});
x.fillStyle='#8aa';x.fillText('activity',2,band+11);
for(const n in C){x.strokeStyle=C[n];x.lineWidth=2;x.beginPath();S.forEach((s,i)=>{const y=T+PH*(1-s.needs[n]/100);i?x.lineTo(X(s.t),y):x.moveTo(X(s.t),y);});x.stroke();}
document.getElementById('leg').innerHTML=Object.entries(C).map(([n,c])=>'<span><b style="color:'+c+'">━</b> '+n+'</span>').join('');
</script></body></html>`);
await wait(300);
await chart.screenshot({ path: 'screenshot-need-curves.png', fullPage: true });
console.log('avg needs at end', JSON.stringify(R.avg));
check('no page errors', errors.length === 0, errors.slice(0, 3));
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
