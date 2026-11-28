import { fetchMyRole } from '../../lib/cloudSync';
import { atLeast, normalizeRole, type Role } from '../../lib/roles';
import { god } from '../god/api';

/**
 * What this device may do in God mode, asked of the server every time (never remembered from the client):
 * - an accepted God admin session cookie acts as `super_god` (the password unlock path);
 * - otherwise this player's own role from `GET /api/players/me`, which counts only when it is `god` or `super_god`.
 * A plain player, a missing token, or an offline device gives null and no GOD button.
 */
export async function godAccessRole(): Promise<Role | null> {
  try {
    const me = await god<{ role?: unknown }>('me');
    return normalizeRole(me.role ?? 'super_god');
  } catch {
    // no admin session: fall through to the player's own role
  }
  const role = await fetchMyRole();
  return role && atLeast(role, 'god') ? role : null;
}
