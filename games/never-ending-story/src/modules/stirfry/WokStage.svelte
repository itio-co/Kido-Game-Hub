<script lang="ts">
  /** Stir-fry edition visual: photoreal wok frames driven by the rhythm engine's StageProps. */
  import { imageUrl } from '../../lib/flow/loadFlow';
  import type { StageProps } from '../rhythm';
  import { cookStage, burntLevel, WOK_FRAMES } from './edition';

  let props: StageProps = $props();

  const stage = $derived(cookStage(props.progress));
  const burnt = $derived(burntLevel(props.pressure));
  let tossing = $state(false);
  let missed = $state(false);
  let lastPulse = 0;

  $effect(() => {
    const p = props.pulse;
    if (p === lastPulse || !props.last) return;
    lastPulse = p;
    const hit = props.last === 'perfect' || props.last === 'good' || props.last === 'extra-hit';
    if (hit) {
      tossing = true;
      setTimeout(() => (tossing = false), 260);
    } else {
      missed = true;
      setTimeout(() => (missed = false), 380);
    }
  });
</script>

<span class="pan" class:toss={tossing} class:miss={missed} style="--beat:{props.beat}" data-testid="wok-pan" data-stage={tossing ? 'toss' : burnt > 0.5 ? 'burnt' : stage}>
  {#each WOK_FRAMES as name (name)}
    <img src={imageUrl(`stirfry/wok-${name}.webp`)} alt="" class:on={stage === name} draggable="false" />
  {/each}
  <img src={imageUrl('stirfry/wok-burnt.webp')} alt="" class="burnt" style="opacity:{burnt}" draggable="false" />
  <img src={imageUrl('stirfry/wok-toss.webp')} alt="" class="tossimg" class:on={tossing} draggable="false" />
  {#key props.pulse}{#if tossing}<span class="steam"><i></i><i></i><i></i></span>{/if}{/key}
  {#if burnt > 0.3}<span class="smoke"></span>{/if}
</span>

<style>
  .pan {
    position: absolute;
    inset: 0;
    border-radius: 24px;
    overflow: hidden;
    box-shadow: 0 14px 30px rgba(0, 0, 0, 0.55);
    transform: scale(calc(1 + var(--beat) * 0.02));
    transition: transform 60ms linear, filter 120ms linear;
  }
  .pan img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity 600ms ease; pointer-events: none; user-select: none; }
  .pan img.on { opacity: 1; }
  .pan img.burnt { transition: opacity 400ms linear; }
  .pan img.tossimg { transition: opacity 80ms linear; }
  .pan.toss { animation: hop 260ms ease-out; }
  .pan.miss { animation: shake 380ms ease-in-out; filter: saturate(0.6) brightness(0.8) sepia(0.35) hue-rotate(-20deg); }
  @keyframes hop { 0% { transform: translateY(0) rotate(0); } 40% { transform: translateY(-14px) rotate(-3deg); } 100% { transform: translateY(0) rotate(0); } }
  @keyframes shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-9px); } 40% { transform: translateX(8px); } 60% { transform: translateX(-6px); } 80% { transform: translateX(4px); } }
  .steam { position: absolute; inset: 0; pointer-events: none; }
  .steam i { position: absolute; bottom: 45%; width: 22%; aspect-ratio: 1; border-radius: 50%; background: radial-gradient(rgba(255,255,255,0.75), rgba(255,255,255,0)); animation: puff 700ms ease-out forwards; }
  .steam i:nth-child(1) { left: 22%; }
  .steam i:nth-child(2) { left: 42%; animation-delay: 60ms; }
  .steam i:nth-child(3) { left: 60%; animation-delay: 120ms; }
  @keyframes puff { from { transform: translateY(0) scale(0.6); opacity: 0.9; } to { transform: translateY(-70%) scale(1.6); opacity: 0; } }
  .smoke { position: absolute; inset: 0; background: radial-gradient(circle at 50% 40%, rgba(40, 40, 40, 0.55), rgba(40, 40, 40, 0) 60%); animation: smoke 1.6s ease-in-out infinite; pointer-events: none; }
  @keyframes smoke { 50% { opacity: 0.4; transform: translateY(-6%); } }
</style>
