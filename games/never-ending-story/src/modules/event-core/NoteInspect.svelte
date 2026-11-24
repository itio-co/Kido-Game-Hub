<script lang="ts">
  import { t } from '../../lib/i18n';

  type Note = { front: string; back: string; side: 'front' | 'back' };

  let { note, onFlip, onClose }: { note: Note; onFlip: () => void; onClose: () => void } = $props();

  const flipped = $derived(note.side === 'back');
  let shrink = $state(false);

  function requestFlip(): void {
    if (shrink) return;
    shrink = true;
    setTimeout(() => {
      onFlip();
      shrink = false;
    }, 180);
  }

  function onKey(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    requestFlip();
  }
</script>

<div class="note-layer" data-testid="rin-note" role="dialog" aria-label={t('note.flipHint')}>
  <div
    class="paper"
    class:shrink
    role="button"
    tabindex="0"
    onclick={requestFlip}
    onkeydown={onKey}
    aria-label={flipped ? t('note.flipFront') : t('note.flipHint')}
  >
    <div class="face" data-testid={flipped ? 'rin-note-back' : 'rin-note-front'}>
      <p class="body">{flipped ? note.back : note.front}</p>
    </div>
  </div>
  <p class="hint">{flipped ? t('note.flipFront') : t('note.flipHint')}</p>
  <button type="button" class="close" data-testid="rin-note-close" onclick={onClose}>{t('note.close')}</button>
</div>

<style>
  .note-layer {
    position: absolute;
    inset: 0;
    z-index: 8;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 24px 16px 96px;
    background: rgba(8, 14, 22, 0.72);
  }
  .paper {
    width: min(86%, 340px);
    aspect-ratio: 3 / 4;
    cursor: pointer;
    transform-origin: center;
    transition: transform 180ms ease;
  }
  .paper.shrink { transform: scaleX(0.02); }
  .face {
    width: 100%;
    height: 100%;
    border-radius: 6px 10px 8px 7px;
    background:
      radial-gradient(circle at 18% 12%, rgba(255, 255, 255, 0.55), transparent 40%),
      linear-gradient(180deg, #f7ebcf 0%, #f0dcb0 70%, #e8d09a 100%);
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.45), inset 0 0 0 1px rgba(90, 60, 20, 0.18);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 14% 12%;
    box-sizing: border-box;
  }
  .body {
    margin: 0;
    font-family: "Itim", "Noto Sans Thai", sans-serif;
    font-size: clamp(22px, 5.6vw, 30px);
    line-height: 1.7;
    color: #2c1c12;
    text-align: center;
    white-space: pre-wrap;
  }
  .hint {
    margin: 0;
    color: #eaf6ff;
    font-size: var(--fs-sm);
    text-align: center;
  }
  .close {
    min-height: 48px;
    min-width: 44%;
    border-radius: 12px;
    border: 1px solid #39e0ff;
    background: #0d4a66;
    color: #fff;
    font-weight: 800;
    font-size: var(--fs);
    padding: 10px 14px;
  }
</style>
