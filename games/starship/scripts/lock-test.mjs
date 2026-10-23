// Headless test: lock / unlock equipment movement (desktop + iPhone 13).
// Usage: node scripts/lock-test.mjs [url]   (dev server running)
import { chromium, devices } from 'playwright';

const URL = process.argv[2] ?? 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let fails = 0;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, ok, info) => {
	if (!ok) fails++;
	console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info !== undefined ? ' ' + JSON.stringify(info) : ''}`);
};
const G = (page, fn, arg) => page.evaluate(fn, arg);
async function open(opts, clear = true) {
	const ctx = await browser.newContext(opts);
	const page = await ctx.newPage();
	page.setDefaultTimeout(90000);
	const errors = [];
	page.on('pageerror', (e) => errors.push(String(e)));
	page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
	await page.goto(URL, { waitUntil: 'networkidle' });
	if (clear) {
		await page.evaluate(() => localStorage.clear());
		await page.reload({ waitUntil: 'networkidle' });
	}
	await page.waitForFunction(() => !!window.__debug && !!window.__game);
	await wait(2000);
	return { ctx, page, errors };
}
/** a big floor module of deck 1 that is on screen and clickable (picks back to itself) */
async function target(page) {
	return G(page, () => {
		const g = window.__game;
		g.selectDeck(0);
		g.tool = 'select';
		const W = innerWidth, H = innerHeight;
		const cands = g.decks[0].modules
			.filter((m) => !m.mount)
			.map((m) => ({ m, p: window.__debug.toScreen(m.x, m.z), a: 0 }))
			.filter((o) => o.p.x > W * 0.3 && o.p.x < W * 0.85 && o.p.y > H * 0.2 && o.p.y < H * 0.7);
		const o = cands.sort((a, b) => Math.hypot(a.p.x - W * 0.55, a.p.y - H * 0.45) - Math.hypot(b.p.x - W * 0.55, b.p.y - H * 0.45))[0];
		return o ? { uid: o.m.uid, x: o.m.x, z: o.m.z, angle: o.m.angle, type: o.m.type } : null;
	});
}
const pos = (page, uid) => G(page, (uid) => { const m = window.__game.decks[0].modules.find((x) => x.uid === uid); return m ? { x: m.x, z: m.z, angle: m.angle, locked: !!m.locked } : null; }, uid);
async function dragFrom(page, uid, dx) {
	const p = await G(page, (uid) => { const m = window.__game.decks[0].modules.find((x) => x.uid === uid); return window.__debug.toScreen(m.x, m.z); }, uid);
	await page.mouse.move(p.x, p.y);
	await page.mouse.down();
	for (let k = 1; k <= 8; k++) await page.mouse.move(p.x + (dx * k) / 8, p.y + (dx * k) / 16);
	await page.mouse.up();
	await wait(300);
}

// ---------------- desktop ----------------
{
	const { ctx, page, errors } = await open({ viewport: { width: 1440, height: 900 } });
	let t = await target(page);
	// select it by clicking
	const sp = await G(page, (t) => window.__debug.toScreen(t.x, t.z), t);
	await page.mouse.click(sp.x, sp.y);
	await wait(300);
	let selUid = await G(page, () => window.__game.selectedUid);
	if (selUid !== t.uid) {
		await G(page, (uid) => (window.__game.selectedUid = uid), t.uid);
		selUid = t.uid;
	}
	await page.keyboard.press('KeyL');
	await wait(200);
	const lockBtn = page.getByTestId('selcard-lock');
	const pressed = await lockBtn.getAttribute('aria-pressed');
	check('L locks the selection; card shows 🔒', (await pos(page, t.uid)).locked && pressed === 'true' && /locked/.test(await G(page, () => window.__game.toast)), { pressed });

	const az0 = await G(page, () => window.__rig.az);
	await dragFrom(page, t.uid, 160);
	const p1 = await pos(page, t.uid);
	const az1 = await G(page, () => window.__rig.az);
	check('locked: drag does not move it (camera orbits instead)', p1.x === t.x && p1.z === t.z && Math.abs(az1 - az0) > 0.02, { t, p1, daz: +(az1 - az0).toFixed(3) });
	check('locked: still selected after the drag', (await G(page, () => window.__game.selectedUid)) === t.uid);
	await page.keyboard.press('KeyR');
	await page.keyboard.press('KeyE');
	await wait(100);
	check('locked: R / E rotate refused', (await pos(page, t.uid)).angle === t.angle && /locked/.test(await G(page, () => window.__game.toast)));
	await page.keyboard.press('Delete');
	await wait(100);
	const toastDel = await G(page, () => window.__game.toast);
	check('locked: Delete refused with "… is locked" toast', !!(await pos(page, t.uid)) && /is locked/.test(toastDel), { toastDel });
	await page.getByRole('button', { name: 'Rotate 90°' }).click();
	check('locked: rotate button refused', (await pos(page, t.uid)).angle === t.angle);

	// undo / redo
	await page.keyboard.press('Control+KeyZ');
	const u = (await pos(page, t.uid)).locked;
	await page.keyboard.press('Control+Shift+KeyZ');
	const r = (await pos(page, t.uid)).locked;
	check('Ctrl+Z undoes the lock, Ctrl+Shift+Z redoes it', u === false && r === true, { u, r });

	// persists after reload (layout JSON)
	await wait(800);
	const saved = await G(page, () => JSON.parse(localStorage.getItem('starship-interior:save:v5') ?? '{}'));
	const savedLocked = (saved.decks?.[0]?.modules ?? []).filter((m) => m.locked).length;
	await page.reload({ waitUntil: 'networkidle' });
	await page.waitForFunction(() => !!window.__debug && !!window.__game);
	await wait(2000);
	const after = await G(page, (t) => window.__game.decks[0].modules.find((m) => m.type === t.type && Math.abs(m.x - t.x) < 1e-6 && Math.abs(m.z - t.z) < 1e-6), t);
	check('lock persists after reload (layout JSON has "locked": true)', savedLocked === 1 && after?.locked === true, { savedLocked, after: !!after });
	t = { ...t, uid: after.uid };

	// unlock with the card button → drag works
	await G(page, (uid) => { const g = window.__game; g.selectDeck(0); g.tool = 'select'; g.selectedUid = uid; }, t.uid);
	await wait(300);
	await page.getByTestId('selcard-lock').click();
	await wait(150);
	check('🔓 button unlocks', !(await pos(page, t.uid)).locked);
	let moved = false;
	for (const dx of [60, -60, 100, -100, 30]) {
		await dragFrom(page, t.uid, dx);
		const p = await pos(page, t.uid);
		if (p.x !== t.x || p.z !== t.z) { moved = true; break; }
	}
	check('unlocked: drag moves it', moved, await pos(page, t.uid));

	// lock all / unlock all on this deck; structural default
	await page.getByRole('button', { name: '🔒 Lock all on deck' }).click();
	const all = await G(page, () => { const g = window.__game; return { mods: g.decks[0].modules.every((m) => m.locked), shafts: g.shafts.filter((s) => s.from === 0 || s.to === 0).every((s) => s.locked) }; });
	await page.getByRole('button', { name: '🔓 Unlock all' }).click();
	const none = await G(page, () => window.__game.decks[0].modules.some((m) => m.locked));
	check('Lock all on deck / Unlock all', all.mods && all.shafts && !none, all);
	await G(page, () => window.__game.setLockStructural(true));
	const st = await G(page, () => window.__game.shafts.every((s) => s.locked));
	await G(page, () => { const g = window.__game; g.setLockStructural(false); g.setLocked(g.shafts.map((s) => s.uid), false); });
	check('"Lock ladders / hatches by default" locks every ladder', st);
	// crew can still use a locked item (lock does not touch the sim)
	await page.screenshot({ path: 'screenshot-lock.png' });
	check('desktop: no page errors', errors.length === 0, errors.slice(0, 5));
	await ctx.close();
}

// ---------------- mobile (iPhone 13) ----------------
{
	const { ctx, page, errors } = await open({ ...devices['iPhone 13'] });
	const t = await G(page, () => { const g = window.__game; g.selectDeck(0); g.tool = 'select'; const m = g.decks[0].modules.find((x) => !x.mount); g.selectedUid = m.uid; return { uid: m.uid, x: m.x, z: m.z }; });
	await wait(500);
	const btn = page.getByTestId('selcard-lock');
	await btn.tap();
	await wait(200);
	const locked = (await pos(page, t.uid)).locked;
	await page.screenshot({ path: 'screenshot-mobile-lock.png' });
	await page.getByTestId('selcard-delete').tap();
	await wait(150);
	check('mobile: lock button on the selection card locks; delete refused', locked && !!(await pos(page, t.uid)), { locked });
	await btn.tap();
	check('mobile: tap again unlocks', !(await pos(page, t.uid)).locked);
	check('mobile: no page errors', errors.length === 0, errors.slice(0, 5));
	await ctx.close();
}
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
