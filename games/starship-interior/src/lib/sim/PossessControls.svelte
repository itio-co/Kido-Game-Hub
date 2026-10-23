<script lang="ts">
	/**
	 * Possession camera + input: third-person follow camera behind the controlled crew member
	 * (drag to orbit, wheel to zoom) or first-person (V). WASD / arrows / joystick move, Shift runs,
	 * E = interact with whatever is in front / in reach (handled by InteractHud: use equipment, sit,
	 * climb a ladder towards where you look, repair…; Shift+E or hold E = other actions).
	 * Gravity: Space/PgUp climb up, Q/C/PgDn climb down, X stop the current activity, Esc releases.
	 * Cruise (micro-g, 6-DOF): WASD translate in the body frame, Space/R up, Ctrl/F down, Z/C roll,
	 * drag to look (relative to the body), Shift = stronger push-off, G grab, X stop activity,
	 * T reorient to deck-up, V first/third person, PgUp/PgDn auto-fly through the nearest hatch.
	 * Keys match e.code (any keyboard layout).
	 */
	import { T, useTask, useThrelte } from '@threlte/core';
	import { onMount } from 'svelte';
	import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
	import { game } from '$lib/game/state.svelte';
	import { crew } from './crewSim.svelte';
	import { isTyping, keyCode } from '$lib/util/keys';

	const { dom } = useThrelte();
	const cam = new PerspectiveCamera(60, 1, 0.05, 400);
	let pitch = 0.42;
	let dist = 2.8;
	const keys = new Set<string>();
	function onKeyDown(e: KeyboardEvent) {
		const code = keyCode(e);
		if (isTyping(e)) return;
		keys.add(code);
		if (code === 'PageUp' || code === 'PageDown') {
			e.preventDefault();
			crew.climb(code === 'PageUp');
			return;
		}
		if (crew.micro) {
			if (code === 'Space' || code.startsWith('Control')) e.preventDefault();
			if (code === 'KeyX') crew.stopAction();
			else if (code === 'KeyG') crew.input.grab = true;
			else if (code === 'KeyT') crew.reorient();
			else if (code === 'KeyV') crew.firstPerson = !crew.firstPerson;
			else if (code === 'Escape') release();
			return;
		}
		// gravity (E = interact lives in InteractHud): Space climbs up, Q/C climb down, X stops
		if (code === 'Space') {
			e.preventDefault();
			crew.climb(true);
		} else if (code === 'KeyQ' || code === 'KeyC') {
			e.preventDefault();
			crew.climb(false);
		} else if (code === 'KeyX') crew.stopAction();
		else if (code === 'KeyV') crew.firstPerson = !crew.firstPerson;
		else if (code === 'Escape') release();
	}
	/** Esc: release the crew member (walk mode: back to build, handled by the page) */
	function release() {
		if (crew.embodied) crew.disembody();
		else crew.possess(null);
	}
	const onKeyUp = (e: KeyboardEvent) => keys.delete(keyCode(e));
	const clearKeys = () => keys.clear();
	let dragId: number | null = null;
	let lx = 0, ly = 0;
	function onDown(e: PointerEvent) {
		if (dragId !== null) return;
		dragId = e.pointerId;
		lx = e.clientX;
		ly = e.clientY;
	}
	function onMove(e: PointerEvent) {
		if (e.pointerId !== dragId) return;
		if (crew.micro) {
			crew.input.lookX += (e.clientX - lx) * 0.005;
			crew.input.lookY += (e.clientY - ly) * 0.005;
			lx = e.clientX;
			ly = e.clientY;
			return;
		}
		crew.input.yaw -= (e.clientX - lx) * 0.006;
		pitch = Math.max(crew.firstPerson ? -1.2 : 0.05, Math.min(crew.firstPerson ? 1.2 : 1.2, pitch + (e.clientY - ly) * 0.005));
		lx = e.clientX;
		ly = e.clientY;
	}
	const onUp = (e: PointerEvent) => e.pointerId === dragId && (dragId = null);
	const onWheel = (e: WheelEvent) => {
		dist = Math.max(1.4, Math.min(7, dist * (e.deltaY > 0 ? 1.1 : 0.9)));
		e.preventDefault();
	};
	const provider = () => crew.actions();
	onMount(() => {
		game.ctxProvider = provider;
		(window as unknown as { __possessCam: unknown }).__possessCam = () => cam.position.toArray();
		// walk-mode test / debug hook (same shape as the old first-person walker)
		const me = () => (crew.possessed !== null ? crew.agents[crew.possessed] : null);
		(window as unknown as { __walk: unknown }).__walk = {
			avatar: true,
			id: () => crew.possessed,
			pos: () => {
				const a = me();
				if (!a) return [0, 0, 0];
				return a.m ? [a.m.p.x, a.m.p.y, a.m.p.z] : [a.x, (game.floorY[a.deck] ?? 0) + a.y + 1.62, a.z];
			},
			/** turn to look at (x, z) */
			face: (x: number, z: number) => {
				const a = me();
				if (!a) return;
				const [px, pz] = a.m ? [a.m.p.x, a.m.p.z] : [a.x, a.z];
				crew.input.yaw = Math.atan2(-(x - px), -(z - pz));
			},
			/** look pitch (rad, + up) */
			look: (p: number) => (pitch = 0.42 - p),
			climbing: () => {
				const a = me();
				return !!a && (a.state === 'move' || a.state === 'ladder') && (a.climbPhase === 1 || a.legs.slice(a.leg).some((l) => l.kind === 'climb') || (!a.item && !!crew.micro));
			},
			seated: () => {
				const a = me();
				return !!a && (a.state === 'use' || a.state === 'strapped') && ['sit', 'sitwork', 'eat', 'couch', 'strap'].includes(a.av.pose) ;
			},
			state: () => me()?.state ?? null,
			/** avatar snapshot for tests: state, pose, action, item, deck, x/z */
			info: () => {
				const a = me();
				return a ? { state: a.state, pose: a.av.pose, action: a.action, item: a.item?.label ?? null, aff: a.aff?.id ?? null, deck: a.deck, x: a.x, z: a.z, dock: a.dock, needs: { ...a.needs } } : null;
			},
			place: (x: number, z: number) => {
				const a = me();
				if (a) crew.teleport(a.id, a.deck, x, z);
			},
			actions: () => crew.actions().map((c) => c.label)
		};
		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('keyup', onKeyUp);
		window.addEventListener('blur', clearKeys);
		dom.addEventListener('pointerdown', onDown);
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		window.addEventListener('pointercancel', onUp);
		dom.addEventListener('wheel', onWheel, { passive: false });
		return () => {
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', onKeyUp);
			window.removeEventListener('blur', clearKeys);
			dom.removeEventListener('pointerdown', onDown);
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
			window.removeEventListener('pointercancel', onUp);
			dom.removeEventListener('wheel', onWheel);
			crew.input.f = crew.input.s = crew.input.u = crew.input.roll = 0;
			delete (window as unknown as { __walk?: unknown }).__walk;
			if (game.ctxProvider === provider) game.ctxProvider = null;
		};
	});

	const target = new Vector3();
	const camQ = new Quaternion();
	const Y = new Vector3(0, 1, 0);
	const flip = new Quaternion().setFromAxisAngle(Y, Math.PI);
	const camPos = new Vector3();
	let lastDeck = -1;
	let hatchKey = '';
	useTask((dt) => {
		const id = crew.possessed;
		const a = id !== null ? crew.agents[id] : null;
		if (!a) return;
		let f = -game.joystick.y, s = game.joystick.x;
		if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
		if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
		if (keys.has('KeyD') || keys.has('ArrowRight')) s += 1;
		if (keys.has('KeyA') || keys.has('ArrowLeft')) s -= 1;
		crew.input.f = f;
		crew.input.s = s;
		crew.input.run = keys.has('ShiftLeft') || keys.has('ShiftRight');
		if (crew.micro && a.m) {
			let u = crew.touch.u, roll = crew.touch.roll;
			if (keys.has('Space') || keys.has('KeyR')) u += 1;
			if (keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyF')) u -= 1;
			if (keys.has('KeyC')) roll += 1;
			if (keys.has('KeyZ')) roll -= 1;
			crew.input.u = Math.max(-1, Math.min(1, u));
			crew.input.roll = Math.max(-1, Math.min(1, roll));
			if (a.deck !== lastDeck) {
				lastDeck = a.deck;
				if (game.current !== a.deck) game.selectDeck(a.deck);
			}
			const p = a.m.p, q = a.m.q;
			const up = new Vector3(0, 1, 0).applyQuaternion(q);
			const fwd = new Vector3(0, 0, 1).applyQuaternion(q);
			if (crew.firstPerson || a.state === 'use') {
				if (a.state === 'use' && a.av.q === null) {
					// docked (restraint/bag): eyes from the posed body, level
					cam.position.set(a.av.x, a.av.y + 1.5, a.av.z);
					camQ.setFromAxisAngle(Y, a.av.yaw + Math.PI);
				} else {
					cam.position.copy(p).addScaledVector(up, 0.68).addScaledVector(fwd, 0.1);
					camQ.copy(q).multiply(flip);
				}
				cam.quaternion.slerp(camQ, Math.min(1, dt * 20));
				return;
			}
			// third person: behind and above in the body frame (no fixed horizon)
			let d = dist;
			for (let k = 0; k < 10; k++) {
				camPos.copy(p).addScaledVector(fwd, -d).addScaledVector(up, 0.25 + d * 0.2);
				if (crew.vox?.isFree(camPos.x, camPos.y, camPos.z) || d < 0.5) break;
				d *= 0.8;
			}
			cam.position.lerp(camPos, Math.min(1, dt * 8));
			cam.up.lerp(up, Math.min(1, dt * 8)).normalize();
			cam.lookAt(target.copy(p).addScaledVector(up, 0.3));
			return;
		}
		cam.up.set(0, 1, 0);
		crew.input.look = 0.42 - pitch;
		if (game.mode === 'walk') {
			// walk HUD state from the avatar: viewed deck + ladder / hatch in reach (▲ / ▼ lit)
			if (a.climbPhase !== 1 && game.walkDeck !== a.deck) game.walkDeck = a.deck;
			const hu = crew.ladderNear(a, true, 1.5), hd = crew.ladderNear(a, false, 1.5);
			const P = crew.world?.portals;
			const key = `${a.deck}|${hu}|${hd}`;
			if (key !== hatchKey && P) {
				hatchKey = key;
				game.hatchHere = { up: hu >= 0, down: hd >= 0, upTo: hu >= 0 ? P[hu].top.deck : -1, downTo: hd >= 0 ? P[hd].bottom.deck : -1 };
			}
		}
		if (a.deck !== lastDeck && a.climbPhase !== 1) {
			lastDeck = a.deck;
			if (game.current !== a.deck) game.selectDeck(a.deck);
		}
		const fy = game.floorY[a.deck] ?? 0;
		const yaw = crew.input.yaw;
		if (crew.firstPerson) {
			cam.position.set(a.av.x, a.av.y + (a.av.pose === 'sit' || a.av.pose === 'sitwork' ? 1.2 : 1.62), a.av.z);
			cam.rotation.order = 'YXZ';
			cam.rotation.set(-pitch + 0.42, yaw, 0);
			return;
		}
		target.set(a.av.x, a.av.y + 1.35, a.av.z);
		// lining + handrails sit ~10 cm inside the hull: keep the boom 35 cm clear of the wall
		const R = (game.deckRadius[a.deck] ?? 4.5) - 0.35;
		const ceil = fy + (game.decks[a.deck]?.height ?? 2.4) - 0.12;
		let d = dist;
		// shorten the boom so the camera stays inside the hull and under the ceiling
		for (let k = 0; k < 12; k++) {
			camPos.set(target.x + Math.sin(yaw) * Math.cos(pitch) * d, target.y + Math.sin(pitch) * d, target.z + Math.cos(yaw) * Math.cos(pitch) * d);
			if (Math.hypot(camPos.x, camPos.z) <= R && (camPos.y <= ceil || a.climbPhase === 1)) break;
			d *= 0.85;
		}
		camPos.y = Math.min(camPos.y, a.climbPhase === 1 ? camPos.y : ceil);
		cam.position.lerp(camPos, Math.min(1, dt * 10));
		cam.lookAt(target);
	});
</script>

<T is={cam} makeDefault />
