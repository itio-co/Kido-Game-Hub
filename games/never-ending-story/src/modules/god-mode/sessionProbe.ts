import { godAccessRole } from './access';

/** True when this device may use God mode: an accepted God admin session, or a god / super_god player. */
export async function godSessionActive(): Promise<boolean> {
  return (await godAccessRole()) !== null;
}
