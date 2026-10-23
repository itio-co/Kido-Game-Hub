<script lang="ts">
	/** On-screen camera controls: orbit ±45° (animated), pitch, Top / Iso / Reset, zoom ±, compass. */
	import { rig } from '$lib/three/cameraRig.svelte';

	interface Props {
		compact?: boolean;
	}
	let { compact = false }: Props = $props();
	const Q = Math.PI / 4;
	const deg = $derived((rig.az * 180) / Math.PI);
</script>

<div class="cam" class:compact role="toolbar" aria-label="Camera">
	<div class="compass" title="Compass: N = −Z (bow side of the deck plan)" aria-label="Compass">
		<div class="needle" style="transform: rotate({deg}deg)"><span>N</span></div>
	</div>
	<div class="row">
		<button onclick={() => rig.orbitStep(-Q)} aria-label="Orbit left" title="Orbit left 45° (←)">⟲</button>
		<button onclick={() => rig.orbitStep(Q)} aria-label="Orbit right" title="Orbit right 45° (→)">⟳</button>
	</div>
	{#if !compact}
		<div class="row">
			<button onclick={() => rig.pitchStep(-0.2)} aria-label="Tilt up" title="Look more from above (↑)">⤒</button>
			<button onclick={() => rig.pitchStep(0.2)} aria-label="Tilt down" title="Look more from the side (↓)">⤓</button>
		</div>
	{/if}
	<div class="row">
		<button onclick={() => rig.zoom(0.8)} aria-label="Zoom in" title="Zoom in (+)">＋</button>
		<button onclick={() => rig.zoom(1.25)} aria-label="Zoom out" title="Zoom out (−)">－</button>
	</div>
	<div class="row txt">
		<button onclick={() => rig.top()} aria-label="Top view" title="Top view">Top</button>
		<button onclick={() => rig.iso()} aria-label="Iso view" title="Isometric view">Iso</button>
	</div>
	<button class="wide txt" onclick={() => rig.reset()} aria-label="Reset view" title="Reset view">Reset</button>
</div>

<style>
	.cam {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 6px;
		background: rgba(10, 16, 28, 0.82);
		border: 1px solid #2a3852;
		border-radius: 12px;
		backdrop-filter: blur(6px);
		pointer-events: auto;
	}
	.row {
		display: flex;
		gap: 4px;
	}
	button {
		width: 38px;
		height: 34px;
		border-radius: 8px;
		border: 1px solid #34466a;
		background: #142035;
		color: #dfe8ff;
		font-size: 17px;
		cursor: pointer;
		padding: 0;
	}
	button:hover {
		border-color: #5aa0ff;
	}
	.txt button,
	button.txt {
		font-size: 12px;
		font-weight: 600;
	}
	.wide {
		width: 80px;
	}
	.compass {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		border: 1px solid #34466a;
		background: radial-gradient(circle, #1b2a44, #0b1220);
		position: relative;
		margin-bottom: 2px;
	}
	.needle {
		position: absolute;
		inset: 0;
		transition: transform 60ms linear;
	}
	.needle::before {
		content: '';
		position: absolute;
		left: 50%;
		top: 5px;
		transform: translateX(-50%);
		border-left: 5px solid transparent;
		border-right: 5px solid transparent;
		border-bottom: 14px solid #ff5a5a;
	}
	.needle span {
		position: absolute;
		left: 50%;
		bottom: 3px;
		transform: translateX(-50%);
		font: 700 10px system-ui, sans-serif;
		color: #ffb0b0;
	}
	.compact button {
		width: 44px;
		height: 40px;
	}
	.compact .wide {
		width: 92px;
	}
</style>
