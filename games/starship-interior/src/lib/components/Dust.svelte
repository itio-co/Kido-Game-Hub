<script lang="ts">
	/** Cruise ambience: a few hundred dust motes drifting weightlessly in the current deck volume. */
	import { T, useTask } from '@threlte/core';
	import { BufferAttribute, BufferGeometry, PointsMaterial } from 'three';
	import { game } from '$lib/game/state.svelte';

	const N = 320;
	const pos = new Float32Array(N * 3);
	const vel = new Float32Array(N * 3);
	const geo = new BufferGeometry();
	geo.setAttribute('position', new BufferAttribute(pos, 3));
	const mat = new PointsMaterial({ color: '#dfe8f2', size: 0.025, transparent: true, opacity: 0.55, depthWrite: false });
	let seeded = '';
	function seed(R: number, H: number) {
		for (let i = 0; i < N; i++) {
			const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * R;
			pos[i * 3] = Math.cos(a) * r;
			pos[i * 3 + 1] = Math.random() * H;
			pos[i * 3 + 2] = Math.sin(a) * r;
			for (let k = 0; k < 3; k++) vel[i * 3 + k] = (Math.random() - 0.5) * 0.04;
		}
	}
	useTask((dt) => {
		const k = game.current;
		const R = (game.deckRadius[k] ?? 4.5) - 0.3, H = game.decks[k]?.height ?? 2.4;
		const key = `${k}|${R}|${H}`;
		if (key !== seeded) (seeded = key), seed(R, H);
		const t = Math.min(dt, 0.1);
		for (let i = 0; i < N; i++) {
			const j = i * 3;
			pos[j] += vel[j] * t;
			pos[j + 1] += vel[j + 1] * t;
			pos[j + 2] += vel[j + 2] * t;
			if (pos[j + 1] < 0 || pos[j + 1] > H) vel[j + 1] *= -1;
			if (Math.hypot(pos[j], pos[j + 2]) > R) (vel[j] *= -1), (vel[j + 2] *= -1);
		}
		geo.attributes.position.needsUpdate = true;
	});
</script>

<T.Points geometry={geo} material={mat} position.y={game.floorY[game.current] ?? 0} name="Cruise dust" />
