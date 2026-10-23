<script lang="ts">
  import { onMount } from 'svelte';
  import type { NightstandEntity, PlayerRoom } from '../lib/types';
  import { mountOrbit } from '../lib/orbitStand';
  import CompareSlider from './CompareSlider.svelte';
  import RoomView from './RoomView.svelte';

  let { room }: { room: PlayerRoom } = $props();

  const nightstand = $derived.by((): NightstandEntity | null => {
    const found = room.objects.find((obj) => obj.kind === 'nightstand');
    return found && found.kind === 'nightstand' ? found : null;
  });

  const mock = `${import.meta.env.BASE_URL}img/player-room-wide.jpg`;
  /** Nightstand in player-room-wide.jpg: x 53–86%, y 47–65%. */
  const tableCrop = { x: 53, y: 47, w: 33, h: 18 };

  let orbitCanvas = $state<HTMLCanvasElement>();

  onMount(() => {
    if (!orbitCanvas || !nightstand) return;
    const view = mountOrbit(orbitCanvas, nightstand);
    return () => view.dispose();
  });
</script>

<div class="showcase">
  <header>
    <p class="kicker">มุมออกแบบ</p>
    <h1>{nightstand?.title ?? 'ตู้ข้างเตียง'}</h1>
  </header>

  {#if nightstand}
    <dl>
      <div><dt>id</dt><dd>{nightstand.id}</dd></div>
      <div><dt>kind</dt><dd>{nightstand.kind}</dd></div>
      <div><dt>title</dt><dd>{nightstand.title}</dd></div>
      <div><dt>slug</dt><dd>{nightstand.slug}</dd></div>
    </dl>

    <section>
      <h2>ห้องทั้งห้อง</h2>
      <div class="frame room-frame">
        <CompareSlider src={mock}>
          <RoomView {room} showMarkers={false} />
        </CompareSlider>
      </div>
    </section>

    <section>
      <h2>ตู้ข้างเตียง</h2>
      <div
        class="frame table-frame"
        style="aspect-ratio: {(tableCrop.w / tableCrop.h) * (390 / 844)};"
      >
        <CompareSlider src={mock} crop={tableCrop}>
          <RoomView {room} showMarkers={false} />
        </CompareSlider>
      </div>
    </section>

    <section>
      <h2>หมุนดู</h2>
      <p class="hint">ลากเพื่อหมุน ภาพไม่หมุนเอง</p>
      <canvas bind:this={orbitCanvas} class="orbit" aria-label="หมุนตู้ข้างเตียง"></canvas>
    </section>
  {/if}
</div>

<style>
  .showcase {
    position: absolute;
    inset: 0;
    overflow: auto;
    background: #1b2430;
    color: #eaf6ff;
    padding: 16px 14px 28px;
  }
  .kicker {
    margin: 0;
    font-size: 13px;
    letter-spacing: 0.04em;
    color: #8fdfff;
  }
  h1 {
    margin: 2px 0 12px;
    font-size: 28px;
    line-height: 1.2;
  }
  h2 {
    margin: 0 0 8px;
    font-size: 18px;
  }
  dl {
    margin: 0 0 18px;
    display: grid;
    gap: 6px;
  }
  dl div { display: grid; grid-template-columns: 52px 1fr; gap: 8px; }
  dt { color: #8fdfff; font-size: 13px; }
  dd {
    margin: 0;
    font-size: 13px;
    word-break: break-all;
  }
  section { margin: 0 0 22px; }
  .frame {
    position: relative;
    width: 100%;
    border-radius: 12px;
    overflow: hidden;
  }
  .room-frame { aspect-ratio: 390 / 844; }
  .hint { margin: 0 0 8px; font-size: 14px; color: #c5d7e6; }
  .orbit {
    display: block;
    width: 100%;
    height: 280px;
    border-radius: 12px;
    touch-action: none;
    background: #efe4d4;
  }
</style>
