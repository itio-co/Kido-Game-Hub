import { god } from '../god/api';
import { settleLogin, type GodLoginResult } from './loginResult';

export type { GodLoginFailure, GodLoginResult } from './loginResult';
export { classifyGodLoginError } from './loginResult';

/**
 * POST /api/god/login. The password is sent once and not stored.
 * The server sets the existing HttpOnly session cookie.
 */
export async function loginGod(password: string): Promise<GodLoginResult> {
  return settleLogin(() => god('login', { method: 'POST', body: JSON.stringify({ password }) }).then(() => undefined));
}
