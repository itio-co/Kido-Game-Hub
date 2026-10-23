// "Like a real user" E-interact test: real key down/up with human timings, emulated pointer lock, focus left on HUD
// buttons, Thai layout events, missing key-ups (blur), a busy main thread, empty `code`, the F9 debug overlay,
// and possessed crew with the sim RUNNING. Usage: node scripts/interact-real-test.mjs [url]
import { chromium } from 'playwright';
const URL = process.argv[2] ?? 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let fails = 0;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, ok, info) => {
	if (!ok) fails++;
	console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info !== undefined ? ' ' + JSON.stringify(info) : ''}`);
};
const G = (page, fn, arg) => page.evaluate(fn, arg);
async function until(page, fn, arg, ms = 15000) {
	const t0 = Date.now();
	for (;;) {
		const v = await page.evaluate(fn, arg);
		if (v || Date.now() - t0 > ms) return v;
		await wait(150);
	}
}
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
// pointer-lock emulation (headless Chrome refuses the real lock): lock / unlock events like a desktop browser
await ctx.addInitScript(() => {
	let el = null;
	Object.defineProperty(Document.prototype, 'pointerLockElement', { get: () => el, configurable: true });
	Element.prototype.requestPointerLock = function () {
		el = this;
		setTimeout(() => document.dispatchEvent(new Event('pointerlockchange')), 0);
		return Promise.resolve();
	};
	Document.prototype.exitPointerLock = function () {
		el = null;
		setTimeout(() => document.dispatchEvent(new Event('pointerlockchange')), 0);
	};
});
const page = await ctx.newPage();
page.setDefaultTimeout(90000);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(URL, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__game && !!window.__crew);
await wait(1200);
const cdp = await ctx.newCDPSession(page);
/** Thai Kedmanee E key: code KeyE, key "ำ" (as Chrome on Windows reports it) */
async function thaiE(holdMs = 120) {
	await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyE', key: 'ำ', text: 'ำ', unmodifiedText: 'ำ', windowsVirtualKeyCode: 69, nativeVirtualKeyCode: 69 });
	await wait(holdMs);
	await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyE', key: 'ำ', windowsVirtualKeyCode: 69, nativeVirtualKeyCode: 69 });
}
async function tapE(holdMs = 140) {
	await page.keyboard.down('KeyE');
	await wait(holdMs);
	await page.keyboard.up('KeyE');
}
const W = (fn, arg) => G(page, fn, arg);
const toast = () => W(() => window.__game.toast ?? '');
/** stand ~dist m from module m (free spot, not inside anything), facing it */
const standNear = (type, dist = 1.0) =>
	W(({ type, dist }) => {
		const g = window.__game, w = window.__walk;
		const m = g.decks[g.walkDeck].modules.find((x) => new RegExp(type).test(x.type));
		if (!m) return null;
		for (const r of [dist, dist + 0.2, dist + 0.4, dist - 0.2])
			for (let a = 0; a < Math.PI * 2; a += 0.2) {
				const x = m.x + Math.cos(a) * r, z = m.z + Math.sin(a) * r;
				if (Math.hypot(x, z) > 4.1) continue;
				w.place(x, z);
				w.face(m.x, m.z);
				w.look(-0.25);
				const l = w.actions();
				if (l.length && !/Climb/.test(l[0])) return { type: m.type, at: [x, z], actions: l };
			}
		return null;
	}, { type, dist });

// ---- 1. walk mode entered with the sidebar button, canvas click locks the pointer, E at the ladder climbs ----
await W(() => window.__game.selectDeck(0));
await page.getByRole('button', { name: /Walk/ }).first().click();
await page.waitForFunction(() => !!window.__walk && window.__game.mode === 'walk');
await wait(600);
await page.mouse.click(760, 420);
await wait(300);
const locked = await W(() => window.__game.pointerLocked);
const sp = await W(() => window.__walk.actions());
await tapE();
const climbing = await until(page, () => window.__walk.climbing() || window.__game.walkDeck === 1, null, 4000);
check('walk (pointer lock on): E at the spawn ladder climbs', locked && /Climb up/.test(sp[0] ?? '') && !!climbing, { locked, sp });
await until(page, () => !window.__walk.climbing(), null, 20000);
await W(() => { const w = window.__walk; window.__game.walkDeck = 0; w.place(1.5, 1.5); });
await wait(300);

// ---- 2. walk near a chair with real W presses, short E → sits ----
let near = await standNear('chair|couch', 1.3);
check('setup: a seat within reach', !!near, near);
if (near) {
	await page.keyboard.down('KeyW');
	await wait(350);
	await page.keyboard.up('KeyW');
	await wait(200);
	const labels = await W(() => window.__walk.actions());
	await tapE(160);
	await wait(300);
	const seated = await W(() => window.__walk.seated());
	const menuOpen = await page.getByTestId('interact-menu').isVisible().catch(() => false);
	const t2 = await toast();
	const ran = /^Sit/.test(labels[0]) ? seated : /^Inspect/.test(labels[0]) ? /kg/.test(t2) : false;
	check('walk: after walking up with W, a short E (160 ms) runs the best action', ran && !menuOpen, { best: labels[0], seated, menuOpen, toast: t2 });
	if (!seated) near = await standNear('chair|couch', 1.0), await tapE(120), await wait(200);
	await tapE(100); // stand up
	await wait(200);
	// ---- 3. long hold opens the list, Esc closes ----
	await page.keyboard.down('KeyE');
	await wait(700);
	const menu = await page.getByTestId('interact-menu').isVisible().catch(() => false);
	await page.keyboard.up('KeyE');
	await wait(150);
	const stillSeated = await W(() => window.__walk.seated());
	await page.keyboard.press('Escape');
	check('walk: holding E 0.7 s opens the action list (no action on release)', menu && !stillSeated, { menu, stillSeated });
}

// ---- 4. focus stuck on a HUD button (💡) after a click ----
await page.getByTestId('light-tone').click();
const tone0 = await W(() => window.__game.interiorTone);
near = await standNear('chair|couch', 1.0);
await tapE(120);
await wait(250);
const seatedAfterFocus = await W(() => window.__walk.seated());
const focusAfter = await W(() => document.activeElement?.tagName);
await page.keyboard.press('Space'); // must climb / hint, not toggle the focused light button
await wait(300);
const tone1 = await W(() => window.__game.interiorTone);
check('walk: E works with focus left on a HUD button, and focus is released (Space no longer clicks it)', seatedAfterFocus && focusAfter !== 'BUTTON' && tone0 === tone1, { seatedAfterFocus, focusAfter, tone0, tone1 });
if (await W(() => window.__walk.seated())) await tapE(100);

// ---- 5. Thai layout (code KeyE, key "ำ") ----
near = await standNear('chair|couch', 1.0);
await thaiE(130);
await wait(300);
check('walk: Thai layout E (key "ำ") interacts', await W(() => window.__walk.seated()), near?.actions);
if (await W(() => window.__walk.seated())) await tapE(100);

// ---- 6. key-up lost (window blur mid-press) still acts once ----
near = await standNear('chair|couch', 1.0);
const multi = (near?.actions.length ?? 0) > 1;
await page.keyboard.down('KeyE');
await wait(80);
await W(() => window.dispatchEvent(new Event('blur')));
await wait(150);
const sBlur = await W(() => window.__walk.seated());
await page.keyboard.up('KeyE'); // late key-up must not act a second time
await wait(200);
const sBlur2 = await W(() => window.__walk.seated());
check('walk: a press whose key-up is lost (blur) still acts exactly once', multi && sBlur && sBlur2, { multi, sBlur, sBlur2 });
if (await W(() => window.__walk.seated())) await tapE(100);

// ---- 7. busy main thread: short press, hold timer fires before the key-up is handled ----
near = await standNear('chair|couch', 1.0);
await W(() => setTimeout(() => { const t = performance.now(); while (performance.now() - t < 900); }, 60));
await page.keyboard.down('KeyE');
await wait(120);
await page.keyboard.up('KeyE');
await wait(1400);
const sJank = await W(() => window.__walk.seated());
const mJank = await page.getByTestId('interact-menu').isVisible().catch(() => false);
check('walk: short press during a 0.9 s frame stall still acts (key-up timestamp), no stray list', sJank && !mJank, { sJank, mJank });
if (await W(() => window.__walk.seated())) await tapE(100);
if (mJank) await page.keyboard.press('Escape');

// ---- 8. empty `code` (remote desktop / VM): key fallback ----
near = await standNear('chair|couch', 1.0);
await W(() => {
	window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', code: '', bubbles: true }));
	window.dispatchEvent(new KeyboardEvent('keyup', { key: 'e', code: '', bubbles: true }));
});
await wait(250);
check('walk: E with an empty event.code (key fallback) interacts', await W(() => window.__walk.seated()));
if (await W(() => window.__walk.seated())) await tapE(100);

// ---- 9. long items count from their nearest side; nothing in reach says so ----
const longItem = await W(() => {
	const g = window.__game, w = window.__walk;
	const m = g.decks[0].modules.find((x) => /bunk|galley|workstation|bed/.test(x.type));
	if (!m) return null;
	return { type: m.type };
});
if (longItem) {
	const r = await standNear(longItem.type, 1.6);
	check('walk: a long item is reachable from ~1.3 m off its nearest edge', !!r, r);
}
await W(() => { const w = window.__walk; w.place(0, 0); });
const empty = await W(() => {
	const w = window.__walk;
	for (let a = 0; a < Math.PI * 2; a += 0.15)
		for (const r of [3.9, 3.5, 3, 2.5]) {
			w.place(Math.cos(a) * r, Math.sin(a) * r);
			w.face(Math.cos(a) * 10, Math.sin(a) * 10);
			if (!w.actions().length) return true;
		}
	return false;
});
if (empty) {
	await tapE();
	await wait(200);
	check('walk: E with nothing in reach shows a hint', /Nothing to interact with/.test(await toast()), await toast());
} else console.log('SKIP nothing-in-reach (deck full)');

// ---- 10. F9 debug overlay ----
await page.keyboard.press('F9');
await tapE(90);
await wait(200);
const dbg = await page.getByTestId('interact-debug').textContent().catch(() => '');
await page.keyboard.press('F9');
const dbgOff = await page.getByTestId('interact-debug').isVisible().catch(() => false);
check('F9 debug overlay logs key events (code / key / target) and the result; F9 hides it', /keydown code=KeyE/.test(dbg) && /keyup code=KeyE/.test(dbg) && /→/.test(dbg) && !dbgOff, { dbg: dbg.slice(0, 300) });
await page.keyboard.press('KeyF');
await page.waitForFunction(() => window.__game.mode === 'build');

// ---- 11. possessed crew with the sim RUNNING: real E next to an item ----
await W(() => window.__crew.start());
await page.waitForFunction(() => window.__crew.agents.length > 0 && !!window.__crew.world);
await wait(800);
const slot = await W(() => {
	const c = window.__crew;
	const it = c.items.find((i) => i.deck === 0 && /Locker|Galley|Water|Trash|Treadmill|Food/.test(i.label) && i.slots.some((s) => s.occ === null) && !i.broken);
	if (!it) return null;
	const s = it.slots.find((s) => s.occ === null);
	return { x: s.x, z: s.z, ax: s.ax, az: s.az, label: it.label };
});
await W((s) => { const c = window.__crew; c.possess(0); c.teleport(0, 0, s.ax, s.az); c.input.yaw = Math.atan2(-(s.x - s.ax), -(s.z - s.az)); }, slot);
await wait(700);
await page.mouse.click(760, 420); // like a user clicking into the view
await wait(200);
const before = await W(() => window.__crew.actions().map((a) => a.label));
await tapE(150);
const used = await until(page, () => { const a = window.__crew.agents[0]; return a.state === 'use' || (a.item && a.state === 'move') ? { state: a.state, item: a.item?.label } : null; }, null, 6000);
check('possessed (sim running): a real E press next to an item uses it', !!used && used.item === slot.label, { before, used, toast: await toast() });
// Thai E stops it (Stop is the only action → acts on key-down)
await until(page, () => window.__crew.agents[0].state === 'use', null, 8000);
await thaiE(110);
await wait(400);
check('possessed: Thai E on "Stop: …" stops the activity', (await W(() => window.__crew.agents[0].state)) !== 'use');
check('no page errors', errors.length === 0, errors.slice(0, 3));
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
