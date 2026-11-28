<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from './lib/i18n';
  import { showBagAndNotebook, showHouseMapHud } from './lib/hudIcons';
  import EditorView from './components/EditorView.svelte';
  import AssetBrowser from './components/AssetBrowser.svelte';
  import CalendarPanel from './components/CalendarPanel.svelte';
  import PhotoPanel from './components/PhotoPanel.svelte';
  import { isDesignLocked, themeForDesign, type CalendarState } from './lib/calendarDecor';
  import { ComicPanel, FlowView, createFlow, loadFlow } from './modules/event-core';
  import Hud from './components/Hud.svelte';
  import Onboarding from './components/Onboarding.svelte';
  import Prologue from './components/Prologue.svelte';
  import RoomView from './components/RoomView.svelte';
  import ShowcaseView from './components/ShowcaseView.svelte';
  import SettingsPanel from './components/SettingsPanel.svelte';
  import Sheet from './components/Sheet.svelte';
  import LoadingDialog from './components/LoadingDialog.svelte';
  import VersionBadge from './components/VersionBadge.svelte';
  import StreakPanel from './components/StreakPanel.svelte';
  import StreakCelebrateDialog from './components/StreakCelebrateDialog.svelte';
  import { readStreak, refreshStreak, STREAK_EVENT, takeStreakCelebrate, type StreakCache, type StreakCelebrate } from './lib/cloudSync';
  import { bangkokDay, emptyRecord, viewOf } from './lib/streak';
  import { StirFryGame } from './modules/stirfry';
  import { ChallengeView, LeaderboardView, parseChallengeHash } from './modules/challenge';
  import { minigameRoute } from './modules/minigame-core';
  import { loadPlayerRoom } from './lib/loadRoom';
  import { readSave, writeSave } from './lib/save';
  import { DECOR_PHOTO, GRANDPA_PHOTO_SLUG, KEEPSAKE_SHELF_ID, isGrandpaPhoto, photoPlaced, shouldPlayPhotoPlacement, type GrandpaPhotoState } from './lib/decor';
  import { itemBySlug, itemCopy } from './modules/item';
  import { appStorage } from './lib/deployment';
  import { buildInfo } from './lib/buildInfo';
  import {
    GodFloat,
    GodLogin,
    godButtonVisible,
    godFloatVisible,
    godAccessRole,
    loadFloatPrefs,
    saveFloatPrefs,
    type FloatPrefs,
    type InspectPage,
  } from './modules/god-mode';
  import type { Role } from './lib/roles';
  import type { CalendarEntity, PlayerRoom, SaveV1, TextSize } from './lib/types';

  let room = $state<PlayerRoom | null>(null);
  let save = $state<SaveV1>(readSave());
  let error = $state<string | null>(null);
  let overlay = $state<null | 'calendar' | 'settings' | 'decor' | 'photo' | 'streak'>(null);
  let streak = $state<StreakCache | null>(readStreak());
  /** Cached server view, or a local empty board until the server answers. Never computed from local wins. */
  const streakView = $derived(streak?.view ?? viewOf(emptyRecord(), bangkokDay(Date.now())));
  let celebrate = $state<StreakCelebrate | null>(null);
  let celebrateTimer = 0;
  function queueCelebrate(offer: StreakCelebrate): void {
    window.clearTimeout(celebrateTimer);
    const start = Date.now();
    const tick = () => {
      const busy = typeof document !== 'undefined' && document.querySelector('[data-testid="minigame-win-dialog"]');
      if (!busy || Date.now() - start > 8000) {
        celebrate = offer;
        return;
      }
      celebrateTimer = window.setTimeout(tick, 200);
    };
    celebrateTimer = window.setTimeout(tick, 400);
  }
  function openStreak(): void {
    overlay = 'streak';
    void refreshStreak().then((next) => {
      streak = next;
    });
  }
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
  /** This device's God access, asked of the server: super_god (admin session), god / super_god player, or null. */
  let godRole = $state<Role | null>(null);
  const godReady = $derived(godRole !== null);
  let showGodLogin = $state(false);
  let floatPrefs = $state<FloatPrefs>(loadFloatPrefs((key) => appStorage.getItem(key)));
  // Prologue only on a plain home entry, never for deep links (challenge, practice, leaderboard...).
  const homeEntry = ['', '#', '#/'].includes(window.location.hash);
  let showPrologue = $state(homeEntry && !save.player.prologueSeen);
  let prologueKey = $state(0);
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
    if ((progress.caseDone || progress.cleared) && !save.knowledge.solvedCaseIds.includes('case-01')) {
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
        // once the story has placed Grandpa's photo, the shelf opens its own panel (put away / back)
        overlay = hotspot.id === KEEPSAKE_SHELF_ID && photoPlaced(save.player.decor) ? 'photo' : 'decor';
      } else if (hotspot.action === 'event-select') void session.go('event-select');
      else if (hotspot.action === 'practice') session.enterPractice();
      else if (hotspot.action === 'calendar') overlay = 'calendar';
      else if (hotspot.action === 'case-board') void session.go('notebook');
      else if (hotspot.action === 'storage') session.openStorage();
      return;
    }
    selectedId = id;
  }

  function onBack(): void {
    if (placingPhoto) {
      finishPlacement();
      return;
    }
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

  /** Change what hangs on the wall; a design also switches the panel to its matching skin. */
  function setCalendarWall(next: CalendarState): void {
    if (!calendar || isDesignLocked(next, save.knowledge.solvedCaseIds)) return;
    save.player.room = { ...save.player.room, calendar: next };
    const theme = themeForDesign(calendar.themes, next);
    if (theme) save.player.calendarTheme = theme;
    commit();
  }

  function canPlacePhoto(slotId: string | null): boolean {
    return !!slotId && slotId === KEEPSAKE_SHELF_ID;
  }

  function placeGrandpaPhoto(): boolean {
    if (photoPlaced(save.player.decor)) return false;
    const next = { ...save.player.decor };
    for (const key of Object.keys(next)) {
      if (isGrandpaPhoto(next[key])) next[key] = null;
    }
    next[KEEPSAKE_SHELF_ID] = DECOR_PHOTO;
    save.player.decor = next;
    save.player.room = { ...save.player.room, grandpaPhoto: 'shelf' };
    commit();
    return true;
  }

  function placeReward(): void {
    if (!canPlacePhoto(decorSlotId) || !session.reward) return;
    if (!placeGrandpaPhoto()) return;
    overlay = null;
    showToast(t('toast.photoPlaced'));
  }

  const albumPhotoItem = $derived(itemBySlug(GRANDPA_PHOTO_SLUG));

  const placingPhoto = $derived(
    !showTutor
      && !showPrologue
      && session.ready
      && session.overlay !== 'trip-summary'
      && session.overlay !== 'storage'
      && shouldPlayPhotoPlacement({
        placed: photoPlaced(save.player.decor),
        screen: session.screen,
        reward: session.reward,
        cleared: session.cleared,
        caseDone: session.caseDone,
      }),
  );

  function finishPlacement(): void {
    placeGrandpaPhoto();
    session.showToast(t('toast.photoPlaced'));
  }

  /** Put the photo away or back. Only player.room changes; the placed decor (story record) stays. */
  function setGrandpaPhoto(next: GrandpaPhotoState): void {
    if (!photoPlaced(save.player.decor) || save.player.room.grandpaPhoto === next) return;
    save.player.room = { ...save.player.room, grandpaPhoto: next };
    commit();
    showToast(t(next === 'stored' ? 'toast.photoStored' : 'toast.photoBack'));
  }

  function decorBody(): string {
    if (!decorHotspot || decorHotspot.kind !== 'decor-slot') return t('decor.empty');
    const placed = save.player.decor[decorHotspot.id];
    if (isGrandpaPhoto(placed)) return t('decor.photo');
    if (placed) return placed;
    if (session.reward && decorHotspot.id === KEEPSAKE_SHELF_ID) return t('decor.ready');
    if (session.reward) return t('decor.shelfOnly');
    return decorHotspot.emptyHint;
  }

  function decorActionLabel(): string {
    if (!decorHotspot || decorHotspot.kind !== 'decor-slot') return '';
    if (!session.reward || save.player.decor[decorHotspot.id]) return '';
    return decorHotspot.id === KEEPSAKE_SHELF_ID ? t('decor.place') : '';
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

  function showGodBubble(role: Role): void {
    godRole = role;
    setFloat({ ...floatPrefs, on: true });
  }

  async function onVersionUnlock(): Promise<void> {
    const role = await godAccessRole();
    if (role) showGodBubble(role);
    else showGodLogin = true;
  }

  async function openSettings(): Promise<void> {
    if (overlay === 'settings') {
      overlay = null;
      return;
    }
    godRole = await godAccessRole();
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
      stateCheck: session.stateCheck,
      difficulty: session.difficulty,
      subtitle: session.subtitle,
    },
    save: $state.snapshot(save),
    versions: buildInfo(),
  }));

  onMount(() => {
    const ac = new AbortController();
    void godAccessRole().then((role) => {
      if (!ac.signal.aborted) godRole = role;
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
    const onStreak = (event: Event) => {
      streak = readStreak();
      const detail = (event as CustomEvent<{ counted?: boolean; batteryGranted?: boolean; refilled?: boolean; view?: typeof streakView }>).detail;
      const offer = takeStreakCelebrate({ ...detail, view: detail?.view ?? streak?.view });
      if (offer) queueCelebrate(offer);
    };
    window.addEventListener(STREAK_EVENT, onStreak);
    void refreshStreak().then((next) => {
      if (!ac.signal.aborted) streak = next;
    });
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
      window.removeEventListener(STREAK_EVENT, onStreak);
      window.clearTimeout(toastTimer);
      window.clearTimeout(hintTimer);
      window.clearTimeout(celebrateTimer);
    };
  });
</script>

<div class="phone" class:wide={editing || browsing} data-text={save.player.textSize}>
  {#if !editing && !browsing && !fullscreenGame}<VersionBadge onUnlock={onVersionUnlock} />{/if}
  {#if celebrate}
    <StreakCelebrateDialog
      view={celebrate.view}
      batteryGranted={celebrate.batteryGranted}
      onClose={() => (celebrate = null)}
    />
  {/if}
  {#if showGodLogin}
    <GodLogin onSuccess={() => { showGodLogin = false; showGodBubble('super_god'); }} onClose={() => (showGodLogin = false)} />
  {/if}
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
          calendar={save.player.room.calendar}
          grandpaPhoto={save.player.room.grandpaPhoto}
          onTap={choose}
          onMiss={() => (selectedId = null)}
        />
      </div>
      {#if session.ready && (session.screen !== 'player-room' || session.overlay === 'trip-summary' || session.overlay === 'storage' || session.overlay === 'bag')}
        <FlowView {session} />
      {/if}
      {#if placingPhoto}
        <div class="placement-layer" data-testid="photo-placement" data-item={GRANDPA_PHOTO_SLUG} aria-label={albumPhotoItem ? itemCopy(albumPhotoItem).title : t('photo.title')}>
          <ComicPanel
            image="photo-placement.jpg"
            lines={[]}
            caption={t('placement.caption')}
            tapLabel={t('placement.tapDone')}
            count={1}
            index={0}
            onNext={finishPlacement}
          >
            {#snippet actions()}
              <button type="button" class="skip" data-testid="comic-skip" onclick={finishPlacement}>{t('ending.skip')}</button>
            {/snippet}
          </ComicPanel>
        </div>
      {/if}
    </div>

    <Hud
      title={session.screen === 'player-room' ? room.title : session.title}
      hintLabel={room.hud.hintLabel}
      settingsLabel={room.hud.settingsLabel}
      showHint={!placingPhoto && !['event-select', 'cutscene', 'ending-comic', 'difficulty', 'practice', 'level-map', 'crossword', 'jigsaw', 'slide'].includes(session.screen)}
      onHint={onHint}
      onSettings={() => { void openSettings(); }}
    />
    {#if session.subtitle && session.screen !== 'case-board' && !session.talk && !(session.toastText && session.toastLow) && (session.showCaseUi || session.screen === 'cutscene' || session.screen === 'ending-comic' || session.screen === 'difficulty')}
      <p class="flow-sub">{session.subtitle}</p>
    {/if}

    <button type="button" class="back" aria-label={room.hud.backLabel} onclick={onBack}>
      <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
        <path d="M14.5 5 7.5 12l7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>

    {#if showBagAndNotebook(session.showCaseUi, session.screen) || showHouseMapHud({ screen: session.screen, showHouseMapButton: session.showHouseMapButton, showCaseUi: session.showCaseUi, sceneHasMap: session.scene?.map === true })}
      <div class="bottom-actions">
        {#if showHouseMapHud({ screen: session.screen, showHouseMapButton: session.showHouseMapButton, showCaseUi: session.showCaseUi, sceneHasMap: session.scene?.map === true })}
          <button
            type="button"
            class="hud-icon"
            class:fresh={session.mapUnlockPulse}
            class:locked={!session.mapUnlocked}
            data-testid="house-map-btn"
            data-locked={session.mapUnlocked ? 'false' : 'true'}
            aria-label={session.mapUnlocked ? t('hud.houseMap') : t('hud.houseMapLocked')}
            title={session.mapUnlocked ? t('hud.houseMap') : t('hud.houseMapLocked')}
            onclick={() => session.openHouseMap()}
          >
            <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
              <rect x="3.2" y="3.2" width="17.6" height="17.6" rx="1.5" fill="none" stroke="currentColor" stroke-width="2" />
              <path d="M3.2 13h17.6M12 13v8" fill="none" stroke="currentColor" stroke-width="2" />
              <path d="M8.2 3.2v3.2M15.8 3.2v3.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
            {#if !session.mapUnlocked}
              <span class="lock-badge" aria-hidden="true">
                <svg viewBox="0 0 12 12" width="11" height="11">
                  <rect x="2.2" y="5.4" width="7.6" height="5.2" rx="1.2" fill="currentColor" />
                  <path d="M3.8 5.4V4a2.2 2.2 0 0 1 4.4 0v1.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
                </svg>
              </span>
            {/if}
          </button>
        {/if}
        {#if showBagAndNotebook(session.showCaseUi, session.screen)}
          <button
            type="button"
            class="hud-icon"
            class:fresh={session.bagPulse}
            data-testid="bag-btn"
            aria-label={t('hud.bag')}
            title={t('hud.bag')}
            onclick={() => session.openBag()}
          >
            <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
              <path d="M6 9.2h12v9.3a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9.2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
              <path d="M9 9.2V7.6a3 3 0 0 1 6 0v1.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              <path d="M6 13.2h12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </button>
          <button
            type="button"
            class="hud-icon"
            data-testid="case-notebook"
            aria-label={t('hud.notebook')}
            title={t('hud.notebook')}
            onclick={() => (session.screen === 'notebook' ? session.back() : session.go('notebook'))}
          >
            <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
              <rect x="3.2" y="3.2" width="11.2" height="15.6" rx="1.4" fill="none" stroke="currentColor" stroke-width="2" />
              <path d="M6.2 7.4h6M6.2 10.6h6M6.2 13.8h4.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
              <circle cx="16.2" cy="15.2" r="3.6" fill="none" stroke="currentColor" stroke-width="2" />
              <path d="M18.8 17.8 21.4 20.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </button>
        {/if}
      </div>
    {/if}

    {#if session.screen === 'player-room' && session.ready && !overlay && !showTutor && !showPrologue && !placingPhoto && !session.overlay}
      <button
        type="button"
        class="streak-chip"
        class:lit={streakView.state === 'done'}
        class:cold={streakView.count === 0}
        data-testid="streak-btn"
        aria-label={t('streak.button', { n: streakView.count })}
        title={t('streak.title')}
        onclick={openStreak}
      >
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
          <path d="M13.6 2 4.8 13.4h6l-1.4 8.6 8.8-11.4h-6z" fill="currentColor" />
        </svg>
        <span class="n" data-testid="streak-btn-count">{streakView.count}</span>
      </button>
    {/if}

    {#if overlay === 'settings'}
      <SettingsPanel
        textSize={save.player.textSize}
        soundEnabled={save.player.soundEnabled}
        onTextSize={setTextSize}
        onSound={setSound}
        onClose={() => (overlay = null)}
        onReplayPrologue={() => { overlay = null; prologueKey += 1; showPrologue = true; }}
        showGod={godButtonVisible(godReady)}
        godOn={floatPrefs.on}
        onGodToggle={toggleGod}
      />
    {:else if overlay === 'streak' && session.screen === 'player-room'}
      <StreakPanel view={streakView} synced={!!streak} onClose={() => (overlay = null)} />
    {:else if overlay === 'calendar' && calendar && session.screen === 'player-room'}
      <CalendarPanel
        calendar={calendar}
        {themeId}
        solvedCaseIds={save.knowledge.solvedCaseIds}
        wall={save.player.room.calendar}
        onTheme={setTheme}
        onWall={setCalendarWall}
        onEntry={onCalendarEntry}
        onClose={() => (overlay = null)}
      />
    {:else if overlay === 'photo' && decorHotspot && session.screen === 'player-room'}
      <PhotoPanel
        title={decorHotspot.title}
        photoState={save.player.room.grandpaPhoto}
        onState={setGrandpaPhoto}
        onClose={() => (overlay = null)}
      />
    {:else if overlay === 'decor' && decorHotspot}
      <Sheet
        title={decorHotspot.title}
        body={decorBody()}
        actionLabel={decorActionLabel()}
        onAction={placeReward}
        onClose={() => (overlay = null)}
      />
    {/if}

    {#if showTutor && session.screen === 'player-room' && !overlay && !showPrologue}
      <Onboarding steps={room.onboarding} index={tutorIndex} onNext={finishTutor} />
    {/if}

    {#if showPrologue && session.screen === 'player-room'}
      {#key prologueKey}
        <Prologue onDone={finishPrologue} />
      {/key}
    {/if}

    {#if !placingPhoto && (session.toastText || toast)}
      <p class="toast" class:toast-low={session.context !== 'event' || session.toastLow} role="status">{session.toastText || toast}</p>
    {/if}
  {/if}
  {#if godFloatVisible(godReady, floatPrefs.on) && !editing && !browsing && overlay !== 'settings'}
    <GodFloat page={inspectPage} prefs={floatPrefs} onPrefs={setFloat} role={godRole} />
  {/if}
  {#if session.loading}
    <LoadingDialog title={t('loading.title')} body={t('loading.body')} />
  {/if}
</div>

<style>
  .streak-chip {
    position: absolute;
    z-index: 5;
    right: 12px;
    bottom: calc(var(--hud-btn-bottom) + env(safe-area-inset-bottom));
    height: 64px;
    min-width: 64px;
    padding: 0 16px 0 12px;
    border-radius: 32px;
    border: 3px solid var(--cyan);
    background: var(--hud);
    color: #ffcf4a;
    display: flex;
    align-items: center;
    gap: 4px;
    font-family: "Itim", "Noto Sans Thai", sans-serif;
  }
  .streak-chip .n { font-size: 26px; line-height: 1; color: #fff3c8; font-variant-numeric: tabular-nums; }
  .streak-chip.lit { box-shadow: 0 0 12px rgba(255, 207, 74, 0.55); }
  .streak-chip.cold { color: #7d93a3; }
  .streak-chip.cold .n { color: #c3d3de; }
  .placement-layer { position: absolute; inset: 0; z-index: 6; }
  .placement-layer :global(.skip) { background: rgba(0, 0, 0, 0.55); color: #fff; border: 0; border-radius: 16px; padding: 8px 14px; font-size: var(--fs-sm); font-weight: 700; white-space: nowrap; }
  .phone.wide { width: 100vw; }
  .room-layer { position: absolute; inset: 0; }
  .room-layer.hidden { visibility: hidden; pointer-events: none; }
  .bottom-actions {
    position: absolute;
    z-index: 7;
    right: 12px;
    bottom: calc(var(--hud-btn-bottom) + env(safe-area-inset-bottom));
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .bottom-actions .hud-icon {
    position: relative;
    bottom: auto;
    left: auto;
    right: auto;
  }
  .hud-icon .lock-badge {
    position: absolute;
    right: -2px;
    bottom: -2px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid var(--cyan);
    background: var(--hud);
    color: var(--ink);
    display: grid;
    place-items: center;
    pointer-events: none;
  }
  .hud-icon.fresh { animation: map-unlock 0.7s ease; }
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
    bottom: calc(var(--hud-msg-bottom) + env(safe-area-inset-bottom));
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
