<script lang="ts">
  import { imageUrl } from '../../lib/imageUrl';
  import type { FlowScene, FlowSpot } from './types';

  let {
    scene,
    image,
    spots,
    selected,
    hintId,
    evidence,
    labelFor,
    onSpot,
    onMiss,
    floor = 1,
    onFloor,
  }: {
    scene: FlowScene;
    image: string;
    spots: FlowSpot[];
    selected: string | null;
    hintId: string | null;
    evidence: string[];
    labelFor: (spot: FlowSpot) => string;
    onSpot: (spot: FlowSpot) => void;
    onMiss: () => void;
    floor?: 1 | 2;
    onFloor?: (floor: 1 | 2) => void;
  } = $props();

  const width = $derived(scene.contain ? 864 : 720);
  const height = $derived(scene.contain ? 1152 : 1280);
  const font = 34;

  function place(spot: FlowSpot) {
    const cx = (spot.x / 100) * width;
    const cy = (spot.y / 100) * height;
    const label = labelFor(spot);
    const tw = Math.max(120, label.length * font * 0.72 + 28);
    const lx = Math.max(8, Math.min(width - tw - 8, cx - tw / 2));
    const above = cy - font - 70;
    const ly = above < 150 ? cy + 28 : above;
    return { cx, cy, label, tw, lx, ly };
  }
</script>

<div class="photo">
  <img class:contain={scene.contain} src={imageUrl(image)} alt="" />
  <svg
    class="layer"
    viewBox="0 0 {width} {height}"
    preserveAspectRatio={scene.contain ? 'xMidYMid meet' : 'xMidYMid slice'}
  >
    <rect width={width} height={height} fill="transparent" role="presentation" onclick={onMiss} />
    {#each spots as spot (spot.id)}
      {@const at = place(spot)}
      <g class:done={!!spot.doneEvidence && evidence.includes(spot.doneEvidence)} class:hint={hintId === spot.id}>
        <circle
          class="hit"
          cx={at.cx}
          cy={at.cy}
          r={scene.contain ? 34 : 40}
          role="button"
          tabindex="0"
          aria-label={at.label}
          onclick={(event) => { event.stopPropagation(); onSpot(spot); }}
          onkeydown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            event.stopPropagation();
            onSpot(spot);
          }}
        />
        <circle class="dot" cx={at.cx} cy={at.cy} r={scene.contain ? 12 : 14} />
        {#if spot.action.type === 'locked'}
          <text class="lock" x={at.cx} y={at.cy + 9} font-size="26" text-anchor="middle">🔒</text>
        {/if}
        {#if selected === spot.id}
          <g class="lbl">
            <rect x={at.lx} y={at.ly} width={at.tw} height={font + 22} rx={(font + 22) / 2} />
            <text x={at.lx + at.tw / 2} y={at.ly + font + 2} font-size={font} text-anchor="middle">{at.label}</text>
          </g>
        {/if}
      </g>
    {/each}
  </svg>
  {#if scene.floors && onFloor}
    <div class="floors" role="group">
      {#each scene.floors as item (item.floor)}
        <button
          type="button"
          class:on={item.floor === floor}
          aria-pressed={item.floor === floor}
          data-testid={'map-floor-' + item.floor}
          onclick={() => onFloor?.(item.floor)}
        >{item.title}</button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .photo { position: absolute; inset: 0; background: #1c2430; }
  img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  img.contain { object-fit: contain; background: #efe6d2; }
  .layer { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 2; }
  .hit { fill: transparent; cursor: pointer; }
  .dot { fill: #bff6ff; pointer-events: none; }
  .done .dot { fill: #9aa; }
  .hint .dot { fill: #ffe066; transform-box: fill-box; transform-origin: center; transform: scale(1.8); }
  .lock { pointer-events: none; }
  .floors { position: absolute; z-index: 3; top: calc(96px + env(safe-area-inset-top)); left: 50%; transform: translateX(-50%); display: flex; gap: 0; border: 2px solid #39e0ff; border-radius: 999px; overflow: hidden; background: rgba(6, 30, 48, 0.9); }
  .floors button { border: 0; background: transparent; color: #cfe9f5; font-weight: 700; font-size: var(--fs-sm, 15px); padding: 6px 18px; min-width: 76px; }
  .floors button.on { background: #39e0ff; color: #06212f; }
  .lbl { pointer-events: none; }
  .lbl rect { fill: rgba(6, 30, 48, 0.94); stroke: #39e0ff; stroke-width: 3; }
  .lbl text { fill: #eaf6ff; font-family: "Noto Sans Thai", "Noto Sans", sans-serif; font-weight: 700; }
</style>
