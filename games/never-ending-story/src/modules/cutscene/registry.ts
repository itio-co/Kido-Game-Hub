/**
 * Story and room illustrations already shipped in public/img/.
 * No original image-generation prompt was stored in the repo (the nightstand prompt is a 3D prop, not these scenes).
 * Every prompt below is reconstructed from the picture and the story text.
 * People in a frame are character ids, not a second copy of the character sheet.
 */

export type Artwork = {
  id: string;
  /** Path under public/img/. Same string the story pack and prologue already use. */
  file: string;
  /** Code sites that show this frame, such as prologue or event-01. */
  usedIn: string[];
  /** Ids from the character module. */
  characterIds: string[];
  prompt: string;
  negative: string;
  styleNotes: string;
  promptSource: 'original' | 'reconstructed';
  version: string;
  /** Sort key when a caller asks for every frame of one use. */
  order: number;
};

export const CUTSCENE_VERSION = '1.0.0';

const STYLE =
  'Stylized low-poly 3D storybook illustration, faceted clay-like surfaces, warm cozy light, Thai wooden house, no text, no watermark.';
const NEGATIVE =
  'photorealistic pores, extra fingers, text, watermark, logo, blurry, horror, grandma hair bun, grandma topknot';

const sheet = 'Use the character module sheet for anyone listed; do not redesign them.';

export const ARTWORKS: Artwork[] = [
  {
    id: 'prologue.player-room',
    file: 'player-room-wide.jpg',
    usedIn: ['prologue'],
    characterIds: [],
    prompt: `${STYLE} Wide view of a child's bedroom that is the game hub: bed, nightstand, calendar, door, souvenir shelf, warm afternoon light.`,
    negative: NEGATIVE,
    styleNotes: `Reconstructed. ${sheet}`,
    promptSource: 'reconstructed',
    version: CUTSCENE_VERSION,
    order: 10,
  },
  {
    id: 'prologue.house-map',
    file: 'house-map.jpg',
    usedIn: ['prologue', 'event-01', 'jigsaw'],
    characterIds: [],
    prompt: `${STYLE} Illustrated top-down map of Grandma's wooden house and yard, rooms labelled by the picture itself, soft paper colors, used as the house plan and as the jigsaw photo.`,
    negative: NEGATIVE,
    styleNotes: `Reconstructed. ${sheet}`,
    promptSource: 'reconstructed',
    version: CUTSCENE_VERSION,
    order: 70,
  },
  {
    id: 'prologue.grandma',
    file: 'living-grandma.jpg',
    usedIn: ['prologue', 'case-01'],
    characterIds: ['grandma'],
    prompt: `${STYLE} Grandma Mali seated on a beige sofa in the living room, hands folded, short loose silver hair, never a bun, lavender cardigan and purple pha sin. Character id grandma.`,
    negative: NEGATIVE,
    styleNotes: `Reconstructed from the portrait. ${sheet}`,
    promptSource: 'reconstructed',
    version: CUTSCENE_VERSION,
    order: 30,
  },
  {
    id: 'prologue.yesterday',
    file: 'living-wide-yesterday.jpg',
    usedIn: ['prologue', 'case-01'],
    characterIds: ['grandma'],
    prompt: `${STYLE} Yesterday evening in the living room: Grandma Mali standing by the shelf, album still on the high shelf, dry table, warm lamp light. Character id grandma.`,
    negative: NEGATIVE,
    styleNotes: `Reconstructed from the case timeline (yesterday evening). ${sheet}`,
    promptSource: 'reconstructed',
    version: CUTSCENE_VERSION,
    order: 40,
  },
  {
    id: 'prologue.living-now',
    file: 'living-wide.jpg',
    usedIn: ['prologue', 'event-01', 'case-01'],
    characterIds: [],
    prompt: `${STYLE} Present-time wide living room at 17:00, album missing from the table, a damp cloth and a small note, beige sofa, wooden shelf, blue curtains.`,
    negative: NEGATIVE,
    styleNotes: `Reconstructed. ${sheet}`,
    promptSource: 'reconstructed',
    version: CUTSCENE_VERSION,
    order: 50,
  },
  {
    id: 'case-01.p1',
    file: 'cutscene-01-p1.jpg',
    usedIn: ['case-01', 'event-01'],
    characterIds: ['mom', 'player'],
    prompt: `${STYLE} Three-panel comic: Mom on the phone, the child cheering in a yellow shirt, then both packing a bag of fruit. Character ids mom and player.`,
    negative: NEGATIVE,
    styleNotes: `Reconstructed from cutscene-01-p1.jpg. ${sheet}`,
    promptSource: 'reconstructed',
    version: CUTSCENE_VERSION,
    order: 1,
  },
  {
    id: 'case-01.p2',
    file: 'cutscene-01-p2.jpg',
    usedIn: ['case-01', 'event-01'],
    characterIds: ['grandma', 'mom', 'player'],
    prompt: `${STYLE} Three-panel comic at sunset: stilt wooden house and a small car, Grandma Mali in the doorway with arms open and short loose silver hair, then Mom hugging the child. Character ids grandma, mom, player.`,
    negative: NEGATIVE,
    styleNotes: `Reconstructed from cutscene-01-p2.jpg. Grandma's hair stays short and loose. ${sheet}`,
    promptSource: 'reconstructed',
    version: CUTSCENE_VERSION,
    order: 2,
  },
  {
    id: 'case-01.p3',
    file: 'cutscene-01-p3.jpg',
    usedIn: ['case-01', 'event-01'],
    characterIds: ['grandma', 'player'],
    prompt: `${STYLE} Three-panel comic: empty shelf where the album was, worried Grandma Mali with a hand on her cheek and short loose silver hair, then the child with a notebook looking determined. Character ids grandma and player.`,
    negative: NEGATIVE,
    styleNotes: `Reconstructed from cutscene-01-p3.jpg. ${sheet}`,
    promptSource: 'reconstructed',
    version: CUTSCENE_VERSION,
    order: 3,
  },
  {
    id: 'case-01.ending-01',
    file: 'ending-01.jpg',
    usedIn: ['case-01-ending'],
    characterIds: ['player', 'grandma'],
    prompt: `${STYLE} The child hands Grandma Mali the family album and an old poster in the living room. Character ids player and grandma. Grandma's silver hair is short and loose.`,
    negative: NEGATIVE,
    styleNotes: `Reconstructed from the ending caption. ${sheet}`,
    promptSource: 'reconstructed',
    version: CUTSCENE_VERSION,
    order: 80,
  },
  {
    id: 'case-01.ending-02',
    file: 'ending-02.jpg',
    usedIn: ['case-01-ending'],
    characterIds: ['grandma', 'grandpa-young'],
    prompt: `${STYLE} Grandma Mali smiles over a photo of young Grandpa. The photo matches character id grandpa-young. Her hair is short and loose.`,
    negative: NEGATIVE,
    styleNotes: `Reconstructed from the ending caption. ${sheet}`,
    promptSource: 'reconstructed',
    version: CUTSCENE_VERSION,
    order: 81,
  },
  {
    id: 'case-01.ending-03',
    file: 'ending-03.jpg',
    usedIn: ['case-01-ending'],
    characterIds: ['grandma', 'player'],
    prompt: `${STYLE} Grandma Mali telling a warm story to the child, both on the sofa, album open. Character ids grandma and player.`,
    negative: NEGATIVE,
    styleNotes: `Reconstructed from the ending caption. ${sheet}`,
    promptSource: 'reconstructed',
    version: CUTSCENE_VERSION,
    order: 82,
  },
  {
    id: 'case-01.ending-04',
    file: 'ending-04.jpg',
    usedIn: ['case-01-ending'],
    characterIds: ['grandma', 'player', 'grandpa-young'],
    prompt: `${STYLE} Grandma and the child laugh at young Grandpa's old haircut in a photo. Character ids grandma, player, grandpa-young.`,
    negative: NEGATIVE,
    styleNotes: `Reconstructed from the ending caption. ${sheet}`,
    promptSource: 'reconstructed',
    version: CUTSCENE_VERSION,
    order: 83,
  },
  {
    id: 'case-01.ending-05',
    file: 'ending-05.jpg',
    usedIn: ['case-01-ending'],
    characterIds: ['grandma'],
    prompt: `${STYLE} Close view of the old poster "library of yesterday, drawer 7" in Grandma's hands, short loose silver hair at the edge of frame. Character id grandma.`,
    negative: NEGATIVE,
    styleNotes: `Reconstructed from the ending caption. Do not render readable text if it would misspell the poster. ${sheet}`,
    promptSource: 'reconstructed',
    version: CUTSCENE_VERSION,
    order: 84,
  },
  {
    id: 'scene.living-afternoon',
    file: 'living-wide-afternoon.jpg',
    usedIn: ['case-01'],
    characterIds: ['aunt-rin'],
    prompt: `${STYLE} Afternoon living room, Aunt Rin wiping a spilled vase on the coffee table, album still on the table, no note yet. Character id aunt-rin.`,
    negative: NEGATIVE,
    styleNotes: `Reconstructed from the case timeline. ${sheet}`,
    promptSource: 'reconstructed',
    version: CUTSCENE_VERSION,
    order: 41,
  },
  {
    id: 'scene.living-table',
    file: 'living-table.jpg',
    usedIn: ['case-01'],
    characterIds: [],
    prompt: `${STYLE} Close view of the living-room coffee table, wet ring, cloth, and the empty rectangle where the album sat.`,
    negative: NEGATIVE,
    styleNotes: `Reconstructed. ${sheet}`,
    promptSource: 'reconstructed',
    version: CUTSCENE_VERSION,
    order: 42,
  },
  {
    id: 'scene.living-tray',
    file: 'living-shelf-tray.jpg',
    usedIn: ['case-01'],
    characterIds: [],
    prompt: `${STYLE} Close view of a shelf tray of jigsaw pieces that form the house map, wooden shelf, small plants.`,
    negative: NEGATIVE,
    styleNotes: `Reconstructed. ${sheet}`,
    promptSource: 'reconstructed',
    version: CUTSCENE_VERSION,
    order: 43,
  },
  {
    id: 'scene.uncle-mek',
    file: 'uncle-mek.jpg',
    usedIn: ['case-01'],
    characterIds: ['uncle-mek'],
    prompt: `${STYLE} Uncle Mek in a teal armchair doing a newspaper crossword with a pencil. Character id uncle-mek.`,
    negative: NEGATIVE,
    styleNotes: `Reconstructed from uncle-mek.jpg. ${sheet}`,
    promptSource: 'reconstructed',
    version: CUTSCENE_VERSION,
    order: 44,
  },
  {
    id: 'scene.aunt-rin',
    file: 'rin.jpg',
    usedIn: ['case-01'],
    characterIds: ['aunt-rin'],
    prompt: `${STYLE} Aunt Rin seated with a folded blue cloth, low ponytail, sage shirt, apron. Character id aunt-rin.`,
    negative: NEGATIVE,
    styleNotes: `Reconstructed from rin.jpg. ${sheet}`,
    promptSource: 'reconstructed',
    version: CUTSCENE_VERSION,
    order: 45,
  },
  {
    id: 'scene.study-wide',
    file: 'study-wide.jpg',
    usedIn: ['event-01', 'case-01'],
    characterIds: [],
    prompt: `${STYLE} Wide study with a wooden desk, window, and shelves, afternoon light, no people.`,
    negative: NEGATIVE,
    styleNotes: `Reconstructed. Also the locked cover for case-02. ${sheet}`,
    promptSource: 'reconstructed',
    version: CUTSCENE_VERSION,
    order: 60,
  },
  {
    id: 'scene.study-box',
    file: 'study-box.jpg',
    usedIn: ['case-01'],
    characterIds: [],
    prompt: `${STYLE} Close view of a star-shaped photo box under the study window, wooden floor, soft light.`,
    negative: NEGATIVE,
    styleNotes: `Reconstructed. ${sheet}`,
    promptSource: 'reconstructed',
    version: CUTSCENE_VERSION,
    order: 61,
  },
  {
    id: 'scene.kitchen-wide',
    file: 'kitchen-wide.jpg',
    usedIn: ['event-01', 'case-01'],
    characterIds: [],
    prompt: `${STYLE} Wide Thai home kitchen, wooden cabinets, stove, window, no people. Also used as the locked cover for case-03.`,
    negative: NEGATIVE,
    styleNotes: `Reconstructed. This is the story kitchen, not the stir-fry minigame backdrop. ${sheet}`,
    promptSource: 'reconstructed',
    version: CUTSCENE_VERSION,
    order: 62,
  },
  {
    id: 'scene.kitchen-close',
    file: 'kitchen-close.jpg',
    usedIn: ['case-01'],
    characterIds: [],
    prompt: `${STYLE} Close view of the kitchen counter and a damp cloth, wooden cabinets, warm light.`,
    negative: NEGATIVE,
    styleNotes: `Reconstructed. ${sheet}`,
    promptSource: 'reconstructed',
    version: CUTSCENE_VERSION,
    order: 63,
  },
  {
    id: 'scene.album-found',
    file: 'album-found.jpg',
    usedIn: ['case-01'],
    characterIds: [],
    prompt: `${STYLE} The family album found inside the star box, a faded cover and an old poster peeking out, wooden table.`,
    negative: NEGATIVE,
    styleNotes: `Reconstructed. ${sheet}`,
    promptSource: 'reconstructed',
    version: CUTSCENE_VERSION,
    order: 64,
  },
];

const byId = new Map(ARTWORKS.map((item) => [item.id, item]));
const byFile = new Map(ARTWORKS.map((item) => [item.file, item]));

export function artwork(id: string): Artwork | undefined {
  return byId.get(id);
}

/** Filename under public/img/. Empty string when the id is unknown. */
export function artworkFile(id: string): string {
  return byId.get(id)?.file ?? '';
}

export function artworkByFile(file: string): Artwork | undefined {
  return byFile.get(file);
}

/** Stable list for one use tag, in `order`. */
export function filesForUse(use: string): string[] {
  return ARTWORKS.filter((item) => item.usedIn.includes(use))
    .sort((a, b) => a.order - b.order)
    .map((item) => item.file);
}
