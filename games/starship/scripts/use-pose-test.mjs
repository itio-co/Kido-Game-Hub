// Headless test: exact use-pose / position alignment per affordance slot. Crew (AI + your avatar) blend from the
// approach point into the slot's exact transform (position, facing, body pose), snap within 5 cm / 10°, reverse
// on exit; multi-seat items use the reserved slot; Designer use-point editor; E while climbing gives feedback.
// Screenshot: screenshot-use-poses.png
// Usage: node scripts/use-pose-test.mjs [url]   (dev server running)
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
		await wait(100);
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
await wait(800);
await page.evaluate(() => {
	window.__game.quality = 'low';
	const c = window.__crew;
	c.start();
	c.running = false;
});
await until(page, () => window.__crew.items.length > 0, null, 10000);

// in-page helpers: start a use on an item slot for an agent standing at the approach point; sample the blend
await page.evaluate(() => {
	const c = window.__crew;
	window.__use = (id, key, affId, slot) => {
		const it = c.items.find((i) => i.key === key);
		const af = it.affords.find((f) => f.id === affId) ?? it.affords[0];
		const s = it.slots[slot];
		c.teleport(id, it.deck, s.ax, s.az);
		const a = c.agents[id];
		a.yaw = Math.atan2(s.x - s.ax, s.z - s.az) + 0.6; // facing a bit off: the blend must turn the body
		const ok = c.useSlot(a, it, af, slot);
		window.__t0 = a.av.t; // samples after the next avatar sync only (the body jumped here by teleport)
		return ok;
	};
	window.__xfErr = (id) => {
		const a = c.agents[id];
		const u = c.useXf(a.item, a.aff, a.slot);
		const fy = window.__game.floorY[a.deck] ?? 0;
		let dy = a.av.yaw - u.yaw;
		dy = Math.abs(Math.atan2(Math.sin(dy), Math.cos(dy))) * 180 / Math.PI;
		return { dPos: Math.hypot(a.av.x - u.x, a.av.z - u.z), dY: Math.abs(a.av.y - (fy + u.y)), dYaw: dy, pose: a.av.pose, want: u.pose, mix: a.av.mix ?? 1, dock: a.dock, door: a.door };
	};
	window.__sample = (id) => {
		clearInterval(window.__sT);
		window.__s = [];
		window.__sT = setInterval(() => {
			const a = c.agents[id];
			window.__s.push({ t: a.av.t, x: a.av.x, z: a.av.z, y: a.av.y, yaw: a.av.yaw, mix: a.av.mix ?? 1, dock: a.dock, state: a.state, door: a.door, pose: a.av.pose });
		}, 30);
	};
});
const samples = () => page.evaluate(() => (clearInterval(window.__sT), window.__s));
/** blend quality from samples: ≥ 3 distinct intermediate frames, no jumps, dock monotonic */
function blendOK(ss, dir) {
	const mid = ss.filter((s) => s.dock > 0.02 && s.dock < 0.98);
	const distinct = new Set(mid.map((s) => s.dock.toFixed(3))).size;
	let jump = 0, mono = true;
	for (let i = 1; i < ss.length; i++) {
		jump = Math.max(jump, Math.hypot(ss[i].x - ss[i - 1].x, ss[i].z - ss[i - 1].z));
		if (dir > 0 ? ss[i].dock < ss[i - 1].dock - 1e-6 : ss[i].dock > ss[i - 1].dock + 1e-6) mono = false;
	}
	const mixMid = mid.some((s) => s.mix > 0.02 && s.mix < 0.98);
	return { ok: distinct >= 3 && jump < 0.35 && mono && mixMid, distinct, jump: +jump.toFixed(3), mono, mixMid };
}

// ---- AI crew: one item per kind, end transform matches the slot ----
const kinds = await page.evaluate(() => {
	const c = window.__crew, want = ['workstation', 'bunk', 'treadmill', 'galley', 'waterdispenser', 'couch', 'hygiene', 'fridge', 'galleytable', 'table'];
	const out = [];
	for (const id of want) {
		const it = c.items.find((i) => i.def.id === id && !i.virtual && i.slots.some((s) => s.occ === null && s.cell >= 0) && !i.broken);
		if (it) out.push({ id, key: it.key, aff: it.affords[0].id, slot: it.slots.findIndex((s) => s.occ === null && s.cell >= 0) });
	}
	return out;
});
check('items to test found', kinds.length >= 5, kinds.map((k) => k.id));
const aiId = await page.evaluate(() => window.__crew.agents.find((a) => !a.possessed).id);
const worst = { dPos: 0, dYaw: 0, dY: 0 };
let firstBlend = null;
for (const k of kinds) {
	await page.evaluate(([id, k]) => { window.__sample(id); return window.__use(id, k.key, k.aff, k.slot); }, [aiId, k]);
	const done = await until(page, (id) => { const a = window.__crew.agents[id]; return a.state === 'use' && a.dock >= 1 && (!a.door || a.door === 'in') ? true : null; }, aiId, 20000);
	await wait(150);
	const e = await page.evaluate((id) => window.__xfErr(id), aiId);
	const ss = await samples();
	const t0 = await page.evaluate(() => window.__t0);
	const b = blendOK(ss.filter((x) => x.state === 'use' && x.t > t0), 1);
	if (!firstBlend) firstBlend = b;
	worst.dPos = Math.max(worst.dPos, e.dPos);
	worst.dYaw = Math.max(worst.dYaw, e.dYaw);
	worst.dY = Math.max(worst.dY, e.dY);
	check(`${k.id}: snapped to the slot transform (≤ 5 cm, ≤ 10°) in the slot pose`, !!done && e.dPos <= 0.05 && e.dY <= 0.05 && e.dYaw <= 10 && e.pose === e.want, { dPos: +e.dPos.toFixed(3), dY: +e.dY.toFixed(3), dYaw: +e.dYaw.toFixed(1), pose: e.pose, want: e.want });
	check(`${k.id}: smooth blend in (position, facing and pose mix)`, b.ok, b);
	// exit: reverse blend to the approach point, then released
	await page.evaluate((id) => { window.__sample(id); window.__crew.finishUse(window.__crew.agents[id]); }, aiId);
	const out = await until(page, (id) => (window.__crew.agents[id].item === null ? true : null), aiId, 15000);
	const so = await samples();
	const bo = blendOK(so.filter((s) => s.state === 'use' && s.door === 'out'), -1);
	const end = await page.evaluate((id) => ({ state: window.__crew.agents[id].state, pose: window.__crew.agents[id].av.pose }), aiId);
	check(`${k.id}: reverse blend on exit, then released`, !!out && bo.ok && end.state === 'idle', { bo, end });
}
check('all end transforms within 5 cm / 10°', worst.dPos <= 0.05 && worst.dYaw <= 10 && worst.dY <= 0.05, { dPos: +worst.dPos.toFixed(3), dYaw: +worst.dYaw.toFixed(1), dY: +worst.dY.toFixed(3) });

// ---- multi-seat: two crew at one table each take their reserved slot's transform ----
{
	const r = await page.evaluate(async () => {
		const c = window.__crew;
		const it = c.items.find((i) => (i.def.id === 'galleytable' || i.def.id === 'table') && i.slots.filter((s) => s.occ === null && s.cell >= 0).length >= 2);
		if (!it) return null;
		const free = it.slots.map((s, i) => (s.occ === null && s.cell >= 0 ? i : -1)).filter((i) => i >= 0);
		const ids = c.agents.filter((a) => !a.possessed).slice(0, 2).map((a) => a.id);
		const af = it.affords.find((f) => f.id === 'chat') ?? it.affords[it.affords.length - 1];
		window.__use(ids[0], it.key, af.id, free[0]);
		window.__use(ids[1], it.key, af.id, free[free.length - 1]);
		return { ids, slots: [free[0], free[free.length - 1]], key: it.key, label: it.label };
	});
	if (r) {
		await until(page, (ids) => ids.every((id) => window.__crew.agents[id].dock >= 1 && window.__crew.agents[id].state === 'use'), r.ids, 15000);
		await wait(150);
		const e = await page.evaluate((ids) => ids.map((id) => ({ ...window.__xfErr(id), slot: window.__crew.agents[id].slot })), r.ids);
		check('multi-seat: each crew member sits in its own reserved slot transform', e.every((x) => x.dPos <= 0.05 && x.dYaw <= 10) && e[0].slot !== e[1].slot, { label: r.label, e: e.map((x) => ({ slot: x.slot, dPos: +x.dPos.toFixed(3), dYaw: +x.dYaw.toFixed(1), pose: x.pose })) });
		await page.evaluate((ids) => ids.forEach((id) => { const c = window.__crew; c.release(c.agents[id], false); c.agents[id].state = 'idle'; }), r.ids);
	} else check('multi-seat table found', false);
}

// ---- screenshot: crew in their use poses on the galley deck ----
{
	const deck = await page.evaluate(() => {
		const c = window.__crew, g = window.__game;
		const score = (d) => c.items.filter((i) => i.deck === d && /table|galley|workstation|foodstation|couch/.test(i.def.id)).length;
		const d = [...g.decks.keys()].sort((a, b) => score(b) - score(a))[0];
		g.selectDeck(d);
		const its = c.items.filter((i) => i.deck === d && !i.virtual && i.affords.length && i.slots.some((s) => s.cell >= 0) && !i.door);
		const agents = c.agents.filter((a) => !a.possessed);
		let n = 0;
		for (const it of its) {
			for (let si = 0; si < it.slots.length && n < agents.length; si++) {
				if (it.slots[si].occ !== null || it.slots[si].cell < 0) continue;
				const af = it.affords.find((f) => c.usable(it, f)) ?? it.affords[0];
				if (window.__use(agents[n].id, it.key, af.id, si)) n++;
				if (it.slots.length > 1 && si >= 1) break;
			}
			if (n >= agents.length) break;
		}
		return { d, n };
	});
	await until(page, () => window.__crew.agents.filter((a) => a.state === 'use').every((a) => a.dock >= 1), null, 15000);
	await page.evaluate(() => { const r = window.__rig; if (r?.orbitStep) r.orbitStep(0.4); });
	await wait(1500);
	await page.screenshot({ path: 'screenshot-use-poses.png' });
	check('screenshot: crew in use poses', deck.n >= 3, deck);
	await page.evaluate(() => window.__crew.agents.forEach((a) => { const c = window.__crew; if (a.item) { c.release(a, false); a.state = 'idle'; } }));
}

// ---- your avatar: walk mode, E on a workstation → exact transform; X → reverse blend ----
{
	await page.evaluate(() => window.__game.selectDeck(window.__crew.items.find((i) => i.def.id === 'workstation').deck));
	await page.keyboard.press('KeyF');
	await page.waitForFunction(() => !!window.__walk?.avatar && window.__game.mode === 'walk');
	await page.evaluate(() => (window.__crew.running = false));
	const me = await page.evaluate(() => window.__crew.possessed);
	const ws = await page.evaluate((me) => {
		const c = window.__crew;
		const it = c.items.find((i) => i.def.id === 'workstation' && i.slots[0].occ === null);
		const s = it.slots[0];
		c.teleport(me, it.deck, s.ax + (s.ax - s.x) * 0.2, s.az + (s.az - s.z) * 0.2);
		window.__walk.face(s.x, s.z);
		return window.__walk.actions();
	}, me);
	const wi = ws.findIndex((l) => /Work at console/.test(l));
	if (wi === 0) await page.keyboard.press('KeyE');
	else if (wi > 0) { await page.keyboard.press('Shift+KeyE'); await page.keyboard.press(`Digit${wi + 1}`); }
	const ok = await until(page, (id) => { const a = window.__crew.agents[id]; return a.state === 'use' && a.dock >= 1; }, me, 15000);
	await wait(200);
	const e = await page.evaluate((id) => window.__xfErr(id), me);
	check('your avatar: E → seated at the console in the exact slot transform', wi >= 0 && !!ok && e.dPos <= 0.05 && e.dYaw <= 10 && e.dY <= 0.05 && e.pose === 'sitwork', { wi, e });
	await page.evaluate((id) => window.__sample(id), me);
	await page.keyboard.press('KeyX');
	const out = await until(page, (id) => window.__crew.agents[id].state === 'idle', me, 8000);
	const so = await samples();
	check('your avatar: X stands up with a reverse blend', !!out && so.some((s) => s.door === 'out' && s.dock > 0.02 && s.dock < 0.98), { n: so.length });

	// E while climbing: feedback instead of nothing
	const lad = await page.evaluate((me) => {
		const c = window.__crew;
		const p = c.world.portals.find((pp) => pp.bottom.deck === c.agents[me].deck) ?? c.world.portals[0];
		c.teleport(me, p.bottom.deck, p.bottom.x, p.bottom.z);
		window.__game.selectDeck(p.bottom.deck);
		return c.climb(true);
	}, me);
	const climbing = await until(page, (id) => window.__crew.agents[id].climbPhase === 1, me, 10000);
	await page.evaluate(() => (window.__game.toast = null));
	await page.keyboard.press('KeyE');
	const toast = await until(page, () => (/Climbing/.test(window.__game.toast ?? '') ? window.__game.toast : null), null, 3000);
	const acts = await page.evaluate(() => window.__walk.actions());
	check('E while climbing: feedback toast + disabled "Climbing…" action', lad && !!climbing && !!toast && /Climbing…/.test(acts[0] ?? ''), { toast, acts });
	await until(page, (id) => window.__crew.agents[id].climbPhase !== 1, me, 15000);
	await page.keyboard.press('Escape');
	await until(page, () => window.__game.mode !== 'walk', null, 5000);
}

// ---- Designer: use-point editor (place / orient / pose) with ghost avatars ----
{
	await page.evaluate(() => (window.__game.designer = true));
	await wait(800);
	await page.evaluate(() => window.__equip.select('workstation'));
	const id = await until(page, () => window.__equip.duplicate('workstation'), null, 15000);
	await wait(1500);
	const st = await page.evaluate(() => ({ sel: window.__equip.selectedId, aff: window.__equip.selected?.affords?.length ?? 0, editable: window.__equip.editable }));
	const show = page.locator('[data-testid="slot-editor"] button.show').first();
	await show.click({ timeout: 10000 }).catch(() => {});
	await wait(500);
	const rows = await page.locator('[data-testid="slot-row"]').count();
	const ghosts0 = await page.locator('[data-testid="use-ghost"]').count();
	const x = page.getByLabel('Use point 1 X cm');
	await x.fill('12');
	await x.press('Enter');
	await x.dispatchEvent('change');
	await page.getByLabel('Use point 1 facing deg').fill('165');
	await page.getByLabel('Use point 1 facing deg').dispatchEvent('change');
	await page.getByLabel('Use point 1 pose').selectOption('sit');
	await page.locator('[data-testid="slot-add"]').click().catch(() => {});
	await wait(500);
	const after = await page.evaluate(() => window.__equip.selected.affords[0].slots);
	const ghosts1 = await page.locator('[data-testid="use-ghost"]').count();
	const tag = await page.locator('[data-testid="use-ghost"]').first().textContent().catch(() => '');
	check('designer: use-point editor edits position / facing / pose; ghost avatars follow', !!id && rows >= 1 && after?.[0]?.[0] === 0.12 && after?.[0]?.[3] === 165 && after?.[0]?.[4] === 'sit' && after.length === rows + 1 && ghosts1 === ghosts0 + 1 && /sit/.test(tag ?? ''), { id, st, rows, ghosts0, ghosts1, slot0: after?.[0], n: after?.length, tag });
	await page.screenshot({ path: 'screenshot-use-points-designer.png' });
}

check('no page errors', errors.length === 0, errors.slice(0, 5));
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
