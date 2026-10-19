# Starship Interior Planner (concept prototype)

> **Disclaimer:** this is a concept-planning tool only. Real spacecraft interiors require engineering,
> structural and safety certification. Masses, power figures, costs and several clearances are planning
> assumptions (see below), not certified data.

A browser tool for laying out true-to-scale interiors inside a Starship-sized pressurized hull, built with
**SvelteKit (Svelte 5 runes, TypeScript, Vite)** and **Three.js via Threlte** (`@threlte/core`, `@threlte/extras`).
All geometry, textures and the environment map are procedural, so it works fully offline. Runs on desktop and phones.

## Run

```bash
npm install
npm run dev                    # http://localhost:5173 (bound to 0.0.0.0 → reachable from a phone on the LAN)
npm run check                  # svelte-check
npm run build                  # static site in ./build (adapter-static)
npx playwright install chromium && node scripts/screenshot.mjs   # headless test → screenshots + samples/
node scripts/crew-test.mjs     # crew-sim test (desktop + iPhone 13): move, use, ladder, queue, possession, launch
```

## Hard limits and sources (all in `src/lib/game/specs.ts`)

| Constant | Value | Source / status |
| --- | --- | --- |
| `HULL_OUTER_DIAMETER` | 9.0 m | SpaceX Starship page (diameter 9 m) – https://www.spacex.com/vehicles/starship/ |
| `HULL_INNER_RADIUS` | 4.5 m | Design choice: the 9 m is treated as the **interior** boundary; the rigid hull wall (0.25 m, nominal) is drawn outside it |
| `HABITABLE_VOLUME_LIMIT` | 600 m³ | Wikipedia "SpaceX Starship" lists ~614 m³ pressurized volume; the rounder, stricter 600 m³ is used |
| Deck floor area | π·4.5² ≈ 63.6 m² | derived |
| Deck clear height | 2.0–4.0 m, default 2.4, 0.1 steps | design rule (from the brief) |
| `SLAB_THICKNESS` | 0.25 m per deck | design rule (from the brief) |
| Volume per deck | π·4.5²·(clear + slab) | stack limit ≈ 9.43 m |
| `MIN_PASSAGE_WIDTH` | 0.8 m | **Verified:** IDSS 800 mm transfer passageway (mated). Also see NASA-STD-3000/MSIS §8.8 and NASA-STD-3001 Vol 2 §8.3 [V2 8013]. The numbers in HIDH Fig. 8.8.3.1-1 were **not** checked |
| `ROUND_HATCH_DIAMETER` | 0.8 m clear | based on the IDSS 800 mm passageway |
| `ISS_CBM_HATCH_SIZE` | 1.27 m square (reference only) | **Verified:** NASA OCHMO tech brief "Vehicle Hatches" (50 in square CBM hatch) |
| `ISS_CREW_QUARTERS_VOLUME` | 2.1 m³ | **Verified:** NASA NTRS 20130011142; the pod's 1.0 × 1.0 × 2.1 m split is an **assumption** |
| `MIN_HEADROOM` | 2.0 m | **Assumption** |
| Access-zone depths | 0.6–0.9 m per module | **Assumption** |
| `AVAILABLE_POWER_W` | 6000 W | **Assumption** (placeholder budget, not a SpaceX figure) |
| Module mass, power, cost | per catalog | **Assumptions** |

## Rules the tool enforces

- **Hull:** the hull is rigid and can't be edited. Every footprint corner, or the edge of a round
  footprint, must be ≤ 4.45 m from the axis (4.5 m minus a 5 cm wall margin). Bottom deck: fixed hull airlock on the −X side.
- **Overlap:** footprints can't overlap. Rectangles are tested as rotated rectangles (separating-axis test),
  round modules as circles; touching is allowed.
- **Height:** a module taller than its deck's clear height can't be placed. Partitions and hatch ladders
  automatically span floor to ceiling.
- **Volume:** you can't add a deck, or raise a deck's height, if total volume would go over 600 m³. You also
  can't lower a deck below the tallest module on it.
- **Clearance check** (toggle, warns but doesn't block):
  - Each module's front access zone is drawn faintly; it turns orange if blocked by another module or the hull.
  - A flood fill at 0.1 m resolution checks for a path ≥ 0.8 m wide from a hatch (or the airlock on deck 1) to
    every access zone. Modules without one get an orange warning.

## Equipment (front = access side)

Sleep bunk 2.0×0.9×1.2 · Crew-quarters pod 1.0×1.0×2.1 · Galley counter 1.8×0.65×2.0 · Table + 4 seats 1.2×1.8×0.95 ·
Workstation 1.4×0.9×1.4 · Storage locker 0.6×0.6×2.0 · Hydroponics rack 1.2×0.6×2.0 · Hygiene/toilet 1.0×1.0×2.1 ·
Exercise treadmill 2.0×0.9×1.4 · Life-support (ECLSS) rack 1.05×0.9×2.0 · Partition wall 1.5×0.08×full height ·
Ladder + hatch (deck link): Ø1.1 m footprint, 0.8 m clear opening. See *Ladder connections* below.

## Ladder connections (decks N → N+1)

Each connection is one entity: a **ladder standing on deck N** rising to a **hatch opening in deck N+1's
floor**, always at the same X/Z and rotation. It is moved, rotated and deleted as one item and is valid only
if it fits on both decks (inside the hull, no overlaps; lower deck = ladder + climbing zone, upper deck =
0.8 m opening + guard rail + access zone). A deck may have its hatch from below at one spot and its ladder
up at a completely different spot; the starter layout shows that (L1-2 at the centre, L2-3 off-centre on deck 2).
Labels are `L1-2`, `L2-3` (with a/b suffixes if two connections join the same pair of decks).

- **Placing:** pick *Ladder + Hatch* and click on deck N to link N → N+1. On the top deck it refuses
  with "Add a deck above first". The *Connect to deck below* option places N−1 → N instead.
- **Align snap** (on by default, separate from the position Snap toggle): within 0.6 m of the hatch coming
  up from the deck below, or of the ladder going up from the deck above, the ladder snaps exactly to that X/Z
  and rotation. You see a cyan ring, a dashed vertical guide through the decks, and the label "Aligned with
  L1-2". Hold **Alt** (desktop), or switch off the **⇅ Align** button / option (mobile), to place freely.
- The floor slab gets a real opening. The ladder runs continuously through it and ends 1.0 m above the
  upper floor. The guard rail leaves a gap at the front (access side).
- **Removing a deck** removes the connections that touch it and renumbers the ones above. Adding a deck
  creates no connections. A deck with no chain of ladders back to deck 1 shows an "unreachable" warning.
- **Clearance check:** every ladder/opening is an entry node for the 0.8 m path flood fill on its deck, and
  its access zone must be clear.
- **Exports:** the SVG plan shows the opening (⊗, guard-rail circle) on the upper deck and the ladder on the
  lower deck, at identical coordinates, tagged `L1-2 ↑/↓`. The BOM lists each connection once, with its
  deck pair (`1-2`) and ladder length. The GLB contains the ladders.
- **Migration (v3 → v4):** per-deck hatch modules on adjacent decks within 1 m are paired into one N → N+1
  connection at the lower hatch's X/Z. The upper hatch takes that X/Z, so a chain stays aligned. A lone
  hatch becomes a connection to the deck above if it fits. Hatches on the top deck, and anything invalid,
  are dropped with a console note.

## Ship modes: Cabin and Surface Habitat

The **Ship** panel (top of the sidebar or bottom sheet) switches between two modes:

- **Cabin**: the original planner. Decks sit in the 4.5 m payload bay and the total is capped at 600 m³.
- **Surface habitat**: the ship has landed on the **Moon** or **Mars**, is buried, and its tanks are converted into living space.
  Research, sources and confidence levels are in [`docs/starship-reference.md`](docs/starship-reference.md).
  Constants live in `src/lib/game/ship.ts`, each with its source.

| Item | Model (ESTIMATE unless noted) |
| --- | --- |
| Hull | Stacked 1.83 m rings, Ø9 m (OFFICIAL). Aft skirt 3 rings, LOX 10, CH4 6, crew bay 3, then an 11.74 m tangent-ogive nose. Tip at 52.0 m (OFFICIAL height) |
| Domes | Aft, common (LOX/CH4) and forward domes with a 2.0 m rise, drawn curved. Each can be **Keep** (intact), **Hatch Ø1** (manway on the axis) or **Cut** (only a flat ring flange is left) |
| Tanks | Start **SEALED**. **Convert to habitat** needs access from a habitable neighbour: CH4 needs the forward dome cut or hatched; LOX needs CH4 converted and the common dome cut or hatched |
| Decks | Labels such as `LOX-1`, `CH4-2`, `Cabin-1`, `Nose-1`. Floors stack per section from the dome-limited span. Nose decks get the **usable radius at head height** (2.0 m above the floor) as a hard limit, at least 1.2 m, and must stop 4.5 m below the tip |
| Ladders | Work across sections only if the dome between them is cut or hatched. Through a hatch the ladder must sit on the axis; the align snap pulls it there |
| Volume | Sum of habitable decks (π r² per deck, no cap). 614 m³ (original cabin) and 600 m³ (planner cap) are shown for reference, plus the reclaimed tank volume |
| Location | Moon g = 1.62, Mars g = 3.71 m/s². Regolith 1.6 and 1.75 g/cm³ |
| Burial | Slider 0–4 m (default 2.5), measured from grade down to the ship base (pit floor). **Berm** slider 0–8 m: backfill against the hull with a 3 m crest, then a 35° slope down to grade |
| Shielding | Shown as depth × density = g/cm² (for example 3 m × 1.6 = 480 g/cm²), with references: Moon 160 / 405 g/cm² (MDPI 11:3853); Mars ≈1.0–1.6 m and ≈3 m (JGR 2020/21, Nature Astronomy 2024). Decks below the soil line are marked 🛡 (full) or ◐ (partial). This is lateral shielding only |
| Ring inserts | Insert 1–6 rings at a joint inside LOX, CH4 or the crew bay. Orange **cut & reweld** markers appear in 3D and in the SVG, with a requalification warning |
| Side openings | Max width 2.0 m. Within one ring the height is ≤ 1.63 m (clear of welds); spanning two rings it is ≤ 3.46 m and needs a frame. No openings in dome-attachment rings or the nose. Warnings when stringers are cut (24 stringers) or the opening is in a sealed tank or the engine bay. Optional Ø2 m **tunnel stub** (2–12 m), shown as buried when below the soil line. IDs `P1` and `T1` |

**Elevation / section view** (✂, or automatic when you switch to habitat): the whole ship with ring welds, domes in their
current state, sealed-tank tint, engines, the LOX header tank, openings and tunnels, terrain with the pit and berm, the yellow
ground line on the hull, and labels for sections, domes and decks. The numbers are also in the section list panel.

## Section view: free orbit and rotatable cut (cabin and habitat)

- The camera orbits freely in section view: full 360° yaw, and tilt from straight down to looking up from below.
- **Cut controls** appear under the deck controls while ✂ is on:
  - **Half 180°** or **Quarter 90°** (wedge) cut.
  - **Follow camera** (on by default): the removed part always faces the camera.
  - **Cut angle** slider 0–359° with ⟲/⟳ 15° buttons. Moving either one turns Follow off.
  - **Horizontal cut height** (optional) removes everything above a height.
- The cut uses local clipping planes (`renderer.localClippingEnabled`; quarter = two planes with `clipIntersection`) plus
  a global plane for the cut height. **Caps** fill the cut faces: hull wall and domes in orange with a yellow edge, deck
  slabs in tan, regolith in brown. Terrain is clipped the same way as the ship.

## Crew launch / landing seating

Our own design (ESTIMATE badges). Rationale and sources are in
[`docs/starship-reference.md` §8](docs/starship-reference.md#8-crew-seating-design-rationale-launch--landing-couches).
The crew lies semi-supine in the **+Gx** posture with the back to the floor, because thrust acts along the ship axis
(NASA-STD-3001 Vol 2 §6.5; Soyuz Kazbek / Dragon analogs). Each seat has a 5-point harness.

| Equipment | Surface / cruise (folded) | Launch / landing (deployed) | Seats |
| --- | --- | --- | --- |
| Launch Couch | 0.8 × 0.6 × 0.5 m | 0.8 × 2.0 × 1.0 m | 1 |
| Pilot Couch (display arm) | 0.9 × 0.6 × 0.5 m | 0.9 × 2.0 × 1.35 m | 1 |
| Couch Row ×3 / ×4 | 2.4 / 3.2 × 0.6 × 0.5 m | 2.4 / 3.2 × 2.0 × 1.0 m | 3 / 4 |

- The procedural model has a composite shell with a moulded liner, side bolsters, headrest with cheek pads, 5-point harness
  and rotary buckle, leg rest, floor rails, struts with **stroking attenuators**, a diagonal hip attenuator, and armrests with
  a keypad and hand controller. The pilot couch adds a swing-arm display. The front (access side) is the foot end.
- **Posture** (semi-supine, knees up): horizontal seat pan, back about 16° head-up, thighs about 78° (near vertical),
  knees about 90°, and lower legs horizontal on the leg rest. The designer's **Side** view shows a seated 1.75 m occupant
  (🧑‍🚀 Occupant toggle) next to the silhouette (`screenshot-couch-side.png`).
- **Mission phase** toggle in the Crew panel: *Surface / cruise* and *Launch / landing*. In Launch, couches deploy and
  stowables fold away (table top folded against its rail, treadmill rails folded down).
- Every placement must be valid in **both** phases. The ghost reason names the failing phase, e.g.
  `Launch/Landing: Outside the 4.45 m usable radius`.
- **Crew count** 1–100 (default 6). Checks run in the Launch geometry: seats ≥ crew, couch front access and 0.8 m egress
  to a hatch or the airlock, and a warning for a couch within about 1 m of a hatch opening above.
- **Pre-launch checklist** (automatic, GO / NO-GO) and a manual **cargo restraint** checklist.
- The BOM lists both footprints (`W/D/H` and `W/D/H_launch`), stowable and seats. Floor-plan SVGs are exported **per phase**.

### Layout changes while the crew sim runs
Moving, adding, rotating or deleting equipment no longer resets the crew. Nav (2D grid and micro-g voxels) rebuilds incrementally, throttled to 0.5 s, and the planner writes changes on drop. Crew keep their position, action, needs, effects and reservations. Only affected crew are repaired:
- Someone standing inside new equipment gets a minimal nudge (≤1.2 m, same deck).
- A blocked path is re-planned from where the crew member is now.
- If the target item moved, the use point is updated and the route re-planned.
- If the target was deleted or can't be reached, the reservation is released and a new action chosen.
- Someone using a moved item moves with it.
- Someone climbing a moved ladder steps off at the nearest valid point.
The log lists only affected crew (🧭 nudged / ↪ re-routed). A toast shows "Layout changed: N crew re-routed". The CSV SAFETY line gains layout_changes/nudged/replanned. Test: `node scripts/layout-change-test.mjs`.

## Equipment Designer

Open it with **📐 Design** (sidebar Mode row, or the top-right button; also on mobile). The planner is replaced by a workbench;
**◀ Planner** goes back.

- **Workbench:** cm grid (1 cm / 10 cm / 1 m lines), a translucent **1.75 m human** for scale, the footprint (blue) and front
  access zone (green, +Z = front), and a size label for the current pose. Orbit with drag, zoom with the wheel or a pinch.
- **Library:** all built-ins (🔒 read-only) and your custom designs. **Duplicate to edit** converts a built-in procedural model
  into editable parts. The model is rendered once offscreen in both phases, and the deployed and stowed meshes are paired.
  The Launch Couch becomes 35 parts, each with a stowed pose. **＋ New** starts from a single rounded box.
- **Parts** are data, not code. Shapes: `box`, `rbox` (rounded box), `cyl`, `sphere`, `capsule`, `plane`, `torus`, and `glb`.
  Material presets (17): white, grey, steel, steelDark, dark, fabric, mattress, screen, led, glass, rubber, yellow, green, amber, blue, grow, plant. Each part has a deployed
  transform and an optional **stowed** transform.
- **Editing** (custom designs only):
  - Click a part (or pick it in the list) to get **TransformControls**: Move `T`, Rotate `R`, Size `S`. Snaps are
    **1 cm / 5° / 1 cm**. Size is applied when you release.
  - Numeric fields: position and size in cm, rotation in °.
  - Nudge buttons (±1 cm per axis, ±5° yaw).
  - Add, duplicate (`D`), mirror across X (`M`), delete (`Del`); `Esc` deselects.
  - The **Deployed / Stowed** toggle previews and edits either pose. *Stowed in* says which phase uses the stowed pose:
    Launch/Landing for tables and the treadmill, Surface/Cruise for couches.
- **Metadata form:** name, icon, category, mass, power, cost, access depth, seats, stowable, ESTIMATE flag, description.
  **Auto-fit footprint** keeps W/D/H (and the launch footprint) fitted to the parts, symmetric about the origin and rounded
  up to 1 cm. Duplicates of built-ins keep the reference footprint until you turn Auto-fit on or press **Fit now**. A warning
  appears when parts stick out of a manual footprint.
- **Placing:** **➕ Place on Deck N** returns to the planner with the design selected. Custom designs also appear at the
  end of the Equipment list (tagged *custom*). They follow every rule (both phases, access, egress, seats).
- **Propagation:** edits apply live to every placed instance. A placement that no longer fits is **flagged, not deleted**:
  a red marker and a ⛔ warning in Stats naming the deck and reason. The designer shows "N placed · N no longer fit".
  A custom design that is still placed can't be deleted.
- **Storage:** custom designs are saved in `localStorage` (`starship-equipment-v1`) and embedded in save files (`equipment`
  array), so a shared layout carries its designs. **Export JSON** / **Import JSON** exchanges a single design
  (`format: "starship-equipment", version: 1`). Imported files are sanitised: shapes, materials and sizes are clamped.
- **Component editing (Blender-style, custom designs):**
  - **Modes:**
    - Select a part, then pick **Object / Vertex / Edge / Face** with `1`–`4`, the floating toolbar, or the panel.
    - `Tab` toggles between Object and the last component mode.
    - `Esc` steps back: it first clears the selection, then returns to Object mode.
    - A primitive stays a primitive until the first component edit. That edit converts it to an editable polygon mesh
      (`shape: "mesh"`, `mesh: {v, f, fm?, sm?}` in part-local metres). Rounded-box rounding is dropped at that point.
  - **Selection:**
    - Vertices show as dots and edges as lines. Faces highlight on hover and turn orange when selected.
    - Click to select, Shift-click to add or remove, and **Shift+drag** to box-select. Box select only picks components
      you can see; occluded ones are skipped.
    - On a phone, **＋ Multi** makes taps toggle, and **⬚ Box** makes a one-finger drag box-select (orbit with two fingers).
  - **Moving:**
    - The gizmo sits at the selection's centroid: move `T`, rotate `R`, scale `S`.
    - Numeric X/Y/Z fields (cm, equipment space) and ± nudge buttons move the selection. Snap is **1 cm or 5 cm**,
      toggled with the cm button.
  - **Operations:**
    - **Extrude** `E` (faces, 5 cm along the normal). **Inset** `I` (faces).
    - **Bevel** `B`: a 2 cm chamfer on edges shared by two faces.
    - **Merge** `M`: merges the selected vertices at their centre.
    - **Delete** `X`/`Del`.
    - **Select all/none** `A`.
    - **Flip normals** `N` (faces). **Recalculate normals outward** `Shift+N`.
    - **Flat/Smooth** shading.
    - **Per-face material**: in Face mode, pick it in the panel.
  - **Validation:** warnings in the panel for open edges (holes), non-manifold edges, zero-area faces, an inside-out or
    flat mesh, geometry below the floor, and a design taller than the tallest deck.
  - **Undo/redo:** `Ctrl+Z` / `Ctrl+Shift+Z` (or `Ctrl+Y`), or the ↶ ↷ buttons.
  - **Persistence:** edited meshes are saved in localStorage, save files and Export JSON. Older files without meshes load
    unchanged, and a corrupt mesh falls back to a box.
  - **Exports:**
    - **⬇ Export GLB** exports the design: parts, edited meshes and per-face materials.
    - The ship GLB export includes placed custom designs.
    - The BOM CSV has a `geometry` column, e.g. "3 parts · 1 edited mesh (17 faces)".
  - **Test:** `node scripts/designer-edit-test.mjs`. Screenshots: screenshot-designer-vertex.png,
    screenshot-designer-face.png, screenshot-mobile-designer-edit.png.
- **GLB import (optional):** **📦 Import GLB part** adds a `.glb` (≤ 1.5 MB) as one part. It is normalised to a unit box and
  then scaled like any other part. It is stored as a data URL.

## Crew simulation (Sims-like)

Open **👥 Crew simulation** in the sidebar, or the **👥** button on a phone, and press **▶ Start crew sim**. It works in
Cabin and Surface Habitat modes, runs on top of build mode, and replans live when you move equipment.

- **Crew:** one member per crew-count seat (default 6; the sim runs up to 24). Each has an editable **name**,
  a **role** (Commander, Pilot, Engineer, Scientist, Medic or Specialist) and a **colour**. The low-poly 1.75 m avatar has
  walk, climb, sit, sit-work, eat, sleep, exercise, work, wash and couch poses. Gravity (Earth, Mars, Moon, or Auto from the
  habitat location) changes the walk cadence and bounce. This is cosmetic only.
- **Needs** (0–100, decaying per sim hour): Energy, Hunger, Hygiene, Bladder, Fitness, Fun/Social, Work/Purpose, Comfort.
- **Affordances** belong to the equipment data. Each one has a label, a need-restore rate per sim hour, minutes, a pose,
  and slots (capacity), plus social, enclosed and *until-full* flags. Built-ins provide bunk/pod sleep, galley cooking,
  table meals and chat (4 seats, social), workstation, hydroponics, toilet and wash, treadmill, ECLSS maintenance, locker
  supplies, and couch relaxing. Custom designs edit them in **📐 Design → Crew sim affordances**. Duplicates copy them.
- **Utility AI:**
  - Score = need urgency × restore gain × personality × schedule bias ÷ (travel + expected wait).
  - Free will: a weighted pick among the top 3 options.
  - Schedule: sleep and work shift, configurable under ⚙.
  - Slots are reserved. When an item is busy the crew member queues in front of it, may give up, and the event is logged.
    Sharing a social table gives extra Fun/Social.
- **Navigation:**
  - A per-deck 0.1 m grid with obstacles inflated by the body radius, inside the hull radius minus 0.3 m.
  - Dijkstra distance fields with line-of-sight path smoothing.
  - Multi-deck routing over a ladder graph. In habitat mode this includes the dome-hatch ladders.
  - Climbing has its own animation, and only one climber is allowed per ladder (others wait, logged).
  - Agents steer to keep apart while walking.
- **Controls:** ▶/⏸, speeds **1× / 4× / 16× / 60×** (at 1×, one real second is one sim minute), a "Day N · HH:MM" clock
  (also a HUD pill), an event log, and ↺ Reset / ■ Stop.
- **Inspect:** click or tap an avatar to open its card: portrait, role, mood, current action, queue position, need bars
  and **🎮 Take control**.
- **Possess:**
  - A third-person follow camera; **V** switches to first person.
  - Drag to look, wheel to zoom. **WASD** or the arrows move (joystick on touch), Shift runs.
  - **E = interact** with whatever you are facing (see *Interact (E)* below): use equipment, sit, climb a ladder,
    repair, stop the current activity. At a ladder E climbs toward where you look (look down = down). **Space/PgUp**
    climb up and **Q/C/PgDn** climb down explicitly (or use the ▲/▼ Deck buttons). **X** stops the current activity.
    Away from a ladder, the climb keys show where the nearest ladder is and ring it.
  - **Esc** or **⏏ Release** hands the crew member back to the AI. The others keep living.
- **Analytics (📊 Issues):**
  - Utilisation % per item, average wait, max queue, unreachable items.
  - Ladder climbs and waits, and crew time spent with critical needs.
  - **Design issues found by crew sim**, e.g. "Hygiene / Toilet (Deck 1): average wait 12 min over 9 waits – consider a
    second unit", "No reachable equipment satisfies Fitness", congestion hot spots.
  - **🔥** toggles a congestion and presence heat map on the current deck.
  - **⬇ CSV** exports everything (`samples/crew-sim-analytics.csv` comes from the test).
- **Launch / landing phase:** the crew walks to the couches and straps in (couch pose). Needs freeze while strapped.
  A crew member without a seat is logged as a design issue.
- **Save:** the roster (names, roles, colours) and the schedule and gravity settings are stored in save files and JSON
  exports (`crewSim`).
- **Performance:** the sim step costs about 0.3 ms per frame for 12 agents (headless measurement). Phones start in Low quality.

### Work/Purpose, galley and group seating
- **Role-based work:** Commander, Pilot and Scientist work at consoles (the Dual Workstation seats two, Engineers too).
  Scientists garden at the hydroponics rack. Engineers maintain the ECLSS and do periodic servicing and repairs.
  Specialists and Medics cook for the crew, run food and locker inventory, and clean and organise anywhere.
  Medics hold medical check-ups at a table. Work tasks are spread over the shift.
- **Galley set:** food warmer / convection oven, water dispenser (hot / ambient, also coffee breaks), fridge/freezer,
  pantry lockers, prep counter, trash compactor and a zero-g food station. A meal is a multi-step flow:
  get food (fridge or pantry), rehydrate (water), heat (warmer or galley), eat at a table or food station, then dispose of
  the packaging. Missing steps are reported as design issues.
- **Tables + chairs (groups):** the Galley Table seats come from chairs. A chair dropped near a table snaps to a free side
  facing it, and **🪑 Add seats** fills the free sides (up to 8). Seats join the table group, so a meal or chat is social.
- **Capacity and occupancy:** every item has strict slots. Badges over items show `used/capacity` (green, amber when
  full, ✖ when broken, 🔧 needing service, ⚡ unpowered). Taking control and pressing Use on a full item says "Full".
- **Containment:** crew can only walk or fly in the area reachable from their spawn point (2D grid and micro-g voxel
  masks pruned to the connected region). Moves are swept against obstacles, a watchdog unsticks stalled agents, and use
  points that can't be reached are flagged in the issues and drawn red in the editor. A walkable-area debug overlay
  is in ⚙.

### Working rates, status effects and trend symbols
- Using an item restores a need at a **rate per sim hour**, scaled by the item's condition (100 % → 1×, 0 % → 0.5×)
  and with **diminishing returns** above 70 (20 % at 100). Some affordances have a per-session cap.
  Effects are scaled by the fraction of the session completed.
- **Status effects** continue after use (chips on the crew card, with remaining time): Digesting, Snack, Well rested,
  Groggy, Post-exercise glow, Sweaty (cleared by washing), Muscle fatigue, Coffee boost → Caffeine crash, Noise fatigue,
  Fresh & clean, Accomplished, Relieved. Each has per-need rates and/or decay multipliers, a duration and a curve
  (constant, linear fade or exponential). The AI looks ahead with these effects, so a satiated crew member doesn't re-eat.
- **Trend symbols** on every need bar: `>>` / `>` rising (green), `<` / `<<` falling (red), `·` steady.
  The trend is the measured net rate (smoothed over ~10 sim minutes). Hover (desktop) or tap (phone) shows the exact rate, e.g. `−6.2/h`.
- Typical durations at 60× (2-day test): sleep ≈ 6.5 h, meal ≈ 30 min, toilet ≈ 13 min, wash ≈ 19 min, exercise ≈ 85 min,
  work blocks ≈ 3.5 h.

### Equipment life cycle and spares
- Each item has a life spec (rated life, MTBF, service interval, ESTIMATE values; editable in the Designer).
  Condition falls with use and with calendar aging. States: ✦ New → ✓ Operational → ◐ Worn → 🔧 Needs maintenance → ✖ Broken.
- Failures follow an MTBF hazard that rises as condition drops. A broken item can't be used: queued crew leave and
  an Engineer repairs it, consuming spares (6 per storage locker; 3× when the item is past its rated life).
  Maintenance resets the service clock.
- The selection card and sidebar show condition, hours and next service. The issues list reports broken items, waiting
  maintenance and spares shortfalls. **Mission spares plan** (cruise + surface days) estimates spares needed vs carried.
  The CSV has a LIFE CYCLE section.

### Electrical power
- Each item has a power profile (Off / Standby / Active / Peak, duty cycle and start-up peak, ISS/analog ESTIMATEs) and a
  priority: **Critical** (ECLSS, never shed), **Essential**, **Normal**, **Deferrable**. Priorities can be changed per item in the power panel.
- **Live bus:** supply is 6 kW in cruise, or 12 kW solar (day/night curve) or nuclear on the surface, with a 60 kWh battery
  (all editable). Deck lighting depends on occupancy.
- When load exceeds supply plus the battery limit, loads are **shed** by priority (Deferrable first, largest first) and
  restored one at a time once there is a 15 % margin. **Brownout:** an idle item whose start-up peak doesn't fit can't be started.
  Unpowered items aren't used by the AI. A possessed crew member gets "Unavailable (no power …)".
- **HUD power meter** (load / supply, battery %, sparkline). Click it for the power panel: settings, per-item draw and
  priority, 24 h chart and alerts. Deficits are design issues, and the CSV has a POWER section.

### Couch egress and clearances
- With a couch selected (or **📐 Clearances** on in the top bar) the planner draws the couch's stowed and deployed
  envelopes, its front access zone and the **egress path** (0.8 m wide) to the nearest ladder/hatch or the airlock,
  using the envelope for the current phase (deployed in Launch/Landing).
- Blocking items turn red and the blocked segment is marked. Issue text names the blocker and the needed path, e.g.
  "Pilot Couch (Deck 3) egress blocked by Water Dispenser at (0.7, 0.2); needs 0.8 m path to Ladder L2-3 (deployed envelope)".
  Click the issue to jump to the couch.
- While you drag a couch the path updates live. **🧭 Move to nearest clear spot** suggests a nudge within 1.2 m.
- Door and locker keep-out zones are drawn (amber) but don't block egress, because doors are latched for launch.

## Mission phases and Cruise (micro-g)

The **Crew / Ship** panel has a mission selector: **🚀 Launch → 🪐 Cruise (micro-g) → 🛬 Landing → 🌕 Surface**.
Launch and Landing deploy the couches (the existing launch geometry). Surface uses the gravity sim. Cruise is weightless.
The mission is saved with the layout.

- **Micro-g equipment** (category *Micro-g*, ESTIMATE sizes):
  - Handrail (0.8 m; wall, ceiling or floor)
  - Foot restraint
  - Sleeping bag (wall-mounted, 2.0 × 0.8 × 0.2 m)
  - Zero-g toilet
  - Resistive exercise device (ARED)
- **Mounting:** equipment data has `mount: floor | wall | ceiling | any`. When the selected item allows it, the sidebar
  shows **Mounting**: Floor / Wall / Ceiling, plus a height slider for wall mounts.
  - **Wall** snaps to the hull's inner surface, facing inward, with its base at the slider height.
  - **Ceiling** hangs under the slab above.
  - Collision checks are 3D (vertical ranges must overlap). Items mounted at 1.9 m or higher don't count for the 2D
    clearance check or for walking navigation.
- **Weightless crew:**
  - Avatars float with free 3D orientation. When idle they hold the NASA neutral body posture (hips and knees flexed,
    arms floating forward) and slowly drift and tumble.
  - They translate head-first in a glide pose.
- **Locomotion:**
  - A crew member can only change velocity when a surface or handrail is within reach (about 0.6 m beyond a padded
    surface, or 0.7 m from a handrail or ladder): it pushes off, then **coasts with momentum** at up to 0.6 m/s.
  - It brakes on approach and grabs at the destination. Hitting a surface stops or slides it (grab).
  - Hatches (and habitat dome hatches) are open passages that crew fly through head-first. Ladders act as handrails.
- **3D navigation:**
  - One 0.2 m voxel grid covers the whole deck stack. Free voxels lie inside the hull minus 0.35 m and inside a deck's
    habitable band (0.3 m clearance from floor and ceiling) or a hatch column (r 0.3 m) through the slab.
  - Equipment boxes are inflated by 0.25 m. Handrails and foot restraints are not obstacles.
  - Routing uses a Dijkstra distance field (26-neighbourhood, bucket queue), gradient descent and 3D line-of-sight
    smoothing.
  - Floating crew keep a 0.6 m separation in 3D.
- **What works in micro-g** (affordance `micro: ok | restraint | no`, `gravity: false` = micro-g only):
  - Sleep needs a sleeping bag or a crew pod. Bunks work only with a restraint within 1.5 m.
  - Table, galley, workstation, hydroponics and similar items need a handrail or foot restraint within 1.5 m. Crew then
    work standing in foot restraints.
  - The gravity toilet is unusable. A **Zero-g toilet** is required.
  - Exercise needs the harnessed treadmill or the ARED.
  - The sleeping bag is unusable in gravity.
- **Cruise analytics (📊 Issues + CSV `MICRO-G` section):**
  - Hatch passages and congestion, number of translations and average path length.
  - **Handrail coverage:** % of crew paths with a handrail within 1 m along at least 80% of the path.
  - Equipment unusable in micro-g, e.g. "Sleep Bunk without restraints".
  - Missing zero-g toilet or micro-g exercise (high-severity issues).
- **Possessing a crew member in Cruise (6-DOF):** first person by default; **V** switches to third person (no fixed horizon).
  - Desktop: **WASD** translate in the body frame, **Space/R** up and **Ctrl/F** down along the body axis, **Z/C** roll,
    drag to look relative to the body.
  - **Shift** gives a stronger push-off (1.0 m/s). **E** interacts (use equipment, fly through a nearby hatch, grab a
    handhold while drifting). **G** grabs (stops) when something is in reach, **X** stops the current activity,
    **T** or **⊙ Deck up** reorients to deck-up, **PgUp/PgDn** (or ▲/▼ Deck) auto-fly to the next/previous deck
    through the nearest hatch (flying through manually works too; a prompt appears near a hatch), **Esc** releases.
  - Momentum persists. With nothing in reach you only drift, or wriggle slowly.
  - Mobile: the joystick translates and dragging looks. The pad has ▲/▼ (up/down), ⟲/⟳ (roll) and ✊ (grab), plus
    the big **Interact** button, Deck up, 1st/3rd and Release.
- **Build camera in Cruise:** tick **Free 6-DOF camera** in the panel to swap the orbit camera for a trackball that allows
  roll and upside-down views. **⬆ Reset up** (panel or HUD) restores the deck-up view. Dust motes drift in the current deck.

## Game HUD
- **Top resource bar** (slim, glass): mission phase (click to cycle), crew / launch seats, mass, power (the live meter
  while the crew sim runs, otherwise the static budget), volume, cost, free floor area, issue count, **📐 Clearances**
  toggle, and the sim clock with ⏸/▶ and speed.
- **Bottom build bar:** large tool buttons (Select, Place, Measure, Camera), category tabs (Crew, Galley, Hygiene & fitness,
  Work & systems, Launch seats, Micro-g, Custom) and scrolling item cards (size, power, seats). Click a card to place it.
  ▾ collapses the bar.
- **Selection card:** appears when an item is selected. It shows size, power and deck, live condition (when the sim runs),
  couch egress status, and seats. Actions: ⟲ ⟳ 90°, 📋 duplicate, 🪑＋ add seats (tables), 🧭 nudge (blocked couch), 🗑 delete.
- **Side panel drawer:** ☰ (left of the deck pills) shows or hides the full sidebar (tools, catalog, checks, crew sim).
  It is open by default.
- **Mode buttons** (top-right): large 🚶 Walk / 🛠 Build and 🧩 Design.
- **Phone:** the top bar sits at the top (scrolls sideways), the build bar sits above the bottom sheet, and the selection
  card replaces the build bar while something is selected.

## Controls

### Camera (build mode)

- **Desktop:** left-drag on empty floor or space orbits a full 360°, in every tool. Left-drag on a module
  still moves it, and a click still selects, places or measures. Right-drag pans in the deck plane; a
  right-click without a drag on a module deletes it. Middle-drag orbits, the wheel zooms, ←/→ orbit, ↑/↓
  tilt and +/− zoom.
- **Mobile:** with the Select tool, a one-finger drag on empty space orbits. Two-finger drag orbits or pans
  (set this under Touch options) and pinch zooms.
- **Camera widget** (top-right, under Walk; desktop and mobile): ⟲/⟳ orbit in animated 45° steps, ⤒/⤓ tilt,
  ＋/－ zoom, Top view, Iso view and Reset. A compass needle turns with the camera (N = −Z).
- Pitch ranges from near top-down to near horizontal and never goes below the floor. Switching decks keeps
  the view angle and smoothly moves the orbit target to the selected deck's floor height.

### Desktop
| Action | Control |
| --- | --- |
| Tools | `1` Select · `2` Place · `3` Measure · `4` Camera · `G` snap on/off (0.25 m / 15°) |
| Place | Pick equipment, then left-click. The ghost is green when valid, red with the reason when not |
| Rotate | While placing (Place tool with a ghost/preview) or with a module/ladder selected: `Q`/`E` or `Shift`+wheel 15° · `Alt+Q/E` 1° · `R` 90° · on-screen ⟲ ⟳ 90° buttons |
| Select / move / delete | Select tool: click a module, drag to move. `Delete`/`Backspace` or 🗑 deletes; right-click deletes in any tool |
| Measure | Click two points to see the distance (m). `Esc` clears |
| Lock / unlock | **🔒/🔓** on the selection card (also in the sidebar's Selected box; on mobile on the card, or the HUD button for a selected ladder) or `L` toggles the lock on the selection. You can't drag a locked item (dragging it orbits the camera instead), rotate it (`Q`/`E`/`R` or the buttons), move it to a clear spot (🧭), or delete it (`Del`, 🗑 or right-click show "… is locked – unlock it first"). It can still be selected, inspected and used by the crew. Locked items show a small 🔒 badge, a 🔒 on the hover/selection labels and an amber outline when selected. The Decks panel has **🔒 Lock all on deck** / **🔓 Unlock all** (items plus the ladders touching the deck) and **Lock ladders / hatches by default**. `Ctrl+Z` / `Ctrl+Shift+Z` (or `Ctrl+Y`) undo/redo lock changes. The flag is saved as `"locked": true` per module / ladder in the layout JSON |
| Back to normal | `Esc` (or the ↖ Select button) cancels placing / measuring, deselects, and returns to the Select tool. `1` also picks Select |
| Camera | Middle-drag orbits, wheel zooms (Camera tool: left orbit, right pan) |
| Decks | Deck pills, **▼ ▲** buttons, `PgUp`/`PgDn`, `Shift+Q`/`Shift+E`, or plain `Q`/`E` when nothing is selected or being placed · ＋ adds a deck, height slider, ✂ section view |
| Section cut | ✂ on: Half/Quarter, Follow camera, cut-angle slider and ⟲/⟳ 15° in the Decks panel, optional cut height |
| Mission phase | Crew panel: Surface/Cruise ↔ Launch/Landing (couches deploy, stowables fold) |
| Equipment designer | 📐 Design · `T`/`R`/`S` gizmo mode · `D` duplicate part · `M` mirror · `Del` delete part · `Esc` deselect |
| Walk | `F`; click to look around, `WASD` move, `Shift` run. `E` interacts (see below): at a ladder (within ~1 m) or hatch opening it climbs toward where you look, at a chair or couch it sits you down (move or `E` to stand), at other equipment it inspects it. `Space`/`PgUp` climb up and `Q`/`C`/`PgDn` climb down explicitly (short climb animation), or use the on-screen **▲ / ▼** buttons. Away from a ladder, a hint names the nearest one and rings it |
| Interact (E) | Walk, possessed crew and cruise. **E** runs the best context action. That is the item under the crosshair, otherwise the nearest one within ~1.5 m in front of you (measured from the item's nearest edge; anything within 0.8 m counts whatever your heading). The prompt names it, e.g. `E  Climb up to Deck 2`, `E  Sit – Meal at table (Chair 2/4)`, `E  Use Water Dispenser – Rehydrate food`, `E  Repair Hygiene / Toilet`, `E  Stop: Sleep (Sleep Bunk)`. **Shift+E** or **holding E for 0.4 s** opens a list of the other actions for what's in reach: pick with `1`–`9` or a click, close with `Esc`/`E`. `Enter` also runs the best action. Ladders follow your look direction: look up to climb up, down to climb down. Unpowered, broken or full items show greyed out with the reason. Mobile: tap the big **Interact** button (it shows the label), hold it for the list. With a single possible action E acts immediately on key-down. A press whose key-up gets lost (focus or pointer-lock change, a remote desktop) still acts once, and the key-up's timestamp decides tap vs hold, so a stalled frame can't turn a tap into the list. If the browser sends no `code`, the key / keyCode / Thai character is used instead. Entering walk or possession releases focus from the button you clicked. A dim `E nothing in reach` line shows when there is no target. **F9** (or `?ixdebug` in the URL) shows a debug overlay with the last key events (code, key, keyCode, repeat, IME, target), pointer lock, focus, the actions in reach and what E did |
| Possessed crew | `Space`/`PgUp` climb up, `Q`/`C`/`PgDn` climb down, `X` stop the current activity, `V` 1st/3rd person, `Esc` release. Cruise: `Space`/`R` up, `Ctrl`/`F` down, `Z`/`C` roll, `G` grab, `T` reorient to deck-up |
| Keyboard layouts | All shortcuts use the physical key (`KeyboardEvent.code`), so they work on Thai, AZERTY etc. layouts. Keys are ignored only while typing in a text field; clicked buttons release focus |

### Mobile (touch)
- Below 760 px wide the sidebar becomes a **bottom sheet**: the tools row is always visible, and ▲ opens equipment, decks, stats and export.
  At the top: the resource bar (phase, crew/seats, power, volume, free m², clearances, sim clock) and deck pills (D1, D2, …, ＋, ✂).
  Above the sheet: the build bar (category tabs + cards); selecting an item swaps it for the selection card.
- **Place:** tap to preview (the ghost locks in place), drag to move it, then tap it again or press **✓ Place**; **✕** cancels.
- **Select:** tap a module to select it, drag it to move, use 🗑 to delete. Rotate with the large ⟲ / ⟳15° / 90° buttons.
- **Measure:** tap two points.
- **Two fingers** always control the camera: pinch zooms, drag orbits (or pans, under *View & checks*).
  A second finger cancels any build action in progress, so camera gestures never place anything.
- **Walk:** joystick to move, drag to look, ▲ Up / ▼ Down buttons (lit when a ladder or hatch is within reach).
- **Designer:** 📐 opens it. The ▲ bottom sheet holds the library, parts, numeric fields, ±1 cm / ±5° nudge buttons and
  the metadata form. Tap a part to get the gizmo; one finger orbits, pinch zooms.
- Phones start in **Low** quality (no shadows or reflections, 1× pixel ratio). The page doesn't scroll or zoom (`touch-action: none`).

## Exports (all offline; files download)
- **Floor plan SVG at 1:50 (A3):** one per deck **and per mission phase**. The title block states the configuration (Surface/Cruise or
  Launch/Landing). Each plan shows:
  - the hull circle and wall at the deck's own radius (nose decks are smaller)
  - the airlock on the airlock deck
  - module outlines with numbered tags and front markers
  - dashed access zones
  - the Ø dimension and a 0–3 m scale bar
  - a schedule (W×D×H in that phase, X/Z, rotation, distance to the wall) and the disclaimer
- **Ship elevation SVG at 1:200 (A3 portrait, habitat mode):**
  - left half: outside elevation; right half: section
  - ring welds, cut & reweld lines, domes in their current state, sealed-tank shading
  - decks with FFL, openings and tunnels with IDs, section labels with ring counts and volumes
  - regolith with pit, backfill and berm, grade and soil lines
  - overall dimensions, scale bar, and a title block with location, gravity and shielding
- **Bill of materials CSV:** one row per item with:
  - deck label, item, module, quantity
  - W/D/H **and launch W/D/H**, stowable, seats
  - x/y position, rotation, estimated mass, power and cost
  - ladder connections, totals, and launch seats vs crew
  - in habitat mode, a **HULL OPERATIONS** section: tank purge and pressurization, dome cuts and hatches, ring inserts (cut plus 2 welds,
    steel mass), side openings with doubler frames, tunnel stubs, and excavation and berm volume. Every item is flagged ESTIMATE / requalification.
- **3D model GLB:** all decks plus the ship shell in habitat mode, exported with Three.js `GLTFExporter`.
- **JSON save: format version 5.** It holds:
  - `shipMode`, `habitat` (location, burial, berm, domes, converted tanks, ring inserts, openings), `crew`, `phase`
  - per-deck `section` and the ladder `shafts`
  - custom `equipment` definitions

  Migration: v4 and v3 saves load as Cabin mode, with all decks placed in the crew section. v3 hatches are also migrated to ladders. Older grid saves are ignored.

Samples in `samples/`:
- `deck-N-plan-1to50.svg`, `deck-2-plan-launch.svg` / `deck-2-plan-surface.svg`
- `habitat-elevation-1to200.svg`
- `bom.csv`, `bom-habitat.csv`
- `layout.json`, `layout-habitat.json`
- `starship-interior.glb`

## Visuals
- Physically based materials: brushed stainless hull (procedural streak texture) with circumferential frames
  and longitudinal stringers, small round windows on the +X side, and panelled floors with seams.
- Matte white/grey equipment, an LED ceiling strip, and ceiling lights per deck in walk and section view.
- A procedural RoomEnvironment (PMREM) environment map, ACES filmic tone mapping and an sRGB output.
- PCF shadows. The PCFSoft shadow type was removed in this three.js version, so plain PCF is used.
- No screen-space ambient occlusion (not cheap enough for phones). The AO look comes from gradients baked into the
  lining texture plus a hemisphere light.

### Interior view (walk / possess / cruise)
- In walk mode, and whenever you possess a crew member (gravity or cruise free-fly), each deck renders as a closed room.
  Build mode switches back to the 1.1 m cut-away with the decks above hidden.
- **Walls:**
  - A full-height curved hull lining with off-white insulation panels, seams, fasteners and a kick plate.
  - Handrails, cable trays and vent grilles.
  - Portholes that glow with the outside light: blue-black in space, warm on Mars, grey-white on the Moon.
  - Wall-mounted equipment gets a dark backplate and two mounting rails that bridge the gap to the curved wall.
- **Ceilings:**
  - Each ceiling is the underside of the deck above: perforated ceiling panels, recessed LED strips, and the hatch
    opening with a yellow rim. The ladder is visible through it.
  - The top deck closes with the nose ogive. The bottom deck sits on an aft bulkhead dome.
- **No clipping:** section clipping is always off in the interior view, even when ✂ Section view is on.
- **Lighting:**
  - Emissive LED strips and a hemisphere light, plus point lights on your deck and the decks next to it (one shadow-casting
    light on high quality).
  - On desktop, a window spotlight carries the Moon, Mars or space light.
  - 💡 **warm/cool** (in the walk bar and the possess action bar) switches the lights between 3000 K and 5000 K. The
    choice is remembered.
- **Camera:** walking stops 0.2 m before the lining. The 3rd-person possess camera's boom is limited to the deck radius
  minus 0.35 m, so the camera pulls in near the walls instead of leaving the hull.
- **Performance (LOD):**
  - Fit-out and portholes are built only for your deck ±1, and static parts are merged per material.
  - On phones (or Low quality) there is 1 point light on your deck, no spotlight and no shadows.
  - Measured in a headless iPhone 13 emulation: about 185 draw calls, 30k triangles and 4 lights.
  - Desktop: about 1,070 draw calls, 107k triangles and 8 lights.
- Test: `node scripts/interior-test.mjs`. Screenshots: screenshot-walk-interior.png, screenshot-walk-ceiling.png,
  screenshot-cruise-interior.png, screenshot-possess-interior.png, screenshot-mobile-walk-interior.png.

## Structure
```
src/lib/game/specs.ts       all limits + sources/assumptions
src/lib/game/catalog.ts     equipment catalog, starter layout
src/lib/game/geometry.ts    footprints, SAT/circle collision, ray picking
src/lib/game/clearance.ts   access zones + 0.1 m flood-fill path check
src/lib/game/state.svelte.ts  decks, rules, selection, persistence (runes)
src/lib/game/exporters.ts   SVG 1:50 plan, BOM CSV, download helper
src/lib/game/equipment.ts   data-driven equipment parts, auto-fit, mirror, extraction, sanitising
src/lib/game/equipStore.svelte.ts  custom equipment library + designer state (localStorage), component edit ops + undo
src/lib/game/editMesh.ts    editable polygon meshes: primitive → mesh, extrude/inset/bevel/merge/delete, normals, validation
src/lib/three/              materials/textures, hull geometry
src/lib/components/         Scene, Hull, DeckModules, ModuleMesh, Part, Overlays, BuildInput,
                            WalkControls, Sidebar, StatsPanel, Joystick, Outline, Zone,
                            DesignerScene/DesignerPanel/EquipModel/EquipPartMesh/Silhouette, EditOverlay/EditToolbar (designer)
src/lib/game/affordances.ts needs, decay rates, built-in affordances (crew sim)
src/lib/game/couchModel.ts  launch couch shell geometry + occupant posture
src/lib/sim/                crew sim: nav.ts (grid, Dijkstra, ladder portals), nav3d.ts (micro-g voxel nav), crewSim.svelte.ts (needs, utility AI,
                            queues, possession, analytics), avatarPose.ts/Avatar.svelte (procedural avatar),
                            CrewLayer (render, picking, heat map), PossessControls, AgentCard, CrewSimPanel
scripts/screenshot.mjs      Playwright test: screenshots, rule checks, sample exports
scripts/crew-test.mjs       Playwright crew-sim test + crew screenshots
scripts/cruise-test.mjs     Playwright Cruise (micro-g) test + cruise / wall-mount screenshots
scripts/deck-keys-test.mjs  deck up/down keys in build / walk / possessed / cruise
scripts/galley-test.mjs     galley meal flow, table+chair groups, capacity / occupancy
scripts/nav-safety-test.mjs crew containment over random layouts
scripts/needs-bench.mjs     need averages / Work/Purpose bench (node scripts/needs-bench.mjs [days])
scripts/lifecycle-test.mjs  wear, failures, repairs, maintenance, spares plan
scripts/need-curves.mjs     working rates, status effects, trend symbols (2 days at 60×)
scripts/couch-egress-test.mjs couch envelopes, egress blockers, nudge, Show clearances
scripts/power-test.mjs      power bus, shedding order, brownout, deficit issues
scripts/designer-edit-test.mjs designer vertex/edge/face editing, ops, validation, undo, exports
scripts/interact-real-test.mjs E like a real user: pointer lock, focus on HUD buttons, Thai keys, lost key-ups, frame stalls, empty code, F9 overlay
scripts/interior-test.mjs   interior view: walls/ceilings, no clipping, lights, camera containment, mobile budget
scripts/hud-test.mjs        HUD top bar, build bar, selection card, drawer (desktop + iPhone 13)
src/lib/sim/effects.ts      status effects, diminishing returns, trend symbols
src/lib/sim/lifecycle.ts    life specs, wear / hazard, repair / service
src/lib/sim/power.ts        power profiles + priorities
src/lib/game/egress.ts      couch egress path solver + nudge
src/lib/components/hud/     HudTopBar, BuildBar, SelectionCard, categories
```

## Limitations / next steps
- **Crew sim:**
  - Movement runs at visual speed scaled by the sim speed. Walking and climbing therefore take more sim minutes than
    real life, which inflates ladder waits.
  - Needs, rates and schedules are game-style heuristics, not human-factors data.
  - Avoidance is local steering only. Two agents can briefly overlap in a tight aisle.
  - Avatars are hidden on decks that are not displayed. Enclosed units (pods, toilet) hide the user.
  - The couch occupant does not follow custom couch geometry.
- **Cruise (micro-g):**
  - The physics is a simple, deterministic kinematic model (push-off, coast, grab, stop on contact). There is no
    angular momentum, and bodies don't collide with each other (only separation steering).
  - Docking into a slot is an animated glide. Feet-in-restraint is a pose, not a contact model.
  - The voxel grid is 0.2 m and the hatch column 0.3 m, so very tight gaps may be closed or open differently than in reality.
  - Wall items above the 1.1 m build cutaway can look like they float in build view (in the interior view they sit on backplates against the full wall).
  - Loose floating items (the optional cosmetic extra) are not implemented. The torus "loops" of the foot restraint are full rings.
  - First-person camera in build mode keeps the hull cutaway, so looking up shows the sky.
- **Needs / effects / life cycle / power:** all rates, lifetimes, MTBFs and power figures are gameplay ESTIMATEs
  (ISS analogs where noted), not physiology or reliability data. "Health" is modelled through Fitness. Brownout is a heuristic
  (an idle item can't start when its start-up peak doesn't fit). Condition, broken-state and power badges need the crew sim running.
- **Egress:** a 2D 0.1 m grid path with a 0.8 m wide body. Door keep-outs are drawn but don't block. There is no
  timed evacuation and no multi-person flow.
- **Default cruise layout:** only 2 sleep places are usable in micro-g and there's no zero-g toilet, so cruise
  Work/Purpose is lower (the issues list flags both).
- Equipment is generic and procedural, not real flight hardware. Mass, power and cost are placeholders.
- There is no structural, thermal, acoustic, radiation-transport, fire-safety or emergency-egress analysis. The path check is 2D and
  inflates the body with rough square corners.
- **Cabin mode** treats the hull as a constant 4.5 m cylinder. Frames, windows and the airlock are decorative.
- **Habitat mode** uses an ESTIMATE ring and section model (docs §3), not SpaceX drawings:
  - The domes are ellipsoidal caps with a 2.0 m rise. Header tanks, plumbing, the downcomer and thrust structure are simplified or omitted.
  - Tank decks are flat floors inside the barrel. There is no deck inside a dome volume.
  - The opening rules are simple planning rules (width, weld clearance, stringer count), not stress analysis.
  - Shielding is shown only as lateral regolith areal density. There is no overhead shield or dose calculation.
  - At 2–3 m burial only the engine bay is below grade. The lowest LOX deck needs a berm of about 3 m or more to count as shielded.
  - Burial is a vertical pit around a vertical ship. The ~8° landing tilt and the landing legs are not modelled.
- Section caps cover the structure (hull, domes, slabs, regolith). Equipment shows its hollow interior where it is cut.
  There is no cap on the horizontal cut-height plane.
- The couch design is a concept. There are no load-path or certification checks, and the posture assumes the axis stays vertical.
- Decks are added to the top of their section. You can't insert one between existing decks of the same section.
- GLB export uses the current material setup (no texture baking).
- **Designer:**
  - Built-ins keep their procedural model in the planner. Only duplicates use the part data.
  - Extracted parts get generic names such as `12 · white rbox`.
  - Meshes in a built-in that are not primitives (lathe, extrude, tube) are skipped during extraction.
  - There is no undo.
  - Imported GLBs are stored inline, which bloats saves and localStorage. The GLB path is not covered by the headless test.
