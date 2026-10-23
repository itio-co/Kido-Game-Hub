/** Real-world exports: 1:50 SVG floor plans, bill-of-materials CSV, file download helper. */
import { CATALOG_BY_ID, LADDER_EXTENSION, SHAFT_MASS_PER_M } from './catalog';
import { accessFootprint, footprintOf, localToWorld, maxRadius, outline, shaftAccess, shaftFootprint } from './geometry';
import {
	AIRLOCK_ANGLE,
	AIRLOCK_WIDTH,
	DISCLAIMER,
	HULL_INNER_RADIUS as HULL_R,
	HULL_WALL_THICKNESS,
	SLAB_THICKNESS
} from './specs';
import type { Deck, Phase, Shaft } from './types';
import { PHASE, dimsOf } from './geometry';
import {
	DOME_RISE,
	HULL_OUTER,
	LOCATIONS,
	OPENING_MAX_W,
	RING_HEIGHT,
	arealDensity,
	bermToe,
	hullRadiusAt,
	terrainHeight,
	type HabitatConfig,
	type ShipGeo
} from './ship';

export interface PlanOpts {
	/** inner hull radius of this deck (nose decks are smaller) */
	R?: number;
	deckLabel?: (k: number) => string;
	phase?: Phase;
	airlock?: boolean;
}

function wrap(text: string, n: number): string[] {
	const out: string[] = [];
	let line = '';
	for (const w of text.split(' ')) {
		if ((line + ' ' + w).trim().length > n) {
			out.push(line.trim());
			line = w;
		} else line += ' ' + w;
	}
	if (line.trim()) out.push(line.trim());
	return out;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * Floor plan of one deck at 1:50 on an A3 landscape sheet (420 × 297 mm).
 * At 1:50, 1 m = 20 mm on paper. SVG user units = mm. Plan view from above: +X right, +Z down.
 */
export function floorPlanSVG(
	decks: Deck[],
	shafts: Shaft[],
	k: number,
	floorY: number[],
	label: (s: Shaft) => string,
	opts: PlanOpts = {}
): string {
	const prevPhase = PHASE.v;
	if (opts.phase) PHASE.v = opts.phase;
	try {
		return planSVG(decks, shafts, k, floorY, label, opts);
	} finally {
		PHASE.v = prevPhase;
	}
}
function planSVG(decks: Deck[], shafts: Shaft[], k: number, floorY: number[], label: (s: Shaft) => string, opts: PlanOpts): string {
	const HULL_INNER_RADIUS = opts.R ?? HULL_R;
	const dl = opts.deckLabel ?? ((i: number) => `Deck ${i + 1}`);
	const phaseName = PHASE.v === 'launch' ? 'Launch/Landing configuration' : 'Surface/Cruise configuration';
	const here = shafts.filter((s) => s.from === k || s.to === k);
	const deck = decks[k];
	const S = 20; // mm per metre at 1:50
	const W = 420;
	const H = 297;
	const cx = 150;
	const cy = 150;
	const P = (x: number, z: number) => `${(cx + x * S).toFixed(2)},${(cy + z * S).toFixed(2)}`;
	const RI = HULL_INNER_RADIUS * S;
	const RO = (HULL_INNER_RADIUS + HULL_WALL_THICKNESS) * S;
	const o: string[] = [];
	o.push(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" font-family="Helvetica, Arial, sans-serif">`,
		`<rect width="${W}" height="${H}" fill="#fff"/>`,
		`<rect x="8" y="8" width="${W - 16}" height="${H - 16}" fill="none" stroke="#000" stroke-width="0.5"/>`,
		`<defs><pattern id="hatch" width="2" height="2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="2" stroke="#555" stroke-width="0.4"/></pattern>`,
		`<marker id="arr" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0,0 L6,3 L0,6 z" fill="#000"/></marker></defs>`
	);
	// hull wall (hatched annulus)
	o.push(
		`<path d="M ${cx - RO},${cy} a ${RO},${RO} 0 1,0 ${2 * RO},0 a ${RO},${RO} 0 1,0 ${-2 * RO},0 M ${cx - RI},${cy} a ${RI},${RI} 0 1,1 ${2 * RI},0 a ${RI},${RI} 0 1,1 ${-2 * RI},0" fill="url(#hatch)" fill-rule="evenodd" stroke="#000" stroke-width="0.5"/>`
	);
	// guide rings / axes
	for (const r of [1, 2, 3, 4])
		o.push(`<circle cx="${cx}" cy="${cy}" r="${r * S}" fill="none" stroke="#9cc" stroke-width="0.15" stroke-dasharray="1 1.5"/>`);
	o.push(
		`<line x1="${cx - RO - 6}" y1="${cy}" x2="${cx + RO + 6}" y2="${cy}" stroke="#666" stroke-width="0.18" stroke-dasharray="6 1.5 1 1.5"/>`,
		`<line x1="${cx}" y1="${cy - RO - 6}" x2="${cx}" y2="${cy + RO + 6}" stroke="#666" stroke-width="0.18" stroke-dasharray="6 1.5 1 1.5"/>`
	);
	if (opts.airlock ?? k === 0) {
		const half = AIRLOCK_WIDTH / 2;
		const ax = Math.cos(AIRLOCK_ANGLE);
		const az = Math.sin(AIRLOCK_ANGLE);
		const tx = -az;
		const tz = ax;
		const a = [HULL_INNER_RADIUS - 0.02, HULL_INNER_RADIUS + HULL_WALL_THICKNESS + 0.02];
		o.push(
			`<polygon points="${P(ax * a[0] + tx * half, az * a[0] + tz * half)} ${P(ax * a[1] + tx * half, az * a[1] + tz * half)} ${P(ax * a[1] - tx * half, az * a[1] - tz * half)} ${P(ax * a[0] - tx * half, az * a[0] - tz * half)}" fill="#fff" stroke="#000" stroke-width="0.35"/>`,
			`<text x="${cx + ax * (HULL_INNER_RADIUS + 0.9) * S}" y="${cy + az * (HULL_INNER_RADIUS + 0.9) * S}" font-size="3" text-anchor="middle" dominant-baseline="middle" transform="rotate(-90 ${cx + ax * (HULL_INNER_RADIUS + 0.9) * S} ${cy + az * (HULL_INNER_RADIUS + 0.9) * S})">AIRLOCK ${(AIRLOCK_WIDTH * 1000).toFixed(0)}</text>`
		);
	}
	// modules
	deck.modules.forEach((m, n) => {
		const def = CATALOG_BY_ID[m.type];
		const f = footprintOf(m.type, m.x, m.z, m.angle);
		const acc = accessFootprint(m.type, m.x, m.z, m.angle);
		if (acc)
			o.push(`<polygon points="${outline(acc).map(([x, z]) => P(x, z)).join(' ')}" fill="none" stroke="#3a7bd5" stroke-width="0.2" stroke-dasharray="1 0.8"/>`);
		o.push(
			`<polygon points="${outline(f, 48).map(([x, z]) => P(x, z)).join(' ')}" fill="${m.type === 'partition' ? '#444' : '#eef1f4'}" stroke="#000" stroke-width="0.35"/>`
		);
		if (def.shape === 'rect') {
			const [fx, fz] = [m.x + Math.sin((m.angle * Math.PI) / 180) * (dimsOf(def).d / 2), m.z + Math.cos((m.angle * Math.PI) / 180) * (dimsOf(def).d / 2)];
			o.push(`<circle cx="${cx + fx * S}" cy="${cy + fz * S}" r="0.6" fill="#3a7bd5"/>`);
		}
		const tag = n + 1;
		o.push(
			`<circle cx="${cx + m.x * S}" cy="${cy + m.z * S}" r="2.4" fill="#fff" stroke="#000" stroke-width="0.3"/>`,
			`<text x="${cx + m.x * S}" y="${cy + m.z * S + 1}" font-size="2.8" text-anchor="middle" font-weight="bold">${tag}</text>`
		);
	});
	// ladder connections: opening (upper deck) / ladder (lower deck) at identical coordinates
	for (const sh of here) {
		const f = shaftFootprint(sh.x, sh.z, sh.angle);
		const R = (f.kind === 'circle' ? f.r : 0.55) * S;
		const X = cx + sh.x * S;
		const Y = cy + sh.z * S;
		o.push(`<polygon points="${outline(shaftAccess(sh.x, sh.z, sh.angle)).map(([x, z]) => P(x, z)).join(' ')}" fill="none" stroke="#3a7bd5" stroke-width="0.2" stroke-dasharray="1 0.8"/>`);
		o.push(`<circle cx="${X}" cy="${Y}" r="${R}" fill="none" stroke="#b58a00" stroke-width="0.35" stroke-dasharray="${sh.to === k ? '0' : '1.5 1'}"/>`);
		if (sh.to === k) {
			// floor opening Ø800: circle with diagonal cross (opening convention) + guard rail arc
			const r = 0.4 * S;
			o.push(
				`<circle cx="${X}" cy="${Y}" r="${r}" fill="#fff" stroke="#000" stroke-width="0.4"/>`,
				`<line x1="${X - r * 0.707}" y1="${Y - r * 0.707}" x2="${X + r * 0.707}" y2="${Y + r * 0.707}" stroke="#000" stroke-width="0.25"/>`,
				`<line x1="${X - r * 0.707}" y1="${Y + r * 0.707}" x2="${X + r * 0.707}" y2="${Y - r * 0.707}" stroke="#000" stroke-width="0.25"/>`
			);
		}
		// ladder (shown on both decks: solid on the lower deck, dashed where it rises through the opening)
		const [ax, az] = localToWorld(sh.x, sh.z, sh.angle, -0.2, -0.33);
		const [bx, bz] = localToWorld(sh.x, sh.z, sh.angle, 0.2, -0.33);
		o.push(`<line x1="${cx + ax * S}" y1="${cy + az * S}" x2="${cx + bx * S}" y2="${cy + bz * S}" stroke="#000" stroke-width="${sh.from === k ? 0.9 : 0.4}" ${sh.from === k ? '' : 'stroke-dasharray="1 0.6"'}/>`);
		o.push(
			`<rect x="${X + R + 0.8}" y="${Y - 2.6}" width="${label(sh).length * 2 + 5}" height="4" rx="0.8" fill="#ffd23f" stroke="#000" stroke-width="0.2"/>`,
			`<text x="${X + R + 1.6}" y="${Y + 0.4}" font-size="2.8" font-weight="bold">${esc(label(sh))} ${sh.from === k ? '↑' : '↓'}</text>`
		);
	}

	// overall dimension: inner diameter
	const dy = cy - RO - 10;
	o.push(
		`<line x1="${cx - RI}" y1="${dy}" x2="${cx + RI}" y2="${dy}" stroke="#000" stroke-width="0.25" marker-start="url(#arr)" marker-end="url(#arr)"/>`,
		`<line x1="${cx - RI}" y1="${dy - 2}" x2="${cx - RI}" y2="${cy}" stroke="#000" stroke-width="0.15"/>`,
		`<line x1="${cx + RI}" y1="${dy - 2}" x2="${cx + RI}" y2="${cy}" stroke="#000" stroke-width="0.15"/>`,
		`<text x="${cx}" y="${dy - 1.5}" font-size="3.5" text-anchor="middle">Ø ${(HULL_INNER_RADIUS * 2000).toFixed(0)} (interior)</text>`,
		`<text x="${cx + RO + 2}" y="${cy - 2}" font-size="2.5">hull wall ${(HULL_WALL_THICKNESS * 1000).toFixed(0)} (nominal)</text>`
	);
	// scale bar (0–3 m)
	const sx = 30;
	const sy = H - 22;
	for (let i = 0; i < 3; i++)
		o.push(`<rect x="${sx + i * S}" y="${sy}" width="${S}" height="2.5" fill="${i % 2 ? '#fff' : '#000'}" stroke="#000" stroke-width="0.25"/>`);
	for (let i = 0; i <= 3; i++) o.push(`<text x="${sx + i * S}" y="${sy + 6.5}" font-size="3" text-anchor="middle">${i} m</text>`);
	o.push(`<text x="${sx}" y="${sy - 2.5}" font-size="3">SCALE 1:50 (A3)</text>`);
	o.push(`<text x="${sx + 70}" y="${sy + 2}" font-size="2.6">+X →   +Z ↓   (origin = hull axis)</text>`);

	// title block + schedule
	const tx = 285;
	let ty = 20;
	o.push(
		`<line x1="${tx - 6}" y1="8" x2="${tx - 6}" y2="${H - 8}" stroke="#000" stroke-width="0.4"/>`,
		`<text x="${tx}" y="${ty}" font-size="6" font-weight="bold">STARSHIP INTERIOR</text>`
	);
	ty += 8;
	o.push(`<text x="${tx}" y="${ty}" font-size="4.5">${esc(dl(k))} (${k + 1} of ${decks.length}) — floor plan</text>`);
	ty += 5;
	o.push(`<text x="${tx}" y="${ty}" font-size="3.2" font-weight="bold">${phaseName}</text>`);
	ty += 6;
	o.push(
		`<text x="${tx}" y="${ty}" font-size="3">Clear height ${deck.height.toFixed(2)} m · slab ${SLAB_THICKNESS.toFixed(2)} m · FFL +${floorY[k].toFixed(2)} m</text>`
	);
	ty += 5;
	o.push(`<text x="${tx}" y="${ty}" font-size="3">Dimensions in mm unless noted · ${new Date().toISOString().slice(0, 10)}</text>`);
	ty += 8;
	o.push(`<text x="${tx}" y="${ty}" font-size="3" font-weight="bold"># Module   W×D×H (m)   X, Z (m)   rot°  wall (m)</text>`);
	ty += 1.5;
	o.push(`<line x1="${tx}" y1="${ty}" x2="${W - 12}" y2="${ty}" stroke="#000" stroke-width="0.25"/>`);
	deck.modules.forEach((m, n) => {
		ty += 4.2;
		if (ty > H - 30) return;
		const def = CATALOG_BY_ID[m.type];
		const dd = dimsOf(def);
		const h = def.fullHeight ? deck.height : dd.height;
		const dims = def.shape === 'circle' ? `Ø${dd.w.toFixed(2)}×${h.toFixed(2)}` : `${dd.w.toFixed(2)}×${dd.d.toFixed(2)}×${h.toFixed(2)}`;
		const wall = HULL_INNER_RADIUS - maxRadius(footprintOf(m.type, m.x, m.z, m.angle));
		o.push(
			`<text x="${tx}" y="${ty}" font-size="2.7">${n + 1}  ${esc(def.name)}</text>`,
			`<text x="${tx + 4}" y="${ty + 2.9}" font-size="2.3" fill="#333">${dims} · ${m.x.toFixed(2)}, ${m.z.toFixed(2)} · ${m.angle.toFixed(0)}° · ${wall.toFixed(2)}</text>`
		);
		ty += 2.6;
	});
	for (const sh of here) {
		ty += 4.2;
		if (ty > H - 30) break;
		o.push(
			`<text x="${tx}" y="${ty}" font-size="2.7">${esc(label(sh))}  Ladder deck ${sh.from + 1}→${sh.to + 1} (${sh.to === k ? 'opening Ø0.80 here' : 'ladder here'})</text>`,
			`<text x="${tx + 4}" y="${ty + 2.9}" font-size="2.3" fill="#333">X, Z ${sh.x.toFixed(3)}, ${sh.z.toFixed(3)} · ${sh.angle.toFixed(0)}° · same coordinates on deck ${sh.to === k ? sh.from + 1 : sh.to + 1}</text>`
		);
		ty += 2.6;
	}
	o.push(
		`<text x="${tx}" y="${H - 22}" font-size="2.4" fill="#3a7bd5">Dashed blue = front access zone; dot = front · ⊗ = floor opening</text>`,
		...wrap(DISCLAIMER, 58).map((line, i) => `<text x="${tx}" y="${H - 16 + i * 3.5}" font-size="2.3" fill="#a00">${esc(line)}</text>`),
		`</svg>`
	);
	return o.join('\n');
}

/** Bill of materials (one row per placed item) + totals per module type. */
export interface BomOpts {
	deckLabel?: (k: number) => string;
	/** habitat mode: hull operations section */
	ship?: ShipGeo;
	hab?: HabitatConfig;
	crew?: number;
}
/** BOM note for data-driven (custom) equipment: parts and edited meshes */
function geomNote(def: { parts?: { shape: string; mesh?: { v: number[]; f: number[][] } }[]; custom?: boolean }): string {
	if (!def.custom || !def.parts) return '';
	const meshes = def.parts.filter((p) => p.shape === 'mesh' && p.mesh);
	const faces = meshes.reduce((n, p) => n + (p.mesh?.f.length ?? 0), 0);
	return `${def.parts.length} parts${meshes.length ? ` · ${meshes.length} edited mesh (${faces} faces)` : ''}`;
}
export function bomCSV(decks: Deck[], shafts: Shaft[] = [], floorY: number[] = [], label: (s: Shaft) => string = () => 'L', opts: BomOpts = {}): string {
	const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
	const dl = opts.deckLabel ?? ((k: number) => String(k + 1));
	const rows: (string | number)[][] = [
		['deck', 'item_no', 'module', 'module_id', 'quantity', 'W_m', 'D_m', 'H_m', 'x_m', 'y_m', 'rotation_deg', 'mass_kg_est', 'power_W_est', 'unit_cost_est', 'length_m', 'W_launch_m', 'D_launch_m', 'H_launch_m', 'stowable', 'seats', 'geometry']
	];
	const totals = new Map<string, { qty: number; mass: number; power: number; cost: number }>();
	decks.forEach((d, k) =>
		d.modules.forEach((m, n) => {
			const def = CATALOG_BY_ID[m.type];
			const h = def.fullHeight ? d.height : def.height;
			const L = def.launch;
			rows.push([dl(k), n + 1, def.name, def.id, 1, def.w.toFixed(3), def.d.toFixed(3), h.toFixed(3), m.x.toFixed(3), m.z.toFixed(3), m.angle.toFixed(1), def.mass, def.power, def.cost, '', L ? L.w.toFixed(3) : '', L ? L.d.toFixed(3) : '', L ? L.height.toFixed(3) : '', def.stowable ? 'yes' : '', def.seats ?? '', geomNote(def)]);
			const t = totals.get(def.name) ?? { qty: 0, mass: 0, power: 0, cost: 0 };
			t.qty++;
			t.mass += def.mass;
			t.power += def.power;
			t.cost += def.cost;
			totals.set(def.name, t);
		})
	);
	// ladder connections: listed once with their deck pair and ladder length
	const hd = CATALOG_BY_ID.hatch;
	for (const sh of shafts) {
		const len = (floorY[sh.to] ?? 0) - (floorY[sh.from] ?? 0) + LADDER_EXTENSION;
		const mass = Math.round(hd.mass + SHAFT_MASS_PER_M * len);
		rows.push([`${dl(sh.from)}→${dl(sh.to)}`, label(sh), `Ladder connection ${label(sh)}`, 'ladder', 1, hd.w.toFixed(3), hd.d.toFixed(3), len.toFixed(3), sh.x.toFixed(3), sh.z.toFixed(3), sh.angle.toFixed(1), mass, hd.power, hd.cost, len.toFixed(3)]);
		const t = totals.get('Ladder connection') ?? { qty: 0, mass: 0, power: 0, cost: 0 };
		t.qty++;
		t.mass += mass;
		t.power += hd.power;
		t.cost += hd.cost;
		totals.set('Ladder connection', t);
	}
	rows.push([]);
	rows.push(['TOTALS', '', 'module', '', 'quantity', '', '', '', '', '', '', 'mass_kg_est', 'power_W_est', 'cost_est']);
	let all = { qty: 0, mass: 0, power: 0, cost: 0 };
	for (const [name, t] of totals) {
		rows.push(['', '', name, '', t.qty, '', '', '', '', '', '', t.mass, t.power, t.cost]);
		all = { qty: all.qty + t.qty, mass: all.mass + t.mass, power: all.power + t.power, cost: all.cost + t.cost };
	}
	rows.push(['', '', 'ALL', '', all.qty, '', '', '', '', '', '', all.mass, all.power, all.cost]);
	const seats = decks.reduce((s, d) => s + d.modules.reduce((a, m) => a + (CATALOG_BY_ID[m.type].seats ?? 0), 0), 0);
	if (seats || opts.crew) rows.push(['', '', `Launch seats ${seats} / crew ${opts.crew ?? '?'}`, '', '', '', '', '', '', '', '', '', '', '']);
	if (opts.ship && opts.hab) {
		rows.push([]);
		rows.push(['HULL OPERATIONS (ESTIMATE – every item needs structural analysis and requalification)']);
		rows.push(['op_no', 'operation', 'location', 'detail', 'quantity', 'length_or_area', 'unit']);
		hullOperations(opts.ship, opts.hab).forEach((r, i) => rows.push([i + 1, r.op, r.where, r.detail, r.qty, r.amount, r.unit]));
	}
	rows.push([]);
	rows.push(['# Mass, power and cost are planning ASSUMPTIONS. y_m = plan Z axis (metres from hull axis).']);
	rows.push(['# ' + DISCLAIMER]);
	return rows.map((r) => r.map(q).join(',')).join('\n') + '\n';
}

export function download(name: string, data: BlobPart, mime: string) {
	const blob = new Blob([data], { type: mime });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = name;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export interface HullOp {
	op: string;
	where: string;
	detail: string;
	qty: number;
	amount: string;
	unit: string;
}
/** list of hull modification operations implied by the habitat configuration */
export function hullOperations(g: ShipGeo, h: HabitatConfig): HullOp[] {
	const out: HullOp[] = [];
	const circ = 2 * Math.PI * HULL_R;
	for (const sec of ['ch4', 'lox'] as const)
		if (h.converted[sec]) {
			const s = g.sections.find((x) => x.id === sec)!;
			out.push({ op: 'Purge, passivate, insulate & pressurize tank', where: s.name, detail: `${s.rings} rings · ${Math.round(s.volume)} m³ geometric`, qty: 1, amount: Math.round(s.volume).toString(), unit: 'm³' });
		}
	for (const d of g.domes) {
		if (d.state === 'cut')
			out.push({ op: 'Cut out dome, leave ring flange (~0.6 m), add floor/beam ring', where: d.name, detail: `cut length ≈ circumference at flange`, qty: 1, amount: (2 * Math.PI * (HULL_R - 0.6)).toFixed(2), unit: 'm cut' });
		else if (d.state === 'hatch')
			out.push({ op: 'Cut Ø1.0 m manway in dome apex + reinforcing ring + pressure hatch', where: d.name, detail: 'apex manway', qty: 1, amount: (Math.PI * 1.0).toFixed(2), unit: 'm cut' });
	}
	h.inserts.forEach((ins) =>
		out.push({ op: `Cut circumferential weld, insert ${ins.count} ring(s), 2 new welds`, where: `${ins.section.toUpperCase()} joint ${ins.joint}`, detail: `+${(ins.count * RING_HEIGHT).toFixed(2)} m · ${(ins.count * 1600).toLocaleString('en-US')} kg steel (≈1,600 kg/ring REPORTED)`, qty: ins.count, amount: (circ * 3).toFixed(1), unit: 'm cut+weld' })
	);
	for (const o of h.openings) {
		const sec = g.ringSection[o.ring];
		out.push({ op: `Side opening P${o.uid} (${o.w}×${o.h} m) with doubler frame${o.spanWeld ? ' across weld' : ''}`, where: `${sec.toUpperCase()} ring #${o.ring + 1} @ ${o.angle}°`, detail: `max width ${OPENING_MAX_W} m`, qty: 1, amount: (2 * (o.w + o.h)).toFixed(2), unit: 'm cut' });
		if (o.tunnel) out.push({ op: `Tunnel stub T${o.uid} Ø2.0 m + pressure collar`, where: `from P${o.uid}`, detail: 'buried/bermed if below soil line', qty: 1, amount: o.tunnelLen.toFixed(1), unit: 'm' });
	}
	if (h.burial > 0 || h.berm > 0)
		out.push({ op: 'Excavate pit, backfill and berm regolith', where: LOCATIONS[h.location].name, detail: `burial ${h.burial} m · berm ${h.berm} m`, qty: 1, amount: Math.round(Math.PI * (bermToe(h) ** 2 - HULL_OUTER ** 2) * (h.burial + h.berm / 2)).toString(), unit: 'm³ (approx.)' });
	return out;
}

/**
 * Ship elevation / section at 1:200 on A3 portrait (297 × 420 mm). 1 m = 5 mm.
 * Left half = outside elevation, right half = section with decks, domes and tanks.
 */
export function elevationSVG(
	g: ShipGeo,
	h: HabitatConfig,
	decks: Deck[],
	floorY: number[],
	deckLabel: (k: number) => string,
	soilTop: number
): string {
	const S = 5; // mm per metre at 1:200
	const W = 297, Hp = 420;
	const cx = 110;
	const base = 360; // paper y of ship base (y = 0)
	const X = (u: number) => cx + u * S;
	const Y = (y: number) => base - y * S;
	const o: string[] = [];
	const loc = LOCATIONS[h.location];
	o.push(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${Hp}mm" viewBox="0 0 ${W} ${Hp}" font-family="Helvetica, Arial, sans-serif">`,
		`<rect width="${W}" height="${Hp}" fill="#fff"/>`,
		`<rect x="8" y="8" width="${W - 16}" height="${Hp - 16}" fill="none" stroke="#000" stroke-width="0.5"/>`,
		`<defs><pattern id="soil" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="3" stroke="#8a6d4b" stroke-width="0.35"/></pattern>`,
		`<pattern id="fill" width="2" height="2" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><line x1="0" y1="0" x2="0" y2="2" stroke="#c09a6b" stroke-width="0.3"/></pattern></defs>`
	);
	// regolith (native) and backfill/berm, both sides
	const span = 18;
	const terr = (sgn: number) => {
		const pts: string[] = [];
		for (let i = 0; i <= 40; i++) {
			const u = HULL_OUTER + (span - HULL_OUTER) * (i / 40);
			pts.push(`${X(sgn * u)},${Y(terrainHeight(h, u))}`);
		}
		return pts;
	};
	for (const sgn of [-1, 1]) {
		const t = terr(sgn);
		o.push(`<polygon points="${X(sgn * HULL_OUTER)},${Y(-3)} ${X(sgn * HULL_OUTER)},${Y(soilTop)} ${t.join(' ')} ${X(sgn * span)},${Y(-3)}" fill="url(#soil)" stroke="none"/>`);
		const pe = Math.min(bermToe(h), HULL_OUTER + 1.5 + h.burial);
		o.push(`<polyline points="${X(sgn * HULL_OUTER)},${Y(0)} ${X(sgn * (HULL_OUTER + 1.5))},${Y(0)} ${X(sgn * pe)},${Y(h.burial)}" fill="none" stroke="#8a6d4b" stroke-width="0.35" stroke-dasharray="1.5 1"/>`);
		o.push(`<polyline points="${t.join(' ')}" fill="none" stroke="#5a4630" stroke-width="0.5"/>`);
	}
	o.push(`<rect x="${X(-HULL_OUTER)}" y="${Y(0)}" width="${2 * HULL_OUTER * S}" height="${3 * S}" fill="url(#soil)"/>`);
	o.push(`<line x1="${X(-span)}" y1="${Y(h.burial)}" x2="${X(span)}" y2="${Y(h.burial)}" stroke="#5a4630" stroke-width="0.25" stroke-dasharray="4 1.5"/>`);
	o.push(`<text x="${X(span) + 1}" y="${Y(h.burial) + 1}" font-size="2.6">GRADE ±0.00 (ship base −${h.burial.toFixed(2)})</text>`);
	o.push(`<line x1="${X(-HULL_OUTER - 1)}" y1="${Y(soilTop)}" x2="${X(HULL_OUTER + 1)}" y2="${Y(soilTop)}" stroke="#d08a00" stroke-width="0.5"/>`);
	o.push(`<text x="${X(HULL_OUTER + 1.2)}" y="${Y(soilTop) - 1}" font-size="2.6" fill="#b06a00">SOIL LINE +${soilTop.toFixed(2)}</text>`);
	// hull outline (outer), both sides
	const prof: [number, number][] = [];
	for (let i = 0; i <= 60; i++) {
		const y = (g.tip * i) / 60;
		prof.push([hullRadiusAt(g, y) + (y < g.noseBase ? HULL_OUTER - HULL_R : 0), y]);
	}
	const path = prof.map(([u, y]) => `${X(u)},${Y(y)}`).concat(prof.slice().reverse().map(([u, y]) => `${X(-u)},${Y(y)}`));
	o.push(`<polygon points="${path.join(' ')}" fill="#f4f6f8" stroke="#000" stroke-width="0.6"/>`);
	// section half (right) – inner face
	const inner = prof.map(([u, y]) => `${X(Math.max(0, u - (y < g.noseBase ? HULL_OUTER - HULL_R : 0)))},${Y(y)}`);
	o.push(`<polyline points="${inner.join(' ')}" fill="none" stroke="#000" stroke-width="0.3"/>`);
	o.push(`<line x1="${cx}" y1="${Y(-1)}" x2="${cx}" y2="${Y(g.tip + 2)}" stroke="#666" stroke-width="0.2" stroke-dasharray="6 1.5 1 1.5"/>`);
	o.push(`<text x="${cx - 26}" y="${Y(g.tip) - 6}" font-size="3">ELEVATION</text><text x="${cx + 4}" y="${Y(g.tip) - 6}" font-size="3">SECTION</text>`);
	// ring welds
	for (const j of g.joints) o.push(`<line x1="${X(-HULL_OUTER)}" y1="${Y(j)}" x2="${X(HULL_OUTER)}" y2="${Y(j)}" stroke="#777" stroke-width="0.18"/>`);
	g.welds.forEach((w) => o.push(`<line x1="${X(-HULL_OUTER - 0.8)}" y1="${Y(w.y)}" x2="${X(HULL_OUTER + 0.8)}" y2="${Y(w.y)}" stroke="#e06a00" stroke-width="0.5" stroke-dasharray="2 1"/>`));
	if (g.welds.length) o.push(`<text x="${X(-HULL_OUTER - 1)}" y="${Y(g.welds[0].y) - 1}" font-size="2.4" fill="#e06a00" text-anchor="end">CUT &amp; REWELD (requalify)</text>`);
	// domes (right half)
	for (const d of g.domes) {
		if (d.state === 'cut') {
			o.push(`<line x1="${X(HULL_R - 0.6)}" y1="${Y(d.y)}" x2="${X(HULL_R)}" y2="${Y(d.y)}" stroke="#e06a00" stroke-width="0.9"/>`);
			o.push(`<text x="${X(1.0)}" y="${Y(d.y) - 1}" font-size="2.3" fill="#e06a00">${esc(d.name)} CUT – flange</text>`);
			continue;
		}
		const pts: string[] = [];
		const u0 = d.state === 'hatch' ? 0.5 : 0;
		for (let i = 0; i <= 24; i++) {
			const u = u0 + ((HULL_R - u0) * i) / 24;
			pts.push(`${X(u)},${Y(d.y + d.dir * DOME_RISE * Math.sqrt(Math.max(0, 1 - (u / HULL_R) ** 2)))}`);
		}
		o.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="#000" stroke-width="0.45"/>`);
		o.push(`<text x="${X(1.0)}" y="${Y(d.y + d.dir * 1.0) + 1}" font-size="2.3">${esc(d.name)}${d.state === 'hatch' ? ' + Ø1.0 HATCH' : ''}</text>`);
	}
	// sealed tanks shaded
	for (const sec of g.sections) {
		if ((sec.id === 'lox' || sec.id === 'ch4') && !h.converted[sec.id])
			o.push(`<rect x="${X(0)}" y="${Y(sec.y1)}" width="${HULL_R * S}" height="${(sec.y1 - sec.y0) * S}" fill="${sec.id === 'lox' ? '#d8ecff' : '#dcf5e0'}" opacity="0.6"/>`);
	}
	// decks (right half)
	decks.forEach((d, k) => {
		const y = floorY[k];
		const r = hullRadiusAt(g, y);
		o.push(`<rect x="${X(0)}" y="${Y(y)}" width="${r * S}" height="${0.25 * S}" fill="#555"/>`);
		o.push(`<text x="${X(0.3)}" y="${Y(y + 0.8)}" font-size="2.4">${esc(deckLabel(k))} FFL +${y.toFixed(2)} · ${d.height.toFixed(1)} m${y + d.height <= soilTop ? ' · shielded' : ''}</text>`);
	});
	// openings & tunnels (drawn on the side they face: right if 0–180°)
	for (const op of h.openings) {
		const y0 = g.ringY[op.ring] ?? 0;
		const yc = op.spanWeld ? y0 + RING_HEIGHT : y0 + RING_HEIGHT / 2;
		const sgn = op.angle % 360 < 180 ? 1 : -1;
		o.push(`<rect x="${sgn > 0 ? X(HULL_R) : X(-HULL_OUTER)}" y="${Y(yc + op.h / 2)}" width="${(HULL_OUTER - HULL_R) * S}" height="${op.h * S}" fill="#fff" stroke="#c00" stroke-width="0.4"/>`);
		if (op.tunnel) {
			const x0 = sgn > 0 ? X(HULL_OUTER) : X(-HULL_OUTER - op.tunnelLen);
			o.push(`<rect x="${x0}" y="${Y(yc + 1)}" width="${op.tunnelLen * S}" height="${2 * S}" fill="none" stroke="#c00" stroke-width="0.4"/>`);
		}
		o.push(`<text x="${X(sgn * (HULL_OUTER + (op.tunnel ? op.tunnelLen : 0) + 0.5))}" y="${Y(yc) + 1}" font-size="2.6" fill="#c00" text-anchor="${sgn > 0 ? 'start' : 'end'}">P${op.uid}${op.tunnel ? '/T' + op.uid : ''} ${op.w}×${op.h}</text>`);
	}
	// section labels (left)
	for (const sec of g.sections) {
		const ym = (sec.y0 + sec.y1) / 2;
		o.push(`<line x1="${X(-HULL_OUTER - 0.5)}" y1="${Y(sec.y0)}" x2="${X(-HULL_OUTER - 3)}" y2="${Y(sec.y0)}" stroke="#000" stroke-width="0.2"/>`);
		o.push(`<text x="${X(-HULL_OUTER - 3)}" y="${Y(ym)}" font-size="2.7" text-anchor="end">${esc(sec.short)} ${sec.rings ? sec.rings + '×1.83' : ''}</text>`);
		o.push(`<text x="${X(-HULL_OUTER - 3)}" y="${Y(ym) + 3}" font-size="2.2" text-anchor="end" fill="#444">${Math.round(sec.volume)} m³${sec.id === 'lox' || sec.id === 'ch4' ? (h.converted[sec.id] ? ' HAB' : ' SEALED') : ''}</text>`);
	}
	// overall dimensions
	const dx = X(HULL_OUTER + 9);
	o.push(`<line x1="${dx}" y1="${Y(0)}" x2="${dx}" y2="${Y(g.tip)}" stroke="#000" stroke-width="0.25"/>`);
	o.push(`<text x="${dx + 1.5}" y="${Y(g.tip / 2)}" font-size="3" transform="rotate(-90 ${dx + 1.5} ${Y(g.tip / 2)})" text-anchor="middle">${(g.tip * 1000).toFixed(0)}</text>`);
	o.push(`<line x1="${X(-HULL_OUTER)}" y1="${Y(-4)}" x2="${X(HULL_OUTER)}" y2="${Y(-4)}" stroke="#000" stroke-width="0.25"/>`);
	o.push(`<text x="${cx}" y="${Y(-4) + 4}" font-size="3" text-anchor="middle">Ø ${(HULL_OUTER * 2000).toFixed(0)} (outer, model)</text>`);
	// scale bar
	const sbx = 20, sby = Hp - 22;
	for (let i = 0; i < 5; i++) o.push(`<rect x="${sbx + i * 10}" y="${sby}" width="10" height="2" fill="${i % 2 ? '#fff' : '#000'}" stroke="#000" stroke-width="0.2"/>`);
	o.push(`<text x="${sbx}" y="${sby - 1.5}" font-size="2.6">0      2      4      6      8      10 m   SCALE 1:200 (A3)</text>`);
	// title block
	const tx = 200;
	let ty = Hp - 70;
	o.push(`<rect x="${tx - 4}" y="${ty - 8}" width="${W - tx - 4}" height="62" fill="#fff" stroke="#000" stroke-width="0.4"/>`);
	o.push(`<text x="${tx}" y="${ty}" font-size="4.5" font-weight="bold">STARSHIP SURFACE HABITAT</text>`);
	ty += 6;
	o.push(`<text x="${tx}" y="${ty}" font-size="3">Elevation / section · 1:200</text>`);
	ty += 5;
	o.push(`<text x="${tx}" y="${ty}" font-size="2.7">${loc.name} · g = ${loc.g} m/s² · regolith ${loc.rho} g/cm³</text>`);
	ty += 4;
	o.push(`<text x="${tx}" y="${ty}" font-size="2.7">Burial ${h.burial.toFixed(1)} m (${arealDensity(h.burial, loc.rho).toFixed(0)} g/cm²) · berm ${h.berm.toFixed(1)} m</text>`);
	ty += 4;
	o.push(`<text x="${tx}" y="${ty}" font-size="2.7">Habitable decks: ${decks.length} · height ${g.tip.toFixed(2)} m</text>`);
	ty += 4;
	o.push(`<text x="${tx}" y="${ty}" font-size="2.4" fill="#a60">Ring/section model and dome shape = ESTIMATE</text>`);
	ty += 4;
	o.push(...wrap(DISCLAIMER, 40).map((line, i) => `<text x="${tx}" y="${ty + i * 3.2}" font-size="2.2" fill="#a00">${esc(line)}</text>`));
	o.push(`<text x="${tx}" y="${Hp - 12}" font-size="2.3">${new Date().toISOString().slice(0, 10)} · units mm unless noted</text>`);
	o.push('</svg>');
	return o.join('\n');
}
