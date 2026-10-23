<script lang="ts">
	/**
	 * Regolith around the buried ship: undisturbed ground at grade, an excavated pit around the
	 * hull (ship base = pit floor, `burial` m below grade), backfill and a berm against the hull
	 * (flat crest BERM_WIDTH wide, then the ~35° angle of repose down to grade).
	 */
	import { T } from '@threlte/core';
	import { BufferAttribute, Color, DoubleSide, LatheGeometry, MeshStandardMaterial, Vector2 } from 'three';
	import { game } from '$lib/game/state.svelte';
	import { HULL_OUTER, bermToe, terrainHeight } from '$lib/game/ship';
	import { SOIL_DEPTH, TERRAIN_R, terrainSamples } from '$lib/three/capProfiles';

	const h = $derived(game.hab);
	const mars = $derived(h.location === 'mars');
	const native = $derived(new Color(mars ? '#9b5a38' : '#8c8983'));
	const disturbed = $derived(new Color(mars ? '#b06a45' : '#a29e97'));

	const surface = $derived.by(() => {
		const us = terrainSamples(h);
		const toe = bermToe(h);
		for (const u of [toe + 1, toe + 3, toe + 6, 18, 26, 36, 48, TERRAIN_R]) if (u > us[us.length - 1] + 0.05) us.push(u);
		const pts = us.map((u) => new Vector2(u, terrainHeight(h, u)));
		pts.unshift(new Vector2(HULL_OUTER - 0.001, 0));
		const g = new LatheGeometry(pts, 128);
		// vertex colours: backfill/berm lighter than the native ground
		const pos = g.getAttribute('position');
		const col = new Float32Array(pos.count * 3);
		const c = new Color();
		for (let i = 0; i < pos.count; i++) {
			const u = Math.hypot(pos.getX(i), pos.getZ(i));
			const t = Math.min(1, Math.max(0, (u - toe) / 2));
			c.copy(disturbed).lerp(native, t);
			// subtle radial noise so the ground does not look like plastic
			const n = 0.94 + 0.06 * Math.sin(u * 3.1 + Math.atan2(pos.getZ(i), pos.getX(i)) * 17);
			col.set([c.r * n, c.g * n, c.b * n], i * 3);
		}
		g.setAttribute('color', new BufferAttribute(col, 3));
		return g;
	});
	$effect(() => {
		const g = surface;
		return () => g.dispose();
	});
	const surfMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0, side: DoubleSide });
	const rimMat = $derived(new MeshStandardMaterial({ color: native, roughness: 1, side: DoubleSide }));
</script>

<T.Group name="Terrain">
	<T.Mesh geometry={surface} material={surfMat} receiveShadow />
	<!-- pit floor under the skirt -->
	<T.Mesh position.y={0.001} rotation.x={-Math.PI / 2} material={rimMat}>
		<T.CircleGeometry args={[HULL_OUTER, 64]} />
	</T.Mesh>
	<!-- outer rim and bottom so the terrain block reads as solid when cut -->
	<T.Mesh position.y={(h.burial - SOIL_DEPTH) / 2} material={rimMat}>
		<T.CylinderGeometry args={[TERRAIN_R, TERRAIN_R, h.burial + SOIL_DEPTH, 128, 1, true]} />
	</T.Mesh>
	<T.Mesh position.y={-SOIL_DEPTH} rotation.x={Math.PI / 2} material={rimMat}>
		<T.CircleGeometry args={[TERRAIN_R, 128]} />
	</T.Mesh>
</T.Group>
