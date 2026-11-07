<script lang="ts">
  /** Sub-page for one game/module: overview, mechanism/pack, rulesets, stats, leaderboard, recent runs, config, GDD. */
  import { t } from '../../lib/i18n';
  import { currentRuleset, moduleRules, supportedRulesets } from '../../lib/rulesetCatalog';
  import { fmtDate, fmtTime, god, short, ApiError } from './api';
  import { renderMarkdown } from './markdown';

  type Row = Record<string, any>;
  let { id, onError }: { id: string; onError: (e: unknown) => void } = $props();

  /** Module id -> server "game" key (challenge games use short keys; packs use their leaderboardId). */
  const GAME_KEY: Record<string, string> = { crossword: 'cross', jigsaw: 'jig', slide: 'slide' };
  const DIFFS = ['easy', 'medium', 'hard'];

  let reg = $state<Row | null>(null);
  let stats = $state<Row[]>([]);
  let byRuleset = $state<Row[]>([]);
  let tab = $state<'overview' | 'board' | 'gdd'>('overview');
  let diff = $state('easy');
  let rulesetFilter = $state('all');
  let rows = $state<Row[] | null>(null);
  let missing = $state(false);

  const packOf = (m: Row | undefined) => (m?.pack ?? m?.edition ?? null) as Row | null;
  const mod = $derived<Row | undefined>(reg?.modules?.find((m: Row) => m.id === id));
  const pack = $derived(packOf(mod));
  const gameKey = $derived<string | null>(mod ? GAME_KEY[mod.id] ?? pack?.leaderboardId ?? null : null);
  const supported = $derived(gameKey ? supportedRulesets(gameKey) : []);
  const currentKey = $derived(gameKey ? currentRuleset(gameKey) : '');
  const ownRules = $derived(moduleRules(id));
  const packList = $derived<string[]>(mod?.packs ?? mod?.editions ?? []);
  const diffs = $derived(gameKey && !GAME_KEY[id] ? ['easy', 'normal', 'hard'] : DIFFS);
  const modName = (mid: string) => reg?.modules?.find((m: Row) => m.id === mid)?.name ?? mid;
  const diffName = (d: string) => (d === 'normal' ? t('god.games.normal') : t(`challenge.diff.${d}`));
  const kindName = (k: string) => {
    const key = k === 'edition' ? 'pack' : k;
    return t(`god.mod.kind.${key}`) === `god.mod.kind.${key}` ? key : t(`god.mod.kind.${key}`);
  };
  const runsFor = (key: string) => byRuleset.filter((r) => r.game === gameKey && r.ruleset === key).reduce((n, r) => n + Number(r.runs || 0), 0);
  const playersFor = (key: string) => byRuleset.filter((r) => r.game === gameKey && r.ruleset === key).reduce((n, r) => n + Number(r.players || 0), 0);

  async function load() {
    try {
      reg = ((await god<Row>('modules')) as Row).registry;
      const games = await god<Row>('games');
      stats = (games.stats as Row[]) ?? [];
      byRuleset = (games.byRuleset as Row[]) ?? [];
      missing = !mod;
      if (gameKey) { diff = diffs[0]; rulesetFilter = currentRuleset(gameKey); await loadBoard(); }
    } catch (e) { onError(e); }
  }
  async function loadBoard() {
    if (!gameKey) return;
    rows = null;
    const q = new URLSearchParams({ difficulty: diff });
    if (rulesetFilter && rulesetFilter !== 'all') q.set('ruleset', rulesetFilter);
    try { rows = ((await god<Row>(`games/${gameKey}/board?${q}`)) as Row).rows; } catch (e) { onError(e); }
  }
  async function removeRun(r: Row) {
    if (!confirm(t('god.games.confirmRemove', { nick: r.nickname || '?', score: r.score }))) return;
    try { await god(`runs/${encodeURIComponent(r.sessionId)}`, { method: 'DELETE' }); await loadBoard(); } catch (e) { if (!(e instanceof ApiError)) throw e; onError(e); }
  }
  $effect(() => { void id; void load(); });
  const recent = $derived(rows ? [...rows].sort((a, b) => b.ts - a.ts).slice(0, 10) : []);
</script>

{#if missing}
  <p>{t('god.empty')}</p>
{:else if mod}
  <a href="#/games" class="gback">← {t('god.nav.games')}</a>
  <h2 class="title">{mod.name} <code>{mod.id}</code> <span class="tag kind">{kindName(mod.kind)}</span> <b>v{mod.version}</b></h2>
  <p class="note">{mod.description}</p>
  <div class="tabs" role="tablist">
    {#each ['overview', 'board', 'gdd'] as k (k)}
      {#if k !== 'board' || gameKey}
        <button type="button" role="tab" class="chip" class:on={tab === k} aria-selected={tab === k} onclick={() => (tab = k as typeof tab)}>{t(`god.page.${k}`)}</button>
      {/if}
    {/each}
  </div>

  {#if tab === 'overview'}
    <div class="cards">
      <div class="card"><small>{t('god.mod.version')}</small><strong class="sm">v{mod.version}</strong></div>
      <div class="card"><small>{t('god.mod.size')}</small><strong class="sm">{(mod.size / 1024).toFixed(1)} KB · {mod.files} {t('god.mod.files')}</strong></div>
      <div class="card"><small>{t('god.mod.hash')}</small><strong class="sm"><code>{mod.hash}</code></strong></div>
      <div class="card"><small>{t('god.mod.commit')}</small><strong class="sm">{mod.lastCommit ? `${mod.lastCommit.sha.slice(0, 7)} · ${fmtDate(Date.parse(mod.lastCommit.date))}` : '–'}</strong></div>
    </div>
    {#if pack}
      <h3>{t('god.page.mechanism')}</h3>
      <p><a href="#/games/{pack.mechanism}">{modName(pack.mechanism)}</a> <code>{pack.mechanism}</code></p>
      <h3>{t('god.page.config')}</h3>
      <dl>{#each Object.entries(pack) as [k, v] (k)}<dt>{k}</dt><dd>{Array.isArray(v) ? v.join(', ') : String(v)}</dd>{/each}</dl>
    {/if}
    {#if packList.length}
      <h3>{t('god.page.packs')}</h3>
      <ul>{#each packList as e (e)}<li><a href="#/games/{e}">{modName(e)}</a> <code>{e}</code></li>{/each}</ul>
    {/if}
    {#if ownRules}
      <h3>{t('god.page.rulesets')}</h3>
      <p class="note">{t('god.page.rulesetNote')}</p>
      <ul>{#each ownRules.versions as v (v)}<li><code>{id}@{v}</code>{#if v === ownRules.current} · {t('god.page.current')}{/if}{#if v === ownRules.legacy} · {t('god.page.legacy')}{/if}</li>{/each}</ul>
    {/if}
    <h3>{t('god.mod.deps')}</h3>
    <ul>{#each mod.dependsOn as d (d.id)}<li class:bad={!d.ok}>{d.ok ? '✓' : '✗'} <a href="#/games/{d.id}">{d.id}</a> {d.range} <small>({d.version ?? '–'})</small></li>{:else}<li>–</li>{/each}</ul>
    {#if gameKey}
      <h3>{t('god.page.rulesetRuns')}</h3>
      <p class="note">{t('god.page.rulesetNote')} {#if currentKey}<code>{currentKey}</code>{/if}</p>
      <table><thead><tr><th>{t('god.col.ruleset')}</th><th>{t('god.col.runs')}</th><th>{t('god.page.players')}</th></tr></thead>
        <tbody>{#each supported as key (key)}<tr><td><code>{key}</code></td><td>{runsFor(key)}</td><td>{playersFor(key)}</td></tr>{:else}<tr><td colspan="3">{t('god.empty')}</td></tr>{/each}</tbody></table>
      <h3>{t('god.page.stats')}</h3>
      <table><thead><tr><th>{t('god.col.diff')}</th><th>{t('god.col.runs')}</th><th>{t('god.page.players')}</th><th>{t('god.col.best')}</th><th>{t('god.page.fastest')}</th></tr></thead>
        <tbody>{#each diffs as d (d)}{@const s = stats.find((x) => x.game === gameKey && x.difficulty === d)}<tr><td>{diffName(d)}</td><td>{s?.runs ?? 0}</td><td>{s?.players ?? 0}</td><td>{s?.best ?? '–'}</td><td>{s ? fmtTime(s.fastest) : '–'}</td></tr>{/each}</tbody></table>
      <h3>{t('god.page.recent')}</h3>
      <table><tbody>{#each recent as r (r.sessionId)}<tr><td><a href="#/players/{encodeURIComponent(r.playerId)}">{r.nickname || short(r.playerId)}</a></td><td>{r.score}</td><td>{fmtTime(r.timeMs)}</td><td>{fmtDate(r.ts)}</td><td><small>{r.version}</small></td></tr>{:else}<tr><td>{t('god.empty')}</td></tr>{/each}</tbody></table>
    {/if}
  {:else if tab === 'board' && gameKey}
    {#if diffs.length > 1}
      <div class="tabs">{#each diffs as d (d)}<button type="button" class="chip" class:on={diff === d} onclick={() => { diff = d; void loadBoard(); }}>{diffName(d)}</button>{/each}</div>
    {/if}
    {#if supported.length}
      <div class="tabs">{#each ['all', ...supported] as key (key)}<button type="button" class="chip" class:on={rulesetFilter === key} onclick={() => { rulesetFilter = key; void loadBoard(); }}>{key === 'all' ? t('god.board.allRulesets') : key}</button>{/each}</div>
    {/if}
    {#if rows}
      <table class="wide"><thead><tr><th>#</th><th>{t('god.col.nick')}</th><th>{t('god.col.score')}</th><th>{t('god.col.time')}</th><th>{t('god.col.verified')}</th><th>{t('god.col.when')}</th><th></th></tr></thead>
        <tbody>{#each rows as r, i (r.sessionId)}<tr><td>{i + 1}</td><td><a href="#/players/{encodeURIComponent(r.playerId)}">{r.nickname || short(r.playerId)}</a></td><td>{r.score}</td><td>{fmtTime(r.timeMs)}</td><td>{r.verified ? '✓' : '–'}</td><td>{fmtDate(r.ts)}</td><td><button type="button" class="danger sm" onclick={() => removeRun(r)}>{t('god.games.remove')}</button></td></tr>
        {:else}<tr><td colspan="7">{t('god.empty')}</td></tr>{/each}</tbody></table>
    {:else}<p>{t('god.loading')}</p>{/if}
  {:else if tab === 'gdd'}
    {#if mod.gddMarkdown}
      <p class="note"><code>{mod.gdd}</code></p>
      <article class="gdd">{@html renderMarkdown(mod.gddMarkdown)}</article>
    {:else}<p>{t('god.empty')}</p>{/if}
  {/if}
{:else}
  <p>{t('god.loading')}</p>
{/if}

<style>
  .title { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .tabs { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0 14px; }
  .chip { border-radius: 999px; padding: 6px 14px; background: transparent; font-weight: 600; border: 1px solid var(--cyan); color: #fff; }
  .chip.on { background: var(--cyan); color: #06212f; }
  .gback { display: inline-block; margin-bottom: 6px; color: var(--cyan); }
  .bad { color: #ff9a9a; }
  .tag.kind { font-size: 0.75em; padding: 1px 8px; border-radius: 6px; background: #12324a; color: var(--cyan); }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px; margin-bottom: 12px; }
  .card { background: #111e2c; border: 1px solid #234; border-radius: 12px; padding: 12px; display: grid; gap: 4px; }
  .card strong { color: var(--cyan); }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; font-size: 0.9em; }
  dt { opacity: 0.7; }
  dd { margin: 0; word-break: break-word; }
  table { width: 100%; border-collapse: collapse; font-size: 0.92em; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #1f2d3c; vertical-align: top; }
  a { color: var(--cyan); }
  button.danger { background: #5a1620; border: 1px solid #ff6b7a; color: #fff; border-radius: 8px; padding: 4px 8px; }
  .note { opacity: 0.7; font-size: 0.9em; }
  .gdd { background: #0f1a27; border: 1px solid #234; border-radius: 12px; padding: 4px 18px 16px; line-height: 1.6; max-width: 900px; }
  .gdd :global(h2) { font-size: 1.3em; color: var(--cyan); }
  .gdd :global(h3) { font-size: 1.1em; margin-top: 18px; }
  .gdd :global(table) { margin: 8px 0; }
  .gdd :global(code) { background: #0b1622; padding: 1px 5px; border-radius: 4px; }
  .gdd :global(pre) { background: #0b1622; padding: 10px; border-radius: 8px; overflow: auto; }
  .gdd :global(blockquote) { border-left: 3px solid var(--cyan); margin: 8px 0; padding-left: 10px; opacity: 0.85; }
  @media (max-width: 760px) { table { display: block; overflow-x: auto; white-space: nowrap; } .gdd { padding: 4px 10px 12px; } }
</style>
