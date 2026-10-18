<script lang="ts">
	/**
	 * Build-mode pointer handling (mouse + touch).
	 *  - Ray → current deck floor plane gives a continuous point (optionally snapped).
	 *  - Ray → module bounding boxes picks modules for select/move/delete.
	 * Camera (discoverable): left-drag on empty space orbits (any tool; a click still selects/places/measures),
	 * right-drag pans (a right-click without drag on a module deletes it), middle-drag orbits, wheel zooms.
	 * Touch: one finger = tool (tap / drag); in Select mode a one-finger drag on empty space orbits;
	 * a second finger cancels and the camera (OrbitControls: pinch zoom, two-finger orbit/pan) takes over.
	 */
	import { useThrelte } from '@threlte/core';
	import { onMount } from 'svelte';
	import { Plane, Raycaster, Vector2, Vector3 } from 'three';
	import { containsPoint, footprintOf, rayHitModule } from '$lib/game/geometry';
	import { HULL_INNER_RADIUS } from '$lib/game/specs';
	import { game, type Pt } from '$lib/game/state.svelte';
	import { rig } from '$lib/three/cameraRig.svelte';

	const { camera, dom } = useThrelte();
	const raycaster = new Raycaster();
	const plane = new Plane(new Vector3(0, 1, 0), 0);
	const ndc = new Vector2();
	const hit = new Vector3();
	const DRAG_PX = 10;
	const ORBIT_PX = 5;
	function orbitDelta(dx: number, dy: number) {
		const h = dom.clientHeight || 600;
		rig.orbitBy((-2 * Math.PI * dx) / h, (-2 * Math.PI * dy) / h);
	}

	function setRay(cx: number, cy: number) {
		const r = dom.getBoundingClientRect();
		ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
		raycaster.setFromCamera(ndc, camera.current);
	}
	function pickPoint(cx: number, cy: number): Pt | null {
		setRay(cx, cy);
		plane.constant = -game.floorY[game.current];
		if (!raycaster.ray.intersectPlane(plane, hit)) return null;
		if (Math.hypot(hit.x, hit.z) > HULL_INNER_RADIUS + 1.5) return null;
		return { x: hit.x, z: hit.z };
	}
	function pickModule(cx: number, cy: number): number | null {
		setRay(cx, cy);
		const o = raycaster.ray.origin;
		const d = raycaster.ray.direction;
		const y0 = game.floorY[game.current];
		let best: number | null = null;
		let bestT = Infinity;
		const items = [
			...game.modules.map((m) => ({ uid: m.uid, type: m.type, x: m.x, z: m.z, angle: m.angle })),
			...game.shaftsOn(game.current).map((s) => ({ uid: s.uid, type: 'hatch' as const, x: s.x, z: s.z, angle: s.angle }))
		];
		for (const m of items) {
			const t = rayHitModule([o.x, o.y - y0, o.z], [d.x, d.y, d.z], m.type, m.x, m.z, m.angle, game.deck.height);
			if (t !== null && t < bestT) {
				bestT = t;
				best = m.uid;
			}
		}
		return best;
	}

	function startDrag(uid: number, p: Pt | null) {
		const m = game.modules.find((mm) => mm.uid === uid) ?? game.shafts.find((s) => s.uid === uid);
		if (!m || !p) return null;
		return { uid, ox: m.x - p.x, oz: m.z - p.z };
	}
	function updateDrag(off: { uid: number; ox: number; oz: number }, p: Pt) {
		const q = game.snapPt({ x: p.x + off.ox, z: p.z + off.oz });
		game.drag = { uid: off.uid, x: q.x, z: q.z, moved: true };
	}
	function measureClick(p: Pt) {
		const q = game.snapPt(p);
		if (!game.measureA || game.measureB) {
			game.measureA = q;
			game.measureB = null;
		} else game.measureB = q;
	}

	// ---- mouse ----
	let mouseDown = -1;
	let mouseDrag: { uid: number; ox: number; oz: number } | null = null;
	let downXY = [0, 0];
	let lastXY = [0, 0];
	/** left/right button gesture on empty space: 'pending' until it moves past ORBIT_PX */
	let camGesture: 'none' | 'pending' | 'orbit' | 'pan' = 'none';
	let rightUid: number | null = null;

	// ---- touch ----
	const touches = new Set<number>();
	let g: {
		id: number;
		sx: number;
		sy: number;
		cancelled: boolean;
		uid: number | null;
		drag: { uid: number; ox: number; oz: number } | null;
		dragging: boolean;
		onPending: boolean;
		orbit: boolean;
		lx: number;
		ly: number;
	} | null = null;

	const isTouch = (e: PointerEvent) => e.pointerType === 'touch' || e.pointerType === 'pen';

	function onDown(e: PointerEvent) {
		if (game.mode !== 'build') return;
		if (isTouch(e)) {
			game.isTouch = true;
			touches.add(e.pointerId);
			if (touches.size === 1) {
				const p = pickPoint(e.clientX, e.clientY);
				const uid = game.tool === 'select' ? pickModule(e.clientX, e.clientY) : null;
				const pf = game.pending ? footprintOf(game.selectedModule, game.pending.x, game.pending.z, game.rotation) : null;
				g = {
					id: e.pointerId,
					sx: e.clientX,
					sy: e.clientY,
					cancelled: false,
					uid,
					drag: uid !== null && uid === game.selectedUid ? startDrag(uid, p) : null,
					dragging: false,
					onPending: !!(p && pf && containsPoint(pf, p.x, p.z)),
					orbit: false,
					lx: e.clientX,
					ly: e.clientY
				};
				if (p && game.tool !== 'camera' && !game.pending) game.hover = p;
			} else if (g) {
				g.cancelled = true;
				game.drag = null; // revert any move – camera gesture
			}
			return;
		}
		const p = pickPoint(e.clientX, e.clientY);
		game.hover = p;
		downXY = lastXY = [e.clientX, e.clientY];
		camGesture = 'none';
		if (game.tool === 'camera') return; // OrbitControls handles everything
		if (e.button === 0) {
			mouseDown = 0;
			if (game.tool === 'select') {
				const uid = pickModule(e.clientX, e.clientY);
				mouseDrag = uid !== null ? startDrag(uid, p) : null;
				if (uid !== null) game.selectedUid = uid;
				else camGesture = 'pending'; // click = deselect, drag = orbit
			} else camGesture = 'pending'; // Place / Measure: click acts on release, drag orbits
		} else if (e.button === 2) {
			mouseDown = 2;
			rightUid = pickModule(e.clientX, e.clientY);
			camGesture = 'pending'; // click on module = delete, drag = pan
		}
	}

	function onMove(e: PointerEvent) {
		if (game.altHeld !== e.altKey) game.altHeld = e.altKey;
		if (game.mode !== 'build') return;
		if (isTouch(e)) {
			if (!g || g.cancelled || e.pointerId !== g.id || game.tool === 'camera') return;
			const moved = Math.hypot(e.clientX - g.sx, e.clientY - g.sy);
			if (game.tool === 'select' && !g.drag && (g.orbit || moved > DRAG_PX)) {
				// one-finger drag on empty space (or on an unselected module) orbits the camera
				g.orbit = true;
				orbitDelta(e.clientX - g.lx, e.clientY - g.ly);
				g.lx = e.clientX;
				g.ly = e.clientY;
				return;
			}
			g.lx = e.clientX;
			g.ly = e.clientY;
			const p = pickPoint(e.clientX, e.clientY);
			if (!p) return;
			if (game.tool === 'select' && g.drag && (g.dragging || moved > DRAG_PX)) {
				g.dragging = true;
				updateDrag(g.drag, p);
			} else if (game.tool === 'module') {
				game.hover = p;
				if (game.pending && moved > DRAG_PX) {
					game.pending = p;
					g.onPending = false;
				}
			} else if (game.tool === 'measure') game.hover = p;
			return;
		}
		if (camGesture !== 'none' && mouseDown >= 0) {
			const far = Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]) > ORBIT_PX;
			if (camGesture === 'pending' && far) camGesture = mouseDown === 2 ? 'pan' : 'orbit';
			const dx = e.clientX - lastXY[0];
			const dy = e.clientY - lastXY[1];
			lastXY = [e.clientX, e.clientY];
			if (camGesture === 'orbit') orbitDelta(dx, dy);
			else if (camGesture === 'pan') rig.panBy(dx, dy, dom.clientHeight || 600);
			if (camGesture === 'orbit' || camGesture === 'pan') {
				game.cameraDragging = true;
				return;
			}
		}
		const p = pickPoint(e.clientX, e.clientY);
		game.hover = p;
		if (game.tool === 'select') {
			game.hoverUid = mouseDrag ? null : pickModule(e.clientX, e.clientY);
			if (mouseDown === 0 && mouseDrag && p && (game.drag || Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]) > 4))
				updateDrag(mouseDrag, p);
		}
	}

	function onUp(e: PointerEvent) {
		if (isTouch(e)) {
			touches.delete(e.pointerId);
			if (game.mode !== 'build' || !g || e.pointerId !== g.id) {
				if (touches.size === 0) g = null;
				return;
			}
			const gg = g;
			g = null;
			if (gg.cancelled || gg.orbit || game.tool === 'camera') return;
			if (gg.dragging) {
				game.commitDrag();
				return;
			}
			const moved = Math.hypot(e.clientX - gg.sx, e.clientY - gg.sy);
			if (moved > DRAG_PX * 2) return;
			const p = pickPoint(e.clientX, e.clientY);
			if (game.tool === 'select') game.selectedUid = gg.uid;
			else if (game.tool === 'measure' && p) measureClick(p);
			else if (game.tool === 'module' && p) {
				if (!game.confirmPlacement) game.placeAt(p);
				else if (game.pending && gg.onPending) {
					if (game.placeAt(game.pending)) game.pending = null;
				} else game.pending = p;
			}
			return;
		}
		if (game.mode === 'build' && camGesture === 'pending' && e.pointerType === 'mouse') {
			// a click (no drag): the tool acts
			const p = pickPoint(e.clientX, e.clientY);
			if (mouseDown === 0) {
				if (game.tool === 'module' && p) game.placeAt(p);
				else if (game.tool === 'measure' && p) measureClick(p);
				else if (game.tool === 'select') game.selectedUid = null;
			} else if (mouseDown === 2 && rightUid !== null) game.removeModule(rightUid);
		}
		if (mouseDown === 0 && game.drag) game.commitDrag();
		camGesture = 'none';
		game.cameraDragging = false;
		mouseDown = -1;
		mouseDrag = null;
	}

	function onCancel(e: PointerEvent) {
		touches.delete(e.pointerId);
		if (g && g.id === e.pointerId) {
			g = null;
			game.drag = null;
		}
		mouseDown = -1;
		camGesture = 'none';
		game.cameraDragging = false;
	}
	function onLeave(e: PointerEvent) {
		if (e.pointerType === 'mouse') {
			game.hover = null;
			game.hoverUid = null;
		}
	}
	function onContext(e: Event) {
		e.preventDefault();
	}
	/** Shift + wheel rotates (15°) instead of zooming. Registered on window/capture to beat OrbitControls. */
	function onWheel(e: WheelEvent) {
		if (game.mode !== 'build' || !e.shiftKey || !dom.contains(e.target as Node)) return;
		e.preventDefault();
		e.stopImmediatePropagation();
		const d = e.deltaY || e.deltaX;
		game.rotate(d > 0 ? 15 : -15);
	}

	onMount(() => {
		dom.addEventListener('pointerdown', onDown);
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		window.addEventListener('pointercancel', onCancel);
		dom.addEventListener('pointerleave', onLeave);
		dom.addEventListener('contextmenu', onContext);
		window.addEventListener('wheel', onWheel, { capture: true, passive: false });

		const v = new Vector3();
		window.__debug = {
			toScreen(x: number, z: number, deck = game.current) {
				v.set(x, game.floorY[deck] ?? 0, z).project(camera.current);
				const r = dom.getBoundingClientRect();
				return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
			}
		};
		return () => {
			dom.removeEventListener('pointerdown', onDown);
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
			window.removeEventListener('pointercancel', onCancel);
			dom.removeEventListener('pointerleave', onLeave);
			dom.removeEventListener('contextmenu', onContext);
			window.removeEventListener('wheel', onWheel, { capture: true });
		};
	});
</script>
