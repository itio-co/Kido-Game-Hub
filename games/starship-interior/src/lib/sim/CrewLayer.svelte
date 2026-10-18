<script lang="ts">
	/**
	 * Renders the crew avatars, steps the simulation every frame, handles avatar picking
	 * (capture-phase, so a click on a crew member never places/selects equipment) and draws
	 * the congestion/presence heat map on the current deck.
	 */
	import { T, useTask, useThrelte } from '@threlte/core';
	import { onMount } from 'svelte';
	import { CanvasTexture, Group, Raycaster, Vector2, Vector3 } from 'three';
	import { game } from '$lib/game/state.svelte';
	import Avatar from './Avatar.svelte';
	import { crew } from './crewSim.svelte';

	interface Props {
		deckVisible: (k: number) => boolean;
	}
	let { deckVisible }: Props = $props();
	const { camera, dom, invalidate } = useThrelte();

	const refs: Record<number, Group | undefined> = $state({});
	useTask((dt) => {
		if (!crew.enabled) return;
		crew.step(dt);
		for (const a of crew.agents) {
			if (!deckVisible(a.deck)) a.av.visible = false;
		}
	});

	// ---- picking ----
	const ray = new Raycaster();
	const ndc = new Vector2();
	let down: [number, number] | null = null;
	function pick(e: PointerEvent): number | null {
		const r = dom.getBoundingClientRect();
		ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
		ray.setFromCamera(ndc, camera.current);
		const groups = Object.values(refs).filter((g): g is Group => !!g && g.visible);
		const hit = ray.intersectObjects(groups, true)[0];
		if (!hit) return null;
		let o: typeof hit.object | null = hit.object;
		while (o && o.userData.crewId === undefined) o = o.parent;
		return o ? (o.userData.crewId as number) : null;
	}
	function onDown(e: PointerEvent) {
		if (!crew.enabled || game.mode !== 'build' || crew.possessed !== null) return;
		if (e.button !== 0 && e.pointerType === 'mouse') return;
		const id = pick(e);
		if (id === null) return;
		e.stopImmediatePropagation();
		e.preventDefault();
		down = [e.clientX, e.clientY];
		crew.selected = id;
		game.selectedUid = null;
		invalidate();
	}
	onMount(() => {
		dom.addEventListener('pointerdown', onDown, { capture: true });
		// test hook: screen position of an avatar's chest
		const v = new Vector3();
		(window as unknown as { __crewDebug: unknown }).__crewDebug = {
			screenOf(id: number) {
				const a = crew.agents[id];
				if (!a) return null;
				v.set(a.av.x, a.av.y + (a.av.pose === 'sleep' ? 0.6 : a.av.pose.startsWith('sit') || a.av.pose === 'eat' ? 0.85 : 1.15), a.av.z).project(camera.current);
				const r = dom.getBoundingClientRect();
				return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height, visible: a.av.visible };
			}
		};
		return () => dom.removeEventListener('pointerdown', onDown, { capture: true });
	});
	void down;

	// ---- heat map (presence minutes per 0.25 m cell, current deck) ----
	const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
	const raw = typeof document !== 'undefined' ? document.createElement('canvas') : null;
	const tex = canvas ? new CanvasTexture(canvas) : null;
	const R = $derived(game.deckRadius[game.current] ?? 4.5);
	const ramp = (t: number): [number, number, number, number] => {
		// transparent → blue → cyan → yellow → red
		const stops: [number, [number, number, number]][] = [
			[0, [40, 90, 255]],
			[0.35, [40, 220, 220]],
			[0.65, [255, 220, 40]],
			[1, [255, 40, 30]]
		];
		let k = 0;
		while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
		const [t0, c0] = stops[k], [t1, c1] = stops[k + 1];
		const u = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
		return [c0[0] + (c1[0] - c0[0]) * u, c0[1] + (c1[1] - c0[1]) * u, c0[2] + (c1[2] - c0[2]) * u, Math.min(0.9, 0.45 + t * 0.5)];
	};
	$effect(() => {
		void crew.ui.heatVersion;
		const on = crew.heatmap && crew.enabled;
		const k = game.current;
		if (!on || !canvas || !raw || !tex) return;
		const h = crew.heat[k];
		const c = crew.congestion[k];
		if (!h) return;
		const M = Math.round(Math.sqrt(h.length));
		raw.width = raw.height = M;
		const ctx = raw.getContext('2d')!;
		const img = ctx.createImageData(M, M);
		let max = 0;
		for (let i = 0; i < h.length; i++) max = Math.max(max, h[i] + (c?.[i] ?? 0) * 20);
		for (let j = 0; j < M; j++)
			for (let i = 0; i < M; i++) {
				const v = h[j * M + i] + (c?.[j * M + i] ?? 0) * 20;
				const o = (j * M + i) * 4;
				if (v <= 0 || max <= 0) continue;
				const [r, g, b, a] = ramp(Math.log1p(v) / Math.log1p(max)); // log scale: corridors stay visible next to long seated stays
				img.data[o] = r;
				img.data[o + 1] = g;
				img.data[o + 2] = b;
				img.data[o + 3] = a * 255;
			}
		ctx.putImageData(img, 0, 0);
		// upscale with a soft blur so the 0.25 m cells read as a smooth heat map
		const S = 8;
		canvas.width = canvas.height = M * S;
		const out = canvas.getContext('2d')!;
		out.imageSmoothingEnabled = true;
		out.filter = 'blur(6px)';
		out.drawImage(raw, 0, 0, M * S, M * S);
		out.filter = 'none';
		out.globalAlpha = 0.6;
		out.drawImage(raw, 0, 0, M * S, M * S);
		tex.needsUpdate = true;
		invalidate();
	});
</script>

{#if crew.enabled}
	{#each crew.ui.agents as u (u.id)}
		{@const a = crew.agents[u.id]}
		{#if a}
			<Avatar av={a.av} color={u.color} g={crew.g} selected={crew.selected === u.id} id={u.id} bind:ref={refs[u.id]} />
		{/if}
	{/each}
	{#if crew.heatmap && tex}
		<T.Mesh position.y={(game.floorY[game.current] ?? 0) + 0.03} rotation.x={-Math.PI / 2} renderOrder={5} name="Crew heat map">
			<T.PlaneGeometry args={[2 * R, 2 * R]} />
			<T.MeshBasicMaterial map={tex} transparent depthWrite={false} toneMapped={false} />
		</T.Mesh>
	{/if}
{/if}
