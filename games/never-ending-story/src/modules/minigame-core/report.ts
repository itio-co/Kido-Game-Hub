/** Turn a finished run into the protobuf token and queue it for the leaderboard API. */
import { reportStreakWin, submitRun } from '../../lib/cloudSync';
import { packRun, type ChallengeRunPb } from './runProto';

export type { ChallengeRunPb };

/** Same token the client has always queued. `mine` runs are ranked; challenger copies are not. */
export async function submitFinishedRun(run: ChallengeRunPb, mine = true): Promise<string> {
  const token = await packRun(run).catch(() => '');
  if (token) submitRun(token, mine);
  return token;
}

/**
 * A minigame outside ranked runs (story or practice) was won: count it for the daily streak.
 * Ranked runs already count when `submitFinishedRun` reaches the server. Best-effort, never throws.
 */
export function reportWin(game: string): void {
  void reportStreakWin(game).catch(() => undefined);
}
