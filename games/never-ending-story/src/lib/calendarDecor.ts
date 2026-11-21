/**
 * Wall calendar in the player room: keep the painted original, take it down,
 * or hang one of the alternate designs in the same spot.
 *
 * Rendering (RoomView): backdrop (original calendar painted in) → wall patch
 * when the value is not 'original' → design overlay when it is a design.
 * All overlays are 720×1280 RGBA aligned with the backdrop (same object-fit).
 */

export const CALENDAR_STATES = ['original', 'none', 'wooden-home', 'night-sky', 'garden'] as const;
export type CalendarState = (typeof CALENDAR_STATES)[number];
export type CalendarDesign = Exclude<CalendarState, 'none'>;

export const DEFAULT_CALENDAR: CalendarState = 'original';

/** Designs that need a solved case before they can hang (same rule as the night-sky theme). */
export const DESIGN_UNLOCK: Partial<Record<CalendarDesign, string>> = {
  'night-sky': 'case-01',
};

/** Overlay file under img/decor/ for each design (original is the backdrop itself). */
export const DESIGN_OVERLAY: Record<Exclude<CalendarDesign, 'original'>, string> = {
  'wooden-home': 'calendar-wooden-home.png',
  'night-sky': 'calendar-night-sky.png',
  garden: 'calendar-garden.png',
};
export const WALL_PATCH = 'calendar-wall-patch.png';

export type RoomDecorState = { calendar: CalendarState };

export function isCalendarState(value: unknown): value is CalendarState {
  return typeof value === 'string' && (CALENDAR_STATES as readonly string[]).includes(value);
}

export function isDesignLocked(design: CalendarState, solvedCaseIds: readonly string[]): boolean {
  if (design === 'none') return false;
  const need = DESIGN_UNLOCK[design];
  return !!need && !solvedCaseIds.includes(need);
}

/** Unknown values fall back to 'original'; a locked design without its case also falls back. */
export function normalizeCalendar(value: unknown, solvedCaseIds: readonly string[]): CalendarState {
  if (!isCalendarState(value)) return DEFAULT_CALENDAR;
  if (isDesignLocked(value, solvedCaseIds)) return DEFAULT_CALENDAR;
  return value;
}

export function normalizeRoomDecor(raw: unknown, solvedCaseIds: readonly string[]): RoomDecorState {
  const calendar =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as { calendar?: unknown }).calendar : undefined;
  return { calendar: normalizeCalendar(calendar, solvedCaseIds) };
}

export type CalendarLayers = { patch: string | null; design: string | null };

/** Overlay files RoomView stacks over the backdrop, bottom to top. */
export function calendarLayers(state: CalendarState): CalendarLayers {
  if (state === 'original') return { patch: null, design: null };
  if (state === 'none') return { patch: WALL_PATCH, design: null };
  return { patch: WALL_PATCH, design: DESIGN_OVERLAY[state] };
}

type ThemeLike = { id: string; wall?: string };

/** The panel skin that goes with a wall design, if the room data links one. */
export function themeForDesign(themes: readonly ThemeLike[], design: CalendarState): string | null {
  if (design === 'none') return null;
  return themes.find((theme) => theme.wall === design)?.id ?? null;
}

/** Design to hang back after a take-down: the one that matches the current panel skin. */
export function designForTheme(themes: readonly ThemeLike[], themeId: string | null): CalendarDesign {
  const wall = themes.find((theme) => theme.id === themeId)?.wall;
  return isCalendarState(wall) && wall !== 'none' ? wall : 'original';
}
