<script lang="ts">
  import { onMount } from 'svelte';
  import CalendarPanel from './components/CalendarPanel.svelte';
  import EventSelect from './components/EventSelect.svelte';
  import Hud from './components/Hud.svelte';
  import Onboarding from './components/Onboarding.svelte';
  import RoomView from './components/RoomView.svelte';
  import SettingsPanel from './components/SettingsPanel.svelte';
  import Sheet from './components/Sheet.svelte';
  import { loadPlayerRoom } from './lib/loadRoom';
  import { readSave, writeSave } from './lib/save';
  import type { PlayerRoom, SaveV1, TextSize } from './lib/types';

  let room = $state<PlayerRoom | null>(null);
  let save = $state<SaveV1>(readSave());
  let error = $state<string | null>(null);
  let screen = $state<'room' | 'events'>('room');
  let overlay = $state<null | 'calendar' | 'practice' | 'case' | 'settings' | 'decor'>(null);
  let decorSlotId = $state<string | null>(null);
  let selectedId = $state<string | null>(null);
  let hintId = $state<string | null>(null);
  let fading = $state(false);
  let toast = $state<string | null>(null);
  let tutorIndex = $state(0);
  let showTutor = $state(!save.player.onboardingComplete);

  let toastTimer = 0;
  let hintTimer = 0;
  let hintTier = 0;

  const themeId = $derived(save.player.calendarTheme || room?.calendar.theme || 'kid-room');
  const decorHotspot = $derived(room?.hotspots.find((hotspot) => hotspot.slotId === decorSlotId) ?? null);

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

  function wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  async function go(next: 'room' | 'events'): Promise<void> {
    if (fading || screen === next) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    fading = true;
    await wait(reduce ? 0 : 300);
    screen = next;
    overlay = null;
    selectedId = null;
    await wait(30);
    fading = false;
  }

  function choose(id: string): void {
    if (!room) return;
    if (selectedId === id) {
      const hotspot = room.hotspots.find((item) => item.id === id);
      selectedId = null;
      if (!hotspot) return;
      if (hotspot.action === 'event-select') void go('events');
      else if (hotspot.action === 'practice') overlay = 'practice';
      else if (hotspot.action === 'calendar') overlay = 'calendar';
      else if (hotspot.action === 'case-board') overlay = 'case';
      else if (hotspot.action === 'decor') {
        decorSlotId = hotspot.slotId ?? null;
        overlay = 'decor';
      }
      return;
    }
    selectedId = id;
  }

  function onBack(): void {
    if (overlay) {
      overlay = null;
      return;
    }
    if (screen === 'events') {
      void go('room');
      return;
    }
    if (room) showToast(room.hud.hereToast);
  }

  function onHint(): void {
    if (!room || screen !== 'room') return;
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
    return () => {
      ac.abort();
      window.clearTimeout(toastTimer);
      window.clearTimeout(hintTimer);
    };
  });
</script>

<div class="phone" data-text={save.player.textSize}>
  {#if error}
    <p class="error">{error}</p>
  {:else if !room}
    <p class="status">กำลังเปิดห้อง…</p>
  {:else}
    <div class="stage" class:is-fading={fading}>
      <div class="room-layer" class:hidden={screen !== 'room'}>
        <RoomView
          {room}
          {selectedId}
          {hintId}
          decor={save.player.decor}
          onTap={choose}
          onMiss={() => (selectedId = null)}
        />
      </div>
      {#if screen === 'events'}
        <EventSelect {...room.screens.eventSelect} />
      {/if}
    </div>

    <Hud
      title={screen === 'events' ? room.screens.eventSelect.title : room.name}
      hintLabel={room.hud.hintLabel}
      settingsLabel={room.hud.settingsLabel}
      showHint={screen === 'room'}
      onHint={onHint}
      onSettings={() => (overlay = overlay === 'settings' ? null : 'settings')}
    />

    <button type="button" class="back" aria-label={room.hud.backLabel} onclick={onBack}>
      <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
        <path d="M14.5 5 7.5 12l7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>

    {#if screen === 'room'}
      <button type="button" class="case" onclick={() => (overlay = overlay === 'case' ? null : 'case')}>
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
    {:else if overlay === 'calendar'}
      <CalendarPanel
        calendar={room.calendar}
        {themeId}
        solvedCaseIds={save.knowledge.solvedCaseIds}
        onTheme={setTheme}
        onEntry={showToast}
        onClose={() => (overlay = null)}
      />
    {:else if overlay === 'practice'}
      <Sheet title={room.screens.practice.title} body={room.screens.practice.body} onClose={() => (overlay = null)} />
    {:else if overlay === 'case'}
      <Sheet title={room.screens.caseBoard.title} body={room.screens.caseBoard.body} onClose={() => (overlay = null)} />
    {:else if overlay === 'decor' && decorHotspot}
      <Sheet
        title={decorHotspot.label}
        body={decorHotspot.emptyHint ?? 'ช่องนี้ว่าง'}
        onClose={() => (overlay = null)}
      />
    {/if}

    {#if showTutor && screen === 'room' && !overlay}
      <Onboarding steps={room.onboarding} index={tutorIndex} onNext={finishTutor} />
    {/if}

    {#if toast}
      <p class="toast" role="status">{toast}</p>
    {/if}
  {/if}
</div>

<style>
  .room-layer { position: absolute; inset: 0; }
  .room-layer.hidden { visibility: hidden; pointer-events: none; }
</style>
