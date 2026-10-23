# Starship reference data for the Surface Habitat mode

All values used by the code live in `src/lib/game/ship.ts` (whole-ship model) and `src/lib/game/specs.ts`
(cabin / human factors). Each number has a confidence tag:

- **OFFICIAL**: published by SpaceX or NASA.
- **REPORTED**: secondary source (Wikipedia, NASASpaceflight, Ringwatchers, peer-reviewed papers); reasonable confidence.
- **DERIVED**: computed from the numbers above (the formula is given).
- **ESTIMATE**: no public figure. The value is chosen to be consistent with everything above and is shown with an
  ESTIMATE badge in the UI.

Researched on 2026-10-18. Starship changes quickly. The model is a **V3-class ship (2026)**. SpaceX still lists
the ship at 52 m with 1,600 t of propellant, and the V3 announcement says only that tank volume increased, with
no breakdown.

**Disclaimer:** this is concept-planning data, not engineering data. Cutting domes, inserting rings or opening
the hull of a pressure vessel needs full structural requalification by qualified engineers.

## 1. Vehicle

| Item | Value | Confidence | Source |
|---|---|---|---|
| Ship height | 52 m | OFFICIAL | spacex.com/vehicles/starship (technical specifications, accessed 2026-10-18) |
| Ship height, Block 2 | 52.1 m (Block 1: 50.3 m) | REPORTED | Wikipedia, "SpaceX Starship (spacecraft)", infobox |
| V3 stack | ~124.4 m total; V3 described as "about 1.5 m taller" than earlier builds | REPORTED | Space.com, "How SpaceX's new Starship V3 differs…" (2026); orbitcodex.com |
| Diameter | 9 m | OFFICIAL | spacex.com |
| Propellant capacity (V3) | 1,600 t | OFFICIAL | spacex.com technical specifications |
| Propellant, Block 2 | 1,500 t (1,170 t LOX + 330 t CH4) | REPORTED | Wikipedia (Tanks section) |
| Mixture ratio O/F | ~3.6 : 1 (3.4–3.6 range) | REPORTED | DLR, "Critical Analysis of SpaceX's Next Generation Space Transportation System", HiSST 2022 |
| Payload-bay volume | 614 m³ | REPORTED | Wikipedia infobox, citing NASASpaceflight 2025-10-21 |
| HLS habitable volume claim | ">600 m³ combined habitable volume" | REPORTED | spacex-atlas.com (HLS), NASA HLS material |
| Empty mass | ~85 t (Block 2), ~100 t (Block 1) | REPORTED | Wikipedia |

## 2. Hull construction

| Item | Value | Confidence | Source |
|---|---|---|---|
| Ring height | 1.83 m (6.00 ft) | REPORTED | Wikipedia, Manufacturing section; NSF assembly animation ("about 1.8 m high") |
| Wall thickness | 3.97–4 mm (3.6 mm and 3 mm rolls seen, unconfirmed in use) | REPORTED | Wikipedia; space.stackexchange.com Q66384 / Q67144 |
| Ring mass | ~1,600 kg | DERIVED (Wikipedia note: from dimensions and 7.93 g/cm³) | Wikipedia |
| Material | 301 → 304L → proprietary "30X" | REPORTED | Wikipedia; spacelaunchlive.com |
| Ring count (Block 1/2) | 20–21 rings + nose cone | REPORTED | Wikipedia ("Twenty-one such rings are used") |
| Ring stacks | welded in stacks of 3–5; domes sleeved into the aft, common and forward stacks | REPORTED | Wikipedia / NASASpaceflight manufacturing coverage |
| Stringers | 24 internal stringers in the LOX tank (Block 1); added to the CH4 tank on Block 2 | REPORTED | Wikipedia |
| Domes | Block 2 uses flatter elliptical forward and common domes; the common dome bulges down into the LOX tank | REPORTED | Wikipedia; Ringwatchers "From Render to Reality: Block 2" |

## 3. Section layout (bottom → top), model used by the app

There is no official station drawing. The ring counts below are an **ESTIMATE**, chosen so that the tank
volumes match the official 1,600 t of propellant with about 6 % ullage, and the total matches the 52 m height
and ~21–22 rings.

| Section | Rings | Height | z range (m above base) | Confidence |
|---|---|---|---|---|
| Engine bay / aft skirt (aft dome + thrust puck) | 3 | 5.49 m | 0 – 5.49 | ESTIMATE (NSF animation: "these four rings are part of the skirt section") |
| LOX main tank (aft dome equator → common dome equator) | 10 | 18.30 m | 5.49 – 23.79 | ESTIMATE |
| CH4 main tank (common dome → forward dome) | 6 | 10.98 m | 23.79 – 34.77 | ESTIMATE (NSF animation: "methane tank … ends four rings higher with the forward dome" on an earlier build) |
| Payload / crew bay barrel | 3 | 5.49 m | 34.77 – 40.26 | ESTIMATE |
| Nose cone (tangent ogive) | — | 11.74 m | 40.26 – 52.00 | ESTIMATE (shape and length) |
| Dome rise (each of aft, common, forward) | — | 2.0 m | — | ESTIMATE ("flatter" Block 2 elliptical domes) |
| CH4 header tank | sphere, ~17 m³ (r ≈ 1.6 m) | — | sits in the common-dome sump | REPORTED location (Wikipedia); size from DLR 2022 estimate (17 m³) |
| LOX header tank | sphere, ~19 m³ (r ≈ 1.65 m) | — | tip of nose cone | REPORTED location; size from DLR 2022 estimate (19 m³) |

### Derived volumes (inner radius 4.5 m, deck area π·4.5² = 63.6 m²)

| Quantity | Formula | Value | Confidence |
|---|---|---|---|
| LOX mass (1,600 t, O/F 3.6) | 1600·3.6/4.6 | 1,252 t | DERIVED |
| CH4 mass | 1600/4.6 | 348 t | DERIVED |
| LOX volume needed | 1,252 t ÷ 1,141 kg/m³ | 1,097 m³ | DERIVED (LOX density at NBP 1,141 kg/m³; Starship sub-cools, so the real density is slightly higher) |
| CH4 volume needed | 348 t ÷ 422 kg/m³ | 824 m³ | DERIVED (LCH4 density at NBP 422 kg/m³) |
| Elliptical dome cap volume | (2/3)·π·R²·h, h = 2.0 m | 84.8 m³ | DERIVED from ESTIMATE |
| LOX tank geometric volume | 10 rings · 1.83 · 63.6 (+ aft cap − common cap) | 1,164 m³ (≈ 1,097 + 6 % ullage) | DERIVED / ESTIMATE |
| CH4 tank geometric volume | 6 · 1.83 · 63.6 + 2 caps | 868 m³ (≈ 824 + 5 %) | DERIVED / ESTIMATE |
| Payload barrel + nose | 3 · 1.83 · 63.6 − fwd cap + ogive volume (415 m³) | 679 m³ gross (reported usable: 614 m³) | DERIVED |

### Nose-cone usable radius

The nose is modelled as a tangent ogive (**ESTIMATE**: the real nose is close to an ogive but not documented).

- With base radius R = 4.5 m and length L = 11.74 m: ρ = (R² + L²) / 2R, and r(y) = √(ρ² − y²) − (ρ − R) for
  y measured up from the nose base.
- A deck's usable radius is r at (floor + min(clear height, 2.0 m)), minus a 0.05 m wall margin. This is the
  radius at standing head height (MIN_HEADROOM, NASA-STD-3001 based, see `specs.ts`). Decks are refused if this
  radius drops below 1.2 m (ESTIMATE).
- Decks must end 4.5 m below the tip (LOX header tank zone, ESTIMATE).

## 4. Landing and access (HLS)

| Item | Value | Confidence | Source |
|---|---|---|---|
| HLS height | ~50 m (NASA older), 52 m / 171 ft (NASA OIG 2026 planning envelope) | OFFICIAL / REPORTED | NASA HLS page; thespaceatlas.org citing NASA OIG |
| Crew elevator | basket on a vertical rail, top ~115 ft (~35 m) above the surface | REPORTED | thespaceatlas.org citing NASA OIG; NASA "Astronauts Practice Next Giant Leap" |
| Airlocks | two airlocks on an airlock deck below the crew cabin | OFFICIAL (NASA) / REPORTED | NASA HLS suit-test article; spacex-atlas.com |
| Landing legs | four legs (upper/lower strut + foot) | REPORTED (image-based) | spacex-atlas.com; NASA renders |
| Tilt limit | 8° after landing | OFFICIAL (NASA requirement, reported) | thespaceatlas.org citing NASA OIG |

The app draws four simple legs and keeps the existing cabin airlock on the first crew deck. These are
**ESTIMATE** visuals only.

## 5. Gravity

| Body | g | Source |
|---|---|---|
| Moon | 1.62 m/s² | NASA Moon fact sheet (standard value) |
| Mars | 3.71 m/s² (3.72) | NASA Mars fact sheet (standard value) |

## 6. Regolith and shielding

| Item | Value | Confidence | Source |
|---|---|---|---|
| Lunar regolith bulk density | ~1.5 g/cm³ near the surface, 1.6–1.8 at depth; 1.6 g/cm³ used as nominal highland value | REPORTED | Pilles et al. / MDPI Applied Sciences 11(9):3853 (2021), "Utilisation of Moon Regolith for Radiation Protection…" (1.6 g/cm³ nominal) |
| Martian regolith bulk density | 1.7–1.8 g/cm³ (studies use 1.7, 1.79, 2.0) | REPORTED | Röstel et al., JGR Planets 2020 (doi:10.1029/2019JE006246); Zhang et al. JGR 2022 (doi:10.1029/2021JE007157) |
| Moon: 180-day dose < 150 mSv | ≥ 160 g/cm² (≈ 1.0 m at 1.6 g/cm³) | REPORTED | MDPI 11(9):3853 |
| Moon: storm shelter | ≥ 405 g/cm² regolith (multilayer) | REPORTED | MDPI 11(9):3853 |
| Moon: GCR | dose can rise slightly just below the surface, negligible at ~3 m depth | REPORTED | Naito et al. / Nature Astronomy (2024), "Guidelines for radiation-safe human activities on the Moon" (doi:10.1038/s41550-024-02287-8) |
| Moon: secondaries | heavy ions attenuated within 45 g/cm²; neutron secondaries can offset the benefit up to ~105 g/cm² | REPORTED | Planetary & Space Science 2025 (doi:10.1016/j.pss.2025.106116) |
| Mars: 100 mSv/yr | ~1.0–1.6 m regolith; 50 mSv/yr ≈ 1.7–2.2 m; avoid 30–40 cm (neutron peak) | REPORTED | JGR Planets 2021 (doi:10.1029/2021JE007157); 2020 (doi:10.1029/2019JE006246) |

**What the app computes:**

- Soil line on the hull = burial depth + berm height above grade. A deck counts as shielded when its floor is at or below
  that line (partial when the soil line falls inside the deck).
- Lateral areal density = soil column through the 3 m berm crest × ρ (g/cm³) → g/cm². For example
  (2.5 m burial + 4 m berm) at the crest → 480 g/cm². This is a **simplified estimate**: it ignores the overhead path,
  the hull and the oblique paths, and it uses the mean density (1.6 g/cm³ Moon, 1.75 g/cm³ Mars).
- Reference lines shown next to the number:
  - Moon: 160 g/cm² (< 150 mSv per 180 d) and 405 g/cm² (SPE storm shelter), MDPI 11(9):3853.
  - Mars: 175 and 280 g/cm² (≈ 1.0 / 1.6 m for 100 mSv/yr, JGR 2021) and 525 g/cm² (≈ 3 m, negligible GCR increase,
    Nature Astronomy 2024; that paper is about the Moon, so applying it to Mars is an **extrapolation**).
- Burial depth: default 2.5 m (user requirement 2–3 m), slider 0–4 m.
- **Berm** above grade: default 0.6 m, slider 0–8 m (**ESTIMATE**). It is drawn with a 3 m crest and a 35° angle-of-repose
  outer slope.
- The excavated pit is drawn with 45° walls (**ESTIMATE**) and backfilled up to ground level.
- At 2–3 m burial only the engine bay is below grade. The lowest LOX deck (≈ 5.7 m) needs a berm of about 3 m or more.

## 7. Hull-modification rules used by the app (all ESTIMATE / planning rules, not engineering)

| Rule | Value | Reason |
|---|---|---|
| Side opening max width | 2.0 m | below the 24-stringer pitch × 2; cuts through stringers are flagged as needing doubler frames |
| Side opening max height (single ring) | ring height − 2 × 0.10 m = 1.63 m | the opening must not touch a circumferential weld |
| "Span weld" opening | up to 2 rings − 0.20 m = 3.46 m, flagged "needs reinforcing frame" | — |
| No openings | in the nose cone, in a dome-attachment ring (the ring holding a dome equator), or in sealed tanks (warning) | — |
| Tunnel stub | 2.0 m outer diameter, horizontal, length 2–12 m | — |
| Ring insert | whole 1.83 m rings, 1–6 per operation, at a joint inside a barrel section | flagged "structural requalification" |
| Dome cut | replaced by a flat ring flange; a "dome hatch" keeps the dome with a 1.0 m manway | — |

## 8. Crew seating design rationale (launch / landing couches)

The couches are **our own concept design** (ESTIMATE). Nothing is known about SpaceX's real
Starship crew seating; the design copies the logic of flown capsules.

| Decision | Why | Source / analog | Confidence |
|---|---|---|---|
| Semi-supine, back to the floor | Thrust (launch) and the landing burn both push along the ship axis. The best way to take a sustained load is +Gx (chest-to-back), so the occupant lies with the back on the deck floor. In +Gx a person tolerates more than twice the acceleration of other axes. | NASA OCHMO-TB-024 *Acceleration* (2023); NASA-STD-3001 Vol 2 §6.5 (Tables 6.5-1…3) | HIGH (principle) |
| Knees up, hips/knees ≈ 90° (Soyuz "Kazbek" posture) | Short footprint (2.0 m deployed). Keeps the spine supported. Cuts blood pooling in the legs. | Soyuz Kazbek seat (RD&PE Zvezda); Crew Dragon seats are similar | MEDIUM |
| Moulded liner on a standard shell | Spreads load over a large area. The liner's own deformation lowers peak g and onset rate. Soyuz casts each cosmonaut's liner from a plaster body mould. | Zvezda Kazbek page (web.archive.org/…/zvezda-npp.ru/engl/kasbek.html); NASM Kazbek-U liner A19970070000 | HIGH (analog) |
| Stroking energy attenuators on struts | Absorb transient landing loads. Kazbek's seat absorber has up to 250 mm stroke and is locked during launch. The design target is a Brinkley Dynamic Response β ≤ 1.0 ("low", ≈0.5 % injury risk). | culture.ru Kazbek-M liner exhibit; NASA-STD-3001 [V2 6070]; NASA/TM-2013-217380 Rev 1 (Brinkley criterion) | MEDIUM |
| 5-point harness + headrest with cheek pads | NASA-STD-3001 requires restraint for the Brinkley model to apply. The cheek pads give lateral head support for the off-axis landing case (+Gz secondary). | NASA/TM-2013-217380 Rev 1; OCHMO-TB-024 "seat angle" | HIGH (principle) |
| Armrest controls (keypad + hand controller); pilot couch adds a display arm | The crew must operate the ship while lying back-down. The pilot display swings over the knees and faces the occupant. | Dragon/Orion practice (touchscreens on a swing arm) | MEDIUM |
| Couch sizes: deployed 0.8 × 2.0 × 1.0 m, stowed 0.8 × 0.6 × 0.5 m; rows ×3/×4 at 0.8 m pitch | Fit the 95th-percentile male in a suit, with 0.8 m access at the feet. Folding frees floor space for surface or cruise use. | Planner ESTIMATE | LOW–MEDIUM |

**Rules enforced by the planner** (all ESTIMATE):
- Launch seats ≥ crew count (crew 1–100, default 6).
- Every couch keeps its front (foot-end) access zone. Its egress joins the 0.8 m passage network to a hatch or the airlock. Checked in the **Launch/Landing** geometry.
- Warning when a couch is within ~1 m of a hatch opening in the deck above (falling-object risk).
- Stowable items (table, treadmill) take their stowed footprint during Launch/Landing.
- Every placement must be valid in **both** phases. The ghost reason states which phase fails.
- Cargo restraint and pre-launch checklists (couches ≥ crew, egress, stowables stowed, power OK) appear in the Crew panel.

**Not modelled:** couch-to-structure load paths, seat certification, suit/umbilical routing, landing tilt
(HLS lands up to ~8° off vertical), or vibration. All of these need real engineering.
