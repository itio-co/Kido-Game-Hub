/** Player-room decor: the case-01 photo may only sit on the keepsake wall shelf. */

export const KEEPSAKE_SHELF_ID = '6bb33448-6b61-4564-91e1-125bae9cf57c';

/** Canonical stored label. Old saves may still contain the legacy ตา wording. */
export const DECOR_PHOTO = '📷 รูปปู่';
export const DECOR_PHOTO_LEGACY = '📷 รูปตา';

export type DecorViolation = { code: string; detail: string };

/** Bag / catalog slug for young Grandpa's photo (`item` module, event-01 items.json). */
export const GRANDPA_PHOTO_SLUG = 'album-photo';

export function isGrandpaPhoto(value: string | null | undefined): boolean {
  if (!value) return false;
  return value.includes('รูปปู่') || value.includes('รูปตา') || value === GRANDPA_PHOTO_SLUG;
}

export type NormalizedDecor = {
  decor: Record<string, string | null>;
  violations: DecorViolation[];
  changed: boolean;
};

/**
 * Move a placed grandpa photo onto the keepsake shelf and drop copies in other slots.
 * Records `photo-off-shelf` when it had to be moved.
 */
export function normalizeDecor(decor: Record<string, string | null>): NormalizedDecor {
  const next: Record<string, string | null> = { ...decor };
  const violations: DecorViolation[] = [];
  const slots = Object.keys(next).filter((id) => isGrandpaPhoto(next[id]));
  if (slots.length === 0) return { decor: next, violations, changed: false };

  const offShelf = slots.filter((id) => id !== KEEPSAKE_SHELF_ID);
  for (const id of offShelf) next[id] = null;
  next[KEEPSAKE_SHELF_ID] = DECOR_PHOTO;

  if (offShelf.length > 0) {
    violations.push({ code: 'photo-off-shelf', detail: offShelf.join(',') });
  }

  const changed = slots.length !== 1
    || slots[0] !== KEEPSAKE_SHELF_ID
    || decor[KEEPSAKE_SHELF_ID] !== DECOR_PHOTO;
  return { decor: next, violations, changed };
}

/**
 * Where the placed photo is right now. Putting it away only hides it: the decor slot keeps
 * DECOR_PHOTO (the story's record that it was placed), so no progress is ever lost.
 */
export const GRANDPA_PHOTO_STATES = ['shelf', 'stored'] as const;
export type GrandpaPhotoState = (typeof GRANDPA_PHOTO_STATES)[number];
export const DEFAULT_GRANDPA_PHOTO: GrandpaPhotoState = 'shelf';
export const PHOTO_OVERLAY = 'keepsake-shelf-grandpa-photo.png';

export function normalizeGrandpaPhoto(value: unknown): GrandpaPhotoState {
  return value === 'stored' ? 'stored' : DEFAULT_GRANDPA_PHOTO;
}

/** The photo has been placed by the story (it lives in the keepsake slot). */
export function photoPlaced(decor: Record<string, string | null | undefined>): boolean {
  return isGrandpaPhoto(decor[KEEPSAKE_SHELF_ID]);
}

/** Shown on the shelf: placed and not put away. */
export function photoOnShelf(decor: Record<string, string | null | undefined>, state: GrandpaPhotoState): boolean {
  return photoPlaced(decor) && state !== 'stored';
}

/** Play the one-page placement comic when the player is home after a clear, and the story has not placed the photo yet. */
export function shouldPlayPhotoPlacement(input: {
  placed: boolean;
  screen: string;
  reward?: boolean;
  cleared?: boolean;
  caseDone?: boolean;
}): boolean {
  if (input.placed || input.screen !== 'player-room') return false;
  return input.reward === true || input.cleared === true || input.caseDone === true;
}
