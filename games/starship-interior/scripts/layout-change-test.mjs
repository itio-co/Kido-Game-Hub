// Incremental layout changes: moving / adding equipment must not reset the crew sim.
// 1) move an item far from everyone → no crew member changes position / action / needs / reservation
// 2) move an item onto one crew member → only that one is nudged (< 1 m), everyone else untouched
// 3) delete an item someone is heading to / using → only they choose again; sim keeps running cleanly
// Usage: node scripts/layout-change-test.mjs [url]
import { chromium } from 'playwright';
const URL = process.argv[2] ?? 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
page.setDefaultTimeout(120000);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
let fails = 0;
const check = (name, ok, info) => {
	if (!ok) fails++;
	console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info !== undefined ? ' ' + JSON.stringify(info) : ''}`);
};
const G = (fn, a) => page.evaluate(fn, a);
await page.goto(URL, { waitUntil: 'networkidle' });
await G(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__crew && !!window.__game);
await page.getByRole('button', { name: /Start crew sim/ }).click();
await page.waitForFunction(() => window.__crew.enabled && window.__crew.agents.length > 0);

// helpers live in the page
await G(() => {
	const c = window.__crew, g = window.__game;
	window.__snap = () =>
		c.agents.map((a) => ({ id: a.id, deck: a.deck, x: +a.x.toFixed(4), z: +a.z.toFixed(4), state: a.state, action: a.action, item: a.item?.key ?? null, slot: a.slot, needs: Object.values(a.needs).map((v) => +v.toFixed(4)).join(','), eff: a.effects.length }));
	window.__diff = (A, B) => A.filter((a, i) => JSON.stringify(a) !== JSON.stringify(B[i])).map((a) => a.id);
	window.__warm = (n) => {
		c.running = true;
		for (let k = 0; k < n; k++) c.step(0.25);
		c.running = false;
	};
	g.setMission('surface');
	c.running = false; // the render loop must not advance the sim between our snapshots
	c.seed(11);
	c.reset();
	c.speed = 16;
});
await G(() => window.__warm(240)); // ~1 sim hour: crew spread out, some using items, some walking
const before = await G(() => ({ unstuck: window.__crew.safety.unstuck, states: window.__crew.agents.map((a) => a.state) }));
console.log('crew states', JSON.stringify(before.states));

// ---- 1) move an item far from everyone, not used / targeted by anyone ----
const far = await G(() => {
	const c = window.__crew, g = window.__game;
	const s0 = window.__snap();
	for (let k = 0; k < g.decks.length; k++)
		for (const m of g.decks[k].modules) {
			if (c.agents.some((a) => a.item?.uid === m.uid || a.plan?.it?.uid === m.uid)) continue;
			if (c.agents.some((a) => a.deck === k && Math.hypot(a.x - m.x, a.z - m.z) < 2.5)) continue;
			for (const [dx, dz] of [[0.2, 0], [-0.2, 0], [0, 0.2], [0, -0.2]]) {
				if (!g.check(m.type, m.x + dx, m.z + dz, m.angle, m.uid, k, m.y ?? 0).ok) continue;
				m.x += dx;
				m.z += dz;
				g.decks[k] = { ...g.decks[k] };
				c.rebuild();
				const s1 = window.__snap();
				return { moved: `${m.type}@D${k + 1}`, changed: window.__diff(s0, s1), last: c.lastLayout, layout: c.safety.layoutChanges };
			}
		}
	return null;
});
check('far move: an item was moved (incremental rebuild ran)', !!far && far.layout >= 1, far);
check('far move: no crew member changed (position, action, needs, reservation)', !!far && far.changed.length === 0 && far.last.nudged.length === 0 && far.last.dropped.length === 0, far);

// ---- 2) move an item onto one crew member ----
const onto = await G(() => {
	const c = window.__crew, g = window.__game;
	for (let tries = 0; tries < 30; tries++, window.__warm(8))
	for (const a of c.agents) {
		if (a.state === 'use' || a.state === 'strapped' || a.climbPhase === 1 || a.hidden) continue;
		if (c.agents.some((b) => b !== a && b.deck === a.deck && Math.hypot(b.x - a.x, b.z - a.z) < 1.5)) continue; // the new item covers exactly one person
		const k = a.deck;
		for (const m of g.decks[k].modules) {
			if (!['locker', 'trash', 'waterdispenser', 'chair', 'foodwarmer'].includes(m.type)) continue;
			if (c.agents.some((b) => b.item?.uid === m.uid)) continue;
			for (const ang of [0, 90, 180, 270]) {
				if (!g.check(m.type, a.x, a.z, ang, m.uid, k, m.y ?? 0).ok) continue;
				const s0 = window.__snap();
				const tol0 = window.__crew.safety.unstuck;
				m.x = a.x;
				m.z = a.z;
				m.angle = ang;
				g.decks[k] = { ...g.decks[k] };
				c.rebuild();
				const s1 = window.__snap();
				const changed = window.__diff(s0, s1);
				const others = s1.filter((b) => b.id !== a.id);
				const othersMoved = others.filter((b) => {
					const o = s0[b.id];
					return o.x !== b.x || o.z !== b.z || o.deck !== b.deck || o.needs !== b.needs;
				}).map((b) => b.id);
				return { who: a.id, moved: `${m.type}@D${k + 1}`, changed, othersMoved, last: c.lastLayout, toast: g.toast, unstuck: window.__crew.safety.unstuck - tol0 };
			}
		}
	}
	return null;
});
check('onto agent: an item was placed onto a crew member', !!onto, onto);
if (onto) {
	const n = onto.last.nudged;
	check('onto agent: only that crew member was nudged, < 1 m', n.length === 1 && n[0].id === onto.who && n[0].d < 1, n);
	check('onto agent: everyone else kept position and needs', onto.othersMoved.length === 0, onto.othersMoved);
	check('onto agent: toast "Layout changed: N crew re-routed"', /Layout changed: \d+ crew re-routed/.test(onto.toast ?? ''), onto.toast);
	check('onto agent: no watchdog unstuck needed', onto.unstuck === 0, onto.unstuck);
}

// ---- 3) delete an item someone is using or heading to ----
const del = await G(() => {
	const c = window.__crew, g = window.__game;
	const a = c.agents.find((x) => x.item && !x.item.virtual && x.state !== 'strapped' && (x.state === 'use' || x.state === 'move'));
	if (!a) return null;
	const s0 = window.__snap();
	const uid = a.item.uid, k = a.item.deck;
	const users = c.agents.filter((b) => b.item?.uid === uid && b.item?.deck === k).map((b) => b.id);
	g.decks[k] = { ...g.decks[k], modules: g.decks[k].modules.filter((m) => m.uid !== uid) };
	c.rebuild();
	const s1 = window.__snap();
	const changed = window.__diff(s0, s1);
	return { who: a.id, users, changed, dropped: c.lastLayout.dropped, freed: c.agents.filter((b) => users.includes(b.id)).every((b) => b.item === null) };
});
check('delete target: its users released their reservation', !!del && del.freed && del.users.every((u) => del.dropped.includes(u)), del);
check('delete target: nobody else changed', !!del && del.changed.every((id) => del.users.includes(id)), del);

// ---- ladder moved while someone is on it: they step off at a valid point and re-plan ----
const climb = await G(() => {
	const c = window.__crew, g = window.__game;
	c.speed = 4;
	for (let t = 0; t < 400; t++) {
		const a = c.agents.find((x) => x.climbPhase === 1);
		if (a) {
			const leg = a.legs[a.leg];
			const sh = g.shafts.find((s) => Math.hypot(s.x - c.world.portals[leg.portal].bottom.x, s.z - c.world.portals[leg.portal].bottom.z) < 1.5) ?? g.shafts[0];
			const others = window.__snap().filter((b) => b.id !== a.id);
			sh.x += 0.1;
			g.shafts = [...g.shafts];
			c.rebuild();
			const after = window.__snap().filter((b) => b.id !== a.id);
			const movedOthers = after.filter((b, i) => b.x !== others[i].x || b.z !== others[i].z).map((b) => b.id);
			return { who: a.id, cp: a.climbPhase, valid: c.invalidAgents().every((x) => x.id !== a.id), replanned: c.lastLayout.replanned.includes(a.id), movedOthers, state: a.state };
		}
		window.__warm(1);
	}
	return null;
});
if (climb) check('ladder moved mid-climb: climber steps off validly and re-plans, others keep position', climb.cp === 0 && climb.valid && climb.replanned && climb.movedOthers.length === 0, climb);
else console.log('SKIP ladder mid-climb (nobody climbed during the window)');

// ---- keep running: no invalid bodies, no watchdog snaps, crew pick new actions ----
const after = await G(() => {
	const c = window.__crew;
	const u0 = c.safety.unstuck;
	window.__warm(160);
	return { invalid: c.invalidAgents(), unstuck: c.safety.unstuck - u0, idleStuck: c.agents.filter((a) => a.state === 'idle' && a.idleLeft > 60).length, csv: c.csv().includes('layout_nudged') };
});
check('after changes: sim keeps running, nobody in invalid space, no unstuck', after.invalid.length === 0 && after.unstuck === 0, after);
check('CSV reports layout nudges / re-plans', after.csv);

// ---- planner drag (UI path): a real move via the game API is picked up by step() without a reset ----
const ui = await G(() => {
	const c = window.__crew, g = window.__game;
	const s0 = window.__snap();
	const n0 = c.safety.layoutChanges;
	const k = g.current;
	const cands = g.decks[k].modules.filter((x) => !c.agents.some((a) => a.item?.uid === x.uid) && !c.agents.some((a) => a.deck === k && Math.hypot(a.x - x.x, a.z - x.z) < 2.5));
	let ok = false;
	for (const m of cands) {
		const a0 = m.angle;
		g.selectedUid = m.uid;
		g.tool = 'select';
		for (const d of [90, -90, 180, 15]) {
			g.rotate(d);
			if (g.decks[k].modules.find((x) => x.uid === m.uid).angle !== a0) break;
		}
		if (g.decks[k].modules.find((x) => x.uid === m.uid).angle !== a0) {
			ok = true;
			break;
		}
	}
	for (let i = 0; i < 4; i++) c.step(0.25); // paused: nav refresh only
	return { ok, changes: c.safety.layoutChanges - n0, changed: window.__diff(s0, window.__snap()) };
});
check('rotate in the planner: incremental rebuild, crew untouched', !!ui && ui.changes >= 1 && ui.changed.length === 0, ui);
check('no page errors', errors.length === 0, errors.slice(0, 3));
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
