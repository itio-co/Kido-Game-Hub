<script lang="ts">
  import { t } from '../../lib/i18n';
  import { loginGod } from './login';

  let { onSuccess, onClose }: { onSuccess: () => void; onClose: () => void } = $props();

  let password = $state('');
  let error = $state('');
  let busy = $state(false);

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (busy) return;
    busy = true;
    error = '';
    const result = await loginGod(password);
    password = '';
    busy = false;
    if (result.ok) {
      onSuccess();
      return;
    }
    if (result.code === 'bad-password') error = t('god.login.bad', { n: result.attemptsLeft });
    else if (result.code === 'locked') error = t('god.login.locked', { min: Math.max(1, Math.ceil(result.retryAfterSec / 60)) });
    else if (result.code === 'not-configured') error = t('god.login.notConfigured');
    else error = t('god.float.loginError');
  }
</script>

<div class="scrim" role="presentation" onclick={onClose}>
  <div class="sheet" role="dialog" data-testid="god-login" aria-label={t('god.float.loginTitle')} tabindex="-1" onclick={(event) => event.stopPropagation()} onkeydown={(event) => event.stopPropagation()}>
  <form onsubmit={submit}>
    <h2>{t('god.float.loginTitle')}</h2>
    <label>
      {t('god.login.password')}
      <input type="password" name="god-password" autocomplete="off" data-testid="god-login-password" bind:value={password} />
    </label>
    {#if error}<p class="err" data-testid="god-login-error">{error}</p>{/if}
    <button type="submit" class="action" disabled={busy || !password}>{busy ? t('god.loading') : t('god.login.submit')}</button>
    <button type="button" class="close" onclick={onClose}>{t('god.float.loginClose')}</button>
  </form>
  </div>
</div>

<style>
  label { display: flex; flex-direction: column; gap: 6px; font-weight: 700; margin-bottom: 12px; }
  input {
    min-height: 44px;
    border-radius: 10px;
    border: 1px solid var(--cyan);
    background: #0b2230;
    color: white;
    padding: 8px 12px;
    font: inherit;
  }
  .err { color: #ffb4b4; }
  .action { width: 100%; margin-bottom: 8px; }
</style>
