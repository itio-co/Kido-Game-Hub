<script lang="ts">
  import type { CalendarEntity, CalendarThemeEntity } from '../lib/types';
  import { t } from '../lib/i18n';
  import { designForTheme, isCalendarState, isDesignLocked, themeForDesign, type CalendarState } from '../lib/calendarDecor';

  let {
    calendar,
    themeId,
    solvedCaseIds,
    wall = 'original',
    onTheme,
    onWall = () => {},
    onEntry,
    onClose,
  }: {
    calendar: CalendarEntity;
    themeId: string;
    solvedCaseIds: string[];
    wall?: CalendarState;
    onTheme: (id: string) => void;
    onWall?: (next: CalendarState) => void;
    onEntry: (message: string, kind?: string) => void;
    onClose: () => void;
  } = $props();

  const theme = $derived(calendar.themes.find((item) => item.id === themeId) ?? calendar.themes[0]);
  const weekdays = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

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
    if (item.unlock && !solvedCaseIds.includes(item.unlock.afterCase)) return true;
    return isCalendarState(item.wall) && isDesignLocked(item.wall, solvedCaseIds);
  }

  /** A theme with a wall design swaps the calendar on the wall too; others only reskin this panel. */
  function isOn(item: CalendarThemeEntity): boolean {
    if (isCalendarState(item.wall)) return wall === item.wall;
    return item.id === theme?.id;
  }

  function pick(item: CalendarThemeEntity): void {
    if (locked(item)) {
      onEntry(item.lockedHint ?? t('calendar.locked'));
      return;
    }
    if (isCalendarState(item.wall)) onWall(item.wall);
    else onTheme(item.id);
  }

  /** Collapsed every time the panel opens; the calendar page stays the main content. */
  let changeOpen = $state(false);

  const currentLabel = $derived.by(() => {
    if (wall === 'none') return t('calendar.downShort');
    const id = themeForDesign(calendar.themes, wall);
    const title = calendar.themes.find((item) => item.id === id)?.title;
    return title ?? '';
  });

  function hangBack(): void {
    const design = designForTheme(calendar.themes, themeId);
    onWall(isDesignLocked(design, solvedCaseIds) ? 'original' : design);
  }

  function dayLabel(iso: string): string {
    return String(Number(iso.slice(8, 10)));
  }
</script>

<div class="scrim" onclick={onClose} role="presentation">
  {#if theme}
    <dialog class="sheet" aria-label={calendar.title} open onclick={(event) => event.stopPropagation()}>
      <div class="cal" style="background:{theme.paper};color:{theme.ink};border:4px solid {theme.frame}">
        <div class="cal-head" style="background:{theme.head}">
          <span>{theme.art} {calendar.title}</span>
          <small>{calendar.monthLabel}</small>
        </div>
        <div class="grid">
          {#each weekdays as name}
            <div class="dow">{name}</div>
          {/each}
          {#each grid as cell, index (index)}
            {#if cell.day === 0}
              <div></div>
            {:else}
              <div class="day" class:mark={!!cell.icon} class:today={cell.today}>
                <span class="num">{cell.day}</span>
                {#if cell.icon}<i aria-hidden="true">{cell.icon}</i>{/if}
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
                  onEntry(
                    entry.eventRef ? `${entry.title} — ออกทางประตูเพื่อเลือกเหตุการณ์` : entry.title,
                    entry.type,
                  )}
              >
                {entry.icon} {dayLabel(entry.date)} {entry.title}
              </button>
            </li>
          {/each}
        </ul>
      </div>
      {#if calendar.themeSwitch}
        <div class="themes" class:open={changeOpen} data-testid="calendar-change">
          <button
            type="button"
            class="change-toggle"
            data-testid="calendar-change-toggle"
            aria-expanded={changeOpen}
            aria-controls="calendar-change-options"
            onclick={() => (changeOpen = !changeOpen)}
          >
            <span class="label">{t('calendar.change')}</span>
            <span class="current">{currentLabel}</span>
            <span class="chevron" aria-hidden="true">▾</span>
          </button>
          {#if changeOpen}
            <div id="calendar-change-options" data-testid="calendar-change-options">
              {#if wall === 'none'}
                <p class="note">{t('calendar.downNote')}</p>
              {/if}
              <div class="row">
                {#each calendar.themes as item (item.id)}
                  <button
                    type="button"
                    class="choice"
                    class:on={isOn(item)}
                    class:locked={locked(item)}
                    aria-pressed={isOn(item)}
                    onclick={() => pick(item)}
                  >
                    <span class="swatch" style="background:{item.head};border-color:{item.frame}" aria-hidden="true">{item.art}</span>
                    {locked(item) ? t('calendar.lockedPrefix') : ''}{item.title}
                  </button>
                {/each}
              </div>
              <div class="row">
                {#if wall === 'none'}
                  <button type="button" class="choice wall-action" onclick={hangBack}>{t('calendar.hangBack')}</button>
                {:else}
                  <button type="button" class="choice wall-action" onclick={() => onWall('none')}>{t('calendar.takeDown')}</button>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      {/if}
      <button type="button" class="close" onclick={onClose}>{t('calendar.close')}</button>
    </dialog>
  {/if}
</div>
