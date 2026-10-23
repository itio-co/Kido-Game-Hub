// Headless test: Equipment Designer component editing (Object / Vertex / Edge / Face).
// Selection (click, Shift-click, box, mobile multi-tap), gizmo + numeric moves with snap, extrude / inset / bevel /
// merge / delete / flip / recalc normals / shading / per-face material, validation, undo/redo, persistence,
// backward-compatible import, GLB + BOM exports. Screenshots: screenshot-designer-vertex.png,
// screenshot-designer-face.png, screenshot-mobile-designer-edit.png.
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
	const ctx = await browser.newContext({ ...opts, acceptDownloads: true });
	const page = await ctx.newPage();
	page.setDefaultTimeout(60000);
	const errors = [];
	page.on('pageerror', (e) => errors.push(String(e)));
	page.on('console', (m) => m.type() === 'error' && !/favicon/.test(m.text()) && errors.push(m.text()));
	await page.goto(URL, { waitUntil: 'networkidle' });
	await page.evaluate(() => localStorage.clear());
	await page.reload({ waitUntil: 'networkidle' });
	await page.waitForFunction(() => !!window.__game && !!window.__equip);
	await wait(1000);
	return { ctx, page, errors };
}
const mesh = (page) => G(page, () => { const m = window.__equip.workMesh; return m ? { v: m.v.length / 3, f: m.f.length, fm: m.fm ?? null, sm: !!m.sm, shape: window.__equip.part.shape } : null; });
const st = (page) => G(page, () => { const e = window.__equip; return { mode: e.editMode, v: e.sel.v.slice(), e: e.sel.e.slice(), f: e.sel.f.slice(), n: e.selCount }; });
async function newDesign(page) {
	await G(page, () => { window.__game.designer = true; });
	await wait(1200);
	await G(page, () => { const e = window.__equip; e.create(); e.partId = e.selected.parts[0].id; e.setView('iso'); });
	await wait(1200);
}
const vScreen = (page, i) => G(page, (i) => window.__designerEdit.vertexScreen(i), i);
const fScreen = (page, i) => G(page, (i) => window.__designerEdit.faceScreen(i), i);
/** index of the vertex / face closest to the camera among candidates (screen z unknown → use the camera distance in JS) */
const nearestVerts = (page, n) => G(page, (n) => {
	const m = window.__equip.workMesh, p = window.__equip.part;
	const cam = [2.6, 2.0, 3.2];
	return [...Array(m.v.length / 3).keys()].map((i) => [i, Math.hypot(m.v[3 * i] + p.pos[0] - cam[0], m.v[3 * i + 1] + p.pos[1] - cam[1], m.v[3 * i + 2] + p.pos[2] - cam[2])]).sort((a, b) => a[1] - b[1]).slice(0, n).map((x) => x[0]);
}, n);
const topFace = (page) => G(page, () => { const m = window.__equip.workMesh; let best = -1, y = -1e9; m.f.forEach((f, fi) => { const c = f.reduce((s, i) => s + m.v[3 * i + 1], 0) / f.length; const ny = (() => { let n = 0; for (let k = 0; k < f.length; k++) { const a = f[k], b = f[(k + 1) % f.length]; n += (m.v[3 * a + 2] - m.v[3 * b + 2]) * (m.v[3 * a] + m.v[3 * b]); } return n; })(); if (ny > 1e-6 && c > y) { y = c; best = fi; } }); return best; });

// ---------------- desktop ----------------
{
	const { ctx, page, errors } = await open({ viewport: { width: 1440, height: 900 } });
	await newDesign(page);
	check('toolbar shows for an editable part', await page.getByTestId('edit-toolbar').isVisible());
	// Tab → vertex mode (primitive stays a primitive until the first edit)
	await page.mouse.move(900, 500);
	await page.keyboard.press('Tab');
	await wait(400);
	let s = await st(page);
	const shape0 = (await mesh(page)).shape;
	check('Tab enters Vertex mode; primitive not converted yet', s.mode === 'vertex' && shape0 === 'rbox', { s, shape0 });
	// click + Shift-click two near vertices
	const [va, vb] = await nearestVerts(page, 2);
	const pa = await vScreen(page, va), pb = await vScreen(page, vb);
	await page.mouse.click(pa.x, pa.y);
	await wait(300);
	await page.keyboard.down('Shift');
	await page.mouse.click(pb.x, pb.y);
	await page.keyboard.up('Shift');
	await wait(400);
	s = await st(page);
	check('click + Shift-click select two vertices', s.v.length === 2 && s.v.includes(va) && s.v.includes(vb), { s, va, vb });
	// numeric field: Y +5 cm (snap 1 cm) → mesh conversion + undo point
	const y0 = Number(await page.getByTestId('sel-pos-y').inputValue());
	await page.getByTestId('sel-pos-y').fill(String(y0 + 5));
	await page.getByTestId('sel-pos-y').press('Enter');
	await wait(400);
	const m1 = await mesh(page);
	const y1 = Number(await page.getByTestId('sel-pos-y').inputValue());
	check('numeric Y +5 cm moves the selection and converts the part to an editable mesh', m1.shape === 'mesh' && Math.abs(y1 - y0 - 5) < 0.06, { y0, y1, m1 });
	// snap 5 cm: typing +3 rounds to the 5 cm grid
	await page.getByTestId('edit-snap').click();
	await page.getByTestId('sel-pos-y').fill(String(y1 + 3));
	await page.getByTestId('sel-pos-y').press('Enter');
	await wait(300);
	const y2 = Number(await page.getByTestId('sel-pos-y').inputValue());
	check('5 cm snap rounds numeric input to the 5 cm grid', Math.abs(Math.round(y2 / 5) * 5 - y2) < 0.06, { y2 });
	await page.getByTestId('edit-snap').click();
	// gizmo: drag the free-move centre handle
	const before = await G(page, () => window.__equip.workMesh.v.slice());
	const c = await G(page, () => { const e = window.__equip, m = e.workMesh; const i = e.sel.v; const x = i.reduce((s, k) => s + m.v[3 * k], 0) / i.length, y = i.reduce((s, k) => s + m.v[3 * k + 1], 0) / i.length, z = i.reduce((s, k) => s + m.v[3 * k + 2], 0) / i.length; return { x, y, z }; });
	void c;
	const g0 = await G(page, () => { const e = window.__equip, m = e.workMesh, i = e.sel.v; return [i[0], i[1]]; });
	const sa = await vScreen(page, g0[0]), sb = await vScreen(page, g0[1]);
	const cx = (sa.x + sb.x) / 2, cy = (sa.y + sb.y) / 2;
	await page.mouse.move(cx, cy);
	await page.mouse.down();
	for (let k = 1; k <= 6; k++) await page.mouse.move(cx + k * 8, cy - k * 6);
	await page.mouse.up();
	await wait(400);
	const after = await G(page, () => window.__equip.workMesh.v.slice());
	const moved = after.some((x, i) => Math.abs(x - before[i]) > 0.004);
	const sel2 = await st(page);
	check('gizmo drag moves the selected vertices (selection kept)', moved && sel2.v.length === 2, { moved, sel: sel2.v });
	// scale via gizmo (S) on the centre handle
	await page.keyboard.press('KeyS');
	await wait(300);
	const b2 = await G(page, () => window.__equip.workMesh.v.slice());
	const sa2 = await vScreen(page, g0[0]), sb2 = await vScreen(page, g0[1]);
	const cx2 = (sa2.x + sb2.x) / 2, cy2 = (sa2.y + sb2.y) / 2;
	await page.mouse.move(cx2, cy2);
	await page.mouse.down();
	for (let k = 1; k <= 4; k++) await page.mouse.move(cx2 + k * 2, cy2 - k * 1);
	await page.mouse.up();
	await wait(400);
	const a2 = await G(page, () => window.__equip.workMesh.v.slice());
	const spread = await G(page, () => { const m = window.__equip.workMesh; let lo = 1e9, hi = -1e9; for (let i = 0; i < m.v.length; i++) { lo = Math.min(lo, m.v[i]); hi = Math.max(hi, m.v[i]); } return hi - lo; });
	check('gizmo scale (S) changes the selection spacing', a2.some((x, i) => Math.abs(x - b2[i]) > 0.002), { spread });
	await page.keyboard.press('KeyT');
	await page.keyboard.press('Control+KeyZ'); // back to the translated state
	await wait(300);
	await G(page, (ids) => { window.__equip.sel = { v: ids, e: [], f: [] }; }, g0);
	// undo / redo
	const vNow = await G(page, () => window.__equip.workMesh.v.join());
	await page.keyboard.press('Control+KeyZ');
	await wait(300);
	const vUndo = await G(page, () => window.__equip.workMesh.v.join());
	await page.keyboard.press('Control+Shift+KeyZ');
	await wait(300);
	const vRedo = await G(page, () => window.__equip.workMesh.v.join());
	check('Ctrl+Z undoes, Ctrl+Shift+Z redoes a component edit', vUndo !== vNow && vRedo === vNow);
	await G(page, (ids) => { window.__equip.sel = { v: ids, e: [], f: [] }; }, g0);
	await wait(2600); // toast fades
	await page.screenshot({ path: 'screenshot-designer-vertex.png' });
	// merge (M) two vertices
	const vc0 = (await mesh(page)).v;
	await G(page, (ids) => { window.__equip.sel = { v: ids, e: [], f: [] }; }, g0);
	await page.keyboard.press('KeyM');
	await wait(300);

	const vc1 = (await mesh(page)).v;
	const warnM = await page.getByTestId('mesh-warn').allTextContents();
	check('M merges two vertices', vc1 === vc0 - 1, { vc0, vc1, warnM });
	await page.keyboard.press('Control+KeyZ');
	await wait(300);
	// box select (Shift+drag) over the whole part (undo cleared the selection)
	const vs = await G(page, () => { const m = window.__equip.workMesh; return [...Array(m.v.length / 3).keys()].map((i) => window.__designerEdit.vertexScreen(i)); });
	const xs = vs.map((p) => p.x), ys = vs.map((p) => p.y);
	await page.keyboard.down('Shift');
	await page.mouse.move(Math.min(...xs) - 20, Math.min(...ys) - 20);
	await page.mouse.down();
	await page.mouse.move((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, { steps: 4 });
	const boxVisible = await page.getByTestId('box-select').isVisible().catch(() => false);
	await page.mouse.move(Math.max(...xs) + 20, Math.max(...ys) + 20, { steps: 4 });
	await page.mouse.up();
	await page.keyboard.up('Shift');
	await wait(300);
	s = await st(page);
	check('Shift+drag box select picks the visible vertices (occluded ones skipped)', boxVisible && s.v.length >= 4 && s.v.length < vs.length, { n: s.v.length, of: vs.length, boxVisible });
	// Esc steps back: clear selection, then Object mode
	await page.keyboard.press('Escape');
	const e1 = await st(page);
	await page.keyboard.press('Escape');
	const e2 = await st(page);
	check('Esc clears the selection, then returns to Object mode', e1.n === 0 && e1.mode === 'vertex' && e2.mode === 'object', { e1, e2 });

	// ---- edge mode: click an edge, bevel ----
	await page.keyboard.press('Digit3');
	await wait(300);
	const edge = await G(page, () => { const e = window.__equip, m = e.workMesh; const cam = [2.6, 2, 3.2], p = e.part.pos; const keys = new Set(); m.f.forEach((f) => f.forEach((a, k) => { const b = f[(k + 1) % f.length]; keys.add(a < b ? `${a}-${b}` : `${b}-${a}`); })); let best = null, bd = 1e9; for (const k of keys) { const [a, b] = k.split('-').map(Number); const mid = [0, 1, 2].map((j) => (m.v[3 * a + j] + m.v[3 * b + j]) / 2 + p[j]); const d = Math.hypot(mid[0] - cam[0], mid[1] - cam[1], mid[2] - cam[2]); if (d < bd) { bd = d; best = k; } } return best; });
	const [ea, eb] = edge.split('-').map(Number);
	const qa = await vScreen(page, ea), qb = await vScreen(page, eb);
	await page.mouse.click(qa.x * 0.5 + qb.x * 0.5, qa.y * 0.5 + qb.y * 0.5);
	await wait(300);
	s = await st(page);
	check('Edge mode: click selects the edge under the cursor', s.mode === 'edge' && s.e.length === 1 && s.e[0] === edge, { s, edge });
	const f0 = (await mesh(page)).f;
	await page.keyboard.press('KeyB');
	await wait(300);
	const mb = await mesh(page);
	const warnB = await page.getByTestId('mesh-warn').allTextContents();
	check('B bevels (chamfers) the edge: +1 face, mesh stays closed', mb.f === f0 + 1 && !warnB.some((w) => /open|non-manifold|inside-out/.test(w)), { f0, f: mb.f, warnB });

	// ---- face mode: click top face, extrude / inset / material / flip / recalc ----
	await page.keyboard.press('Digit4');
	await wait(300);
	const tf = await topFace(page);
	const fp = await fScreen(page, tf);
	await page.mouse.move(fp.x, fp.y);
	await wait(200);
	await page.mouse.click(fp.x, fp.y);
	await wait(300);
	s = await st(page);
	check('Face mode: click selects the face', s.mode === 'face' && s.f.length === 1 && s.f[0] === tf, { s, tf });
	const mf0 = await mesh(page);
	const kSides = await G(page, (fi) => window.__equip.workMesh.f[fi].length, tf);
	await page.keyboard.press('KeyE');
	await wait(300);
	const mf1 = await mesh(page);
	await page.keyboard.press('KeyI');
	await wait(300);
	const mf2 = await mesh(page);
	const warnF = await page.getByTestId('mesh-warn').allTextContents();
	check('E extrudes (+1 side face per edge) and I insets (+1 ring face per edge); still closed', mf1.f === mf0.f + kSides && mf2.f === mf1.f + kSides && !warnF.length, { kSides, f: [mf0.f, mf1.f, mf2.f], warnF });
	// lift the inset face 5 cm via the nudge button
	await page.getByRole('button', { name: 'Move selection Y +1 cm' }).click();
	await page.getByTestId('face-mat').selectOption('amber');
	await wait(300);
	const mfm = await mesh(page);
	check('per-face material assigned to the selected face', mfm.fm && mfm.fm[s.f[0]] === 'amber', { fm: mfm.fm?.filter(Boolean) });
	const nv = (page) => G(page, (fi) => { const m = window.__equip.workMesh, f = m.f[fi]; const n = [0, 0, 0]; for (let k = 0; k < f.length; k++) { const a = f[k], b = f[(k + 1) % f.length]; n[0] += (m.v[3 * a + 1] - m.v[3 * b + 1]) * (m.v[3 * a + 2] + m.v[3 * b + 2]); n[1] += (m.v[3 * a + 2] - m.v[3 * b + 2]) * (m.v[3 * a] + m.v[3 * b]); n[2] += (m.v[3 * a] - m.v[3 * b]) * (m.v[3 * a + 1] + m.v[3 * b + 1]); } return n; }, s.f[0]);
	const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
	const n0 = await nv(page);
	await page.keyboard.press('KeyN');
	await wait(200);
	const n1 = await nv(page);
	await page.keyboard.press('Shift+KeyN');
	await wait(200);
	const n2 = await nv(page);
	check('N flips the face normal, Shift+N recalculates it outward', n0[1] > 0 && dot(n0, n1) < 0 && dot(n0, n2) > 0, { n0, n1, n2 });
	await page.getByTestId('op-shade').click();
	await wait(200);
	check('flat / smooth shading toggle', (await mesh(page)).sm === true);
	await page.getByTestId('op-shade').click();
	await wait(2600);
	await page.screenshot({ path: 'screenshot-designer-face.png' });
	// delete a face → validation warns about open edges
	const fd0 = (await mesh(page)).f;
	await page.keyboard.press('KeyX');
	await wait(300);
	const fd1 = (await mesh(page)).f;
	const warnD = await page.getByTestId('mesh-warn').allTextContents();
	check('X deletes the face and validation reports the hole', fd1 === fd0 - 1 && warnD.some((w) => /open edge/.test(w)), { fd0, fd1, warnD });
	await page.keyboard.press('Control+KeyZ');
	await wait(300);
	check('undo restores the deleted face', (await mesh(page)).f === fd0);
	// below-floor validation
	await G(page, () => { const e = window.__equip; e.sel = { v: [], e: [], f: [] }; });
	await page.keyboard.press('Digit2');
	await G(page, () => { const e = window.__equip, m = e.workMesh; let lo = 0; for (let i = 1; i < m.v.length / 3; i++) if (m.v[3 * i + 1] < m.v[3 * lo + 1]) lo = i; e.sel = { v: [lo], e: [], f: [] }; });
	await wait(200);
	const ylo = Number(await page.getByTestId('sel-pos-y').inputValue());
	await page.getByTestId('sel-pos-y').fill(String(ylo - 10));
	await page.getByTestId('sel-pos-y').press('Enter');
	await wait(300);
	const warnY = await page.getByTestId('mesh-warn').allTextContents();
	check('validation: geometry below the floor is flagged', warnY.some((w) => /below the floor/.test(w)), warnY);
	await page.keyboard.press('Control+KeyZ');
	await wait(300);

	// persistence + backward compatibility
	const saved = await mesh(page);
	await page.reload({ waitUntil: 'networkidle' });
	await page.waitForFunction(() => !!window.__equip);
	const persisted = await G(page, () => { const e = window.__equip.custom[0]; const p = e.parts[0]; return { shape: p.shape, v: p.mesh?.v.length / 3, f: p.mesh?.f.length, fm: (p.mesh?.fm ?? []).filter(Boolean) }; });
	check('edited mesh persists across reload (localStorage)', persisted.shape === 'mesh' && persisted.v === saved.v && persisted.f === saved.f && persisted.fm.includes('amber'), { persisted, saved });
	const old = await G(page, () => window.__equip.importJSON(JSON.stringify({ format: 'starship-equipment', version: 1, equipment: [{ id: 'custom:old-1', name: 'Old box', w: 0.5, d: 0.5, height: 0.5, parts: [{ id: 'p1', name: 'b', shape: 'rbox', pos: [0, 0.25, 0], rot: [0, 0, 0], size: [0.5, 0.5, 0.5], m: 'white' }] }] })));
	const bad = await G(page, () => window.__equip.importJSON(JSON.stringify([{ id: 'custom:bad-1', name: 'Bad mesh', parts: [{ id: 'p', shape: 'mesh', mesh: { v: [0, 0, 0, 1], f: [[0, 9, 7]] }, pos: [0, 0, 0], rot: [0, 0, 0], size: [1, 1, 1] }] }])));
	const badShape = await G(page, () => window.__equip.custom.find((e) => e.id.startsWith('custom:bad-1'))?.parts[0].shape);
	check('old JSON (no meshes) imports; a corrupt mesh falls back to a box', old === 1 && bad === 1 && badShape === 'box', { old, bad, badShape });

	// exports: designer GLB + layout BOM geometry column
	await G(page, () => { window.__game.designer = true; window.__equip.select(window.__equip.custom[0].id); });
	await wait(1200);
	const dl = page.waitForEvent('download');
	await page.getByTestId('designer-export-glb').click();
	const d = await dl;
	const path = await d.path();
	const fs = await import('fs');
	const glbBytes = fs.readFileSync(path);
	check('designer ⬇ Export GLB downloads a binary glTF with the edited mesh', glbBytes.slice(0, 4).toString() === 'glTF' && glbBytes.length > 1500, { name: d.suggestedFilename(), bytes: glbBytes.length });
	const bom = await G(page, () => { const g = window.__game, id = window.__equip.custom[0].id; g.designer = false; g.selectDeck(0); g.decks[0].modules.push({ ...JSON.parse(JSON.stringify(g.decks[0].modules[0])), uid: 'edit-test-1', type: id, x: 0, z: 0, angle: 0 }); return window.__exports.csv(); });
	const line = bom.split('\n').find((l) => l.includes('edited mesh'));
	check('BOM CSV has a geometry column noting the edited mesh', bom.split('\n')[0].includes('geometry') && !!line, { line: line?.slice(0, 160) });
	check('desktop: no page errors', errors.length === 0, errors.slice(0, 3));
	await ctx.close();
}

// ---------------- mobile (iPhone 13) ----------------
{
	const { ctx, page, errors } = await open({ ...devices['iPhone 13'] });
	await newDesign(page);
	const tb = await page.getByTestId('edit-toolbar').isVisible();
	await page.getByTestId('edit-mode-face').tap();
	await page.getByTestId('edit-multi').tap();
	await wait(400);
	// two visible faces (top + front)
	const faces = await G(page, () => { const m = window.__equip.workMesh; const out = []; m.f.forEach((f, fi) => { let nx = 0, ny = 0, nz = 0; for (let k = 0; k < f.length; k++) { const a = f[k], b = f[(k + 1) % f.length]; nx += (m.v[3 * a + 1] - m.v[3 * b + 1]) * (m.v[3 * a + 2] + m.v[3 * b + 2]); ny += (m.v[3 * a + 2] - m.v[3 * b + 2]) * (m.v[3 * a] + m.v[3 * b]); nz += (m.v[3 * a] - m.v[3 * b]) * (m.v[3 * a + 1] + m.v[3 * b + 1]); } if (ny > 1e-6 || nz > 1e-6) out.push(fi); }); return out; });
	for (const fi of faces) {
		const p = await fScreen(page, fi);
		await page.touchscreen.tap(p.x, p.y);
		await wait(350);
	}
	const s = await st(page);
	check('mobile: toolbar + Multi toggle; taps add faces to the selection', tb && s.mode === 'face' && s.f.length === faces.length, { faces, s });
	// tap one again → toggles off
	const p0 = await fScreen(page, faces[0]);
	await page.touchscreen.tap(p0.x, p0.y);
	await wait(350);
	const s2 = await st(page);
	check('mobile: tapping a selected face toggles it off', s2.f.length === faces.length - 1, s2);
	await page.getByTestId('op-extrude').tap();
	await wait(400);
	check('mobile: Extrude button works', (await mesh(page)).f === 10);
	await G(page, () => window.__equip.setView('iso'));
	await wait(1500);
	await page.screenshot({ path: 'screenshot-mobile-designer-edit.png' });
	check('mobile: no page errors', errors.length === 0, errors.slice(0, 3));
	await ctx.close();
}
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
