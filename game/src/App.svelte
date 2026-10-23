<script lang="ts">
  import { onMount } from 'svelte';
  import EditorView from './components/EditorView.svelte';
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

  onMount(() => {
    const ac = new AbortController();
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
        if (!ac.signal.aborted) session.use(loaded.flow, loaded.screens, save.flow);
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

<div class="phone" class:wide={editing} data-text={save.player.textSize}>
  <VersionBadge />
  {#if editing}
    <EditorView />
  {:else if error}
    <p class="error">{error}</p>
  {:else if !room}
    <p class="status">กำลังเปิดห้อง…</p>
  {:else if showcasing}
    <ShowcaseView {room} />
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
        <DemoRibbon show={session.status === 'demo'} />
      {/if}
    </div>

    <Hud
      title={session.screen === 'player-room' ? room.title : session.title}
      hintLabel={room.hud.hintLabel}
      settingsLabel={room.hud.settingsLabel}
      showHint={!['event-select', 'cutscene', 'difficulty', 'practice', 'level-map', 'crossword', 'jigsaw', 'slide'].includes(session.screen)}
      onHint={onHint}
      onSettings={() => (overlay = overlay === 'settings' ? null : 'settings')}
    />
    {#if session.screen !== 'player-room' && session.subtitle}
      <p class="flow-sub">{session.subtitle}</p>
    {/if}

    <button type="button" class="back" aria-label={room.hud.backLabel} onclick={onBack}>
      <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
        <path d="M14.5 5 7.5 12l7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>

    {#if session.screen !== 'event-select' && session.screen !== 'cutscene'}
      <button type="button" class="case" onclick={() => (session.screen === 'notebook' ? session.back() : session.go('notebook'))}>
        {room.hud.caseLabel}
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
        title={decorHotspot.title}
        body={decorHotspot.kind === 'decor-slot'
          ? save.player.decor[decorHotspot.id] ?? (session.reward ? 'มีรูปตาจากคดีแล้ว วางลงช่องนี้ได้' : decorHotspot.emptyHint)
          : 'ช่องนี้ว่าง'}
        actionLabel={session.reward && decorHotspot.kind === 'decor-slot' && !save.player.decor[decorHotspot.id] ? 'วางรูปตา' : ''}
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
