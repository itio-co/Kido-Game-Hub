<script lang="ts">
	/** Debug overlay: walkable cells (gravity, green) or flyable voxels (micro-g, cyan) of the viewed deck. */
	import { T } from '@threlte/core';
	import { BufferGeometry, Float32BufferAttribute, PointsMaterial } from 'three';
	import { game } from '$lib/game/state.svelte';
	import { crew } from './crewSim.svelte';
	const matG = new PointsMaterial({ color: '#34d399', size: 0.07, transparent: true, opacity: 0.75, depthWrite: false });
	const matM = new PointsMaterial({ color: '#22d3ee', size: 0.05, transparent: true, opacity: 0.45, depthWrite: false });
	const k = $derived(crew.possessed !== null ? (crew.ui.agents[crew.possessed]?.deck ?? game.current) : game.current);
	const geo = $derived.by(() => {
		void crew.navVersion;
		const g = new BufferGeometry();
		const pts: number[] = [];
		const vox = crew.vox;
		if (game.microG && vox) {
			const N = vox.N;
			for (let c = 0; c < vox.free.length; c++) {
				if (!vox.free[c] || vox.deckOf[c] !== k) continue;
				const i = c % N, j = Math.floor(c / N) % N, l = Math.floor(c / (N * N));
				if ((i + j + l) % 2) continue;
				const p = vox.pt(c);
				pts.push(p[0], p[1], p[2]);
			}
		} else {
			const nav = crew.world?.navs[k];
			if (nav) {
				const fy = (game.floorY[k] ?? 0) + 0.04;
				for (let c = 0; c < nav.free.length; c++)
					if (nav.free[c]) {
						const [x, z] = nav.pt(c);
						pts.push(x, fy, z);
					}
			}
		}
		g.setAttribute('position', new Float32BufferAttribute(pts, 3));
		return g;
	});
</script>

<T.Points geometry={geo} material={game.microG ? matM : matG} renderOrder={5} name="nav-debug" />
