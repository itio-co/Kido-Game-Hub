/** Practice drills, the story case, or an online challenge/share link. */
export type PlayMode = 'practice' | 'story' | 'challenge';

export function playModeFromContext(context: string, practice: boolean): PlayMode {
  if (practice || context === 'practice') return 'practice';
  if (context === 'event') return 'story';
  return 'challenge';
}

export type MinigameKind = 'minigame' | 'engine' | 'pack' | 'feature';

export type MinigameDef = {
  id: string;
  kind: MinigameKind;
  /** Surfaces this module can be played from. */
  modes: PlayMode[];
  /** Server `game` key when this module submits a ranked run. */
  leaderboardId?: string;
};

/** Identity helper so every minigame, engine, and pack registers through this module. */
export function defineMinigame<T extends MinigameDef>(def: T): T {
  return def;
}
