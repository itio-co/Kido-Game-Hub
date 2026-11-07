/**
 * Characters that already appear in the game.
 * Prompts are reconstructed: no original image-generation prompt was stored in the repo.
 * Appearance notes in prototypes/asset-showcase/assets.json were used where they exist.
 * Grandma's hair is short and loose. Never a bun.
 */

export type PromptSource = 'original' | 'reconstructed';

export type Character = {
  id: string;
  /** Locale key for the Thai/English display name. */
  nameKey: string;
  /** Locale key for the role line. */
  roleKey: string;
  /** Paths under public/img/, the same files the game already loads. */
  portraits: string[];
  prompt: string;
  negative: string;
  styleNotes: string;
  promptSource: PromptSource;
  /** Registry entry version. Not a gameplay ruleset. */
  version: string;
};

export const CHARACTER_VERSION = '1.0.0';

const STYLE =
  'Stylized low-poly 3D storybook render, faceted clay-like surfaces, large glossy eyes, warm cozy light, Thai family home, no text, no watermark.';

const NEGATIVE_BASE =
  'photorealistic pores, extra fingers, deformed hands, text, watermark, logo, blurry, horror, modern glass skyscraper, anime lineart';

export const CHARACTERS: Character[] = [
  {
    id: 'player',
    nameKey: 'character.player.name',
    roleKey: 'character.player.role',
    portraits: ['cutscene-01-p1.jpg', 'cutscene-01-p3.jpg'],
    prompt: `${STYLE} A Thai child about eight years old, the player, short black bowl-cut hair with straight bangs, bright yellow t-shirt, blue shorts, round cheerful face, standing in a wooden living room.`,
    negative: NEGATIVE_BASE,
    styleNotes:
      'Reconstructed. The asset showcase note says bowl-cut black hair, yellow shirt, blue shorts. No generation prompt was saved.',
    promptSource: 'reconstructed',
    version: CHARACTER_VERSION,
  },
  {
    id: 'grandma',
    nameKey: 'character.grandma.name',
    roleKey: 'character.grandma.role',
    portraits: ['living-grandma.jpg', 'cutscene-01-p2.jpg', 'cutscene-01-p3.jpg'],
    prompt: `${STYLE} Grandma Mali, a kind Thai grandmother, short loose silver hair in a soft bob that sits around the ears, never a bun and never a topknot, warm brown eyes, lavender button cardigan, long purple geometric pha sin skirt, sitting on a beige sofa.`,
    negative: `${NEGATIVE_BASE}, hair bun, topknot, long hair, bald`,
    styleNotes:
      'Reconstructed from living-grandma.jpg and the canon line in locales (short, loose silver hair). Hair must stay short and loose.',
    promptSource: 'reconstructed',
    version: CHARACTER_VERSION,
  },
  {
    id: 'mom',
    nameKey: 'character.mom.name',
    roleKey: 'character.mom.role',
    portraits: ['cutscene-01-p1.jpg', 'cutscene-01-p2.jpg'],
    prompt: `${STYLE} Mom, a Thai woman in her thirties, black hair in a neat bun, cream long-sleeve blouse, purple patterned skirt, warm smile, holding a phone or hugging the child.`,
    negative: NEGATIVE_BASE,
    styleNotes: 'Reconstructed from cutscene-01-p1.jpg. Her bun is part of this character only, not Grandma.',
    promptSource: 'reconstructed',
    version: CHARACTER_VERSION,
  },
  {
    id: 'uncle-mek',
    nameKey: 'character.uncleMek.name',
    roleKey: 'character.uncleMek.role',
    portraits: ['uncle-mek.jpg'],
    prompt: `${STYLE} Uncle Mek, a friendly Thai man in his forties, short black hair, rectangular glasses, light blue polo shirt, beige trousers, brown shoes, seated in a teal armchair holding a newspaper crossword and a yellow pencil.`,
    negative: NEGATIVE_BASE,
    styleNotes: 'Reconstructed from uncle-mek.jpg. He runs the optional crossword.',
    promptSource: 'reconstructed',
    version: CHARACTER_VERSION,
  },
  {
    id: 'aunt-rin',
    nameKey: 'character.auntRin.name',
    roleKey: 'character.auntRin.role',
    portraits: ['rin.jpg'],
    prompt: `${STYLE} Aunt Rin, a gentle Thai woman, black hair in a low ponytail, sage-green button shirt, beige apron, olive skirt, holding a folded blue cloth, seated on a beige sofa.`,
    negative: NEGATIVE_BASE,
    styleNotes:
      'Reconstructed from rin.jpg. The asset showcase note says low ponytail, pale green shirt, apron. She moved the album; she is not a villain. There is no character named เพื่อนบี in this game.',
    promptSource: 'reconstructed',
    version: CHARACTER_VERSION,
  },
  {
    id: 'grandpa-young',
    nameKey: 'character.grandpaYoung.name',
    roleKey: 'character.grandpaYoung.role',
    portraits: ['egg-young-grandpa.webp'],
    prompt: `${STYLE} Young Grandpa as a round sticker portrait, Thai man in his twenties, short spiky black hair, thick eyebrows, rust-orange collared shirt over a white tee, wide friendly smile, peach background, white dashed circular border.`,
    negative: `${NEGATIVE_BASE}, elderly, grey hair, glasses`,
    styleNotes: 'Reconstructed from egg-young-grandpa.webp. He appears as a photo and a hidden fan sticker, not as a living NPC in the rooms.',
    promptSource: 'reconstructed',
    version: CHARACTER_VERSION,
  },
];

const byId = new Map(CHARACTERS.map((item) => [item.id, item]));

export function character(id: string): Character | undefined {
  return byId.get(id);
}

/** First reference picture, the same public/img path the game already uses. */
export function portraitFile(id: string): string {
  return byId.get(id)?.portraits[0] ?? '';
}
