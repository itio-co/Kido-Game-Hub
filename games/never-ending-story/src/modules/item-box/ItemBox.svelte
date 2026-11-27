<script lang="ts">
  import { ItemDetail, ItemIcon, itemCopy, itemForBagId, itemIconFile, itemImageFile } from '../item';
  import { getLocale } from '../../lib/i18n';
  import { imageUrl } from '../../lib/imageUrl';

  let {
    title,
    ownedIds,
    freshId = null,
    emptyText,
    closeLabel,
    slots = 6,
    testid = 'item-box',
    onClose,
  }: {
    title: string;
    ownedIds: readonly string[];
    freshId?: string | null;
    emptyText: string;
    closeLabel: string;
    slots?: number;
    testid?: string;
    onClose: () => void;
  } = $props();

  let selectedId = $state<string | null>(null);

  const views = $derived(ownedIds.map((id) => {
    const item = itemForBagId(id);
    const copy = item ? itemCopy(item, getLocale()) : { title: id, description: '' };
    const icon = item ? itemIconFile(item) : undefined;
    const file = item ? itemImageFile(item) : undefined;
    return {
      id,
      title: copy.title,
      description: copy.description,
      iconUrl: icon ? imageUrl(icon) : '',
      imageUrl: file ? imageUrl(file) : '',
      fresh: freshId === id,
    };
  }));

  const selected = $derived(views.find((item) => item.id === selectedId) ?? null);
  const empties = $derived(Math.max(0, slots - ownedIds.length));

  function closeDetail(): void {
    selectedId = null;
  }
</script>

<div class="time-sheet" data-testid={testid}>
  <button type="button" class="calx" data-testid="item-box-close" aria-label={closeLabel} onclick={onClose}>✕</button>
  <div class="calc">
    <div class="calh"><span>{title}</span></div>
    {#if selected}
      <ItemDetail
        title={selected.title}
        description={selected.description}
        imageUrl={selected.imageUrl}
        {closeLabel}
        onClose={closeDetail}
      />
    {:else if ownedIds.length === 0}
      <p class="empty">{emptyText}</p>
    {:else}
      <div class="grid" data-testid="item-box-grid">
        {#each views as item (item.id)}
          <ItemIcon
            title={item.title}
            iconUrl={item.iconUrl}
            fresh={item.fresh}
            slug={item.id}
            onclick={() => { selectedId = item.id; }}
          />
        {/each}
        {#each Array.from({ length: empties }, (_, index) => index) as index (index)}
          <div class="empty-slot" data-testid="item-slot-empty" aria-hidden="true"></div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .time-sheet {
    position: absolute;
    inset: 0;
    z-index: 6;
    background: rgba(0, 0, 0, 0.55);
    padding: 72px 14px 96px;
    overflow: auto;
  }
  .calc {
    background: repeating-linear-gradient(0deg, #f3e3c3 0 6px, #efdcb8 6px 7px);
    color: #4a2e18;
    border: 8px solid #8a5a34;
    border-radius: 14px;
    padding: 12px;
  }
  .calh {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: linear-gradient(90deg, #6b3f22, #8a5a34);
    color: #fff;
    border-radius: 10px;
    padding: 10px 12px;
    font-weight: 800;
    font-size: 1.15rem;
    margin-bottom: 12px;
  }
  .calx {
    position: absolute;
    right: 22px;
    top: 78px;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 0;
    background: #fff;
    color: #333;
    font-size: 18px;
  }
  .empty {
    margin: 16px 8px;
    font-size: var(--fs);
    line-height: 1.45;
    text-align: center;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(72px, 1fr));
    gap: 12px;
    padding: 4px 2px 8px;
  }
  .empty-slot {
    width: 100%;
    min-width: 72px;
    display: flex;
    flex-direction: column;
    padding: 8px 6px 6px;
    box-sizing: border-box;
  }
  .empty-slot::before {
    content: '';
    width: 100%;
    aspect-ratio: 1;
    min-height: 72px;
    border-radius: 16px;
    border: 3px dashed rgba(57, 224, 255, 0.45);
    background: rgba(6, 24, 40, 0.18);
    box-sizing: border-box;
  }
  .empty-slot::after {
    content: '';
    min-height: 2.5em;
    margin-top: 4px;
  }
</style>
