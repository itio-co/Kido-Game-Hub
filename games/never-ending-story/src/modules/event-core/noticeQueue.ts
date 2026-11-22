/** Queue a bottom-of-screen message so it never overlaps an open dialog or note. */

export function enqueueNotice(busy: boolean, pending: readonly string[], text: string): { pending: string[]; show: string | null } {
  if (!text) return { pending: [...pending], show: null };
  if (busy) return { pending: [...pending, text], show: null };
  return { pending: [...pending], show: text };
}

export function flushNotice(busy: boolean, pending: readonly string[]): { pending: string[]; show: string | null } {
  if (busy || pending.length === 0) return { pending: [...pending], show: null };
  return { pending: pending.slice(1), show: pending[0] };
}
