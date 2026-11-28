<script lang="ts">
  import { t } from '../../lib/i18n';

  type Note = { front: string; back?: string; side?: 'front' | 'back' };

  let { note, onClose }: { note: Note; onFlip?: () => void; onClose: () => void } = $props();
</script>

<div class="note-layer" data-testid="rin-note" role="dialog" aria-label={t('note.close')}>
  <div class="paper">
    <div class="face" data-testid="rin-note-front">
      <p class="body">{note.front}</p>
    </div>
  </div>
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
    padding: 24px 16px calc(var(--hud-btn-bottom, 14px) + var(--hud-btn-size, 64px) + 16px);
    background: rgba(8, 14, 22, 0.72);
    box-sizing: border-box;
  }
  .paper {
    width: min(86%, 340px);
    max-height: calc(100% - 72px);
    flex: 0 1 auto;
  }
  .face {
    width: 100%;
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
    min-height: 220px;
  }
  .body {
    margin: 0;
    font-family: "Itim", "Noto Sans Thai", sans-serif;
    font-size: clamp(20px, 5.2vw, 28px);
    line-height: 1.7;
    color: #2c1c12;
    text-align: center;
    white-space: pre-wrap;
  }
  .close {
    flex: 0 0 auto;
    min-height: 48px;
    min-width: 44%;
    max-width: 80%;
    border-radius: 12px;
    border: 1px solid #39e0ff;
    background: #0d4a66;
    color: #fff;
    font-weight: 800;
    font-size: var(--fs);
    padding: 10px 14px;
  }
</style>
