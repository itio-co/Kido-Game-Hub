import { god } from './api';

/** True only when the HttpOnly God cookie is accepted. A missing or rejected session hides the button. */
export async function godSessionActive(): Promise<boolean> {
  try {
    await god('me');
    return true;
  } catch {
    return false;
  }
}
