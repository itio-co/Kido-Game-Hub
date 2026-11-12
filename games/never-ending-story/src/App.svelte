<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from './lib/i18n';
  import EditorView from './components/EditorView.svelte';
  import AssetBrowser from './components/AssetBrowser.svelte';
  import CalendarPanel from './components/CalendarPanel.svelte';
  import { FlowView, createFlow, loadFlow } from './modules/event-core';
  import Hud from './components/Hud.svelte';
  import Onboarding from './components/Onboarding.svelte';
  import Prologue from './components/Prologue.svelte';
  import RoomView from './components/RoomView.svelte';
  import ShowcaseView from './components/ShowcaseView.svelte';
  import SettingsPanel from './components/SettingsPanel.svelte';
  import Sheet from './components/Sheet.svelte';
  import VersionBadge from './components/VersionBadge.svelte';
  import { StirFryGame } from './modules/stirfry';
  import { ChallengeView, LeaderboardView, parseChallengeHash } from './modules/challenge';
  import { minigameRoute } from './modules/minigame-core';
  import { loadPlayerRoom } from './lib/loadRoom';
  import { readSave, writeSave } from './lib/save';
  import { appStorage } from './lib/deployment';
  import { buildInfo } from './lib/buildInfo';
  import {
    GodFloat,
    godButtonVisible,
    godFloatVisible,
    godSessionActive,
    loadFloatPrefs,
    saveFloatPrefs,
    type FloatPrefs,
    type InspectPage,
  } from './modules/god-mode';
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
  let godReady = $state(false);
  let floatPrefs = $state<FloatPrefs>(loadFloatPrefs((key) => appStorage.getItem(key)));
  // Prologue only on a plain home entry, never for deep links (challenge, practice, leaderboard...).
  const homeEntry = ['', '#', '#/'].includes(window.location.hash);
  let showPrologue = $state(homeEntry && !save.player.prologueSeen);
  function finishPrologue(): void {
    showPrologue = false;
    save.player.prologueSeen = true;
    commit();
  }
  const showcasing = $derived(route.startsWith('#/showcase'));
  const editing = $derived(route.startsWith('#/editor'));
  const browsing = $derived(route.startsWith('#/assets'));
  const mini = $derived(minigameRoute(route));
  const playingStirfry = $derived(mini === 'rhythm' && route.startsWith('#/play/stirfry'));
  const challenge = $derived(mini === 'challenge' ? parseChallengeHash(route) : null);
  const showingBoard = $derived(mini === 'leaderboard');
  const fullscreenGame = $derived(playingStirfry || !!challenge || showingBoard);

  function toPractice(): void {
    window.location.hash = '';
    route = '';
    void session.go('practice');
  }

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
  const decorHotspot = $derived(
    room?.hotspots.find((hotspot) => hotspot.kind === 'decor-slot' && hotspot.id === decorSlotId) ?? null,
  );

  const session = createFlow((progress) => {
    save.flow = progress;
    save.knowledge.evidence = [...progress.evidence];
    if (progress.caseDone && !save.knowledge.solvedCaseIds.includes('case-01')) {
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

  function onCalendarEntry(message: string, kind?: string): void {
    if (kind === 'daily-practice') {
      overlay = null;
      session.enterPractice();
      return;
    }
    showToast(message);
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
      else if (hotspot.action === 'practice') session.enterPractice();
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
    if (room) showToast(room.hud.hereToast);
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
    const line = room.hud.hintLines[hintTier - 1] ?? room.hud.hintLines[0];
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
    showToast(enabled ? 'เปิดเสียงแล้ว ยังไม่มีเสียงในหน้านี้' : 'ปิดเสียงแล้ว');
  }

  function setTheme(id: string): void {
    save.player.calendarTheme = id;
    commit();
  }

  function placeReward(): void {
    if (!decorSlotId || !session.reward) return;
    const next = { ...save.player.decor };
    for (const key of Object.keys(next)) {
      if (next[key]?.includes('รูปตา')) next[key] = null;
    }
    next[decorSlotId] = '📷 รูปตา';
    save.player.decor = next;
    commit();
    overlay = null;
    showToast('วางรูปตาแล้ว');
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

  function setFloat(next: FloatPrefs): void {
    floatPrefs = next;
    saveFloatPrefs((key, value) => appStorage.setItem(key, value), next);
  }

  function toggleGod(): void {
    setFloat({ ...floatPrefs, on: !floatPrefs.on });
  }

  async function openSettings(): Promise<void> {
    if (overlay === 'settings') {
      overlay = null;
      return;
    }
    godReady = await godSessionActive();
    overlay = 'settings';
  }

  const inspectPage = $derived.by((): InspectPage => ({
    page: { screen: fullscreenGame ? route : session.screen, title: session.title, route },
    room: room
      ? {
          id: room.id,
          slug: room.slug,
          title: room.title,
          hotspots: $state.snapshot(room.hotspots),
          objects: $state.snapshot(room.objects),
        }
      : null,
    scene: session.scene,
    hotspots: session.spots,
    event: {
      context: session.context,
      slot: session.slot,
      evidence: [...session.evidence],
      solved: session.solved,
      deduced: session.deduced,
      reward: session.reward,
      poster: session.poster,
      caseDone: session.caseDone,
      mapUnlocked: session.mapUnlocked,
      difficulty: session.difficulty,
      subtitle: session.subtitle,
    },
    save: $state.snapshot(save),
    versions: buildInfo(),
  }));

  onMount(() => {
    const ac = new AbortController();
    void godSessionActive().then((ok) => {
      if (!ac.signal.aborted) godReady = ok;
    });
    loadPlayerRoom()
      .then((loaded) => {
        if (!ac.signal.aborted) room = loaded;
      })
      .catch((reason: unknown) => {
        if (!ac.signal.aborted) error = reason instanceof Error ? reason.message : 'เปิดห้องไม่ได้';
      });
    const onHash = () => {
      route = window.location.hash;
    };
    window.addEventListener('hashchange', onHash);
    loadFlow()
      .then((loaded) => {
        if (ac.signal.aborted) return;
        session.use(loaded.flow, loaded.screens, save.flow);
        const hash = window.location.hash;
        if (hash === '#ending-comic' || hash === '#/ending-comic') {
          session.jumpEndingComic();
        }
      })
      .catch((reason: unknown) => {
        if (!ac.signal.aborted) showToast(reason instanceof Error ? reason.message : 'เปิดหน้าจอไม่ได้');
      });
    return () => {
      ac.abort();
      window.removeEventListener('hashchange', onHash);
      window.clearTimeout(toastTimer);
      window.clearTimeout(hintTimer);
    };
  });
</script>

<div class="phone" class:wide={editing || browsing} data-text={save.player.textSize}>
  {#if !editing && !browsing && !fullscreenGame}<VersionBadge />{/if}
  {#if browsing}
    <AssetBrowser />
  {:else if editing}
    <EditorView />
  {:else if error}
    <p class="error">{error}</p>
  {:else if !room}
    <p class="status">กำลังเปิดห้อง…</p>
  {:else if showcasing}
    <ShowcaseView {room} />
  {:else if challenge}
    {#key route}
      <ChallengeView params={challenge} onExit={toPractice} onBoard={() => (window.location.hash = '#/leaderboard')} />
    {/key}
  {:else if showingBoard}
    <LeaderboardView onExit={toPractice} onPlay={(game) => (window.location.hash = game === 'stirfry' ? '#/play/stirfry' : `#/challenge/${game}`)} />
  {:else if playingStirfry}
    <StirFryGame onExit={() => { window.location.hash = ''; route = ''; void session.go('practice'); }} />
  {:else}
    <div class="stage" class:is-fading={session.fading}>
      <div class="room-layer" class:hidden={session.screen !== 'player-room'}>
        <RoomView
          {room}
          {selectedId}
          {hintId}
          decor={save.player.decor}
          onTap={choose}
          onMiss={() => (selectedId = null)}
        />
      </div>
      {#if session.ready && session.screen !== 'player-room'}
        <FlowView {session} />
      {/if}
    </div>

    <Hud
      title={session.screen === 'player-room' ? room.title : session.title}
      hintLabel={room.hud.hintLabel}
      settingsLabel={room.hud.settingsLabel}
      showHint={!['event-select', 'cutscene', 'ending-comic', 'difficulty', 'practice', 'level-map', 'crossword', 'jigsaw', 'slide'].includes(session.screen)}
      onHint={onHint}
      onSettings={() => { void openSettings(); }}
    />
    {#if session.subtitle && !session.talk && (session.showCaseUi || session.screen === 'cutscene' || session.screen === 'ending-comic' || session.screen === 'difficulty')}
      <p class="flow-sub">{session.subtitle}</p>
    {/if}

    <button type="button" class="back" aria-label={room.hud.backLabel} onclick={onBack}>
      <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
        <path d="M14.5 5 7.5 12l7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>

    {#if session.showCaseUi || session.showHouseMapButton}
      <div class="bottom-actions">
        {#if session.showHouseMapButton}
          <button type="button" class="case mapbtn" class:fresh={session.mapUnlockPulse} data-testid="house-map-btn" onclick={() => session.go('house-map')}>
            {t('hud.houseMap')}
          </button>
        {/if}
        {#if session.showCaseUi}
          <button type="button" class="case" data-testid="case-notebook" onclick={() => (session.screen === 'notebook' ? session.back() : session.go('notebook'))}>
            {room.hud.caseLabel}
          </button>
        {/if}
      </div>
    {/if}

    {#if overlay === 'settings'}
      <SettingsPanel
        textSize={save.player.textSize}
        soundEnabled={save.player.soundEnabled}
        onTextSize={setTextSize}
        onSound={setSound}
        onClose={() => (overlay = null)}
        onReplayPrologue={() => { overlay = null; showPrologue = true; }}
        showGod={godButtonVisible(godReady)}
        godOn={floatPrefs.on}
        onGodToggle={toggleGod}
      />
    {:else if overlay === 'calendar' && calendar && session.screen === 'player-room'}
      <CalendarPanel
        calendar={calendar}
        {themeId}
        solvedCaseIds={save.knowledge.solvedCaseIds}
        onTheme={setTheme}
        onEntry={onCalendarEntry}
        onClose={() => (overlay = null)}
      />
    {:else if overlay === 'decor' && decorHotspot}
      <Sheet
        title={decorHotspot.title}
        body={decorHotspot.kind === 'decor-slot'
          ? save.player.decor[decorHotspot.id] ?? (session.reward ? 'มีรูปตาจากคดีแล้ว วางลงช่องนี้ได้' : decorHotspot.emptyHint)
          : 'ช่องนี้ว่าง'}
        actionLabel={session.reward && decorHotspot.kind === 'decor-slot' && !save.player.decor[decorHotspot.id] ? 'วางรูปตา' : ''}
        onAction={placeReward}
        onClose={() => (overlay = null)}
      />
    {/if}

    {#if showTutor && session.screen === 'player-room' && !overlay && !showPrologue}
      <Onboarding steps={room.onboarding} index={tutorIndex} onNext={finishTutor} />
    {/if}

    {#if showPrologue && session.screen === 'player-room'}
      <Prologue onDone={finishPrologue} />
    {/if}

    {#if session.toastText || toast}
      <p class="toast" class:toast-low={session.context !== 'event'} role="status">{session.toastText || toast}</p>
    {/if}
  {/if}
  {#if godFloatVisible(godReady, floatPrefs.on) && !editing && !browsing && overlay !== 'settings'}
    <GodFloat page={inspectPage} prefs={floatPrefs} onPrefs={setFloat} />
  {/if}
</div>

<style>
  .phone.wide { width: 100vw; }
  .room-layer { position: absolute; inset: 0; }
  .room-layer.hidden { visibility: hidden; pointer-events: none; }
  .bottom-actions {
    position: absolute;
    z-index: 7;
    right: 12px;
    bottom: calc(14px + env(safe-area-inset-bottom));
    display: flex;
    gap: 8px;
    align-items: flex-end;
  }
  .bottom-actions .case { position: static; }
  .mapbtn.fresh { animation: map-unlock 0.7s ease; }
  @keyframes map-unlock {
    0% { transform: scale(0.86); box-shadow: 0 0 0 0 var(--cyan); }
    45% { transform: scale(1.08); box-shadow: 0 0 0 6px transparent; }
    100% { transform: scale(1); }
  }
  .flow-sub {
    position: absolute;
    z-index: 5;
    left: 50%;
    transform: translateX(-50%);
    bottom: calc(88px + env(safe-area-inset-bottom));
    width: max-content;
    max-width: min(78%, 320px);
    margin: 0;
    padding: 6px 12px;
    border-radius: 12px;
    background: rgba(6, 24, 40, 0.9);
    border: 1px solid var(--cyan);
    font-size: var(--fs-sm);
    line-height: 1.35;
    text-align: center;
    pointer-events: none;
    box-sizing: border-box;
  }
</style>
