<script lang="ts">
	/**
	 * First-person walk mode across decks.
	 *  Desktop: click → PointerLockControls, WASD/arrows, Shift run, E/Space up a hatch, Q/C down.
	 *  Touch:   on-screen joystick (game.joystick) + drag to look; Up/Down buttons (game.travel()).
	 * Collision: circular hull (r 4.5 m) and module footprints (OBB / circle); hatches are walkable.
	 */
	import { T, useTask, useThrelte } from '@threlte/core';
	import { onMount } from 'svelte';
	import { Euler, PerspectiveCamera, Vector3 } from 'three';
	import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
	import { CATALOG_BY_ID } from '$lib/game/catalog';
	import { containsPoint, footprintOf, overlaps } from '$lib/game/geometry';
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
	const inZone = (s: { x: number; z: number; angle: number }) =>
		containsPoint(footprintOf('hatch', s.x, s.z, s.angle), cam.position.x, cam.position.z);

	function blocked(x: number, z: number, k = game.walkDeck) {
		if (Math.hypot(x, z) > (game.deckRadius[game.current] ?? HULL_INNER_RADIUS) - BODY_R) return true;
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
			for (let r = 0; r < (game.deckRadius[game.current] ?? HULL_INNER_RADIUS) && !p; r += 0.25)
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

	/** Climb: up via a ladder standing on this deck, down via an opening in this deck's floor. Same XY. */
	function travel(dir: 1 | -1) {
		const k = game.walkDeck;
		const c = (dir > 0 ? upFrom(k) : downFrom(k)).find(inZone);
		if (!c) {
			const other = (dir > 0 ? downFrom(k) : upFrom(k)).find(inZone);
			return game.flash(other ? (dir > 0 ? 'This hatch only goes down' : 'This ladder only goes up') : 'Stand in a ladder zone to climb');
		}
		spawn(dir > 0 ? c.to : c.from, { x: cam.position.x, z: cam.position.z });
		game.flash(`Deck ${game.walkDeck + 1} via ${game.shaftLabel(c)}`);
	}
	game.travel = travel;

	const keys = new Set<string>();
	const onKeyDown = (e: KeyboardEvent) => {
		keys.add(e.code);
		if (e.code === 'KeyE' || e.code === 'Space') {
			e.preventDefault();
			travel(1);
		}
		if (e.code === 'KeyQ' || e.code === 'KeyC') travel(-1);
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
			game.hatchHere = { up: false, down: false };
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
		const up = upFrom(k).some(inZone);
		const down = downFrom(k).some(inZone);
		const state = `${up}|${down}`;
		if (state !== lastHatch) {
			lastHatch = state;
			game.hatchHere = { up, down };
		}
	});
</script>

<T is={cam} makeDefault />
