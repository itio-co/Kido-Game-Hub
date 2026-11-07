/** Turn a finished run into the protobuf token and queue it for the leaderboard API. */
import { submitRun } from '../../lib/cloudSync';
import { packRun, type ChallengeRunPb } from './runProto';

export type { ChallengeRunPb };

/** Same token the client has always queued. `mine` runs are ranked; challenger copies are not. */
export async function submitFinishedRun(run: ChallengeRunPb, mine = true): Promise<string> {
  const token = await packRun(run).catch(() => '');
  if (token) submitRun(token, mine);
  return token;
}
