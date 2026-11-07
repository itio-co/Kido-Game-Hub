<script lang="ts">
  import { ComicPanel } from '../modules/event-core';
  import { t } from '../lib/i18n';
  import { readPlayerId, setNickname } from '../lib/playerId';
  import { NICK_MAX, PROLOGUE_PAGES, nicknameError, suggestNickname } from '../lib/prologue';

  let { onDone }: { onDone: () => void } = $props();

  const profile = readPlayerId();
  let page = $state(0);
  let naming = $state(false);
  let nick = $state(profile.nickname ?? suggestNickname(t('prologue.name.base')));
  let touched = $state(false);
  const err = $derived(nicknameError(nick));
  const cut = $derived(PROLOGUE_PAGES[page]);

  function next(): void {
    if (page < PROLOGUE_PAGES.length - 1) page += 1;
    else naming = true;
  }

  function confirm(): void {
    touched = true;
    if (err) return;
    const clean = nick.trim().replace(/\s+/g, ' ');
    if (clean !== profile.nickname) setNickname(clean);
    onDone();
  }
</script>

<div class="prologue" data-testid="prologue">
  {#if !naming}
    <ComicPanel
      image={cut.image}
      lines={cut.lines.map((line) => ({ ...line, who: t(line.who), text: t(line.text) }))}
      caption={t(cut.caption)}
      tapLabel={page < PROLOGUE_PAGES.length - 1 ? t('prologue.tapNext') : t('prologue.tapName')}
      count={PROLOGUE_PAGES.length}
      index={page}
      onNext={next}
    />
    {#if page > 0}
      <button type="button" class="prev" onclick={() => (page -= 1)}>{t('ending.prev')}</button>
    {/if}
    <button type="button" class="skip" data-testid="prologue-skip" onclick={() => (profile.nickname ? onDone() : (naming = true))}>{t('prologue.skip')}</button>
  {:else}
    <form class="name" data-testid="prologue-name" onsubmit={(event) => { event.preventDefault(); confirm(); }}>
      <h1>{t('prologue.name.title')}</h1>
      <p>{t('prologue.name.body')}</p>
      <input
        bind:value={nick}
        maxlength={NICK_MAX + 4}
        autocomplete="nickname"
        aria-label={t('prologue.name.title')}
        aria-invalid={touched && !!err}
        oninput={() => (touched = true)}
      />
      <small class:bad={touched && !!err}>{touched && err ? t(err, { max: NICK_MAX }) : t('prologue.name.hint', { max: NICK_MAX })}</small>
      <button type="button" class="alt" onclick={() => { nick = suggestNickname(t('prologue.name.base')); touched = true; }}>{t('prologue.name.random')}</button>
      <button type="submit" class="go" disabled={!!err}>{t('prologue.name.start')}</button>
    </form>
  {/if}
</div>

<style>
  .prologue { position: absolute; inset: 0; z-index: 20; background: #000; }
  .skip, .prev { position: absolute; z-index: 6; bottom: 16px; background: rgba(0, 0, 0, 0.55); color: #fff; border: 0; border-radius: 16px; padding: 8px 14px; font-size: var(--fs-sm); font-weight: 700; }
  .skip { right: 12px; top: 16px; bottom: auto; }
  .prev { left: 12px; }
  .name { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; gap: 12px; padding: 24px; background: linear-gradient(#10141c, #1c2a3a); color: var(--ink); }
  .name h1 { margin: 0; font-size: 1.5em; }
  .name p { margin: 0; line-height: 1.5; }
  .name input { font: inherit; font-size: 1.2em; padding: 12px 14px; border-radius: 14px; border: 3px solid var(--cyan); background: #0b1622; color: #fff; }
  .name small { opacity: 0.8; }
  .name small.bad { color: #ff9a9a; opacity: 1; }
  .name button { font: inherit; font-weight: 700; border-radius: 14px; padding: 12px; border: 2px solid var(--cyan); }
  .alt { background: transparent; color: var(--ink); }
  .go { background: var(--cyan); color: #06212f; font-size: 1.1em; }
  .go:disabled { opacity: 0.5; }
</style>
