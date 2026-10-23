<script lang="ts">
  import type { NightstandEntity, PlayerRoom } from '../lib/types';
  import CompareSlider from './CompareSlider.svelte';
  import NightstandView from './NightstandView.svelte';

  let { room }: { room: PlayerRoom } = $props();

  const nightstand = $derived.by((): NightstandEntity | null => {
    const found = room.objects.find((obj) => obj.kind === 'nightstand');
    return found && found.kind === 'nightstand' ? found : null;
  });

  const mock = `${import.meta.env.BASE_URL}showcase/nightstand-ref.png`;
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
      <h2>ตู้ข้างเตียง</h2>
      <div class="frame table-frame">
        <CompareSlider src={mock}>
          <NightstandView entity={nightstand} />
        </CompareSlider>
      </div>
    </section>

    <section>
      <h2>หมุนดู</h2>
      <p class="hint">ลากเพื่อหมุน ภาพไม่หมุนเอง</p>
      <div class="frame orbit-frame">
        <NightstandView entity={nightstand} orbit />
      </div>
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
  .table-frame { aspect-ratio: 252 / 284; }
  .orbit-frame { aspect-ratio: 1; }
  .hint { margin: 0 0 8px; font-size: 14px; color: #c5d7e6; }
</style>
