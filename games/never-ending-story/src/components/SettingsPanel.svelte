<script lang="ts">
  import { t, getLocale } from '../lib/i18n';
  import { NICK_MAX, cleanNickname, nicknameError, randomNickname } from '../lib/nickname';
  import { readPlayerId, setNickname } from '../lib/playerId';
  import type { TextSize } from '../lib/types';

  let {
    textSize,
    soundEnabled,
    onTextSize,
    onSound,
    onClose,
    onReplayPrologue,
    showGod = false,
    godOn = false,
    onGodToggle,
  }: {
    textSize: TextSize;
    soundEnabled: boolean;
    onTextSize: (size: TextSize) => void;
    onSound: (enabled: boolean) => void;
    onClose: () => void;
    onReplayPrologue?: () => void;
    /** Shown only when this device already has a God admin session. */
    showGod?: boolean;
    godOn?: boolean;
    onGodToggle?: () => void;
  } = $props();

  const sizes: { id: TextSize; label: string }[] = [
    { id: 'sm', label: t('settings.size.sm') },
    { id: 'md', label: t('settings.size.md') },
    { id: 'lg', label: t('settings.size.lg') },
  ];

  let name = $state(readPlayerId().nickname ?? '');
  let editing = $state(false);
  let draft = $state('');
  let touched = $state(false);
  let savedFlash = $state(false);
  const err = $derived(nicknameError(draft));

  function startEdit(): void {
    draft = name || randomNickname(getLocale());
    touched = false;
    savedFlash = false;
    editing = true;
  }

  function cancelEdit(): void {
    editing = false;
    draft = name;
    touched = false;
  }

  function saveName(): void {
    touched = true;
    if (err) return;
    const clean = cleanNickname(draft);
    setNickname(clean);
    name = clean;
    editing = false;
    savedFlash = true;
  }
</script>

<div class="scrim" onclick={onClose} role="presentation">
  <dialog class="sheet" aria-label={t('settings.title')} open onclick={(event) => event.stopPropagation()}>
    <header class="head">
      <h2>{t('settings.title')}</h2>
      {#if showGod}
        <button
          type="button"
          class="god"
          class:on={godOn}
          data-testid="god-mode-toggle"
          aria-pressed={godOn}
          onclick={onGodToggle}
        >{t('god.float.toggle')}</button>
      {/if}
    </header>

    <section class="name" data-testid="settings-name">
      <p>{t('settings.name')}</p>
      {#if !editing}
        <div class="name-row">
          <strong class="who" data-testid="settings-name-value">{name || t('settings.name.empty')}</strong>
          <button type="button" class="toggle" data-testid="settings-name-edit" onclick={startEdit}>{t('settings.name.edit')}</button>
        </div>
        {#if savedFlash}<small class="ok" data-testid="settings-name-saved">{t('settings.name.saved')}</small>{/if}
      {:else}
        <input
          bind:value={draft}
          maxlength={NICK_MAX + 4}
          autocomplete="nickname"
          data-testid="settings-name-input"
          aria-label={t('settings.name')}
          aria-invalid={touched && !!err}
          oninput={() => (touched = true)}
        />
        <small class:bad={touched && !!err} data-testid="settings-name-error">{touched && err ? t(err, { max: NICK_MAX }) : t('prologue.name.hint', { max: NICK_MAX })}</small>
        <div class="name-row">
          <button type="button" class="toggle" data-testid="settings-name-random" onclick={() => { draft = randomNickname(getLocale(), { avoid: draft }); touched = true; }}>{t('settings.name.random')}</button>
          <button type="button" class="toggle" data-testid="settings-name-cancel" onclick={cancelEdit}>{t('settings.name.cancel')}</button>
          <button type="button" class="toggle save" data-testid="settings-name-save" disabled={!!err} onclick={saveName}>{t('settings.name.save')}</button>
        </div>
      {/if}
    </section>

    <p>{t('settings.size')}</p>
    <div class="row">
      {#each sizes as size (size.id)}
        <button
          type="button"
          class="choice"
          class:on={textSize === size.id}
          aria-pressed={textSize === size.id}
          onclick={() => onTextSize(size.id)}
        >
          {size.label}
        </button>
      {/each}
    </div>
    <p>{t('settings.sound')}</p>
    <div class="row">
      <button
        type="button"
        class="toggle"
        class:on={soundEnabled}
        aria-pressed={soundEnabled}
        onclick={() => onSound(!soundEnabled)}
      >
        {soundEnabled ? t('settings.sound.on') : t('settings.sound.off')}
      </button>
    </div>
    <p class="note">{t('settings.sound.note')}</p>
    {#if onReplayPrologue}
      <button type="button" class="toggle" data-testid="replay-prologue" onclick={onReplayPrologue}>{t('settings.replayPrologue')}</button>
    {/if}
    <button type="button" class="close" onclick={onClose}>{t('settings.close')}</button>
  </dialog>
</div>

<style>
  .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 0 0 8px; }
  .head h2 { margin: 0; }
  .god {
    margin-left: auto;
    min-height: 36px;
    border-radius: 999px;
    border: 1px solid var(--cyan);
    background: #123246;
    color: #eaf6ff;
    font-weight: 800;
    letter-spacing: 0.06em;
    padding: 6px 12px;
  }
  .god.on { background: #ffcf4a; color: #3a2a00; }
  .name { margin: 0 0 14px; }
  .name p { margin: 0 0 6px; }
  .name-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .who { flex: 1; min-width: 0; font-size: 1.15em; overflow-wrap: anywhere; }
  .name input {
    width: 100%;
    box-sizing: border-box;
    font: inherit;
    font-size: 1.1em;
    padding: 10px 12px;
    border-radius: 12px;
    border: 2px solid var(--cyan);
    background: #0b1622;
    color: #fff;
  }
  .name small { display: block; margin: 6px 0 8px; opacity: 0.8; }
  .name small.bad { color: #ff9a9a; opacity: 1; }
  .name small.ok { color: #9dffc3; opacity: 1; }
  .name .save { background: var(--cyan); color: #06212f; font-weight: 800; }
  .name .save:disabled { opacity: 0.5; }
</style>
