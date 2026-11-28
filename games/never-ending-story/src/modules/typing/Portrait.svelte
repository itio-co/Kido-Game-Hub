<script lang="ts">
  import { findPortrait, initialsOf, portraitSrc, silhouetteStyle } from './portrait';

  let { author }: { author: string } = $props();
  const entry = $derived(findPortrait(author));
  const style = $derived(silhouetteStyle(author));
  const initials = $derived(initialsOf(author));
</script>

<div class="port" data-testid="typing-portrait" data-author={author} data-kind={entry ? 'photo' : 'silhouette'} data-qid={entry?.qid ?? ''}>
  {#if entry}
    <img class="photo" src={portraitSrc(entry.file)} alt="" width="400" height="500" />
  {:else}
    <svg class="sil" viewBox="0 0 200 240" preserveAspectRatio="xMidYMin slice" aria-hidden="true">
      <rect width="200" height="240" fill="#d8dbe0" />
      <ellipse cx="100" cy="250" rx="90" ry="50" fill={style.shirt} />
      <ellipse cx="100" cy="118" rx="44" ry="52" fill={style.skin} />
      {#if style.hairStyle === 0}
        <path d="M56 118c0-46 20-78 44-78s44 32 44 78c0-8-4-36-16-44-8 22-20 28-28 28s-20-6-28-28c-12 8-16 36-16 44z" fill={style.hair} />
      {:else if style.hairStyle === 1}
        <path d="M52 130c-4-54 18-86 48-88 30-2 52 30 50 86-18-10-32-8-50-8s-32-2-48 10z" fill={style.hair} />
      {:else if style.hairStyle === 2}
        <path d="M48 120c8-60 28-84 52-84s44 24 52 84c-16-20-32-16-52-16s-36-4-52 16z" fill={style.hair} />
        <circle cx="58" cy="108" r="16" fill={style.hair} />
        <circle cx="142" cy="108" r="16" fill={style.hair} />
      {:else}
        <path d="M60 100c8-24 24-36 40-36s32 12 40 36c-12-8-24-8-40-8s-28 0-40 8z" fill={style.hair} />
      {/if}
      <text x="100" y="200" text-anchor="middle" fill="#fff" font-size="28" font-weight="700" font-family="Noto Sans, sans-serif">{initials}</text>
    </svg>
  {/if}
</div>

<style>
  .port {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #d8dbe0;
  }
  .photo, .sil {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center top;
  }
</style>
