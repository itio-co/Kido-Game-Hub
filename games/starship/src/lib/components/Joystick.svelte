<script lang="ts">
	import { game } from '$lib/game/state.svelte';

	const R = 52;
	let base: HTMLDivElement;
	let active: number | null = null;
	let kx = $state(0);
	let ky = $state(0);

	function update(e: PointerEvent) {
		const r = base.getBoundingClientRect();
		let dx = e.clientX - (r.left + r.width / 2);
		let dy = e.clientY - (r.top + r.height / 2);
		const d = Math.hypot(dx, dy);
		if (d > R) {
			dx = (dx / d) * R;
			dy = (dy / d) * R;
		}
		kx = dx;
		ky = dy;
		game.joystick = { x: dx / R, y: dy / R };
	}
	function down(e: PointerEvent) {
		if (active !== null) return;
		active = e.pointerId;
		base.setPointerCapture(e.pointerId);
		update(e);
	}
	function move(e: PointerEvent) {
		if (e.pointerId === active) update(e);
	}
	function up(e: PointerEvent) {
		if (e.pointerId !== active) return;
		active = null;
		kx = ky = 0;
		game.joystick = { x: 0, y: 0 };
	}
</script>

<div
	class="joy"
	bind:this={base}
	onpointerdown={down}
	onpointermove={move}
	onpointerup={up}
	onpointercancel={up}
	role="slider"
	aria-label="Movement joystick"
	aria-valuenow={0}
	tabindex="-1"
>
	<div class="knob" style:transform="translate({kx}px, {ky}px)"></div>
</div>

<style>
	.joy {
		position: absolute;
		left: calc(24px + env(safe-area-inset-left));
		bottom: calc(28px + env(safe-area-inset-bottom));
		width: 140px;
		height: 140px;
		border-radius: 50%;
		background: radial-gradient(circle, rgba(60, 200, 255, 0.12), rgba(60, 200, 255, 0.04));
		border: 2px solid rgba(110, 210, 255, 0.45);
		touch-action: none;
		display: grid;
		place-items: center;
		z-index: 20;
		user-select: none;
		-webkit-user-select: none;
	}
	.knob {
		width: 60px;
		height: 60px;
		border-radius: 50%;
		background: rgba(110, 210, 255, 0.55);
		box-shadow: 0 0 18px rgba(60, 200, 255, 0.6);
		pointer-events: none;
	}
</style>
