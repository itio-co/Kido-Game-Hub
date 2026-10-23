// Headless test: equipment doors. Player avatar + AI crew: door opens before entry, body inside the
// footprint, door closed while occupied ("occupied", others queue), exit afterwards (open → step out → close);
// fridge open/use/close; unpowered / broken doors refuse with a reason; swing arc reserved; cruise float-in;
// door row on the selection card. Screenshot: screenshot-door-anim.png
// Usage: node scripts/door-test.mjs [url]   (dev server running)
import { chromium } from 'playwright';

const URL = process.argv[2] ?? 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let fails = 0;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, ok, info) => {
	if (!ok) fails++;
	console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info !== undefined ? ' ' + JSON.stringify(info) : ''}`);
};
async function until(page, fn, arg, ms = 20000) {
	const t0 = Date.now();
	for (;;) {
		const v = await page.evaluate(fn, arg);
		if (v || Date.now() - t0 > ms) return v;
		await wait(120);
	}
}
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
page.setDefaultTimeout(90000);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(URL, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__game && !!window.__crew);
await wait(1000);

// door samples of one agent on one item, recorded in the page every 40 ms
const startLog = (key, id) =>
	page.evaluate(
		([key, id]) => {
			clearInterval(window.__dlT);
			window.__dlog = [];
			window.__dlT = setInterval(() => {
				const d = window.__crew.doorInfo(key);
				if (!d) return;
				const me = d.users.find((u) => u.id === id) ?? null;
				const inside = !!me && Math.abs(me.lx) < d.w / 2 - 0.02 && Math.abs(me.lz) < d.d / 2 - 0.02;
				window.__dlog.push({ open: d.open, phase: me?.phase ?? null, state: me?.state ?? null, inside, hidden: me?.hidden ?? false, lx: me?.lx, lz: me?.lz });
			}, 40);
		},
		[key, id]
	);
const getLog = () => page.evaluate(() => window.__dlog);
/** sequence checks on a door log: opened before entry, inside, closed while occupied */
function analyse(log) {
	const firstOpen = log.findIndex((s) => s.open >= 0.99);
	const firstInside = log.findIndex((s) => s.inside);
	const insideWhileShut = log.filter((s) => s.inside && s.open < 0.9 && s.phase !== 'close' && s.phase !== 'in' && s.phase !== 'exit');
	const reachWhileOpening = log.some((s) => s.phase === 'open' && s.open > 0.05 && s.open < 0.95 && !s.inside);
	return { firstOpen, firstInside, insideWhileShut: insideWhileShut.length, reachWhileOpening };
}

await page.evaluate(() => (window.__game.quality = 'low'));
// ---- player avatar: walk mode on the pod deck ----
// pods live on the upper deck: enter walk mode there (embodies a crew member, starts the sim)
const podDeck = await page.evaluate(() => window.__game.decks.findIndex((d) => d.modules.some((m) => m.type === 'crewpod')));
await page.evaluate((d) => window.__game.selectDeck(d), podDeck);
await page.keyboard.press('KeyF');
await page.waitForFunction(() => !!window.__walk?.avatar && window.__game.mode === 'walk');
await page.evaluate(() => (window.__crew.running = false));
const pods = await page.evaluate(() =>
	window.__crew.items
		.filter((i) => i.def.id === 'crewpod')
		.map((i) => ({ key: i.key, deck: i.deck, uid: i.uid, ax: i.slots[0].ax, az: i.slots[0].az, x: i.slots[0].x, z: i.slots[0].z }))
);
check('two crew pods with doors in the starter layout', pods.length >= 2, pods.length);
const pod = pods[0];


const me = await page.evaluate(() => window.__crew.possessed);
// the crew may already have gone to bed in a pod before the pause: free every door item
await page.evaluate(() => {
	const c = window.__crew;
	for (const a of c.agents) if (a.item?.door && !a.possessed) { c.release(a, false); a.state = 'idle'; }
});
await wait(1500);
// stand at the approach point facing the door
await page.evaluate(([p, id]) => {
	const c = window.__crew;
	c.teleport(id, p.deck, p.ax + (p.ax - p.x) * 0.15, p.az + (p.az - p.z) * 0.15);
	window.__walk.face(p.x, p.z);
}, [pod, me]);
await wait(400);
const acts = await page.evaluate(() => window.__walk.actions());
const ai = acts.findIndex((l) => /Private time – Crew Quarters Pod/.test(l));
check('pod offers "Private time" on E', ai >= 0, acts);
await startLog(pod.key, me);
if (ai === 0) await page.keyboard.press('KeyE');
else {
	await page.keyboard.press('Shift+KeyE');
	await page.keyboard.press(`Digit${ai + 1}`);
}
// screenshot mid-swing (door partly open, avatar reaching at the door)
const mid = await until(page, ([k, id]) => {
	const d = window.__crew.doorInfo(k);
	const u = d?.users.find((x) => x.id === id);
	return u && (u.phase === 'open' || u.phase === 'enter') && d.open > 0.45 ? d : null;
}, [pod.key, me], 8000);
check('player: door opening while the avatar waits at the door (reach pose)', !!mid && mid.users[0].pose === 'work' || mid?.users[0]?.phase === 'enter', mid);
await page.screenshot({ path: 'screenshot-door-anim.png' });
const inPod = await until(page, ([k, id]) => window.__crew.doorInfo(k)?.users.find((x) => x.id === id && x.phase === 'in'), [pod.key, me], 10000);
check('player: reached the "in" phase', !!inPod, inPod);
await wait(300);
let log = await getLog();
let an = analyse(log);
check('player: door fully opened before entering', an.firstOpen >= 0 && an.firstInside > an.firstOpen && an.insideWhileShut === 0, an);
check('player: reach pose while the door swings (never inside a shut door)', an.reachWhileOpening, an);
const occ = await page.evaluate((k) => {
	const d = window.__crew.doorInfo(k);
	const o = window.__crew.occupancy().find((x) => x.key === k);
	const u = d.users[0];
	return { open: d.open, inside: Math.abs(u.lx) < d.w / 2 && Math.abs(u.lz) < d.d / 2, hidden: u.hidden, badge: o?.door, prompt: window.__crew.ui.prompt };
}, pod.key);
check('player: inside the pod bounds, door closed, shown "occupied"', occ.inside && occ.open === 0 && occ.badge === 'occupied', occ);
// another crew member wanting the pod queues outside
const q = await page.evaluate(([p, id]) => {
	const c = window.__crew;
	const b = c.agents.find((a) => a.id !== id && a.deck === p.deck) ?? c.agents.find((a) => a.id !== id);
	const it = c.items.find((i) => i.key === p.key);
	c.teleport(b.id, p.deck, p.ax + (p.ax - p.x) * 0.9, p.az + (p.az - p.z) * 0.9);
	c.commit(b, it, it.affords.find((f) => f.id === 'privacy'), 0);
	const r = { queued: it.queue.includes(b.id), slot: b.slot, label: '' };
	c.release(b, false);
	b.state = 'idle';
	return r;
}, [pod, me]);
check('pod occupied: another crew member queues outside', q.queued && q.slot === -1, q);
// leave: X → door opens → step out → door closes
await page.keyboard.press('KeyX');
const exiting = await until(page, ([k, id]) => window.__crew.doorInfo(k)?.users.find((x) => x.id === id && (x.phase === 'exit' || x.phase === 'out')), [pod.key, me], 4000);
check('player: X starts the exit (door opens first)', !!exiting, exiting);
const out = await until(page, ([k, id]) => {
	const d = window.__crew.doorInfo(k);
	return d && !d.users.some((x) => x.id === id) && d.open === 0 ? d : null;
}, [pod.key, me], 8000);
log = await getLog();
const exitOpenBeforeOut = (() => {
	const firstOut = log.findIndex((s) => s.phase === 'out');
	return firstOut > 0 && log[firstOut].open >= 0.99;
})();
const pos = await page.evaluate(([p, id]) => {
	const a = window.__crew.agents[id];
	return { d: Math.hypot(a.x - p.ax, a.z - p.az), state: a.state };
}, [pod, me]);
check('player: stepped out after the door opened, door closed behind, standing at the approach point', !!out && exitOpenBeforeOut && pos.d < 0.6 && pos.state === 'idle', { out: !!out, exitOpenBeforeOut, pos });

// ---- fridge: open, take, close (non-private: stays open while in use) ----
const fr = await page.evaluate(() => {
	const it = window.__crew.items.find((i) => i.def.id === 'fridge');
	return it ? { key: it.key, deck: it.deck, ax: it.slots[0].ax, az: it.slots[0].az, x: it.slots[0].x, z: it.slots[0].z } : null;
});
if (fr) {
	await page.evaluate(([p, id]) => {
		const c = window.__crew;
		window.__game.selectDeck(p.deck);
		const it = c.items.find((i) => i.key === p.key);
		c.teleport(id, p.deck, p.ax, p.az);
		c.useSlot(c.agents[id], it, it.affords.find((f) => f.id === 'food'), 0);
	}, [fr, me]);
	await startLog(fr.key, me);
	const fin = await until(page, ([k, id]) => window.__crew.doorInfo(k)?.users.find((x) => x.id === id && x.phase === 'in'), [fr.key, me], 6000);
	const fd = await page.evaluate((k) => window.__crew.doorInfo(k), fr.key);
	check('fridge: door opens and stays open while taking food', !!fin && fd.open === 1, fd);
	await page.keyboard.press('KeyX');
	const fc = await until(page, ([k, id]) => {
		const d = window.__crew.doorInfo(k);
		return d && !d.users.some((x) => x.id === id) && d.open === 0 ? d : null;
	}, [fr.key, me], 6000);
	check('fridge: closes after use', !!fc, fc);
	// unpowered: the door won't open, the prompt explains
	const up = await page.evaluate(([p, id]) => {
		const c = window.__crew;
		const it = c.items.find((i) => i.key === p.key);
		it.shed = true;
		c.teleport(id, p.deck, p.ax, p.az);
		window.__walk.face(p.x, p.z);
		const acts = window.__walk.actions();
		return acts;
	}, [fr, me]);
	check('fridge unpowered: prompt says the door won\'t open (no power)', up.some((l) => /door won't open \(no power\)/.test(l)), up);
	await page.evaluate((p) => (window.__crew.items.find((i) => i.key === p.key).shed = false), fr);
}

// ---- broken pod: door jammed ----
{
	const r = await page.evaluate(([p, id]) => {
		const c = window.__crew;
		window.__game.selectDeck(p.deck);
		const it = c.items.find((i) => i.key === p.key);
		it.broken = true;
		c.teleport(id, p.deck, p.ax, p.az);
		c.useSlot(c.agents[id], it, it.base.find((f) => f.id === 'privacy'), 0);
		return true;
	}, [pods[1], me]);
	const msg = await until(page, () => (/jammed/.test(window.__game.toast ?? '') ? window.__game.toast : null), null, 4000);
	const st = await page.evaluate(([p, id]) => ({ open: window.__crew.doorInfo(p.key).open, item: !!window.__crew.agents[id].item }), [pods[1], me]);
	check('broken pod: door won\'t open, toast explains', r && !!msg && st.open < 0.05 && !st.item, { msg, st });
	await page.evaluate((p) => (window.__crew.items.find((i) => i.key === p.key).broken = false), pods[1]);
}

// ---- AI crew member: walk in, door closes, finish, step out, door closes ----
{
	const b = await page.evaluate(([p, me]) => {
		const c = window.__crew;
		const b = c.agents.find((a) => a.id !== me);
		const it = c.items.find((i) => i.key === p.key);
		c.teleport(b.id, p.deck, p.ax, p.az);
		c.commit(b, it, it.base.find((f) => f.id === 'privacy'), 0);
		c.running = true;
		c.speed = 1;
		return b.id;
	}, [pods[1], me]);
	await startLog(pods[1].key, b);
	const bin = await until(page, ([k, id]) => window.__crew.doorInfo(k)?.users.find((x) => x.id === id && x.phase === 'in'), [pods[1].key, b], 15000);
	const din = await page.evaluate((k) => window.__crew.doorInfo(k), pods[1].key);
	const an2 = analyse(await getLog());
	check('AI: door opened before entry, inside, door closed while occupied', !!bin && din.open === 0 && an2.firstInside > an2.firstOpen && an2.insideWhileShut === 0 && Math.abs(bin.lx) < 0.5 && Math.abs(bin.lz) < 0.5, { an2, din });
	await page.evaluate((id) => (window.__crew.agents[id].useLeft = 0), b);
	const bout = await until(page, ([k, id]) => {
		const d = window.__crew.doorInfo(k);
		return d && !d.users.some((x) => x.id === id) ? d : null;
	}, [pods[1].key, b], 8000);
	await page.evaluate(() => (window.__crew.running = false));
	const lg = await getLog();
	const fo = lg.findIndex((s) => s.phase === 'out');
	const closed = await until(page, (k) => window.__crew.doorInfo(k).open === 0 || window.__crew.doorInfo(k).users.length > 0, pods[1].key, 4000);
	check('AI: on finish the door opens, they step out, door closes', !!bout && fo > 0 && lg[fo].open >= 0.99 && !!closed, { fo, out: !!bout });
}

// ---- swing arc reserved while the door moves ----
{
	const r = await page.evaluate(async ([p, me]) => {
		const c = window.__crew;
		const it = c.items.find((i) => i.key === p.key);
		const b = c.agents.find((a) => a.id !== me && a.item === null) ?? c.agents.find((a) => a.id !== me);
		c.release(b, false);
		// stand right in the swing (0.3 m in front of the door, hinge side)
		const m = window.__game.decks[p.deck].modules.find((mm) => mm.uid === it.uid);
		const a = (m.angle * Math.PI) / 180;
		const lx = -0.2, lz = 0.85;
		const wx = m.x + lx * Math.cos(a) + lz * Math.sin(a), wz = m.z - lx * Math.sin(a) + lz * Math.cos(a);
		c.teleport(b.id, p.deck, wx, wz);
		c.teleport(me, p.deck, p.ax + (p.ax - p.x) * 0.15, p.az + (p.az - p.z) * 0.15);
		c.useSlot(c.agents[me], it, it.base.find((f) => f.id === 'privacy'), 0);
		await new Promise((r) => setTimeout(r, 1500));
		const toLocal = (x, z) => [(x - m.x) * Math.cos(a) - (z - m.z) * Math.sin(a), (x - m.x) * Math.sin(a) + (z - m.z) * Math.cos(a)];
		const [bx, bz] = toLocal(b.x, b.z);
		return { before: [lx, lz], after: [+bx.toFixed(2), +bz.toFixed(2)] };
	}, [pods[0], me]);
	const moved = Math.hypot(r.after[0] - r.before[0], r.after[1] - r.before[1]) > 0.1 && !(Math.abs(r.after[0]) < 0.5 && r.after[1] > 0.5 && r.after[1] < 1.25);
	check('swing arc reserved: a crew member standing in it steps aside', moved, r);
	await page.keyboard.press('KeyX');
	await until(page, ([k, id]) => !window.__crew.doorInfo(k).users.some((x) => x.id === id), [pods[0].key, me], 8000);
}

// ---- cruise: float in, door closes ----
{
	await page.evaluate(() => window.__game.setMission('cruise'));
	await until(page, () => window.__crew.micro && window.__crew.agents.every((a) => a.m), null, 15000);
	await page.evaluate(() => (window.__crew.running = false));
	const r = await page.evaluate(([p, id]) => {
		const c = window.__crew;
		const it = c.items.find((i) => i.key === p.key);
		const a = c.agents[id];
		c.teleport(id, p.deck, p.ax, p.az);
		return c.useSlot(a, it, it.base.find((f) => f.id === 'privacy'), 0) ? (c.doorInfo(p.key).users[0]?.phase ?? 'none') : 'refused:' + window.__game.toast;
	}, [pods[0], me]);
	const cin = await until(page, ([k, id]) => window.__crew.doorInfo(k)?.users.find((x) => x.id === id && x.phase === 'in'), [pods[0].key, me], 20000);
	const cd = await page.evaluate((k) => window.__crew.doorInfo(k), pods[0].key);
	check('cruise: floats in, door closes behind', !!cin && cd.open === 0, { r, cd });
	await page.keyboard.press('KeyX');
	const cout = await until(page, ([k, id]) => !window.__crew.doorInfo(k).users.some((x) => x.id === id) && window.__crew.doorInfo(k).open === 0, [pods[0].key, me], 10000);
	check('cruise: exits and the door closes', !!cout);
	await page.evaluate(() => window.__game.setMission('surface'));
}

// ---- build mode: selection card shows the door + swing check ----
{
	await page.keyboard.press('Escape');
	await until(page, () => window.__game.mode !== 'walk', null, 5000);
	await page.evaluate((p) => {
		window.__game.selectDeck(p.deck);
		window.__game.tool = 'select';
		window.__game.selectedUid = p.uid;
	}, pod);
	const row = await page.locator('[data-testid="selcard-door"]').textContent({ timeout: 5000 }).catch(() => null);
	check('selection card: door row with swing check', !!row && /Hinged door · private · (✓ swing clear|✖ swing blocked)/.test(row), row);
}

check('no page errors', errors.length === 0, errors.slice(0, 5));
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
