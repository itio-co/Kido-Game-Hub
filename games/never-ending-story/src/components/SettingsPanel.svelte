<script lang="ts">
  import type { TextSize } from '../lib/types';
  import { LOCALES, t, type MessageKey } from '../lib/i18n/core';
  import { locale } from '../lib/i18n/locale.svelte';

  let {
    textSize,
    soundEnabled,
    onTextSize,
    onSound,
    onClose,
  }: {
    textSize: TextSize;
    soundEnabled: boolean;
    onTextSize: (size: TextSize) => void;
    onSound: (enabled: boolean) => void;
    onClose: () => void;
  } = $props();

  const sizes: TextSize[] = ['sm', 'md', 'lg'];
</script>

<div class="scrim" onclick={onClose} role="presentation">
  <dialog class="sheet" aria-label={t('game.settings.title')} open onclick={(event) => event.stopPropagation()}>
    <h2>{t('game.settings.title')}</h2>
    <p>{t('game.settings.textSize')}</p>
    <div class="row">
      {#each sizes as size (size)}
        <button
          type="button"
          class="choice"
          class:on={textSize === size}
          aria-pressed={textSize === size}
          onclick={() => onTextSize(size)}
        >
          {t(`game.settings.size.${size}` as MessageKey)}
        </button>
      {/each}
    </div>
    <p>{t('game.settings.voice')}</p>
    <div class="row">
      <button
        type="button"
        class="toggle"
        class:on={soundEnabled}
        aria-pressed={soundEnabled}
        onclick={() => onSound(!soundEnabled)}
      >
        {soundEnabled ? t('game.settings.on') : t('game.settings.off')}
      </button>
    </div>
    <p class="note">{t('game.settings.voiceNote')}</p>
    <p>{t('game.settings.language')}</p>
    <div class="row" role="radiogroup" aria-label={t('game.settings.language')}>
      {#each LOCALES as code (code)}
        <button
          type="button"
          role="radio"
          class="choice"
          class:on={locale.game === code}
          aria-checked={locale.game === code}
          data-lang={code}
          lang={code}
          onclick={() => locale.set('game', code)}
        >
          {t(`locale.name.${code}` as MessageKey)}
        </button>
      {/each}
    </div>
    <button type="button" class="close" onclick={onClose}>{t('game.common.close')}</button>
  </dialog>
</div>
