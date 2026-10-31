<script lang="ts">
  import { onMount } from 'svelte';
  import EditorView from './components/EditorView.svelte';
  import CompareView from './components/CompareView.svelte';
  import LayersView from './components/LayersView.svelte';
  import CalendarPanel from './components/CalendarPanel.svelte';
  import DemoRibbon from './components/DemoRibbon.svelte';
  import FlowView from './components/flow/FlowView.svelte';
  import Hud from './components/Hud.svelte';
  import Onboarding from './components/Onboarding.svelte';
  import RoomView from './components/RoomView.svelte';
  import ShowcaseView from './components/ShowcaseView.svelte';
  import SettingsPanel from './components/SettingsPanel.svelte';
  import Sheet from './components/Sheet.svelte';
  import VersionBadge from './components/VersionBadge.svelte';
  import { loadFlow } from './lib/flow/loadFlow';
  import { createFlow } from './lib/flow/session.svelte';
  import { loadPlayerRoom } from './lib/loadRoom';
  import { t, type MessageKey } from './lib/i18n/core';
  import { tx, txList } from './lib/i18n/content';
  import { locale, scopeOfHash } from './lib/i18n/locale.svelte';
  import { readSave, writeSave } from './lib/save';
  import type { CalendarEntity, PlayerRoom, SaveV1, TextSize } from './lib/types';

  let room = $state<PlayerRoom | null>(null);
  let save = $state<SaveV1>(readSave());
  let error = $state<string | null>(null);
  let overlay = $state<null | 'calendar' | 'settings' | 'decor'>(null);
  let decorSlotId = $state<string | null>(null);
  let selectedId = $state<string | null>(null);
  let hintId = $state<string | null>(null);
  let toast = $state<string | null>(null);
  let tutorIndex = $state(0);
  let showTutor = $state(!save.player.onboardingComplete);

  let toastTimer = 0;
  let hintTimer = 0;
  let hintTier = 0;
  let route = $state(window.location.hash);
  const showcasing = $derived(route.startsWith('#/showcase'));
  const editing = $derived(route.startsWith('#/editor'));
  const comparing = $derived(route.startsWith('#/compare'));
  const layering = $derived(route.startsWith('#/layers'));

  const calendar = $derived.by((): CalendarEntity | null => {
    const found = room?.objects.find((obj) => obj.kind === 'calendar');
    return found && found.kind === 'calendar' ? found : null;
  });
  const themeId = $derived.by(() => {
    if (!calendar) return '';
    const saved = save.player.calendarTheme;
    if (saved && calendar.themes.some((theme) => theme.id === saved)) return saved;
    return calendar.theme;
  });
  /** Decor ids from the save, shown with their localized label. */
  const decorLabels = $derived(
    Object.fromEntries(
      Object.entries(save.player.decor).map(([slot, id]) => [slot, id ? t(`game.decor.${id}` as MessageKey) : null]),
    ),
  );
  const decorHotspot = $derived(
    room?.hotspots.find((hotspot) => hotspot.kind === 'decor-slot' && hotspot.id === decorSlotId) ?? null,
  );

  const session = createFlow((progress) => {
    save.flow = progress;
    save.knowledge.evidence = [...progress.evidence];
    if (progress.solved && !save.knowledge.solvedCaseIds.includes('case-01')) {
      save.knowledge.solvedCaseIds = [...save.knowledge.solvedCaseIds, 'case-01'];
    }
    commit();
  });

  function commit(): void {
    writeSave($state.snapshot(save));
  }

  function showToast(message: string): void {
    toast = message;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast = null;
    }, 2200);
  }

  function choose(id: string): void {
    if (!room) return;
    if (selectedId === id) {
      const hotspot = room.hotspots.find((item) => item.id === id);
      selectedId = null;
      if (!hotspot) return;
      if (hotspot.kind === 'decor-slot') {
        decorSlotId = hotspot.id;
        overlay = 'decor';
      } else if (hotspot.action === 'event-select') void session.go('event-select');
      else if (hotspot.action === 'practice') void session.go('practice');
      else if (hotspot.action === 'calendar') overlay = 'calendar';
      else if (hotspot.action === 'case-board') void session.go('notebook');
      return;
    }
    selectedId = id;
  }

  function onBack(): void {
    if (overlay) {
      overlay = null;
      return;
    }
    if (session.screen !== 'player-room') {
      void session.back();
      return;
    }
    if (room) showToast(tx(room.hud, 'hereToast'));
  }

  function onHint(): void {
    if (session.screen !== 'player-room') {
      session.exploreHint();
      return;
    }
    if (!room) return;
    hintTier = hintTier >= 2 ? 1 : hintTier + 1;
    save.knowledge.exploreHints += 1;
    commit();
    const lines = txList(room.hud, 'hintLines');
    const line = lines[hintTier - 1] ?? lines[0];
    showToast(line);
    window.clearTimeout(hintTimer);
    if (hintTier === 2) {
      hintId = room.hud.hintTarget;
      hintTimer = window.setTimeout(() => {
        hintId = null;
      }, 2500);
    } else {
      hintId = null;
    }
  }

  function setTextSize(size: TextSize): void {
    save.player.textSize = size;
    commit();
  }

  function setSound(enabled: boolean): void {
    save.player.soundEnabled = enabled;
    commit();
    showToast(enabled ? t('game.sound.on') : t('game.sound.off'));
  }

  function setTheme(id: string): void {
    save.player.calendarTheme = id;
    commit();
  }

  function placeReward(): void {
    if (!decorSlotId || !session.reward) return;
    const next = { ...save.player.decor };
    for (const key of Object.keys(next)) {
      if (next[key] === 'photo') next[key] = null;
    }
    next[decorSlotId] = 'photo';
    save.player.decor = next;
    commit();
    overlay = null;
    showToast(t('game.decor.placed'));
  }

  function finishTutor(): void {
    if (!room) return;
    if (tutorIndex >= room.onboarding.length - 1) {
      showTutor = false;
      save.player.onboardingComplete = true;
      commit();
      return;
    }
    tutorIndex += 1;
  }

  onMount(() => {
    const ac = new AbortController();
    loadPlayerRoom()
      .then((loaded) => {
        if (!ac.signal.aborted) room = loaded;
      })
      .catch((reason: unknown) => {
        if (!ac.signal.aborted) error = reason instanceof Error ? reason.message : t('game.error.roomLoad');
      });
    const onHash = () => {
      route = window.location.hash;
      locale.setScope(scopeOfHash(route));
    };
    window.addEventListener('hashchange', onHash);
    loadFlow()
      .then((loaded) => {
        if (!ac.signal.aborted) session.use(loaded.flow, loaded.screens, save.flow);
      })
      .catch((reason: unknown) => {
        if (!ac.signal.aborted) showToast(reason instanceof Error ? reason.message : t('game.error.flowLoad'));
      });
    return () => {
      ac.abort();
      window.removeEventListener('hashchange', onHash);
      window.clearTimeout(toastTimer);
      window.clearTimeout(hintTimer);
    };
  });
</script>

<div class="phone" class:wide={editing} data-text={save.player.textSize}>
  <VersionBadge />
  {#if editing}
    <EditorView />
  {:else if error}
    <p class="error">{error}</p>
  {:else if !room}
    <p class="status">{t('game.status.loadingRoom')}</p>
  {:else if showcasing}
    <ShowcaseView {room} />
  {:else if comparing}
    <CompareView />
  {:else if layering}
    <LayersView />
  {:else}
    <div class="stage" class:is-fading={session.fading}>
      <div class="room-layer" class:hidden={session.screen !== 'player-room'}>
        <RoomView
          {room}
          {selectedId}
          {hintId}
          decor={decorLabels}
          onTap={choose}
          onMiss={() => (selectedId = null)}
        />
      </div>
      {#if session.ready && session.screen !== 'player-room'}
        <FlowView {session} />
        <DemoRibbon show={session.status === 'demo'} />
      {/if}
    </div>

    <Hud
      title={session.screen === 'player-room' ? tx(room, 'title') : session.title}
      hintLabel={tx(room.hud, 'hintLabel')}
      settingsLabel={tx(room.hud, 'settingsLabel')}
      showHint={!['event-select', 'cutscene', 'difficulty', 'practice', 'level-map', 'crossword', 'jigsaw', 'slide'].includes(session.screen)}
      onHint={onHint}
      onSettings={() => (overlay = overlay === 'settings' ? null : 'settings')}
    />
    {#if session.screen !== 'player-room' && session.subtitle}
      <p class="flow-sub">{session.subtitle}</p>
    {/if}

    <button type="button" class="back" aria-label={tx(room.hud, 'backLabel')} onclick={onBack}>
      <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
        <path d="M14.5 5 7.5 12l7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>

    {#if session.screen === 'player-room' && !overlay}
      <nav class="home-links" aria-label={t('game.home.linksAria')}>
        <a class="home-link" href="#/showcase?asset=characters/grandma" data-home-demo>{t('game.home.viewDemo')}</a>
        <a class="home-link" href="#/compare" data-home-compare>{t('game.home.beforeAfter')}</a>
        <a class="home-link" href="#/layers" data-home-layers>{t('game.home.layers')}</a>
      </nav>
    {/if}

    {#if session.screen !== 'event-select' && session.screen !== 'cutscene'}
      <button type="button" class="case" onclick={() => (session.screen === 'notebook' ? session.back() : session.go('notebook'))}>
        {tx(room.hud, 'caseLabel')}
      </button>
    {/if}

    {#if overlay === 'settings'}
      <SettingsPanel
        textSize={save.player.textSize}
        soundEnabled={save.player.soundEnabled}
        onTextSize={setTextSize}
        onSound={setSound}
        onClose={() => (overlay = null)}
      />
    {:else if overlay === 'calendar' && calendar && session.screen === 'player-room'}
      <CalendarPanel
        calendar={calendar}
        {themeId}
        solvedCaseIds={save.knowledge.solvedCaseIds}
        onTheme={setTheme}
        onEntry={showToast}
        onClose={() => (overlay = null)}
      />
    {:else if overlay === 'decor' && decorHotspot}
      <Sheet
        title={tx(decorHotspot, 'title')}
        body={decorHotspot.kind === 'decor-slot'
          ? decorLabels[decorHotspot.id] ?? (session.reward ? t('game.decor.ready') : tx(decorHotspot, 'emptyHint'))
          : t('game.decor.empty')}
        actionLabel={session.reward && decorHotspot.kind === 'decor-slot' && !save.player.decor[decorHotspot.id] ? t('game.decor.place') : ''}
        onAction={placeReward}
        onClose={() => (overlay = null)}
      />
    {/if}

    {#if showTutor && session.screen === 'player-room' && !overlay}
      <Onboarding steps={room.onboarding} index={tutorIndex} onNext={finishTutor} />
    {/if}

    {#if session.toastText || toast}
      <p class="toast" role="status">{session.toastText || toast}</p>
    {/if}
  {/if}
</div>

<style>
  .phone.wide { width: 100vw; }
  /* Sits on the floor strip between the round back button (left) and the case button (right). */
  .home-links {
    position: absolute;
    z-index: 7;
    left: 88px;
    right: 112px;
    bottom: calc(18px + env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: center;
  }
  .home-link {
    min-width: 0;
    width: 100%;
    max-width: 180px;
    min-height: 26px;
    padding: 3px 10px;
    border-radius: 12px;
    border: 2px solid var(--cyan);
    background: var(--hud);
    color: var(--ink);
    font-size: 14px;
    font-weight: 700;
    line-height: 1.3;
    text-align: center;
    text-decoration: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .room-layer { position: absolute; inset: 0; }
  .room-layer.hidden { visibility: hidden; pointer-events: none; }
  .flow-sub {
    position: absolute;
    z-index: 5;
    top: calc(50px + env(safe-area-inset-top));
    left: 12px;
    right: 78px;
    margin: 0;
    padding: 4px 10px;
    border-radius: 10px;
    background: rgba(6, 24, 40, 0.88);
    border: 1px solid var(--cyan);
    font-size: var(--fs-sm);
    line-height: 1.35;
    pointer-events: none;
  }
</style>
