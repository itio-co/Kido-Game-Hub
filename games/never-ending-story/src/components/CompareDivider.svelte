<script lang="ts">
  let { value = $bindable(50) }: { value?: number } = $props();
  let track: HTMLDivElement;
  let active: number | null = $state(null);

  function update(event: PointerEvent): void {
    const rect = track.getBoundingClientRect();
    if (rect.width > 0) value = Math.max(0, Math.min(100, Math.round((event.clientX - rect.left) / rect.width * 100)));
  }
  function down(event: PointerEvent): void {
    if (active !== null || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    active = event.pointerId;
    const button = event.currentTarget as HTMLButtonElement;
    button.focus({ preventScroll: true });
    button.setPointerCapture(event.pointerId);
    update(event);
  }
  function move(event: PointerEvent): void {
    if (active !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    update(event);
  }
  function end(event: PointerEvent): void {
    if (active !== event.pointerId) return;
    event.stopPropagation();
    active = null;
    const button = event.currentTarget as HTMLButtonElement;
    if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
  }
  function keys(event: KeyboardEvent): void {
    const step = event.shiftKey ? 10 : 1;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? 100
      : event.key === 'ArrowRight' || event.key === 'ArrowUp' ? value + step
      : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? value - step
      : event.key === 'PageUp' ? value + 10 : event.key === 'PageDown' ? value - 10
      : event.key === 'Enter' || event.key === ' ' ? 50 : null;
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    value = Math.max(0, Math.min(100, next));
  }
</script>

<div class="comparison" bind:this={track} data-editor-chrome data-comparison style={`--split:${value}%`}>
  <span class="line" aria-hidden="true"></span>
  <button type="button" class="divider" class:dragging={active !== null}
    role="slider" aria-label="เลื่อนเทียบก่อนและหลัง" aria-orientation="horizontal"
    aria-valuemin="0" aria-valuemax="100" aria-valuenow={value}
    aria-valuetext={`ภาพก่อน ${value}% โมเดลหลัง ${100 - value}%`}
    title="ลากเส้นหรือปุ่มเพื่อเทียบภาพกับโมเดล · ลูกศรเลื่อน · Home/End · Enter กลับกึ่งกลาง"
    data-compare-divider
    onpointerdown={down} onpointermove={move} onpointerup={end} onpointercancel={end}
    onlostpointercapture={() => (active = null)} onkeydown={keys}
    ondblclick={(event) => { event.preventDefault(); event.stopPropagation(); value = 50; }}>
    <span class="grip" aria-hidden="true"><span class="arrows">‹ ‖ ›</span><small>ก่อน | หลัง</small></span>
  </button>
</div>

<style>
  .comparison { position: absolute; inset: 0; z-index: 8; pointer-events: none; }
  .line { position: absolute; top: 0; bottom: 0; left: clamp(1px, var(--split), calc(100% - 1px)); width: 2px; transform: translateX(-50%); background: #ffe14d; box-shadow: 0 0 3px #000a; }
  .divider { position: absolute; top: 0; bottom: 0; left: clamp(0px, calc(var(--split) - 24px), calc(100% - 48px)); width: 48px; padding: 0; border: 0; background: transparent; color: #1b240c; cursor: ew-resize; touch-action: none; pointer-events: auto; user-select: none; }
  .grip { position: absolute; left: 0; top: 60%; transform: translateY(-50%); width: 48px; min-height: 48px; box-sizing: border-box; border: 2px solid #fff4ad; border-radius: 13px; background: #ffe14d; box-shadow: 0 3px 14px #0008; display: flex; flex-direction: column; justify-content: center; align-items: center; }
  .arrows { font-size: 24px; line-height: 24px; font-weight: 800; }
  small { font-size: 9px; line-height: 15px; white-space: nowrap; }
  .divider:hover .grip, .divider.dragging .grip { background: #fff3a1; }
  .divider:focus-visible { outline: 0; }
  .divider:focus-visible .grip { outline: 3px solid #fff; outline-offset: 4px; }
  /* Keep the grip clear of the side toolbars at the 0/100% endpoints on shorter portrait screens. */
  @media (max-height: 500px) { .grip { top: 50%; } }
  @media (min-height: 501px) and (max-height: 760px) { .grip { top: calc(100% - 90px); } }
</style>
