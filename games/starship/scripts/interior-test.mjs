// Headless test: interior view (walk / possessed / cruise) renders full walls + ceilings, no section
// clipping, build mode restores the cut-away; camera stays inside the hull; mobile light budget.
// Screenshots: screenshot-walk-interior.png, screenshot-walk-ceiling.png, screenshot-cruise-interior.png,
// screenshot-mobile-walk-interior.png.   Usage: node scripts/interior-test.mjs [url]
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
async function open(opts) {
	const ctx = await browser.newContext(opts);
	const page = await ctx.newPage();
	page.setDefaultTimeout(90000);
	const errors = [];
	page.on('pageerror', (e) => errors.push(String(e)));
	page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
	await page.goto(URL, { waitUntil: 'networkidle' });
	await page.evaluate(() => localStorage.clear());
	await page.reload({ waitUntil: 'networkidle' });
	await page.waitForFunction(() => !!window.__game && !!window.__crew && !!window.__sceneCount);
	await wait(1500);
	return { ctx, page, errors };
}
const fps = (page, ms = 3000) => G(page, (ms) => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < ms) requestAnimationFrame(f); else res(+((n * 1000) / (performance.now() - t0)).toFixed(1)); }; requestAnimationFrame(f); }), ms);

// ---------------- desktop ----------------
{
	const { ctx, page, errors } = await open({ viewport: { width: 1440, height: 900 } });
	await G(page, () => { const g = window.__game; g.quality = 'high'; g.selectDeck(0); g.section = true; });
	await wait(500);
	const build0 = await G(page, () => ({ lining: window.__sceneCount('lining'), clip: window.__renderInfo().interior }));
	await page.keyboard.press('KeyF');
	await page.waitForFunction(() => !!window.__walk && window.__game.mode === 'walk');
	await wait(800);
	const walk = await G(page, () => {
		const g = window.__game;
		return { lining: window.__sceneCount('lining'), ceilings: window.__sceneCount('ceiling'), decks: g.decks.length, nose: window.__sceneCount('Nose dome (interior)'), info: window.__renderInfo() };
	});
	check('walk: full-height lining on every deck, ceilings under every upper deck, nose dome on top', walk.lining === walk.decks && walk.ceilings === walk.decks - 1 && walk.nose === 1, walk);
	check('walk: no section clipping even with ✂ section view on in build', walk.info.interior === true && walk.info.clippedMaterials === 0, { clipped: walk.info.clippedMaterials });
	// look along the wall towards a ladder: ceiling + hatch + ladder in view
	await G(page, () => { const g = window.__game, sh = g.shafts.find((x) => x.from === 0), w = window.__walk; w.place(sh.x + 1.6, sh.z + 1.2); w.face(sh.x, sh.z); w.look(0.15); });
	await wait(1500);
	await page.screenshot({ path: 'screenshot-walk-interior.png' });
	await G(page, () => window.__walk.look(1.0));
	await wait(1000);
	await page.screenshot({ path: 'screenshot-walk-ceiling.png' });
	await G(page, () => window.__walk.look(0));
	// walking into the wall: the camera stays inside the lining
	let r = 0;
	for (let k = 0; k < 16 && r < 4.1; k++) {
		const a = (k / 16) * Math.PI * 2;
		await G(page, (a) => { const w = window.__walk; w.place(Math.cos(a) * 3.9, Math.sin(a) * 3.9); w.face(Math.cos(a) * 10, Math.sin(a) * 10); }, a);
		await page.keyboard.down('ShiftLeft');
		await page.keyboard.down('KeyW');
		await wait(3000);
		await page.keyboard.up('KeyW');
		await page.keyboard.up('ShiftLeft');
		r = await G(page, () => { const p = window.__walk.pos(); return Math.hypot(p[0], p[2]); });
	}
	check('walk: walking into the wall stops before the lining (camera r ≤ R − 0.2 m)', r > 4.1 && r <= 4.5 - 0.2, { r: +r.toFixed(3) });
	// tone toggle
	await page.getByTestId('light-tone').click();
	const tone = await G(page, () => window.__game.interiorTone);
	await page.getByTestId('light-tone').click();
	check('💡 toggles warm / cool interior light', tone === 'cool' && (await G(page, () => window.__game.interiorTone)) === 'warm');
	const dfps = await fps(page);
	// back to build: cut-away restored
	await page.keyboard.press('KeyF');
	await page.waitForFunction(() => window.__game.mode === 'build');
	await G(page, () => (window.__game.section = false));
	await wait(600);
	const build = await G(page, () => ({ lining: window.__sceneCount('lining'), interior: window.__renderInfo().interior }));
	check('build mode restores the cut-away (no lining / ceilings)', build.lining === 0 && build.interior === false && build0.lining === 0, { build, build0 });

	// possessed (gravity): interior on, third-person boom stays inside near the wall
	await G(page, () => { const c = window.__crew; c.start(); c.running = false; });
	await page.waitForFunction(() => window.__crew.agents.length > 0 && !!window.__crew.world);
	await G(page, () => { const c = window.__crew; const a = c.agents[0]; c.possess(0); c.firstPerson = false; });
	await wait(300);
	await G(page, () => {
		const c = window.__crew, a = c.agents[0];
		// stand near the hull and face the centre: the boom points at the wall
		const nav = c.world.navs[a.deck];
		let best = null;
		for (let k = 0; k < 64; k++) { const ang = (k / 64) * Math.PI * 2; for (const rr of [3.9, 3.7, 3.5]) { const x = Math.cos(ang) * rr, z = Math.sin(ang) * rr; if (nav.isFree(x, z)) { best = [x, z]; break; } } if (best) break; }
		if (best) c.teleport(0, a.deck, best[0], best[1]);
		c.input.yaw = Math.atan2(c.agents[0].x, c.agents[0].z);
	});
	await wait(1500);
	const pc = await G(page, () => { const c = window.__possessCam(); const a = window.__crew.agents[0]; return { lining: window.__sceneCount('lining'), interior: window.__renderInfo().interior, camR: +Math.hypot(c[0], c[2]).toFixed(3), agentR: +Math.hypot(a.x, a.z).toFixed(3) }; });
	check('possessed: interior view on (full walls / ceilings)', pc.interior && pc.lining > 0, pc);
	check('possessed: 3rd-person camera pulls in at the wall (stays ≥ 0.3 m inside the hull)', pc.camR <= 4.5 - 0.3, pc);
	await page.screenshot({ path: 'screenshot-possess-interior.png' });
	await G(page, () => window.__crew.possess(null));

	// cruise free-fly (possessed, first person)
	await G(page, () => window.__game.setMission('cruise'));
	await page.waitForFunction(() => !!window.__crew.vox && window.__crew.agents[0].m);
	await G(page, () => { const c = window.__crew; c.teleport(0, 0, 1.2, 1.6); c.possess(0); c.firstPerson = true; c.agents[0].m.p.y = window.__game.floorY[0] + 1.4; });
	await wait(1800);
	const cr = await G(page, () => ({ interior: window.__renderInfo().interior, lining: window.__sceneCount('lining') }));
	check('cruise free-fly: interior view on', cr.interior && cr.lining > 0, cr);
	await page.screenshot({ path: 'screenshot-cruise-interior.png' });
	console.log('desktop fps (swiftshader, walk):', dfps, 'render', JSON.stringify(walk.info));
	check('desktop: no page errors', errors.length === 0, errors.slice(0, 5));
	await ctx.close();
}

// ---------------- mobile (iPhone 13) ----------------
{
	const { ctx, page, errors } = await open({ ...devices['iPhone 13'] });
	await G(page, () => { const g = window.__game; g.isTouch = true; g.selectDeck(0); g.mode = 'walk'; });
	await page.waitForFunction(() => !!window.__walk);
	await wait(800);
	await G(page, () => { const g = window.__game, sh = g.shafts.find((x) => x.from === 0), w = window.__walk; w.place(sh.x + 1.6, sh.z + 1.2); w.face(sh.x, sh.z); w.look(0.2); });
	await wait(1500);
	await page.screenshot({ path: 'screenshot-mobile-walk-interior.png' });
	const info = await G(page, () => window.__renderInfo());
	const mfps = await fps(page);
	// lights: ambient + hemisphere + sun + 1 deck light (no spot, no shadows)
	check('mobile: light budget (≤ 4 lights, 1 deck light, no window spot)', info.lights <= 4, info);
	console.log('mobile fps (swiftshader CPU raster – not representative of an iPhone GPU):', mfps, 'calls', info.calls, 'tris', info.triangles);
	check('mobile: no page errors', errors.length === 0, errors.slice(0, 5));
	await ctx.close();
}
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
