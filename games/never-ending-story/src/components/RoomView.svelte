<script lang="ts">
  import type { PlayerRoom } from '../lib/types';
  import { t } from '../lib/i18n';
  import { KEEPSAKE_SHELF_ID, isGrandpaPhoto } from '../lib/decor';

  let {
    room,
    selectedId = null,
    hintId = null,
    decor = {},
    onTap = () => {},
    onMiss = () => {},
    showMarkers = true,
  }: {
    room: PlayerRoom;
    selectedId?: string | null;
    hintId?: string | null;
    decor?: Record<string, string | null>;
    onTap?: (id: string) => void;
    onMiss?: () => void;
    showMarkers?: boolean;
  } = $props();

  const backdropSrc = $derived(`${import.meta.env.BASE_URL}img/${room.backdrop}`);
  const photoOverlaySrc = $derived(`${import.meta.env.BASE_URL}img/decor/keepsake-shelf-grandpa-photo.png`);
  const photoOnShelf = $derived(isGrandpaPhoto(decor[KEEPSAKE_SHELF_ID]));

  function center(hotspot: (typeof room.hotspots)[number]) {
    const { left, top, width, height } = hotspot.screen;
    return { x: left + width / 2, y: top + height / 2 };
  }

  function slotLabel(hotspot: (typeof room.hotspots)[number], filled: boolean): string {
    if (!filled) return hotspot.title;
    const value = decor[hotspot.id];
    return isGrandpaPhoto(value) ? t('decor.photo') : (value ?? hotspot.title);
  }
</script>

<div class="room">
  <img class="backdrop" src={backdropSrc} alt={room.title} draggable="false" />
  {#if photoOnShelf}
    <img class="backdrop decor-overlay" src={photoOverlaySrc} alt="" draggable="false" />
  {/if}
  {#if showMarkers}
    <button type="button" class="miss" aria-label="พื้นห้อง" onclick={() => onMiss()}></button>
  {/if}
  <div class="spots">
    {#if showMarkers}
      {#each room.hotspots as hotspot (hotspot.id)}
        {@const at = center(hotspot)}
        {@const filled = hotspot.kind === 'decor-slot' && !!decor[hotspot.id]}
        <button
          type="button"
          class="spot"
          class:decor={hotspot.kind === 'decor-slot' && !filled}
          class:hint={hintId === hotspot.id}
          class:below={at.y < 12}
          style="left:{at.x}%;top:{at.y}%"
          aria-label={hotspot.title}
          aria-pressed={selectedId === hotspot.id}
          onclick={(event) => {
            event.stopPropagation();
            onTap(hotspot.id);
          }}
        >
          <span class="mark">{#if hotspot.kind === 'decor-slot' && !filled}<span>+</span>{/if}</span>
          {#if selectedId === hotspot.id}
            <span class="pill">{slotLabel(hotspot, filled)}</span>
          {/if}
        </button>
      {/each}
    {/if}
  </div>
</div>
