// Couch egress / clearance visualisation: deployed vs stowed envelope, blocker named in the issue,
// clickable issue focuses the couch, live drag preview + nudge, "Show clearances" toggle.
// Screenshot: screenshot-couch-egress.png (blocked example). Usage: node scripts/couch-egress-test.mjs [url]
import { chromium } from 'playwright';
const URL = process.argv[2] ?? 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
page.setDefaultTimeout(120000);
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
await page.waitForFunction(() => !!window.__game);
await wait(1000);

// Deck 3: pilot couch at (2.0, 0.4) facing the centre; a water dispenser in its access path
const s = await G(() => {
	const g = window.__game;
	g.setMission('launch');
	g.selectDeck(2);
	g.decks[2].modules = g.decks[2].modules.filter((m) => m.type !== 'table');
	g.selectedModule = 'pilotcouch';
	g.tool = 'module';
	g.rotation = 270;
	const uid = g.nextUid;
	const placed = g.placeAt({ x: 2.0, z: 0.4 });
	const clear = g.egressOf(uid, 2);
	g.decks[2].modules.push({ uid: g.nextUid++, type: 'waterdispenser', x: 0.7, z: 0.2, angle: 90 });
	const t0 = performance.now();
	const blocked = g.egressOf(uid, 2);
	const ms = performance.now() - t0;
	g.setMission('surface');
	const stowed = g.egressOf(uid, 2);
	g.setMission('launch');
	g.tool = 'select';
	return { uid, placed, clear: clear && { ok: clear.ok, text: clear.text }, blocked: blocked && { ok: blocked.ok, text: blocked.text, n: blocked.blockers.length, segs: blocked.blocked.filter(Boolean).length }, stowed: stowed && { ok: stowed.ok, text: stowed.text }, issues: g.preflight.couchIssues, ms: +ms.toFixed(1) };
});
console.log(JSON.stringify(s));
check('pilot couch placed with a clear egress first', s.placed && s.clear?.ok, s.clear);
check('blocked: issue names the blocker, the ladder and the 0.8 m rule', s.blocked && !s.blocked.ok && /blocked by Water Dispenser.*at \(0\.7, 0\.2\).*needs 0\.8 m path to Ladder L2-3/.test(s.blocked.text), s.blocked?.text);
check('blocked segment of the path marked', s.blocked?.segs > 0, s.blocked);
check('deployed envelope in Launch, stowed in Surface (stowed couch is clear here)', /deployed envelope/.test(s.blocked?.text) && s.stowed?.ok && /stowed envelope/.test(s.stowed.text), s.stowed);
check('pre-launch checklist lists the improved text', s.issues.some((t) => /Pilot Couch \(Deck 3\) egress blocked by Water Dispenser/.test(t)), s.issues);

// clickable issue → select + focus + zones
await G(() => {
	const g = window.__game;
	g.selectDeck(0);
	g.selectedUid = null;
});
const row = page.locator('[data-testid=egress-issue]').first();
await row.scrollIntoViewIfNeeded();
await row.click();
await wait(1200);
const f = await G(() => ({ deck: window.__game.current, sel: window.__game.selectedUid, focus: window.__game.focusEgress }));
check('issue row click: deck switched, couch selected + focused', f.deck === 2 && f.sel === s.uid && f.focus === s.uid, f);
const lab = await page.locator('[data-testid=egress-label]').first().getAttribute('data-ok');
const blk = await page.locator('[data-testid=egress-blocker]').count();
check('zones shown: red egress label + blocker highlighted', lab === '0' && blk >= 1, { lab, blk });
const selEg = await page.locator('[data-testid=sel-egress]').textContent();
check('selection card shows the egress status', /blocked by Water Dispenser/.test(selEg ?? ''), selEg);

// drag preview: live label + nudge hint while blocked; clear when moved away from the blocker
await G((uid) => {
	const g = window.__game;
	const m = g.deck.modules.find((x) => x.uid === uid);
	g.drag = { uid, x: m.x, z: m.z + 0.05, moved: true };
}, s.uid);
await wait(900);
const live1 = await page.locator('[data-testid=egress-label]').evaluateAll((els) => els.map((e) => e.getAttribute('data-ok')));
const nudge = await page.locator('[data-testid=egress-nudge]').count();
check('drag preview: zones red at a blocked pose + nudge hint shown', live1.includes('0') && nudge === 1, { live1, nudge });
await G((uid) => {
	const g = window.__game;
	g.drag = { uid, x: 2.4, z: 1.6, moved: true };
}, s.uid);
await wait(700);
const live2 = await page.locator('[data-testid=egress-label]').evaluateAll((els) => els.map((e) => e.getAttribute('data-ok')));
check('drag preview turns green at a clear pose', live2.includes('1'), live2);
await G(() => (window.__game.drag = null));

// nudge button
await page.locator('[data-testid=nudge-couch]').click();
await wait(300);
const after = await G((uid) => { const e = window.__game.egressOf(uid, 2); const m = window.__game.decks[2].modules.find((x) => x.uid === uid); return { ok: e?.ok, x: m.x, z: m.z }; }, s.uid);
check('"Move to nearest clear spot" clears the egress', after.ok === true, after);

// show-clearances toggle: keep-out zones + all couches
await G((uid) => { const g = window.__game; const m = g.decks[2].modules.find((x) => x.uid === uid); m.x = 2.0; m.z = 0.4; g.autosave(); g.selectedUid = null; g.focusEgress = null; }, s.uid);
await page.locator('[data-testid=show-clearances]').click();
await wait(600);
const lab2 = await page.locator('[data-testid=egress-label]').count();
check('"Show clearances" shows couch zones without a selection', lab2 >= 1, { lab2 });

// screenshot: blocked example, couch selected, zones visible
await G((uid) => {
	const g = window.__game;
	g.selectedUid = uid;
	g.focusEgress = uid;
	window.__rig.animateTo({ az: 0.9, polar: 0.62, dist: 7.2 }, [0.9, g.floorY[2], 0.0], 10);
}, s.uid);
await page.locator('[data-testid=sel-egress]').scrollIntoViewIfNeeded();
await wait(2500);
await page.screenshot({ path: 'screenshot-couch-egress.png' });
check('no page errors', errors.length === 0, errors.slice(0, 3));
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
