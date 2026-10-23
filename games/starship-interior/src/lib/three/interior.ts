/**
 * Interior view (walk / possessed / cruise): procedural lining, ceiling and fit-out geometry.
 * Everything is generated offline (canvas textures, merged static geometry) and cached by key.
 */
import { BoxGeometry, BufferGeometry, CanvasTexture, CylinderGeometry, DoubleSide, BackSide, LatheGeometry, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, TorusGeometry, Vector2, type Material } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { AIRLOCK_ANGLE, AIRLOCK_WIDTH } from '$lib/game/specs';

function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
	const c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	draw(c.getContext('2d')!);
	return c;
}
function speckle(g: CanvasRenderingContext2D, w: number, h: number, n: number, base: number, a = 0.18) {
	for (let i = 0; i < n; i++) {
		const v = base + Math.random() * 24 - 12;
		g.fillStyle = `rgba(${v},${v + 2},${v + 5},${a})`;
		g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
	}
}

const texCache = new Map<string, CanvasTexture>();
function tex(key: string, c: HTMLCanvasElement) {
	const t = new CanvasTexture(c);
	t.wrapS = t.wrapT = RepeatWrapping;
	t.colorSpace = SRGBColorSpace;
	t.anisotropy = 4;
	texCache.set(key, t);
	return t;
}

/**
 * Wall lining: one texture = one 1.2 m wide insulation panel column over the full deck height
 * (u around the hull, v = floor → ceiling). Quilted off-white panels, seams, fasteners, a kick plate
 * at the floor and a baked ambient-occlusion darkening at the floor and ceiling junctions.
 */
export function liningTexture(): CanvasTexture {
	const hit = texCache.get('lining');
	if (hit) return hit;
	const W = 256,
		H = 512;
	const c = canvas(W, H, (g) => {
		g.fillStyle = '#d9dde2';
		g.fillRect(0, 0, W, H);
		speckle(g, W, H, 2500, 205, 0.15);
		// panel rows: kick plate (bottom 9 %), two tall panels, upper panel
		const rows = [0, 0.18, 0.55, 0.91, 1];
		for (let i = 0; i < rows.length - 1; i++) {
			const y0 = H * (1 - rows[i + 1]),
				y1 = H * (1 - rows[i]);
			// subtle quilting / pillow shading
			const gr = g.createLinearGradient(0, y0, 0, y1);
			gr.addColorStop(0, 'rgba(255,255,255,0.10)');
			gr.addColorStop(1, 'rgba(0,0,0,0.08)');
			g.fillStyle = gr;
			g.fillRect(6, y0 + 4, W - 12, y1 - y0 - 8);
		}
		// kick plate (brushed steel tone)
		g.fillStyle = '#9aa1a9';
		g.fillRect(0, H * 0.91, W, H * 0.09);
		// seams
		g.strokeStyle = '#7d848c';
		g.lineWidth = 3;
		g.beginPath();
		for (const r of rows) {
			g.moveTo(0, H * (1 - r));
			g.lineTo(W, H * (1 - r));
		}
		g.moveTo(1.5, 0);
		g.lineTo(1.5, H);
		g.stroke();
		g.strokeStyle = 'rgba(255,255,255,0.6)';
		g.lineWidth = 1;
		g.beginPath();
		for (const r of rows) {
			g.moveTo(0, H * (1 - r) + 2.5);
			g.lineTo(W, H * (1 - r) + 2.5);
		}
		g.stroke();
		// fasteners
		g.fillStyle = '#80878f';
		for (const r of rows.slice(1, -1))
			for (const x of [14, W / 2, W - 14]) {
				g.beginPath();
				g.arc(x, H * (1 - r) + 9, 2.6, 0, Math.PI * 2);
				g.fill();
			}
		// small labels / placards on the middle panel
		g.fillStyle = 'rgba(60,70,85,0.55)';
		g.fillRect(W * 0.62, H * 0.3, W * 0.22, 9);
		g.fillStyle = 'rgba(229,179,0,0.75)';
		g.fillRect(W * 0.62, H * 0.3 + 12, W * 0.1, 4);
		// baked AO at the floor and ceiling junctions
		const ao = g.createLinearGradient(0, 0, 0, H);
		ao.addColorStop(0, 'rgba(0,0,0,0.35)');
		ao.addColorStop(0.06, 'rgba(0,0,0,0)');
		ao.addColorStop(0.9, 'rgba(0,0,0,0)');
		ao.addColorStop(1, 'rgba(0,0,0,0.4)');
		g.fillStyle = ao;
		g.fillRect(0, 0, W, H);
	});
	return tex('lining', c);
}

/** Ceiling panels: 0.6 m square acoustic panels with seams; the texture spans 1.2 m. */
export function ceilingTexture(): CanvasTexture {
	const hit = texCache.get('ceiling');
	if (hit) return hit;
	const c = canvas(256, 256, (g) => {
		g.fillStyle = '#c9ced4';
		g.fillRect(0, 0, 256, 256);
		speckle(g, 256, 256, 1600, 190, 0.2);
		g.strokeStyle = '#9aa1a9';
		g.lineWidth = 2;
		g.beginPath();
		for (const p of [1.5, 128, 254.5]) {
			g.moveTo(p, 0);
			g.lineTo(p, 256);
			g.moveTo(0, p);
			g.lineTo(256, p);
		}
		g.stroke();
		g.fillStyle = 'rgba(90,98,108,0.5)';
		for (let x = 20; x < 256; x += 128)
			for (let y = 20; y < 256; y += 128)
				for (let i = 0; i < 5; i++)
					for (let j = 0; j < 5; j++) g.fillRect(x + i * 18, y + j * 18, 2, 2); // perforation
	});
	const t = tex('ceiling', c);
	t.repeat.set(1 / 1.2, 1 / 1.2);
	return t;
}

/** Vent grille: dark louvred slots in a steel frame. */
export function ventTexture(): CanvasTexture {
	const hit = texCache.get('vent');
	if (hit) return hit;
	const c = canvas(128, 64, (g) => {
		g.fillStyle = '#9ba2aa';
		g.fillRect(0, 0, 128, 64);
		g.fillStyle = '#1d2126';
		for (let y = 8; y < 58; y += 7) g.fillRect(8, y, 112, 4);
		g.strokeStyle = '#6c737b';
		g.lineWidth = 3;
		g.strokeRect(1.5, 1.5, 125, 61);
	});
	return tex('vent', c);
}

const matCache = new Map<string, Material>();
function cached(key: string, make: () => Material) {
	let m = matCache.get(key);
	if (!m) matCache.set(key, (m = make()));
	return m;
}
export const liningMat = () => cached('lining', () => new MeshStandardMaterial({ map: liningTexture(), roughness: 0.75, metalness: 0.05, side: BackSide }));
export const domeMat = () => cached('dome', () => new MeshStandardMaterial({ map: liningTexture(), color: '#c8cdd3', roughness: 0.8, metalness: 0.05, side: DoubleSide }));
export const ceilingMat = () => cached('ceiling', () => new MeshStandardMaterial({ map: ceilingTexture(), color: '#e4e7eb', roughness: 0.9, metalness: 0.02, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
export const ventMat = () => cached('vent', () => new MeshStandardMaterial({ map: ventTexture(), roughness: 0.6, metalness: 0.5 }));
export const railMat = () => cached('rail', () => new MeshStandardMaterial({ color: '#cfd4da', roughness: 0.3, metalness: 0.9 }));
export const trayMat = () => cached('tray', () => new MeshStandardMaterial({ color: '#4a5058', roughness: 0.6, metalness: 0.6 }));
export const cableMat = () => cached('cable', () => new MeshStandardMaterial({ color: '#23262b', roughness: 0.9 }));
export const ledStripMat = (tone: 'warm' | 'cool') =>
	cached(`led-${tone}`, () => new MeshStandardMaterial({ color: '#ffffff', emissive: tone === 'warm' ? '#ffe7c4' : '#e3f0ff', emissiveIntensity: 2.6 }));
export const windowMat = (key: string, color: string, intensity: number) =>
	cached(`win-${key}`, () => new MeshStandardMaterial({ color: '#000000', emissive: color, emissiveIntensity: intensity, roughness: 0.05, metalness: 0.2 }));
export const LIGHT_TONE = { warm: '#ffe2bd', cool: '#e4efff' } as const;

/** world angle (x = cos a, z = sin a) of the airlock gap → Three cylinder theta (x = sin θ, z = cos θ) */
const toTheta = (a: number) => Math.PI / 2 - a;
/** angular half-width of the airlock gap in the wall */
export const AIRLOCK_HALF = AIRLOCK_WIDTH / 2 / 4.5 + 0.05;
export const inAirlock = (a: number) => Math.abs(Math.atan2(Math.sin(a - AIRLOCK_ANGLE), Math.cos(a - AIRLOCK_ANGLE))) < AIRLOCK_HALF;

/** lining frustum (open, inside faces), optionally leaving the airlock gap; u repeats every ~1.2 m */
export function liningGeometry(rBottom: number, rTop: number, height: number, airlock: boolean) {
	const gap = airlock ? AIRLOCK_HALF * 2 : 0;
	const thetaStart = airlock ? toTheta(AIRLOCK_ANGLE) + gap / 2 : 0;
	const len = Math.PI * 2 - gap;
	const g = new CylinderGeometry(rTop, rBottom, height, 96, 1, true, thetaStart, len);
	const uv = g.attributes.uv;
	const panels = Math.max(4, Math.round((len * (rBottom + rTop)) / 2 / 1.2));
	for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * panels);
	g.translate(0, height / 2, 0);
	return g;
}

/** arc of a torus around the Y axis between world angles a0..a1 (ring in the XZ plane) */
function arc(r: number, tube: number, a0: number, a1: number, y: number, radial = 6) {
	const g = new TorusGeometry(r, tube, radial, Math.max(4, Math.round((a1 - a0) * 16)), a1 - a0);
	// torus lies in XY around Z, arc from +X towards +Y; rotate into XZ so +Y → +Z (world angle a)
	g.rotateX(Math.PI / 2);
	g.rotateY(-a0);
	g.translate(0, y, 0);
	return g;
}

/**
 * Static wall fit-out for one deck, merged by material: handrails (with standoff brackets), cable tray
 * with cables near the ceiling, and vent grilles. Arcs skip the airlock and the given angular gaps.
 */
export function fitout(R: number, height: number, airlock: boolean, seed: number) {
	const segs: [number, number][] = [];
	// 8 wall bays; handrails on alternating bays, skipping the airlock
	const bays = 8;
	for (let i = 0; i < bays; i++) {
		const a0 = (i / bays) * Math.PI * 2 + 0.12,
			a1 = ((i + 1) / bays) * Math.PI * 2 - 0.12;
		if (airlock && (inAirlock(a0) || inAirlock(a1) || inAirlock((a0 + a1) / 2))) continue;
		segs.push([a0, a1]);
	}
	const rails: BufferGeometry[] = [];
	const trays: BufferGeometry[] = [];
	const cables: BufferGeometry[] = [];
	const vents: BufferGeometry[] = [];
	const rr = R - 0.075;
	segs.forEach(([a0, a1], i) => {
		if ((i + seed) % 2 === 0) {
			const y = 1.05;
			rails.push(arc(rr, 0.016, a0 + 0.1, a1 - 0.1, y));
			for (const a of [a0 + 0.12, (a0 + a1) / 2, a1 - 0.12]) {
				const b = new BoxGeometry(0.075, 0.025, 0.025);
				b.translate(-0.0375, 0, 0);
				b.rotateY(-a);
				b.translate(Math.cos(a) * R, y, Math.sin(a) * R);
				rails.push(b);
			}
		}
		// cable tray: open channel near the ceiling + 3 cables
		const ty = height - 0.22;
		trays.push(arc(R - 0.11, 0.05, a0, a1, ty, 2));
		for (let k = 0; k < 3; k++) cables.push(arc(R - 0.095 - k * 0.03, 0.012, a0, a1, ty + 0.04, 4));
		// vent grille low on every third bay, high on the others
		if ((i + seed) % 3 === 0) {
			const a = (a0 + a1) / 2 + 0.2;
			const v = new BoxGeometry(0.42, 0.2, 0.01);
			v.rotateY(Math.PI / 2 - a);
			v.translate(Math.cos(a) * (R - 0.015), 0.32, Math.sin(a) * (R - 0.015));
			vents.push(v);
		}
	});
	const m = (l: BufferGeometry[]) => (l.length ? mergeGeometries(l.map((g) => (g.index ? g.toNonIndexed() : g))) : null);
	return { rails: m(rails), trays: m(trays), cables: m(cables), vents: m(vents) };
}

/** ceiling LED strips (recessed light lines) avoiding hatch openings; merged boxes */
export function ledStrips(R: number, holes: [number, number][]) {
	const parts: BufferGeometry[] = [];
	const clear = (x: number, z: number) => holes.every(([hx, hz]) => Math.hypot(x - hx, z - hz) > 0.75);
	for (const r of [1.4, R - 0.75]) {
		const n = Math.round((Math.PI * 2 * r) / 1.1);
		for (let i = 0; i < n; i++) {
			const a = (i / n) * Math.PI * 2;
			const x = Math.cos(a) * r,
				z = Math.sin(a) * r;
			if (!clear(x, z)) continue;
			const b = new BoxGeometry(0.7, 0.012, 0.06);
			b.rotateY(-a + Math.PI / 2);
			b.translate(x, 0, z);
			parts.push(b);
		}
	}
	return parts.length ? mergeGeometries(parts.map((g) => g.toNonIndexed())) : null;
}

/** lathe dome (inside faces): profile from radius r0 at y = 0 to the tip at y = h (ogive / ellipse) */
export function domeGeometry(r0: number, h: number, radiusAt?: (t: number) => number, down = false) {
	const pts: Vector2[] = [];
	const N = 24;
	for (let i = 0; i <= N; i++) {
		const t = i / N;
		const r = radiusAt ? radiusAt(t) : r0 * Math.sqrt(Math.max(0, 1 - t * t));
		pts.push(new Vector2(Math.max(0.001, r), (down ? -1 : 1) * t * h));
	}
	const g = new LatheGeometry(pts, 64);
	const uv = g.attributes.uv;
	for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 20);
	return g;
}
