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

export const CUTSCENE_VERSION = '1.0.2';

const STYLE =
  'Stylized low-poly 3D storybook illustration, faceted clay-like surfaces, warm cozy light, modern Thai two-storey family home, no text, no watermark.';
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
    prompt: `${STYLE} Top-down clay miniature floor plan of the ground floor of Grandma's modern two-storey house on cream paper, no labels. L-shaped footprint, top of the image is the front. Front door with steps at the left of the top wall into an entrance hall with a shoe rack (top-left). Stairs in the top middle, 0.9 m wide: the foot opens into the middle of the living room's front wall, run 1 (6 treads) climbs toward the front, a flat corner landing, run 2 (3 treads) to the right along the front wall, a second flat landing in the front-right corner, run 3 (5 treads) climbs toward the back; 15 risers. A small guest toilet under runs 2-3, its door right beside the stair foot. An open lawn garden with round bushes beside the house at the top-right (no building there). Living room across the middle: rug, coffee table with two flowers, tan sofa against the back wall facing the front, side table with the blue star box on its left, teal armchair on its right, low bookshelf by the kitchen door. Grandma's bedroom across the back-left, door at the left end of the living room's back wall, bed with its head on the top wall, wardrobe bottom-left, windows on the left and bottom walls. Right wing: kitchen entered from a door near the back of the living room's right wall (counter and sink under a window along its top wall looking onto the garden, stove counter along its right wall, patterned rug by the door), and below it Grandma's en-suite of the same depth, opened only from her bedroom. Used as the house plan and as the case-challenge jigsaw photo.`,
    negative: `${NEGATIVE}, text, labels, letters`,
    styleNotes: `Generated 2026-11-22 for house v2 phase 1 (docs/design/house-v2-proposal.md). Relaid out 2026-11-23 to the owner-approved L footprint (draft v9): rendered 2026-11-23 as a low-poly clay 3D scene in Blender (top-down camera, soft sun shadows, cream paper) built on the exact layout grid, so walls, doors and windows match the approved plan and stay aligned with the tap spots. Room cameras stand at the door looking in: living-wide looks from the stair foot toward the back (kitchen door on the left of the picture, Grandma's door on the right); kitchen-wide looks from its door toward the right wing's far wall (window and sink on the left = garden side, Grandma's en-suite side on the right). Map spots and the deduction zones in event-core FlowView follow this footprint. ${sheet}`,
    promptSource: 'original',
    version: CUTSCENE_VERSION,
    order: 70,
  },
  {
    id: 'house.map-2f',
    file: 'house-map-2f.jpg',
    usedIn: ['event-01', 'jigsaw'],
    characterIds: [],
    prompt: `${STYLE} Top-down clay miniature floor plan of the UPPER floor of Grandma's modern two-storey house on cream paper, same L footprint and framing as house-map.jpg, no labels, no front door. The open stairwell over the ground-floor stairs (three runs, two landings, wooden balustrade) in the top middle, arriving at the front-right; a small storage cupboard between the runs; an outdoor wooden balcony with railings at the front-left above the entrance hall, glass door from the hall. The garden at the top-right stays open lawn. Open upstairs hall with a bench, plant and rug in the middle. Uncle Mek and Auntie's bedroom across the back (double bed with its head on the top wall, two bedside tables, wardrobe), their en-suite in the bottom-right directly above Grandma's, same size, opened only from their bedroom. The study above the kitchen only, door at the top of its left wall: desk with lamp and chair along its top wall, window in its right wall with a blue star box (upper) and a yellow leaf box (lower) under it, tall bookshelf along its bottom wall.`,
    negative: `${NEGATIVE}, text, labels, letters`,
    styleNotes: `Generated 2026-11-22 for house v2 phase 2; relaid out 2026-11-23 to the owner-approved floor-2 draft v4 on the same grid as house-map.jpg, rendered as the same low-poly clay 3D Blender scene. The study-wide.jpg camera stands at the study door (left wall) looking toward the right wall: desk on the picture's left = the plan's top wall, window on the far wall = the plan's right wall, bookshelf on the right = the plan's bottom wall, so the star box sits above the leaf box on the plan. Also the event jigsaw photo, because E04 points at the upstairs study. ${sheet}`,
    promptSource: 'original',
    version: CUTSCENE_VERSION,
    order: 71,
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
    characterIds: ['grandma', 'player'],
    prompt: `${STYLE} Vertical three-panel comic in Saturday-morning light: (1) a modern Thai suburban two-storey house with cream walls, brown tiled roof, a balcony above the central wooden front door, low front steps and a small silver hatchback in the front yard; (2) Grandma Mali with short loose silver hair, lavender cardigan and purple pha sin welcoming with open arms in the open front doorway; (3) the laughing child hugging Grandma Mali (same look as panel 2) at the front door, both faces visible, an indoor staircase behind; Mom is not in this panel. Character ids grandma, player.`,
    negative: `${NEGATIVE}, traditional Thai stilt house, raised wooden house, sunset`,
    styleNotes: `Generated 2026-11-22 for house v2 phase 1; matches the modern interiors and house-map.jpg (front door in the middle, stairs inside). Panel 3 regenerated 2026-11-22 (cutscene 1.0.2): the child hugs Grandma, not Mom; panels 1-2 kept losslessly. Grandma's hair stays short and loose. ${sheet}`,
    promptSource: 'original',
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
    styleNotes: `Reconstructed. Since house v2 phase 2 this is the upstairs study above the kitchen (screen id stays study). Also the locked cover for case-02. ${sheet}`,
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
    styleNotes: `Reconstructed. Mirrored left-right on 2026-11-22 (owner: the render was the wrong way round): stove and hood on the right, sink under the window on the left. Vase and pot swapped by hand on 2026-11-23 (owner: the close-up shows the vase under the towel), so the vase stands on the back counter under the towel and the pot by the faucet. This is the story kitchen, not the stir-fry minigame backdrop. ${sheet}`,
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
    styleNotes: `Reconstructed. Mirrored left-right on 2026-11-22 with kitchen-wide.jpg: vase on the left, wet cloth on the right. ${sheet}`,
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
