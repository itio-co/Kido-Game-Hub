export type GodLoginFailure = {
  ok: false;
  code: 'bad-password' | 'locked' | 'not-configured' | 'error';
  attemptsLeft: number;
  retryAfterSec: number;
};

export type GodLoginResult = { ok: true } | GodLoginFailure;

function readError(error: unknown): { code: string; data: Record<string, unknown> } | null {
  if (!error || typeof error !== 'object') return null;
  const row = error as { code?: unknown; data?: unknown };
  if (typeof row.code !== 'string') return null;
  const data = row.data && typeof row.data === 'object' ? (row.data as Record<string, unknown>) : {};
  return { code: row.code, data };
}

/** Map the existing God login API errors. The password is never part of the result. */
export function classifyGodLoginError(error: unknown): GodLoginFailure {
  const row = readError(error);
  if (row?.code === 'bad-password') {
    return { ok: false, code: 'bad-password', attemptsLeft: Number(row.data.attemptsLeft ?? 0), retryAfterSec: 0 };
  }
  if (row?.code === 'locked') {
    return { ok: false, code: 'locked', attemptsLeft: 0, retryAfterSec: Number(row.data.retryAfterSec ?? 0) };
  }
  if (row?.code === 'not-configured') {
    return { ok: false, code: 'not-configured', attemptsLeft: 0, retryAfterSec: 0 };
  }
  return { ok: false, code: 'error', attemptsLeft: 0, retryAfterSec: 0 };
}

/** Run one login attempt. `post` sends the password; this function does not keep it. */
export async function settleLogin(post: () => Promise<void>): Promise<GodLoginResult> {
  try {
    await post();
    return { ok: true };
  } catch (error) {
    return classifyGodLoginError(error);
  }
}
