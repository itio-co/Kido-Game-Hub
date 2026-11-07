<script lang="ts">
  import type { CalendarEntity, CalendarThemeEntity } from '../lib/types';
  import { t } from '../lib/i18n/core';
  import { tx } from '../lib/i18n/content';

  let {
    calendar,
    themeId,
    solvedCaseIds,
    onTheme,
    onEntry,
    onClose,
  }: {
    calendar: CalendarEntity;
    themeId: string;
    solvedCaseIds: string[];
    onTheme: (id: string) => void;
    onEntry: (message: string) => void;
    onClose: () => void;
  } = $props();

  const theme = $derived(calendar.themes.find((item) => item.id === themeId) ?? calendar.themes[0]);
  const weekdays = $derived(t('game.calendar.weekdays').split(' '));

  const grid = $derived.by(() => {
    const [yearText, monthText] = calendar.month.split('-');
    const year = Number(yearText);
    const month = Number(monthText);
    const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const marks = new Map(calendar.entries.map((entry) => [Number(entry.date.slice(8, 10)), entry.icon]));
    const today = Number(calendar.today.slice(8, 10));
    const cells: { day: number; icon?: string; today: boolean }[] = [];
    for (let index = 0; index < first; index += 1) cells.push({ day: 0, today: false });
    for (let day = 1; day <= count; day += 1) {
      cells.push({ day, icon: marks.get(day), today: day === today });
    }
    return cells;
  });

  function locked(item: CalendarThemeEntity): boolean {
    return !!item.unlock && !solvedCaseIds.includes(item.unlock.afterCase);
  }

  function dayLabel(iso: string): string {
    return String(Number(iso.slice(8, 10)));
  }
</script>

<div class="scrim" onclick={onClose} role="presentation">
  {#if theme}
    <dialog class="sheet" aria-label={tx(calendar, 'title')} open onclick={(event) => event.stopPropagation()}>
      <div class="cal" style="background:{theme.paper};color:{theme.ink};border:4px solid {theme.frame}">
        <div class="cal-head" style="background:{theme.head}">
          <span>{theme.art} {tx(calendar, 'title')}</span>
          <small>{tx(calendar, 'monthLabel')}</small>
        </div>
        <div class="grid">
          {#each weekdays as name, index (index)}
            <div class="dow">{name}</div>
          {/each}
          {#each grid as cell, index (index)}
            {#if cell.day === 0}
              <div></div>
            {:else}
              <div class="day" class:mark={!!cell.icon} class:today={cell.today}>
                {cell.day}{#if cell.icon}<i>{cell.icon}</i>{/if}
              </div>
            {/if}
          {/each}
        </div>
        <ul class="entries">
          {#each calendar.entries as entry}
            <li>
              <button
                type="button"
                onclick={() =>
                  onEntry(entry.eventRef ? t('game.calendar.leaveByDoor', { title: tx(entry, 'title') }) : tx(entry, 'title'))}
              >
                {entry.icon} {dayLabel(entry.date)} {tx(entry, 'title')}
              </button>
            </li>
          {/each}
        </ul>
      </div>
      {#if calendar.themeSwitch}
        <div class="themes">
          <p>{t('game.calendar.theme')}</p>
          <div class="row">
            {#each calendar.themes as item (item.id)}
              <button
                type="button"
                class="choice"
                class:on={item.id === theme.id}
                aria-pressed={item.id === theme.id}
                onclick={() => {
                  if (locked(item)) onEntry(item.lockedHint ? tx(item, 'lockedHint') : t('game.flow.stillLocked'));
                  else onTheme(item.id);
                }}
              >
                {locked(item) ? t('game.calendar.lockedPrefix') : ''}{tx(item, 'title')}
              </button>
            {/each}
          </div>
        </div>
      {/if}
      <button type="button" class="close" onclick={onClose}>{t('game.common.close')}</button>
    </dialog>
  {/if}
</div>
