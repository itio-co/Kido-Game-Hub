<script lang="ts">
  import { t } from '../../lib/i18n';
  import { swipeDirection } from './swipe';
  import type { FlowSession } from './session.svelte';

  let { session }: { session: FlowSession } = $props();

  let start: { x: number; y: number; id: number } | null = null;
  let scrim = $state<HTMLDivElement | undefined>(undefined);
  let card = $state<HTMLDivElement | undefined>(undefined);

  $effect(() => session.bindLeaveGuard());

  /** Render the confirm layer on `.phone`, outside any swiped/translated event view. */
  $effect(() => {
    const node = scrim;
    if (!node) return;
    const host = document.querySelector('.phone');
    if (!host) return;
    if (node.parentElement !== host) host.appendChild(node);
    card?.focus();
    return () => {
      node.remove();
    };
  });

  function inComic(target: EventTarget | null): boolean {
    return target instanceof Element && !!target.closest('[data-testid="comic-panel"]');
  }

  function inFlow(target: EventTarget | null): boolean {
    return target instanceof Element && !!target.closest('.flow');
  }

  function down(event: PointerEvent): void {
    if (session.leaveConfirm) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (!inFlow(event.target) || inComic(event.target)) return;
    start = { x: event.clientX, y: event.clientY, id: event.pointerId };
  }

  function up(event: PointerEvent): void {
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    start = null;
    if (swipeDirection(dx, dy) === 'prev') session.attemptSwipeLeave();
  }

  $effect(() => {
    const cancel = () => { start = null; };
    window.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  });
</script>

{#if session.leaveConfirm}
  <div
    bind:this={scrim}
    class="leave-scrim"
    data-testid="leave-event-dialog"
    role="presentation"
    onclick={(event) => { if (event.target === event.currentTarget) session.cancelLeave(); }}
  >
    <div
      bind:this={card}
      class="leave-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="leave-event-title"
      aria-describedby="leave-event-body"
      tabindex="-1"
      onkeydown={(event) => { if (event.key === 'Escape') session.cancelLeave(); }}
    >
      <h2 id="leave-event-title">{t('event.leaveTitle')}</h2>
      <p id="leave-event-body">{t('event.leaveBody')}</p>
      <div class="leave-actions">
        <button type="button" class="stay" data-testid="leave-event-cancel" onclick={() => session.cancelLeave()}>
          {t('event.leaveCancel')}
        </button>
        <button type="button" class="leave" data-testid="leave-event-confirm" onclick={() => session.confirmLeave()}>
          {t('event.leaveConfirm')}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .leave-scrim {
    position: absolute;
    inset: 0;
    z-index: 40;
    background: rgba(0, 0, 0, 0.62);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
    box-sizing: border-box;
  }
  .leave-card {
    position: relative;
    inset: auto;
    width: 100%;
    max-width: 320px;
    margin: 0;
    background: #06212f;
    border: 2px solid #39e0ff;
    border-radius: 16px;
    padding: 16px 16px 18px;
    color: #eaf6ff;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
    outline: none;
  }
  .leave-card h2 { margin: 0 0 8px; font-size: calc(var(--fs) + 2px); }
  .leave-card p { margin: 0 0 14px; line-height: 1.5; }
  .leave-actions { display: grid; gap: 8px; }
  .leave-actions button {
    min-height: 44px;
    width: 100%;
    border-radius: 10px;
    border: 1px solid #39e0ff;
    font-weight: 700;
    padding: 8px 14px;
  }
  .stay { background: #0d4a66; color: #fff; }
  .leave { background: #8B1E4F; color: #fff; border-color: #ffb3c9; }
</style>
