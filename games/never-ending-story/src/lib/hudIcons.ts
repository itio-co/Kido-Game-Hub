/** Bottom-bar bag and case-notebook buttons stay hidden on these minigame screens. */
export const CASE_HUD_HIDDEN_SCREENS = ['crossword', 'jigsaw', 'slide'] as const;

export function isMinigameHudScreen(screen: string): boolean {
  return (CASE_HUD_HIDDEN_SCREENS as readonly string[]).includes(screen);
}

/** Case UI is on, and the player is not inside a minigame. */
export function showBagAndNotebook(showCaseUi: boolean, screen: string): boolean {
  return showCaseUi && !isMinigameHudScreen(screen);
}
