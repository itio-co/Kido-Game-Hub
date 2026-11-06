<script lang="ts">
  import { t } from '../../lib/i18n';
  import { readPlayerId } from '../../lib/playerId';
  import { onlineTop, type OnlineRow } from '../../lib/cloudSync';
  import { CHALLENGE_GAMES, DIFFICULTIES, fmtTime, leaderboard, type ChallengeGame, type Difficulty, type LeaderEntry } from '../../lib/challenge';

  let { onExit, onPlay }: { onExit: () => void; onPlay: (game: ChallengeGame) => void } = $props();

  let game = $state<ChallengeGame>('cross');
  let diff = $state<Difficulty>('easy');
  let rows = $state<LeaderEntry[]>([]);
  let scope = $state<'online' | 'local'>('online');
  let online = $state<OnlineRow[] | null>(null);
  let loading = $state(false);
  const myId = readPlayerId().playerId;

  $effect(() => {
    const g = game, d = diff;
    void leaderboard.top(g, d).then((list) => (rows = list));
  });

  $effect(() => {
    const g = game, d = diff;
    if (scope !== 'online') return;
    loading = true;
    void onlineTop(g, d).then((list) => {
      online = list;
      loading = false;
      if (list === null) scope = 'local'; // offline / preview host: fall back to this device's board
    });
  });

</script>

<div class="lb" data-testid="leaderboard">
  <div class="top">
    <button type="button" class="x" aria-label={t('stirfry.exit')} onclick={onExit}>✕</button>
    <h1>🏆 {t('board.title')}</h1>
    <span></span>
  </div>
  <div class="tabs two" data-testid="board-scope">
    <button type="button" class:on={scope === 'online'} onclick={() => (scope = 'online')}>🌐 {t('board.online')}</button>
    <button type="button" class:on={scope === 'local'} onclick={() => (scope = 'local')}>📱 {t('board.local')}</button>
  </div>
  <div class="tabs">
    {#each CHALLENGE_GAMES as g (g)}
      <button type="button" class:on={game === g} onclick={() => (game = g)}>{t(`challenge.game.${g}`)}</button>
    {/each}
  </div>
  <div class="tabs small">
    {#each DIFFICULTIES as d (d)}
      <button type="button" class:on={diff === d} onclick={() => (diff = d)}>{t(`challenge.diff.${d}`)}</button>
    {/each}
  </div>
  {#if scope === 'online'}
  <ol class="list" data-testid="board-online">
    {#each online ?? [] as r, i (r.playerId)}
      <li class:me={r.playerId === myId}>
        <span class="rk">{i + 1}</span>
        <span class="nm">{r.nickname || '?'}{r.playerId === myId ? ` (${t('board.you')})` : ''}</span>
        <b>{r.score}</b>
        <span class="tm">{fmtTime(r.timeMs / 1000)}</span>
      </li>
    {:else}
      <li class="empty">{loading ? t('board.loading') : t('board.empty')}</li>
    {/each}
  </ol>
  <p class="local">{t('board.onlineNote')}</p>
  {:else}
  <ol class="list">
    {#each rows as r, i (i)}
      <li class:me={r.source === 'me'}>
        <span class="rk">{i + 1}</span>
        <span class="nm">{r.nick}{r.source === 'me' ? ` (${t('board.you')})` : ' ⚔️'}</span>
        <b>{r.score}</b>
        <span class="tm">{fmtTime(r.time)}</span>
      </li>
    {:else}
      <li class="empty">{t('board.empty')}</li>
    {/each}
  </ol>
  <p class="local">{t('board.localOnly')}</p>
  {/if}
  <div class="foot">
    <button type="button" class="primary" onclick={() => onPlay(game)}>{t('challenge.start')}</button>
  </div>
</div>

<style>
  .lb { position: absolute; inset: 0; z-index: 9; height: 100dvh; background: #15202b; color: #eaf6ff; display: flex; flex-direction: column; gap: 8px; padding: calc(8px + env(safe-area-inset-top)) 12px calc(12px + env(safe-area-inset-bottom)); box-sizing: border-box; }
  .top { display: grid; grid-template-columns: 44px 1fr 44px; align-items: center; }
  h1 { margin: 0; text-align: center; font-size: calc(var(--fs) + 2px); }
  .x { width: 44px; height: 44px; border-radius: 50%; border: 2px solid #39e0ff; background: #0d4a66; color: #fff; font-size: 18px; }
  .tabs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; flex: none; }
  .tabs button { min-height: 44px; border-radius: 12px; border: 2px solid #39a8d8; background: #1d3346; color: #fff; font-weight: 700; }
  .tabs.two { grid-template-columns: repeat(2, 1fr); }
  .tabs.small button { min-height: 36px; }
  .tabs button.on { background: #ffcf4a; color: #3a2a00; border-color: #ffcf4a; }
  .list { flex: 1; min-height: 0; overflow: auto; margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
  .list li { display: grid; grid-template-columns: 28px 1fr auto 56px; gap: 8px; align-items: center; background: #1d3346; border-radius: 10px; padding: 10px; font-variant-numeric: tabular-nums; }
  .list li.me { border: 2px solid #ffcf4a; }
  .list li.empty { display: block; text-align: center; opacity: 0.7; }
  .rk { font-weight: 900; color: #ffcf4a; }
  .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tm { text-align: right; opacity: 0.8; }
  .local { margin: 0; font-size: 12px; opacity: 0.75; text-align: center; }
  .foot { flex: none; display: grid; gap: 8px; }
  .primary { min-height: 52px; border-radius: 14px; font-weight: 800; font-size: var(--fs-sm); }
  .primary { background: #ffcf4a; color: #3a2a00; border: 0; }
</style>
