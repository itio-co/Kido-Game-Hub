<script lang="ts">
	/**
	 * First-person walk mode across decks.
	 *  Desktop: click → PointerLockControls, WASD/arrows, Shift run; within ~1 m of a ladder (lower
	 *           deck) or a hatch opening (upper deck): E/Space/PgUp climb up, Q/C/PgDn climb down
	 *           (short climb animation). Elsewhere a hint names the nearest ladder and rings it.
	 *  Touch:   on-screen joystick (game.joystick) + drag to look; ▲/▼ deck buttons (game.travel()).
	 *  Keys match e.code (layout independent).
	 * Collision: circular hull (r 4.5 m) and module footprints (OBB / circle); hatches are walkable.
	 */
	import { T, useTask, useThrelte } from '@threlte/core';
	import { onMount } from 'svelte';
	import { Euler, PerspectiveCamera, Vector3 } from 'three';
	import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
	import { CATALOG_BY_ID } from '$lib/game/catalog';
	import { footprintOf, localToWorld, overlaps, shaftAccess } from '$lib/game/geometry';
	import { isTyping } from '$lib/util/keys';
	import type { Shaft } from '$lib/game/types';
	import { HULL_INNER_RADIUS } from '$lib/game/specs';
	import { game } from '$lib/game/state.svelte';

	const { dom } = useThrelte();
	const BODY_R = 0.25;
	const cam = new PerspectiveCamera(72, 1, 0.05, 300);
	cam.rotation.order = 'YXZ';

	const eye = (k: number) => game.floorY[k] + Math.min(1.65, game.decks[k].height - 0.2);
	/** ladder connections whose ladder stands on deck k (go up) / whose opening is in deck k (go down) */
	const upFrom = (k: number) => game.shafts.filter((s) => s.from === k);
	const downFrom = (k: number) => game.shafts.filter((s) => s.to === k);
	/** climbing reach: within 1.0 m (horizontal) of the ladder / hatch opening centre */
	const REACH = 1.0;
	const distTo = (s: { x: number; z: number }) => Math.hypot(s.x - cam.position.x, s.z - cam.position.z);
	const inZone = (s: { x: number; z: number }) => distTo(s) <= REACH;
	const nearestOf = (list: Shaft[]) => list.filter(inZone).sort((a, b) => distTo(a) - distTo(b))[0];
	/** standing point next to a connection (in front of the ladder / beside the opening) */
	function exitPoint(s: Shaft, k: number): [number, number] {
		const a = shaftAccess(s.x, s.z, s.angle);
		const cands: [number, number][] = [a.kind === 'rect' ? [a.cx, a.cz] : localToWorld(s.x, s.z, s.angle, 0, 0.85), localToWorld(s.x, s.z, s.angle, 0, 0.85), localToWorld(s.x, s.z, s.angle, 0.85, 0), localToWorld(s.x, s.z, s.angle, -0.85, 0), localToWorld(s.x, s.z, s.angle, 0, -0.85)];
		return cands.find((p) => !blocked(p[0], p[1], k)) ?? [s.x, s.z];
	}

	function blocked(x: number, z: number, k = game.walkDeck) {
		if (Math.hypot(x, z) > (game.deckRadius[k] ?? HULL_INNER_RADIUS) - BODY_R) return true;
		const me = { kind: 'circle' as const, cx: x, cz: z, r: BODY_R };
		return game.decks[k].modules.some(
			(m) => !CATALOG_BY_ID[m.type].walkable && overlaps(me, footprintOf(m.type, m.x, m.z, m.angle))
		);
	}

	function spawn(k: number, at?: { x: number; z: number }) {
		let p: [number, number] | null = at ? [at.x, at.z] : null;
		const h = [...upFrom(k), ...downFrom(k)][0];
		if (!p && h) p = [h.x, h.z];
		if (!p)
			for (let r = 0; r < (game.deckRadius[k] ?? HULL_INNER_RADIUS) && !p; r += 0.25)
				for (let a = 0; a < Math.PI * 2; a += 0.3)
					if (!blocked(Math.cos(a) * r, Math.sin(a) * r, k)) {
						p = [Math.cos(a) * r, Math.sin(a) * r];
						break;
					}
		game.walkDeck = k;
		cam.position.set(p?.[0] ?? 0, eye(k), p?.[1] ?? 0);
	}
	spawn(Math.min(game.current, game.decks.length - 1));
	cam.rotation.set(0, Math.PI / 2, 0);

	/** short climb animation: to the ladder, along it, off at the exit point */
	let climb: { pts: Vector3[]; t: number; dur: number; deck: number; label: string } | null = null;
	/** Climb: up via a ladder standing on this deck, down via an opening in this deck's floor. */
	function travel(dir: 1 | -1) {
		if (climb) return;
		const k = game.walkDeck;
		const c = nearestOf(dir > 0 ? upFrom(k) : downFrom(k));
		if (!c) {
			const other = nearestOf(dir > 0 ? downFrom(k) : upFrom(k));
			if (other) return game.flash(dir > 0 ? `This hatch only goes down – Q ▼ to Deck ${other.from + 1}` : `This ladder only goes up – E ▲ to Deck ${other.to + 1}`);
			return hintNearest(dir);
		}
		const to = dir > 0 ? c.to : c.from;
		const [ex, ez] = exitPoint(c, to);
		const y0 = eye(k), y1 = eye(to);
		const pts = [cam.position.clone(), new Vector3(c.x, y0, c.z), new Vector3(c.x, y1, c.z), new Vector3(ex, y1, ez)];
		let len = 0;
		for (let i = 1; i < pts.length; i++) len += pts[i].distanceTo(pts[i - 1]);
		climb = { pts, t: 0, dur: Math.max(0.6, Math.min(2.2, len / 2.4)), deck: to, label: game.shaftLabel(c) };
		game.ladderHint = null;
	}
	/** not at a ladder: say where the nearest one is and ring it */
	function hintNearest(dir: 1 | -1) {
		const k = game.walkDeck;
		const list = dir > 0 ? upFrom(k) : downFrom(k);
		const all = list.length ? list : [...upFrom(k), ...downFrom(k)];
		if (!all.length) return game.flash(dir > 0 ? 'No ladder up from this deck' : 'No hatch down from this deck');
		const s = all.sort((a, b) => distTo(a) - distTo(b))[0];
		cam.getWorldDirection(fwd);
		const rel = Math.atan2(s.x - cam.position.x, s.z - cam.position.z) - Math.atan2(fwd.x, fwd.z);
		const r = Math.atan2(Math.sin(rel), Math.cos(rel));
		const where = Math.abs(r) < 0.5 ? 'ahead' : Math.abs(r) > 2.6 ? 'behind you' : r > 0 ? 'to your left' : 'to your right';
		game.ladderHint = { deck: k, x: s.x, z: s.z, until: performance.now() + 4000 };
		game.flash(`Go to a ladder to change deck – ${game.shaftLabel(s)} is ${distTo(s).toFixed(1)} m ${where}`);
	}
	game.travel = travel;

	const keys = new Set<string>();
	const onKeyDown = (e: KeyboardEvent) => {
		if (isTyping(e)) return;
		keys.add(e.code);
		if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'PageUp') {
			e.preventDefault();
			travel(1);
		} else if (e.code === 'KeyQ' || e.code === 'KeyC' || e.code === 'PageDown') {
			e.preventDefault();
			travel(-1);
		}
	};
	const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);

	let controls: PointerLockControls | undefined;
	let lookId: number | null = null;
	let lastX = 0;
	let lastY = 0;
	const euler = new Euler(0, 0, 0, 'YXZ');
	function onDown(e: PointerEvent) {
		if (e.pointerType === 'mouse') {
			if (!game.isTouch) controls?.lock();
			return;
		}
		game.isTouch = true;
		if (lookId === null) {
			lookId = e.pointerId;
			lastX = e.clientX;
			lastY = e.clientY;
		}
	}
	function onMove(e: PointerEvent) {
		if (e.pointerId !== lookId) return;
		euler.setFromQuaternion(cam.quaternion);
		euler.y -= (e.clientX - lastX) * 0.005;
		euler.x = Math.max(-1.4, Math.min(1.4, euler.x - (e.clientY - lastY) * 0.005));
		lastX = e.clientX;
		lastY = e.clientY;
		cam.quaternion.setFromEuler(euler);
	}
	function onUp(e: PointerEvent) {
		if (e.pointerId === lookId) lookId = null;
	}

	onMount(() => {
		controls = new PointerLockControls(cam, dom);
		const onLock = () => (game.pointerLocked = true);
		const onUnlock = () => (game.pointerLocked = false);
		controls.addEventListener('lock', onLock);
		controls.addEventListener('unlock', onUnlock);
		// test / debug hook (like window.__game)
		(window as unknown as { __walk: unknown }).__walk = {
			pos: () => [cam.position.x, cam.position.y, cam.position.z],
			face: (x: number, z: number) => cam.rotation.set(0, Math.atan2(-(x - cam.position.x), -(z - cam.position.z)), 0),
			climbing: () => !!climb
		};
		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('keyup', onKeyUp);
		dom.addEventListener('pointerdown', onDown);
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		window.addEventListener('pointercancel', onUp);
		return () => {
			controls?.unlock();
			controls?.dispose();
			game.pointerLocked = false;
			game.travel = undefined;
			game.hatchHere = { up: false, down: false, upTo: -1, downTo: -1 };
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', onKeyUp);
			dom.removeEventListener('pointerdown', onDown);
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
			window.removeEventListener('pointercancel', onUp);
		};
	});

	const fwd = new Vector3();
	const right = new Vector3();
	let lastHatch = '';
	useTask((delta) => {
		if (climb) {
			climb.t = Math.min(1, climb.t + delta / climb.dur);
			const pts = climb.pts;
			let total = 0;
			const seg: number[] = [];
			for (let i = 1; i < pts.length; i++) total += seg[seg.push(pts[i].distanceTo(pts[i - 1])) - 1];
			let d = climb.t * total;
			for (let i = 1; i < pts.length; i++) {
				if (d <= seg[i - 1] || i === pts.length - 1) {
					cam.position.lerpVectors(pts[i - 1], pts[i], seg[i - 1] > 1e-6 ? Math.min(1, d / seg[i - 1]) : 1);
					break;
				}
				d -= seg[i - 1];
			}
			if (climb.t >= 1) {
				game.walkDeck = climb.deck;
				game.flash(`Deck ${climb.deck + 1} via ${climb.label}`);
				climb = null;
				lastHatch = '';
			}
			return;
		}
		cam.position.y = eye(game.walkDeck);
		let f = -game.joystick.y;
		let s = game.joystick.x;
		if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
		if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
		if (keys.has('KeyD') || keys.has('ArrowRight')) s += 1;
		if (keys.has('KeyA') || keys.has('ArrowLeft')) s -= 1;
		const len = Math.hypot(f, s);
		if (len > 0.01) {
			if (len > 1) {
				f /= len;
				s /= len;
			}
			const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 2.6 : 1.4) * Math.min(delta, 0.05);
			cam.getWorldDirection(fwd);
			fwd.y = 0;
			fwd.normalize();
			right.crossVectors(fwd, cam.up).normalize();
			const dx = (fwd.x * f + right.x * s) * speed;
			const dz = (fwd.z * f + right.z * s) * speed;
			if (!blocked(cam.position.x + dx, cam.position.z)) cam.position.x += dx;
			if (!blocked(cam.position.x, cam.position.z + dz)) cam.position.z += dz;
		}
		const k = game.walkDeck;
		const u = nearestOf(upFrom(k)), dn = nearestOf(downFrom(k));
		const state = `${k}|${u?.uid}|${dn?.uid}`;
		if (state !== lastHatch) {
			lastHatch = state;
			game.hatchHere = { up: !!u, down: !!dn, upTo: u ? u.to : -1, downTo: dn ? dn.from : -1 };
			if (u || dn) game.ladderHint = null;
		}
	});
</script>

<T is={cam} makeDefault />
