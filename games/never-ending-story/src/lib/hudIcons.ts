/** Bottom-bar bag, case-notebook, and house-map buttons stay hidden on these minigame screens. */
export const CASE_HUD_HIDDEN_SCREENS = ['crossword', 'jigsaw', 'slide'] as const;

export function isMinigameHudScreen(screen: string): boolean {
  return (CASE_HUD_HIDDEN_SCREENS as readonly string[]).includes(screen);
}

/** Case UI is on, and the player is not inside a minigame. */
export function showBagAndNotebook(showCaseUi: boolean, screen: string): boolean {
  return showCaseUi && !isMinigameHudScreen(screen);
}

/**
 * House-map icon: same minigame hide as bag/notebook.
 * Unlocked scenes keep the existing showHouseMapButton gate.
 * Locked map scenes still show the icon (with a lock badge) so the locked state is visible.
 */
export function showHouseMapHud(input: {
  screen: string;
  showHouseMapButton: boolean;
  showCaseUi: boolean;
  sceneHasMap: boolean;
}): boolean {
  if (isMinigameHudScreen(input.screen)) return false;
  if (input.showHouseMapButton) return true;
  return input.showCaseUi && input.sceneHasMap;
}
