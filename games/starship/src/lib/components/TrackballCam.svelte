<script lang="ts">
	/**
	 * Cruise build camera: TrackballControls (three/examples, no extra dependency) orbit with free
	 * roll – the view can go upside-down, as there is no "down" in micro-g. "Reset up" restores
	 * the deck-up iso view.
	 */
	import { T, useTask, useThrelte } from '@threlte/core';
	import { onMount, untrack } from 'svelte';
	import { PerspectiveCamera } from 'three';
	import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js';
	import { game } from '$lib/game/state.svelte';

	interface Props {
		pos: [number, number, number];
		target: [number, number, number];
	}
	let { pos, target }: Props = $props();
	const { dom } = useThrelte();
	const cam = new PerspectiveCamera(45, 1, 0.05, 400);
	untrack(() => {
		cam.position.set(...pos);
		cam.lookAt(...target);
	});
	let ctl: TrackballControls | null = null;
	const resize = () => ctl?.handleResize();
	onMount(() => {
		const c = new TrackballControls(cam, dom);
		c.rotateSpeed = 2.5;
		c.zoomSpeed = 1.1;
		c.panSpeed = 0.5;
		c.dynamicDampingFactor = 0.15;
		c.minDistance = 1.5;
		c.maxDistance = 60;
		c.target.set(...untrack(() => target));
		ctl = c;
		window.addEventListener('resize', resize);
		return () => {
			window.removeEventListener('resize', resize);
			c.dispose();
			ctl = null;
		};
	});
	// Reset up
	$effect(() => {
		if (game.resetUpTick === 0) return;
		untrack(() => {
			cam.up.set(0, 1, 0);
			cam.position.set(...pos);
			ctl?.target.set(...target);
			cam.lookAt(...target);
		});
	});
	// follow the selected deck height
	$effect(() => {
		const y = target[1];
		untrack(() => {
			if (!ctl) return;
			const dy = y - ctl.target.y;
			ctl.target.y += dy;
			cam.position.y += dy;
		});
	});
	useTask(() => ctl?.update());
</script>

<T is={cam} makeDefault />
