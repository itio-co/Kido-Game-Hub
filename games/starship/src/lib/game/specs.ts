/**
 * ALL hard limits of the game live here.
 *
 * Sources:
 *  - SpaceX, "Starship" vehicle page — https://www.spacex.com/vehicles/starship/
 *    (Starship diameter: 9 m; payload volume / pressurized volume figures).
 *  - Wikipedia, "SpaceX Starship" — https://en.wikipedia.org/wiki/SpaceX_Starship
 *    (pressurized volume listed as ~614 m³; we use the rounder, stricter 600 m³ limit).
 *
 * Design interpretation: the 9 m diameter is treated as the *interior* boundary of each deck
 * (radius 4.5 m). The rigid hull wall is drawn outside that radius.
 * 1 Three.js unit = 1 metre.
 */

/** Starship diameter (SpaceX): 9 m. */
export const HULL_OUTER_DIAMETER = 9.0;
/** Interior deck radius = 9 m / 2. HARD limit for module footprints. */
export const HULL_INNER_RADIUS = HULL_OUTER_DIAMETER / 2; // 4.5 m
/** Pressurized habitable volume limit (SpaceX/Wikipedia ≈ 600–614 m³; we use 600). */
export const HABITABLE_VOLUME_LIMIT = 600; // m³

/** Visual thickness of the rigid hull wall, drawn OUTSIDE the 4.5 m radius. */
export const HULL_WALL_THICKNESS = 0.25;
/** Footprints must stay this far inside the hull face (no clipping into the wall). */
export const WALL_MARGIN = 0.05;
export const MAX_FOOTPRINT_RADIUS = HULL_INNER_RADIUS - WALL_MARGIN; // 4.45 m

/** Floor area of one deck: π·4.5² ≈ 63.6 m². */
export const DECK_FLOOR_AREA = Math.PI * HULL_INNER_RADIUS ** 2;

/** Deck floor-to-ceiling (clear) height limits, metres. */
export const DECK_HEIGHT_MIN = 2.0;
export const DECK_HEIGHT_MAX = 4.0;
export const DECK_HEIGHT_DEFAULT = 2.4;
export const DECK_HEIGHT_STEP = 0.1;
/** Fixed floor/ceiling slab thickness per deck. */
export const SLAB_THICKNESS = 0.25;

/** Volume a deck consumes: π·r²·(clear height + slab). */
export const deckVolume = (clearHeight: number) => DECK_FLOOR_AREA * (clearHeight + SLAB_THICKNESS);
/** Max total stack height (clear + slabs) allowed by the volume limit ≈ 9.43 m. */
export const MAX_STACK_HEIGHT = HABITABLE_VOLUME_LIMIT / DECK_FLOOR_AREA;

/** Build-mode cut-away height of the hull on the selected deck (purely visual). */
export const CUTAWAY_HEIGHT = 1.1;

/** Fixed hull airlock on the bottom deck (world angle around Y, opening width in m). */
export const AIRLOCK_ANGLE = Math.PI; // −X side
export const AIRLOCK_WIDTH = 1.2;

/** Optional snapping (off by default). */
export const SNAP_POS = 0.25;
export const SNAP_ANGLE = 15;

/* ------------------------------------------------------------------------------------------
 * Human-factors values. Each says whether it was VERIFIED against the source or is an ASSUMPTION.
 * ------------------------------------------------------------------------------------------ */

/**
 * Minimum clear passageway width used by the path check (m).
 * VERIFIED: the International Docking System Standard (IDSS) specifies an 800 mm transfer
 * passageway in the mated configuration — https://law.resource.org/pub/us/cfr/ibr/005/nasa.idss.2011.pdf
 * See also NASA-STD-3000/MSIS §8.8 "Translation Paths" (https://msis.jsc.nasa.gov/sections/section08.htm)
 * and NASA-STD-3001 Vol. 2 §8.3 [V2 8013]. HIDH Fig. 8.8.3.1-1 numbers NOT verified.
 */
export const MIN_PASSAGE_WIDTH = 0.8;

/** Round floor hatch clear opening (m). VERIFIED basis: IDSS 800 mm passageway (see above). */
export const ROUND_HATCH_DIAMETER = 0.8;

/**
 * ISS USOS Common Berthing Mechanism hatch: ~50 in (1.27 m) square.
 * VERIFIED: NASA OCHMO technical brief "Vehicle Hatches"
 * (https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-028-vehicle-hatches.pdf). Reference only.
 */
export const ISS_CBM_HATCH_SIZE = 1.27;

/**
 * ISS crew quarters interior volume: 2.1 m³.
 * VERIFIED: NASA NTRS 20130011142, "ISS Crew Quarters On-Orbit Performance and Sustaining".
 * The crew-quarters pod here is 1.0 × 1.0 × 2.1 m = 2.1 m³ (the footprint split is an ASSUMPTION).
 */
export const ISS_CREW_QUARTERS_VOLUME = 2.1;

/** Minimum standing headroom (m). ASSUMPTION (Earth/partial gravity, ~95th-percentile stature + margin). */
export const MIN_HEADROOM = 2.0;

/** Default depth of the front access zone in front of equipment (m). ASSUMPTION (0.6–0.9 m by type). */
export const DEFAULT_ACCESS_DEPTH = 0.75;

/** Grid resolution of the passage flood-fill (m). */
export const PATH_GRID = 0.1;

/**
 * Electrical power available to cabin equipment (W). ASSUMPTION – placeholder budget, not a
 * published Starship figure. Change it here.
 */
export const AVAILABLE_POWER_W = 6000;

/** Concept disclaimer shown in the UI, README and exports. */
export const DISCLAIMER =
	'Concept-planning tool only. Real spacecraft interiors require engineering, structural and safety certification.';
