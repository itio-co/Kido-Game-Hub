<script lang="ts">
	/** Section-view cut controls: angle (follow camera), half / quarter, horizontal cut height. */
	import { game } from '$lib/game/state.svelte';
	const top = $derived(game.shipMode === 'habitat' ? Math.ceil(game.ship.tip) : Math.ceil(game.stackTop + 1));
</script>

<div class="cut">
	<div class="seg">
		<button class:active={game.cutMode === 'half'} onclick={() => (game.cutMode = 'half')}>◐ Half 180°</button>
		<button class:active={game.cutMode === 'quarter'} onclick={() => (game.cutMode = 'quarter')}>◔ Quarter 90°</button>
	</div>
	<label class="chk"><input type="checkbox" checked={game.cutFollow} onchange={(e) => game.setCutFollow(e.currentTarget.checked)} /> Follow camera</label>
	<div class="row">
		<button onclick={() => game.rotateCut(-15)} title="Cut −15°">⟲ 15°</button>
		<input type="range" min="0" max="359" step="1" value={Math.round(game.cutDeg)} oninput={(e) => game.setCutAngle(Number(e.currentTarget.value))} aria-label="Cut angle" />
		<button onclick={() => game.rotateCut(15)} title="Cut +15°">⟳ 15°</button>
		<b>{Math.round(game.cutDeg)}°</b>
	</div>
	<label class="chk"><input type="checkbox" bind:checked={game.cutHeightOn} /> Horizontal cut height</label>
	{#if game.cutHeightOn}
		<div class="row">
			<input type="range" min="0" max={top} step="0.1" bind:value={game.cutHeight} aria-label="Cut height" />
			<b>{game.cutHeight.toFixed(1)} m</b>
		</div>
	{/if}
	<div class="hint">Orbit freely (360° yaw, full tilt). With Follow on, the cut always faces the camera.</div>
</div>

<style>
	.cut {
		display: flex;
		flex-direction: column;
		gap: 5px;
		font-size: 12px;
	}
	.row {
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.row input {
		flex: 1;
	}
	.hint {
		font-size: 10.5px;
		opacity: 0.7;
	}
</style>
