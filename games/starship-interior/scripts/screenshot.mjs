// Headless smoke test, screenshots and sample exports.
// Usage: node scripts/screenshot.mjs [url]   (needs `npx playwright install chromium`)
import { chromium, devices } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const URL = process.argv[2] ?? 'http://localhost:5173/';
const browser = await chromium.launch({
	args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
mkdirSync('samples', { recursive: true });
const errors = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const scr = (page, x, z) => page.evaluate(([x, z]) => window.__debug.toScreen(x, z), [x, z]);
const G = (page, fn, arg) => page.evaluate(fn, arg);
const summary = (page) =>
	G(page, () => {
		const g = window.__game;
		return {
			decks: g.decks.map((d) => `${d.height}m:${d.modules.length}`),
			volume: Math.round(g.stats.volume),
			power: g.stats.power,
			free: g.stats.freeArea.toFixed(1),
			warnings: g.analysis?.warnings.map((w) => w.text) ?? []
		};
	});

async function prep(page) {
	page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
	page.on('pageerror', (e) => errors.push(String(e)));
	await page.goto(URL, { waitUntil: 'networkidle' });
	await page.evaluate(() => localStorage.clear());
	await page.reload({ waitUntil: 'networkidle' });
	await page.waitForFunction(() => !!window.__debug && !!window.__game);
	await wait(3000);
}

// ---------------- desktop ----------------
{
	const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
	const page = await ctx.newPage();
	await prep(page);
	await G(page, () => (window.__game.quality = 'high'));

	// camera: left-drag on empty space orbits; ⟳ button orbits +45° (animated); arrows / +/- work
	{
		const az = () => G(page, () => (window.__rig.az * 180) / Math.PI);
		const a0 = await az();
		const e = await scr(page, -1.5, -5.4); // outside the hull behind it: empty space (on screen)
		await page.mouse.move(e.x, e.y);
		await page.mouse.down();
		for (let k = 1; k <= 10; k++) await page.mouse.move(e.x + k * 20, e.y);
		await page.mouse.up();
		await wait(300);
		const a1 = await az();
		const sel = await G(page, () => window.__game.selectedUid);
		await page.getByRole('button', { name: 'Orbit right' }).click();
		await wait(700);
		const a2 = await az();
		await page.keyboard.press('ArrowLeft');
		await wait(600);
		const a3 = await az();
		const d0 = await G(page, () => window.__rig.read().dist);
		await page.keyboard.press('Equal');
		await wait(450);
		const d1 = await G(page, () => window.__rig.read().dist);
		await page.getByRole('button', { name: 'Top view' }).click();
		await wait(700);
		const top = await G(page, () => window.__rig.read().polar);
		await page.getByRole('button', { name: 'Reset view' }).click();
		await wait(700);
		const a4 = await az();
		console.log('camera', JSON.stringify({ start: a0.toFixed(1), afterLeftDrag: a1.toFixed(1), afterOrbitRightBtn: a2.toFixed(1), btnDelta: (a2 - a1).toFixed(1), afterArrowLeft: a3.toFixed(1), zoomDist: [d0.toFixed(2), d1.toFixed(2)], topPolar: top.toFixed(3), afterReset: a4.toFixed(1), selectionAfterDrag: sel }));
	}

	// Deck 2: place extra equipment at arbitrary positions/angles with real mouse clicks
	// lower deck (deck 1): ladder L1-2 going up into the ceiling opening
	await G(page, () => { const y = window.__game.floorY[0]; window.__rig.animateTo({ az: 0.5, polar: 1.15, dist: 5.2 }, [0, y + 1.2, 0], 10); });
	await wait(1500);
	await page.screenshot({ path: 'screenshot-hatch-lower.png' });
	// upper deck (deck 2): hatch opening of L1-2 coming up from deck 1, seen from above
	await page.getByRole('button', { name: /^Deck 2/ }).click();
	await wait(600);
	await G(page, () => { const y = window.__game.floorY[1]; window.__rig.animateTo({ az: 0.6, polar: 0.75, dist: 4.2 }, [0, y + 0.3, 0], 10); });
	await wait(1500);
	await page.screenshot({ path: 'screenshot-hatch-upper.png' });
	await page.keyboard.press('Digit1'); // Select tool
	{
		const h = await scr(page, 0.15, 0.15);
		await page.mouse.click(h.x, h.y);
		await wait(400);
		console.log('select on deck 2', JSON.stringify(await G(page, () => { const g = window.__game; const s = g.selectedShaft; return s ? { label: g.shaftLabel(s), from: s.from + 1, to: s.to + 1 } : null; })));
		await page.screenshot({ path: 'screenshot-hatch-selected.png' });
		await page.keyboard.press('Escape');
	}
	await page.getByRole('button', { name: 'Reset view' }).click();
	await wait(1200);
	const place = async (name, x, z, keys = []) => {
		await page.getByRole('button', { name: new RegExp(name) }).first().click();
		await G(page, () => (window.__game.rotation = 0));
		for (const k of keys) await page.keyboard.press(k);
		const p = await scr(page, x, z);
		await page.mouse.move(p.x, p.y);
		await wait(120);
		await page.mouse.click(p.x, p.y);
		await wait(200);
	};
	await place('Hydroponics Rack', -1.3, 3.75, ['KeyR', 'KeyR', 'KeyE']); // 195°
	await place('Storage Locker', 2.2, 3.5, ['KeyR', 'KeyR', 'KeyQ']); // 165°
	await place('Exercise Treadmill', 0.4, 1.9, ['KeyE', 'KeyE']); // 30° → likely blocked/valid
	// show a placement ghost briefly, then select a module (live dimension readout)
	await page.getByRole('button', { name: /Galley Counter/ }).click();
	const gpos = await scr(page, -0.6, -1.6);
	await page.mouse.move(gpos.x, gpos.y);
	await wait(600);
	await page.screenshot({ path: 'screenshot-ghost.png' });
	await page.keyboard.press('Digit1');
	const s = await scr(page, -2.6, 2.6);
	await page.mouse.move(s.x, s.y - 30);
	await page.mouse.click(s.x, s.y - 30);
	await wait(900);
	console.log('desktop', JSON.stringify(await summary(page)));
	await page.screenshot({ path: 'screenshot.png' });

	// tape measure across the deck
	await page.keyboard.press('Digit3');
	for (const [x, z] of [[-4.5, 0.6], [4.5, 0.6]]) {
		const p = await scr(page, x, z);
		await page.mouse.click(p.x, p.y);
		await wait(150);
	}
	await wait(500);
	await page.screenshot({ path: 'screenshot-measure.png' });
	await page.keyboard.press('Escape');

	// ladder connections: on deck 2 hover the Ladder tool near the hatch coming up from deck 1 → align cue
	await page.getByRole('button', { name: /^Deck 2/ }).click();
	await wait(800);
	await page.getByRole('button', { name: /Ladder \+ Hatch/ }).click();
	await G(page, () => (window.__game.rotation = 0));
	const near = await scr(page, 0.35, 0.3);
	await page.mouse.move(near.x, near.y);
	await wait(900);
	await page.screenshot({ path: 'screenshot-align.png' });
	console.log('align plan', JSON.stringify(await G(page, () => {
		const g = window.__game;
		const p = g.planShaft({ x: 0.35, z: 0.3 });
		return { x: p.x, z: p.z, ok: p.ok, aligned: p.alignedWith !== null && g.shaftLabel(p.alignedWith), reason: p.reason };
	})));
	console.log('top deck refuse', await G(page, () => { const g = window.__game; g.selectDeck(2); const r = g.planShaft({ x: 1, z: 1 }).reason; g.selectDeck(1); return r; }));
	await page.keyboard.press('Escape');
	console.log('shafts', JSON.stringify(await G(page, () => window.__game.shafts.map((s) => ({ l: window.__game.shaftLabel(s), x: s.x, z: s.z, from: s.from + 1, to: s.to + 1 })))));
	// section view of all decks: L1-2 at the centre, L2-3 at a different spot on deck 2
	await page.getByRole('button', { name: /Section view/ }).first().click();
	await G(page, () => (window.__game.selectedUid = null));
	await wait(2200);
	await page.screenshot({ path: 'screenshot-decks.png' });
	await page.getByRole('button', { name: /Section view/ }).first().click();

	// volume limit: a 4th deck must be refused (3 × 2.65 m stack already uses 506 m³)
	await page.getByRole('button', { name: 'Add deck' }).click();
	await wait(300);
	console.log('after 4th-deck attempt', JSON.stringify(await summary(page)));

	// exports
	const n = await G(page, () => window.__game.decks.length);
	for (let k = 0; k < n; k++) writeFileSync(`samples/deck-${k + 1}-plan-1to50.svg`, await G(page, (k) => window.__exports.svg(k), k));
	writeFileSync('samples/bom.csv', await G(page, () => window.__exports.csv()));
	writeFileSync('samples/layout.json', await G(page, () => JSON.stringify(window.__game.toJSON(), null, 2)));
	const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /GLB/ }).click()]);
	await dl.saveAs('samples/starship-interior.glb');

	// rule checks + migration (after exports, so samples keep the starter layout + edits)
	console.log('rules', JSON.stringify(await G(page, () => {
		const g = window.__game;
		const out = {};
		g.selectDeck(2);
		out.lowerDeck3WithHygiene = g.setDeckHeight(2, 2.0); // false: hygiene is 2.1 m
		out.raiseDeck1To4m = g.setDeckHeight(0, 4.0); // false: would exceed 600 m³
		out.outsideHull = g.check('locker', 4.3, 0, 0).reason;
		out.overlapsLadder = g.check('locker', -1.0, -1.4, 0).reason; // L2-3 opening on deck 3
		out.ladderBlocked = g.checkShaft(3.0, 1.0, 0, 1).reason;
		out.oldGridSaveRejected = !g.load({ version: 1, tiles: [] });
		// v3 migration: aligned pair 1-2, upper adopts XY and pairs again 2-3, lone hatch → to deck above
		g.load({ version: 3, decks: [
			{ height: 2.4, modules: [{ type: 'hatch', x: 0, z: 0, angle: 0 }] },
			{ height: 2.4, modules: [{ type: 'hatch', x: 0.6, z: 0.3, angle: 0 }, { type: 'hatch', x: -2, z: 2, angle: 30 }] },
			{ height: 2.4, modules: [{ type: 'hatch', x: 0.5, z: 0.2, angle: 0 }, { type: 'hatch', x: 2.5, z: -2, angle: 0 }] }
		] });
		out.migrated = g.shafts.map((s) => `${g.shaftLabel(s)}@(${s.x},${s.z})`);
		g.selectDeck(1);
		g.removeDeck(1);
		out.afterRemovingDeck2 = { decks: g.decks.length, shafts: g.shafts.length, unreachable: g.unreachableDecks.map((k) => k + 1) };
		g.resetStarter();
		return out;
	})));

	// walk mode on deck 1
	await page.getByRole('button', { name: /^Deck 1/ }).click();
	await page.keyboard.press('KeyF');
	await wait(1500);
	await page.screenshot({ path: 'screenshot-walk.png' });
	await page.keyboard.press('KeyE');
	await wait(300);
	console.log('walk: after E on L1-2 → deck', await G(page, () => window.__game.walkDeck + 1));
	await ctx.close();
}

// ---------------- launch couches, section cut angle, surface habitat ----------------
{
	const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const page = await ctx.newPage();
	await prep(page);
	await G(page, () => (window.__game.quality = 'high'));

	// crew seating on deck 2 (cabin mode): pilot couch, a row of 3, stowable table
	const seat = await G(page, () => {
		const g = window.__game;
		g.selectDeck(1);
		const res = {};
		const put = (type, x, z, rot) => { g.selectedModule = type; g.tool = 'module'; g.rotation = rot; return g.placeAt({ x, z }) || g.toast; };
		g.setPhase('launch');
		res.pilot = put('pilotcouch', 2.3, -1.2, 270);
		res.row3 = put('couchrow3', 0, 2.2, 180);
		res.table = put('table', -2.6, 0.6, 90);
		g.tool = 'select';
		res.seats = g.seats;
		res.crew = g.crew;
		res.preflight = g.preflight;
		// a couch that fits folded (surface) but not deployed (launch) → phase-specific reason
		g.setPhase('surface');
		// scan the deck for a spot where the folded couch fits but the deployed one does not
		for (let a = 0; a < 360 && !res.surfaceOnlyCheck; a += 10) {
			const x = Math.sin((a * Math.PI) / 180) * 3.85, z = Math.cos((a * Math.PI) / 180) * 3.85;
			const r = g.check('couch', x, z, a);
			if (!r.ok && r.reason.startsWith('Launch')) res.surfaceOnlyCheck = `@${a}°: ${r.reason}`;
		}
		g.setPhase('launch');
		res.couchOverHatchCheck = g.check('couch', 0.1, 0.0, 0).reason;
		return res;
	});
	console.log('seating', JSON.stringify(seat));
	await G(page, () => { const y = window.__game.floorY[1]; window.__rig.animateTo({ az: 0.55, polar: 0.82, dist: 6.4 }, [0.4, y + 0.3, 0.6], 10); });
	await wait(1800);
	await page.screenshot({ path: 'screenshot-launch-couches.png' });
	writeFileSync('samples/deck-2-plan-launch.svg', await G(page, () => window.__exports.svg(1, 'launch')));
	writeFileSync('samples/deck-2-plan-surface.svg', await G(page, () => window.__exports.svg(1, 'surface')));
	await G(page, () => window.__game.setPhase('surface'));

	// section view: quarter cut at a non-default angle + free orbit below the horizon
	await page.getByRole('button', { name: /Section view/ }).first().click();
	await wait(1200);
	const cut = await G(page, () => {
		const g = window.__game;
		g.cutMode = 'quarter';
		g.setCutAngle(215);
		window.__rig.animateTo({ az: (200 * Math.PI) / 180, polar: 1.25, dist: 17 }, undefined, 10);
		return { follow: g.cutFollow, deg: g.cutDeg, mode: g.cutMode };
	});
	await wait(1500);
	const orbit = await G(page, () => { window.__rig.orbitBy(0, 1.2); return window.__rig.read().polar; });
	await wait(200);
	await G(page, () => window.__rig.animateTo({ polar: 1.2 }, undefined, 10));
	await page.getByRole('button', { name: '⟳ 15°' }).first().click().catch(() => {});
	await wait(1500);
	console.log('section cut', JSON.stringify({ ...cut, polarAfterTiltDown: orbit.toFixed(2), afterButton: await G(page, () => window.__game.cutDeg) }));
	await page.screenshot({ path: 'screenshot-section-angle.png' });
	await G(page, () => { const g = window.__game; g.setCutFollow(true); g.cutMode = 'half'; g.section = false; });

	// surface habitat: convert tanks, decks in LOX / CH4, opening + tunnel, ring insert, berm
	const hab = await G(page, () => {
		const g = window.__game;
		const r = {};
		r.convertSealedRefused = (g.setShipMode('habitat'), g.convertTank('ch4'), g.toast);
		g.setDome('forward', 'cut');
		g.convertTank('ch4');
		g.addDeck('ch4'); g.addDeck('ch4');
		g.setDome('common', 'hatch');
		g.convertTank('lox');
		g.addDeck('lox'); g.addDeck('lox');
		g.setBerm(4);
		r.opening = g.addOpening({ ring: 6, angle: 90, w: 1.2, h: 1.6, spanWeld: false, tunnel: true, tunnelLen: 5 });
		r.tooWide = g.checkOpening({ ring: 6, angle: 200, w: 2.4, h: 1.6, spanWeld: false, tunnel: false, tunnelLen: 4 }).reason;
		r.onWeld = g.checkOpening({ ring: 8, angle: 200, w: 1.5, h: 1.8, spanWeld: false, tunnel: false, tunnelLen: 4 }).reason;
		g.insertRings('crew', 1, 1);
		// nose decks: keep adding crew decks until the ogive refuses
		for (let i = 0; i < 6; i++) g.addDeck('crew');
		r.noseRefusal = g.toast;
		r.decks = g.decks.map((d, k) => `${g.deckLabel(k)}@${g.floorY[k].toFixed(2)} R${g.deckRadius[k].toFixed(2)}`);
		r.volume = Math.round(g.volume);
		r.reclaimed = Math.round(g.reclaimed);
		r.shielded = g.decks.map((_, k) => g.shielded(k));
		// ladders across the common dome (hatch) and inside the LOX tank
		g.selectDeck(0);
		r.ladderLox = g.placeShaft({ x: 0, z: 0 }) || g.toast;
		g.selectDeck(1);
		r.ladderLoxToCh4 = g.placeShaft({ x: 0.2, z: 0.1 }) || g.toast;
		r.ladderLabels = g.shafts.map((s) => g.shaftLabel(s));
		// a few modules on CH4-1
		const k = g.decks.findIndex((d) => d.section === 'ch4');
		g.selectDeck(k);
		const put = (type, x, z, rot) => { g.selectedModule = type; g.tool = 'module'; g.rotation = rot; return g.placeAt({ x, z }) || g.toast; };
		r.ch4mods = [put('bunk', -2.3, -2.6, 30), put('bunk', 2.3, -2.6, -30), put('locker', -3.6, 1.2, 75), put('galley', 2.2, 2.6, 200), put('hydroponics', -1.6, 3.4, 170)];
		g.tool = 'select';
		g.section = true;
		return r;
	});
	console.log('habitat', JSON.stringify(hab));
	await wait(2500);
	await page.screenshot({ path: 'screenshot-habitat-elevation.png' });
	writeFileSync('samples/habitat-elevation-1to200.svg', await G(page, () => window.__exports.elevation()));
	writeFileSync('samples/bom-habitat.csv', await G(page, () => window.__exports.csv()));
	writeFileSync('samples/layout-habitat.json', await G(page, () => JSON.stringify(window.__game.toJSON(), null, 2)));
	await G(page, () => { window.__game.section = false; });
	await wait(1500);
	await G(page, () => { const g = window.__game; window.__rig.animateTo({ az: 0.5, polar: 0.85, dist: 11 }, [0, g.floorY[g.current], 0], 10); });
	await wait(1800);
	await page.screenshot({ path: 'screenshot-habitat-deck.png' });
	// save v5 round trip + v4 migration
	console.log('save', JSON.stringify(await G(page, () => {
		const g = window.__game;
		const j = JSON.parse(JSON.stringify(g.toJSON()));
		const before = g.decks.length;
		g.load(j);
		const out = { version: j.version, roundTrip: g.decks.length === before && g.shipMode === 'habitat', hab: { ...g.hab, openings: g.hab.openings.length } };
		g.load({ version: 4, decks: [{ height: 2.4, modules: [] }, { height: 2.6, modules: [] }], shafts: [] });
		out.v4 = { mode: g.shipMode, labels: g.decks.map((_, k) => g.deckLabel(k)), sections: g.decks.map((d) => d.section) };
		return out;
	})));
	await ctx.close();
}

// ---------------- mobile (iPhone 13) ----------------
{
	const ctx = await browser.newContext({ ...devices['iPhone 13'] });
	const page = await ctx.newPage();
	await prep(page);
	await G(page, () => (window.__game.quality = 'high'));
	const tap = async (x, z) => {
		const p = await scr(page, x, z);
		await page.touchscreen.tap(p.x, p.y);
		await wait(250);
	};
	await page.getByRole('button', { name: /Toggle panel/ }).click();
	await page.getByRole('button', { name: /Storage Locker/ }).click();
	await page.getByRole('button', { name: 'Rotate', exact: true }).click(); // +15°
	await tap(-3.4, -0.9);
	await page.getByRole('button', { name: 'Place', exact: true }).click();
	await wait(200);
	await page.getByRole('button', { name: /Toggle panel/ }).click();
	await page.getByRole('button', { name: /Workstation/ }).click();
	await page.getByRole('button', { name: 'Rotate 90' }).click();
	await page.getByRole('button', { name: 'Rotate', exact: true }).click();
	await tap(-0.4, 1.6); // preview only (locked ghost) for the screenshot
	await wait(900);
	// one-finger drag on empty space with the Select tool orbits (real touch events via CDP)
	{
		await page.getByRole('button', { name: 'Cancel' }).click().catch(() => {});
		await G(page, () => { window.__game.tool = 'select'; window.__game.pending = null; });
		const cdp = await ctx.newCDPSession(page);
		const a0 = await G(page, () => (window.__rig.az * 180) / Math.PI);
		const e = await scr(page, 1.0, -5.2);
		const pt = (x, y) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
		await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(e.x - 60, e.y) });
		for (let k = 1; k <= 8; k++) {
			await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(e.x - 60 + k * 15, e.y) });
			await wait(16);
		}
		await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
		await wait(300);
		const a1 = await G(page, () => (window.__rig.az * 180) / Math.PI);
		console.log('mobile camera', JSON.stringify({ before: a0.toFixed(1), afterOneFingerDrag: a1.toFixed(1) }));
		await page.screenshot({ path: 'screenshot-mobile-orbit.png' });
		await page.getByRole('button', { name: 'Reset view' }).click();
		await wait(700);
		await page.keyboard.press('Digit2').catch(() => {});
		await G(page, () => (window.__game.tool = 'module'));
		await tap(-0.4, 1.6);
		await wait(700);
	}
	console.log('mobile', JSON.stringify(await summary(page)));
	await page.screenshot({ path: 'screenshot-mobile.png' });

	await page.getByRole('button', { name: /Walk/ }).click();
	await wait(1500);
	await page.screenshot({ path: 'screenshot-mobile-walk.png' });
	await page.getByRole('button', { name: /Build/ }).click();
	await wait(800);

	// habitat on the phone: elevation + bottom sheet with the Ship panel and cut controls
	await G(page, () => {
		const g = window.__game;
		g.setShipMode('habitat');
		g.setDome('forward', 'hatch');
		g.convertTank('ch4');
		g.addDeck('ch4');
		g.section = true;
		g.tool = 'select';
		g.pending = null;
	});
	await wait(1800);
	await page.screenshot({ path: 'screenshot-mobile-habitat.png' });
	await page.getByRole('button', { name: /Toggle panel/ }).click();
	await wait(500);
	await page.locator('.content').first().evaluate((el) => (el.scrollTop = 0));
	await wait(400);
	await page.screenshot({ path: 'screenshot-mobile-habitat-panel.png' });
	console.log('mobile habitat', JSON.stringify(await G(page, () => ({ mode: window.__game.shipMode, decks: window.__game.decks.map((_, k) => window.__game.deckLabel(k)) }))));
	await ctx.close();
}

await browser.close();
console.log(errors.length ? 'console errors:\n' + errors.join('\n') : 'no console errors');
