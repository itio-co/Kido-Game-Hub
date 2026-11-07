<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '../lib/i18n';
  import { ApiError, fmtDate, fmtTime, god, short } from './api';
  import GodModule from './GodModule.svelte';
  import '../app.css';
  import { version } from '../../package.json';

  type Row = Record<string, any>;
  type Section = 'dashboard' | 'players' | 'games' | 'events' | 'modules';
  const SECTIONS: Section[] = ['dashboard', 'players', 'games', 'events', 'modules'];
  const DIFFS = ['easy', 'medium', 'hard'];

  let authed = $state<boolean | null>(null);
  let notConfigured = $state(false);
  let password = $state('');
  let loginError = $state('');
  let busy = $state(false);
  // Path deep links (/never/god/games/stirfry) map onto the hash router.
  const deep = /\/god\/(.+)$/.exec(location.pathname);
  if (deep && !location.hash) history.replaceState(null, '', `${location.pathname.slice(0, location.pathname.indexOf('/god/'))}/god#/${deep[1]}`);
  let route = $state(location.hash);
  let drawer = $state(false);
  let data = $state<Row | null>(null);
  let detail = $state<Row | null>(null);
  let loadError = $state('');
  let query = $state('');
  let boardGame = $state('cross');
  let boardDiff = $state('easy');
  let board = $state<Row[] | null>(null);
  let toast = $state('');
  let renameTo = $state('');
  let confirmText = $state('');
  const KIND_ORDER = ['core', 'engine', 'edition', 'feature', 'minigame', 'event'];
  const GAME_MODULE: Record<string, string> = { cross: 'crossword', jig: 'jigsaw', slide: 'slide', stirfry: 'stirfry' };
  let kindFilter = $state('all');
  let collapsed = $state<Record<string, boolean>>({});
  const kindName = (k: string) => (t(`god.mod.kind.${k}`) === `god.mod.kind.${k}` ? k : t(`god.mod.kind.${k}`));

  const parts = $derived(route.replace(/^#\/?/, '').split('/'));
  const section = $derived<Section>(SECTIONS.includes(parts[0] as Section) ? (parts[0] as Section) : 'dashboard');
  const playerId = $derived(section === 'players' && parts[1] ? decodeURIComponent(parts[1]) : null);
  const subId = $derived((section === 'games' || section === 'modules') && parts[1] ? decodeURIComponent(parts[1]) : null);
  const modules = $derived<Row[]>(section === 'modules' && Array.isArray(data?.modules) ? data.modules : []);
  const kinds = $derived.by((): string[] => {
    const present = [...new Set(modules.map((m) => String(m.kind)))];
    return [...KIND_ORDER.filter((k) => present.includes(k)), ...present.filter((k) => !KIND_ORDER.includes(k)).sort()];
  });

  const gameName = (g: string) => t(`god.game.${g}`);
  const diffName = (d: string) => (d === 'normal' ? t('god.games.normal') : t(`challenge.diff.${d}`));
  function flash(msg: string) { toast = msg; setTimeout(() => (toast = ''), 2500); }
  function errText(e: unknown): string {
    if (e instanceof ApiError) {
      if (e.status === 401) { authed = false; return t('god.err.session'); }
      return t('god.err.api', { code: e.code });
    }
    return t('god.err.api', { code: '?' });
  }

  async function checkSession() {
    try { await god('me'); authed = true; } catch (e) {
      authed = false;
      notConfigured = e instanceof ApiError && e.code === 'not-configured';
    }
  }

  async function login(event: SubmitEvent) {
    event.preventDefault();
    busy = true; loginError = '';
    try {
      await god('login', { method: 'POST', body: JSON.stringify({ password }) });
      password = ''; authed = true; void load();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'locked') loginError = t('god.login.locked', { min: Math.ceil(Number(e.data.retryAfterSec ?? 900) / 60) });
      else if (e instanceof ApiError && e.code === 'bad-password') loginError = t('god.login.bad', { n: Number(e.data.attemptsLeft ?? 0) });
      else if (e instanceof ApiError && e.code === 'not-configured') { notConfigured = true; loginError = t('god.login.notConfigured'); }
      else loginError = errText(e);
    } finally { busy = false; }
  }

  async function logout() {
    try { await god('logout', { method: 'POST' }); } catch { /* ignore */ }
    authed = false;
  }

  async function load() {
    if (!authed) return;
    loadError = ''; data = null; detail = null;
    try {
      if (section === 'dashboard') data = await god<Row>('dashboard');
      else if (section === 'players') {
        if (playerId) { detail = await god<Row>(`players/${encodeURIComponent(playerId)}`); renameTo = String(detail.player?.nickname ?? ''); confirmText = ''; }
        else data = await god<Row>(`players?q=${encodeURIComponent(query)}`);
      } else if (subId) { data = null; }
      else if (section === 'games') { data = await god<Row>('games'); await loadBoard(); }
      else if (section === 'events') data = await god<Row>('events');
      else if (section === 'modules') data = ((await god<Row>('modules')) as Row).registry;
    } catch (e) { loadError = errText(e); }
  }

  async function loadBoard() {
    board = null;
    try { board = ((await god(`games/${boardGame}/board?difficulty=${boardDiff}`)) as Row).rows; } catch (e) { loadError = errText(e); }
  }

  async function rename() {
    if (!detail) return;
    try {
      await god(`players/${encodeURIComponent(detail.player.playerId)}`, { method: 'PATCH', body: JSON.stringify({ nickname: renameTo }) });
      flash(t('god.player.renamed')); await load();
    } catch (e) { flash(errText(e)); }
  }

  async function removePlayer() {
    if (!detail) return;
    const id = String(detail.player.playerId);
    if (confirmText.trim() !== short(id)) return;
    try {
      await god(`players/${encodeURIComponent(id)}`, { method: 'DELETE' });
      flash(t('god.player.deleted')); location.hash = '#/players';
    } catch (e) { flash(errText(e)); }
  }

  async function removeRun(row: Row) {
    if (!confirm(t('god.games.confirmRemove', { nick: row.nickname || '?', score: row.score }))) return;
    try {
      await god(`runs/${encodeURIComponent(row.sessionId)}`, { method: 'DELETE' });
      flash(t('god.games.removed')); await loadBoard();
    } catch (e) { flash(errText(e)); }
  }

  function statFor(game: string, diff: string): Row | undefined {
    return (data?.stats as Row[] | undefined)?.find((s) => s.game === game && s.difficulty === diff);
  }

  onMount(() => {
    const onHash = () => { route = location.hash; drawer = false; };
    addEventListener('hashchange', onHash);
    void checkSession();
    return () => removeEventListener('hashchange', onHash);
  });

  $effect(() => {
    void route;
    if (authed) void load();
  });
</script>

{#if authed === null}
  <p class="center">{t('god.loading')}</p>
{:else if !authed}
  <main class="login">
    <form onsubmit={login}>
      <h1>Game of Dev</h1>
      <p>{t('god.login.subtitle')}</p>
      {#if notConfigured}<p class="warn">{t('god.login.notConfigured')}</p>{/if}
      <label>{t('god.login.password')}
        <input type="password" autocomplete="current-password" bind:value={password} required />
      </label>
      <button type="submit" disabled={busy || !password}>{busy ? t('god.loading') : t('god.login.submit')}</button>
      {#if loginError}<p class="gerr" role="alert">{loginError}</p>{/if}
    </form>
  </main>
{:else}
  <div class="shell">
    <header>
      <b>Game of Dev</b>
      <span class="crumb">{t(`god.nav.${section}`)}</span>
      <button type="button" class="burger" aria-label={t('god.menu')} onclick={() => (drawer = !drawer)}>☰</button>
    </header>
    <main class="content">
      {#if loadError}<p class="gerr">{loadError} <button type="button" onclick={load}>{t('god.retry')}</button></p>{/if}

      {#if section === 'dashboard' && data}
        <div class="cards">
          {#each [['players', data.counts.players], ['runs', data.counts.runs], ['active24', data.counts.active24], ['active7', data.counts.active7], ['new7', data.counts.new7]] as [k, v] (k)}
            <div class="card"><small>{t(`god.dash.${k}`)}</small><strong>{v}</strong></div>
          {/each}
        </div>
        <h2>{t('god.dash.byGame')}</h2>
        <table><thead><tr><th>{t('god.col.game')}</th><th>{t('god.col.diff')}</th><th>{t('god.col.runs')}</th><th>{t('god.col.best')}</th></tr></thead>
          <tbody>{#each data.byGame as r (r.game + r.difficulty)}<tr><td>{gameName(r.game)}</td><td>{diffName(r.difficulty)}</td><td>{r.n}</td><td>{r.best}</td></tr>{:else}<tr><td colspan="4">{t('god.empty')}</td></tr>{/each}</tbody></table>
        <div class="two">
          <section><h2>{t('god.dash.recentRuns')}</h2>
            <table><tbody>{#each data.recentRuns as r (r.sessionId)}<tr><td><a href="#/players/{encodeURIComponent(r.playerId)}">{r.nickname || short(r.playerId)}</a></td><td>{gameName(r.game)} · {diffName(r.difficulty)}</td><td>{r.score}</td><td>{fmtDate(r.ts)}</td></tr>{:else}<tr><td>{t('god.empty')}</td></tr>{/each}</tbody></table>
          </section>
          <section><h2>{t('god.dash.recentPlayers')}</h2>
            <table><tbody>{#each data.recentPlayers as p (p.playerId)}<tr><td><a href="#/players/{encodeURIComponent(p.playerId)}">{p.nickname || t('god.noName')}</a></td><td><code>{short(p.playerId)}</code></td><td>{fmtDate(p.created_at)}</td></tr>{:else}<tr><td>{t('god.empty')}</td></tr>{/each}</tbody></table>
          </section>
        </div>
        <p class="note">{t('god.dash.note', { at: fmtDate(data.now) })}</p>
      {:else if section === 'players' && !playerId}
        <form class="search" onsubmit={(e) => { e.preventDefault(); void load(); }}>
          <input type="search" placeholder={t('god.player.search')} bind:value={query} />
          <button type="submit">{t('god.player.searchBtn')}</button>
        </form>
        {#if data}
          <table class="wide"><thead><tr><th>{t('god.col.nick')}</th><th>ID</th><th>{t('god.col.created')}</th><th>{t('god.col.lastSeen')}</th><th>{t('god.col.runs')}</th><th>{t('god.col.best')}</th><th>{t('god.col.events')}</th></tr></thead>
            <tbody>{#each data.players as p (p.playerId)}
              <tr><td><a href="#/players/{encodeURIComponent(p.playerId)}">{p.nickname || t('god.noName')}</a>{#if !p.registered}<span class="tag">{t('god.player.unclaimed')}</span>{/if}</td><td><code>{short(p.playerId)}</code></td><td>{fmtDate(p.created_at)}</td><td>{fmtDate(p.last_seen)}</td><td>{p.runs}</td><td>{p.best ?? '–'}</td><td>{p.events ? String(p.events).split(',').map((s) => { const [id, st] = s.split(':'); return `${id} ${t(`god.status.${st}`)}`; }).join(', ') : '–'}</td></tr>
            {:else}<tr><td colspan="7">{t('god.empty')}</td></tr>{/each}</tbody></table>
        {/if}
      {:else if section === 'players' && detail}
        <a href="#/players" class="gback">← {t('god.player.back')}</a>
        <h2>{detail.player.nickname || t('god.noName')} <code>{detail.player.playerId}</code></h2>
        <div class="cards">
          <div class="card"><small>{t('god.col.created')}</small><strong class="sm">{fmtDate(detail.player.created_at)}</strong></div>
          <div class="card"><small>{t('god.col.lastSeen')}</small><strong class="sm">{fmtDate(detail.player.last_seen)}</strong></div>
          <div class="card"><small>{t('god.col.runs')}</small><strong>{detail.runs.length}</strong></div>
          <div class="card"><small>{t('god.player.registered')}</small><strong class="sm">{detail.player.registered ? t('god.yes') : t('god.no')}</strong></div>
        </div>
        <div class="two">
          <section><h2>{t('god.player.state')}</h2>
            {#if detail.state}<p class="note">rev {detail.state.rev} · {detail.state.bytes} B · {fmtDate(detail.state.updated_at)}</p>
              {#if detail.state.summary}<dl>{#each Object.entries(detail.state.summary) as [k, v] (k)}<dt>{k}</dt><dd>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>{/each}</dl>{/if}
            {:else}<p>{t('god.empty')}</p>{/if}
            <h2>{t('god.player.home')}</h2>
            {#if detail.home}<p class="note">rev {detail.home.rev} · {detail.home.bytes} B · {fmtDate(detail.home.updated_at)}</p><pre>{JSON.stringify(detail.home.data, null, 1).slice(0, 1200)}</pre>{:else}<p>{t('god.empty')}</p>{/if}
          </section>
          <section><h2>{t('god.player.events')}</h2>
            {#each detail.events as e (e.eventId)}<p><b>{e.eventId}</b> · {t(`god.status.${e.status}`)} · {t('god.player.evidence')} {Array.isArray(e.progress?.evidence) ? e.progress.evidence.length : 0}/5 · {fmtDate(e.updated_at)}</p>{:else}<p>{t('god.empty')}</p>{/each}
            <h2>{t('god.player.runs')}</h2>
            <table><tbody>{#each detail.runs as r (r.sessionId)}<tr><td>{gameName(r.game)} · {diffName(r.difficulty)}</td><td>{r.score}</td><td>{fmtTime(r.timeMs)}</td><td>{r.verified ? '✓' : ''}</td><td>{fmtDate(r.ts)}</td></tr>{:else}<tr><td>{t('god.empty')}</td></tr>{/each}</tbody></table>
          </section>
        </div>
        <section class="admin">
          <h2>{t('god.player.manage')}</h2>
          <form class="search" onsubmit={(e) => { e.preventDefault(); void rename(); }}>
            <input bind:value={renameTo} maxlength="24" aria-label={t('god.player.rename')} />
            <button type="submit" disabled={!renameTo.trim()}>{t('god.player.rename')}</button>
          </form>
          <p class="danger-note">{t('god.player.deleteHelp', { code: short(detail.player.playerId) })}</p>
          <form class="search" onsubmit={(e) => { e.preventDefault(); void removePlayer(); }}>
            <input bind:value={confirmText} placeholder={short(detail.player.playerId)} aria-label={t('god.player.delete')} />
            <button type="submit" class="danger" disabled={confirmText.trim() !== short(detail.player.playerId)}>{t('god.player.delete')}</button>
          </form>
        </section>
      {:else if subId}
        {#key subId}<GodModule id={subId} onError={(e) => (loadError = errText(e))} />{/key}
      {:else if section === 'games' && data}
        <table class="wide"><thead><tr><th>{t('god.col.game')}</th>{#each DIFFS as d (d)}<th>{diffName(d)}<br /><small>{t('god.games.cell')}</small></th>{/each}</tr></thead>
          <tbody>{#each data.games as g (g)}<tr><td><a href="#/games/{GAME_MODULE[g] ?? g}">{gameName(g)}</a></td>
            {#if g === 'stirfry'}{#each ['easy', 'normal', 'hard'] as d (d)}{@const s = statFor(g, d)}<td>{#if s}{d === 'normal' ? `${t('god.games.normal')}: ` : ''}{s.runs} · {s.players} · <b>{s.best}</b> · {fmtTime(s.fastest)}{:else}–{/if}</td>{/each}
            {:else}{#each DIFFS as d (d)}{@const s = statFor(g, d)}<td>{#if s}{s.runs} · {s.players} · <b>{s.best}</b> · {fmtTime(s.fastest)}{:else}–{/if}</td>{/each}{/if}
          </tr>{/each}</tbody></table>
        <h2>{t('god.games.board')}</h2>
        <div class="search">
          <select bind:value={boardGame} onchange={() => { boardDiff = boardGame === 'stirfry' ? 'normal' : 'easy'; void loadBoard(); }}>{#each ['cross', 'jig', 'slide', 'stirfry'] as g (g)}<option value={g}>{gameName(g)}</option>{/each}</select>
          <select bind:value={boardDiff} onchange={loadBoard}>{#each boardGame === 'stirfry' ? ['easy', 'normal', 'hard'] : DIFFS as d (d)}<option value={d}>{diffName(d)}</option>{/each}</select>
        </div>
        {#if board}
          <table class="wide"><thead><tr><th>#</th><th>{t('god.col.nick')}</th><th>{t('god.col.score')}</th><th>{t('god.col.time')}</th><th>{t('god.col.verified')}</th><th>{t('god.col.when')}</th><th></th></tr></thead>
            <tbody>{#each board as r, i (r.sessionId)}<tr><td>{i + 1}</td><td><a href="#/players/{encodeURIComponent(r.playerId)}">{r.nickname || short(r.playerId)}</a></td><td>{r.score}</td><td>{fmtTime(r.timeMs)}</td><td>{r.verified ? '✓' : '–'}</td><td>{fmtDate(r.ts)}</td><td><button type="button" class="danger sm" onclick={() => removeRun(r)}>{t('god.games.remove')}</button></td></tr>
            {:else}<tr><td colspan="7">{t('god.empty')}</td></tr>{/each}</tbody></table>
        {/if}
      {:else if section === 'events' && data}
        {#each data.events as e (e.eventId)}
          <section class="event">
            <h2>{t(`god.event.${e.eventId}`) === `god.event.${e.eventId}` ? e.eventId : t(`god.event.${e.eventId}`)}</h2>
            <div class="cards">
              <div class="card"><small>{t('god.events.started')}</small><strong>{e.started}</strong></div>
              <div class="card"><small>{t('god.events.completed')}</small><strong>{e.completed}</strong></div>
              <div class="card"><small>{t('god.events.rate')}</small><strong>{e.started ? Math.round((e.completed / e.started) * 100) : 0}%</strong></div>
            </div>
            <h3>{t('god.events.funnel')}</h3>
            {#each data.steps as step (step)}
              <div class="bar"><span>{t(`god.step.${step}`)}</span><i style="width:{e.started ? (e.funnel[step] / e.started) * 100 : 0}%"></i><b>{e.funnel[step]}</b></div>
            {/each}
          </section>
        {:else}<p>{t('god.empty')}</p>{/each}
        <p class="note">{t('god.events.note')}</p>
      {:else if section === 'modules' && data}
        <p class="note">{t('god.mod.app', { v: data.appVersion, at: fmtDate(Date.parse(data.generatedAt)) })}</p>
        <div class="chips" role="group" aria-label={t('god.mod.kind')}>
          <button type="button" class="chip" class:on={kindFilter === 'all'} aria-pressed={kindFilter === 'all'} onclick={() => (kindFilter = 'all')}>{t('god.mod.all')} <small>{modules.length}</small></button>
          {#each kinds as k (k)}
            <button type="button" class="chip" class:on={kindFilter === k} aria-pressed={kindFilter === k} onclick={() => (kindFilter = k)}>{kindName(k)} <small>{modules.filter((m) => m.kind === k).length}</small></button>
          {/each}
        </div>
        {#each kinds.filter((k) => kindFilter === 'all' || kindFilter === k) as k (k)}
          {@const mods = modules.filter((m) => m.kind === k).sort((x, y) => String(x.name).localeCompare(String(y.name)))}
          <section class="kgroup">
            <button type="button" class="khead" aria-expanded={!collapsed[k]} onclick={() => (collapsed = { ...collapsed, [k]: !collapsed[k] })}>
              <span class="caret">{collapsed[k] ? '▸' : '▾'}</span> <b>{kindName(k)}</b> <span class="tag kind">{mods.length}</span>
            </button>
            {#if !collapsed[k]}
              <table class="wide"><thead><tr><th>{t('god.mod.name')}</th><th>{t('god.mod.version')}</th><th>{t('god.mod.deps')}</th><th>{t('god.mod.size')}</th><th>{t('god.mod.hash')}</th><th>{t('god.mod.commit')}</th></tr></thead>
                <tbody>{#each mods as m (m.id)}
                  <tr><td><a href="#/modules/{m.id}"><b>{m.name}</b></a><br /><code>{m.id}</code>{#if m.edition}<br /><small>↳ {m.edition.mechanism}</small>{/if}</td><td><b>{m.version}</b></td>
                    <td>{#each m.dependsOn as d (d.id)}<div class:bad={!d.ok}>{d.ok ? '✓' : '✗'} {d.id} {d.range} <small>({d.version ?? '–'})</small></div>{:else}–{/each}</td>
                    <td>{(m.size / 1024).toFixed(1)} KB<br /><small>{m.files} {t('god.mod.files')}</small></td><td><code>{m.hash}</code></td>
                    <td>{#if m.lastCommit}<code>{m.lastCommit.sha.slice(0, 7)}</code> <small>{fmtDate(Date.parse(m.lastCommit.date))}</small><br /><small>{m.lastCommit.subject}</small>{:else}–{/if}</td></tr>
                {/each}</tbody></table>
            {/if}
          </section>
        {/each}
        <p class="note">{t('god.mod.note')}</p>
      {:else if !loadError}
        <p class="center">{t('god.loading')}</p>
      {/if}
    </main>
    {#if drawer}<button type="button" class="scrim-god" aria-label={t('god.close')} onclick={() => (drawer = false)}></button>{/if}
    <nav class:open={drawer}>
      {#each SECTIONS as s (s)}
        <a href="#/{s}" class:on={section === s}>{t(`god.nav.${s}`)}</a>
      {/each}
      <button type="button" class="logout" onclick={logout}>{t('god.logout')}</button>
      <small class="ver">v{version}</small>
    </nav>
    {#if toast}<p class="toast-god" role="status">{toast}</p>{/if}
  </div>
{/if}

<style>
  :global(body) { overflow: auto !important; background: #0d1117; }
  :global(#god) { min-height: 100vh; }
  .center { text-align: center; padding: 40px; }
  .login { min-height: 100vh; display: grid; place-items: center; padding: 16px; }
  .login form { width: min(360px, 100%); background: var(--hud); border: 2px solid var(--cyan); border-radius: 16px; padding: 24px; display: grid; gap: 12px; }
  .login h1 { margin: 0; color: var(--cyan); }
  .login p { margin: 0; opacity: 0.85; }
  label { display: grid; gap: 6px; }
  input, select { padding: 10px 12px; border-radius: 10px; border: 1px solid #355; background: #0b1622; color: #fff; }
  button { padding: 10px 14px; border-radius: 10px; border: 1px solid var(--cyan); background: #12324a; color: #fff; font-weight: 700; cursor: pointer; }
  button:disabled { opacity: 0.45; cursor: default; }
  button.danger { background: #5a1620; border-color: #ff6b7a; }
  button.sm { padding: 4px 8px; font-size: 0.85em; }
  .gerr { color: #ff9a9a; }
  .warn { color: #ffd479; }
  .shell { display: grid; grid-template-columns: 220px 1fr; grid-template-rows: auto 1fr; min-height: 100vh; }
  header { grid-column: 1 / -1; display: flex; gap: 12px; align-items: center; padding: 12px 20px; border-bottom: 1px solid #234; background: #0b1520; }
  header b { color: var(--cyan); font-size: 1.2em; }
  .crumb { opacity: 0.7; }
  .burger { display: none; order: -1; }
  .content { grid-column: 2; grid-row: 2; padding: 20px; overflow-x: auto; min-width: 0; }
  nav { grid-column: 1; grid-row: 2; border-right: 1px solid #234; background: #0b1520; padding: 16px 12px; display: flex; flex-direction: column; gap: 6px; }
  nav a { padding: 10px 14px; border-radius: 10px; color: var(--ink); text-decoration: none; }
  nav a.on { background: #12324a; color: var(--cyan); font-weight: 700; }
  nav .logout { margin-top: auto; background: transparent; }
  .ver { opacity: 0.5; text-align: center; }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; margin-bottom: 16px; }
  .card { background: #111e2c; border: 1px solid #234; border-radius: 12px; padding: 12px; display: grid; gap: 4px; }
  .card strong { font-size: 1.8em; color: var(--cyan); }
  .card strong.sm { font-size: 1em; }
  h2 { font-size: 1.1em; margin: 18px 0 8px; }
  h3 { font-size: 1em; margin: 12px 0 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 0.92em; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #1f2d3c; vertical-align: top; }
  th { opacity: 0.7; font-weight: 700; }
  a { color: var(--cyan); }
  code { font-size: 0.85em; opacity: 0.8; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .note { opacity: 0.6; font-size: 0.85em; }
  .search { display: flex; gap: 8px; margin: 8px 0 16px; flex-wrap: wrap; }
  .search input { flex: 1; min-width: 160px; }
  .bad { color: #ff9a9a; }
  .tag.kind { background: #12324a; color: var(--cyan); margin: 0; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 16px; }
  .chip { border-radius: 999px; padding: 6px 14px; background: transparent; font-weight: 600; }
  .chip.on { background: var(--cyan); color: #06212f; }
  .chip small { opacity: 0.75; margin-left: 4px; }
  .kgroup { margin-bottom: 18px; border: 1px solid #234; border-radius: 12px; padding: 4px 12px 8px; background: #0f1a27; }
  .khead { width: 100%; text-align: left; background: transparent; border: 0; padding: 10px 0; display: flex; gap: 8px; align-items: center; font-size: 1.05em; }
  .caret { width: 1em; color: var(--cyan); }
  .tag { margin-left: 6px; font-size: 0.75em; padding: 1px 6px; border-radius: 6px; background: #3a3020; color: #ffd479; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; font-size: 0.9em; }
  dt { opacity: 0.7; }
  dd { margin: 0; word-break: break-all; }
  pre { background: #0b1622; padding: 10px; border-radius: 10px; font-size: 0.8em; overflow: auto; max-height: 260px; }
  .admin { margin-top: 24px; padding: 16px; border: 1px solid #5a1620; border-radius: 12px; }
  .danger-note { color: #ffb3bb; font-size: 0.9em; }
  .gback { display: inline-block; margin-bottom: 8px; }
  .event { background: #111e2c; border: 1px solid #234; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
  .bar { display: grid; grid-template-columns: 170px 1fr 40px; align-items: center; gap: 8px; margin: 4px 0; }
  .bar i { display: block; height: 14px; border-radius: 7px; background: linear-gradient(90deg, #39e0ff, #2a8cff); min-width: 2px; }
  .bar b { text-align: right; }
  .toast-god { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: var(--hud); border: 1px solid var(--cyan); padding: 10px 16px; border-radius: 12px; }
  .scrim-god { display: none; }
  @media (max-width: 760px) {
    .shell { grid-template-columns: 1fr; }
    .burger { display: block; }
    .content { grid-column: 1; padding: 12px; }
    .two { grid-template-columns: 1fr; }
    nav { position: fixed; top: 0; left: 0; bottom: 0; width: 240px; z-index: 30; transform: translateX(-100%); transition: transform 0.2s; }
    nav.open { transform: none; }
    .scrim-god { display: block; position: fixed; inset: 0; z-index: 29; background: rgba(0, 0, 0, 0.5); border: 0; border-radius: 0; }
    table.wide { display: block; overflow-x: auto; white-space: nowrap; }
    .bar { grid-template-columns: 120px 1fr 32px; }
  }
</style>
