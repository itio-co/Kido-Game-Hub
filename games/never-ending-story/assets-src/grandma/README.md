# Grandma Mali (ย่ามะลิ) — rigged character

`characters/grandma` · runtime file `games/never-ending-story/public/models/grandma-mali.glb` (1.26 MB) ·
shown in `#/showcase` (not editable in `#/editor`).

Image-to-3D, rigging and animations were done with the [Meshy API](https://docs.meshy.ai/) from the
mock-up art `public/img/living-grandma.jpg`. The GLB is then rebuilt offline (clip selection, trimming,
seat alignment, 1024 texture, quantization) by `build/build.mjs`.

## Layout

```
grandma/
├── README.md, asset.json     this file; metadata incl. clips and the seat anchor
├── ref/
│   ├── grandma-cutout.png    the exact image sent to Meshy (1224², transparent background)
│   └── cut.py                rembg background removal (first step of the cutout)
├── meshy/
│   ├── request-*.json        request bodies, without the API key (image_url = data URI of the cutout)
│   ├── tasks.json            task ids, actions, credits, balances
│   ├── meshy_api.py          re-runs any step; reads MESHY_API_KEY from the environment
│   └── raw/                  git-ignored: raw Meshy downloads (~4.5 MB each) + task JSON
├── build/
│   ├── texture.py            2048 → 1024 JPEG base colour (q85)
│   ├── build.mjs             raw GLBs → public/models/grandma-mali.glb
│   └── package.json          glTF Transform (offline only, not part of the game build)
└── preview/                  turnaround, contact sheets, seated check (JPEG, small)
```

## How it was made

| step | Meshy task | credits | output |
| --- | --- | --- | --- |
| image-to-3d (meshy-7.1, 20k tris, A-pose, 2k texture) | `01a169e7-74d3-7656-b0c0-81b6e7ddbc85` | 30 | textured mesh |
| rigging (height 1.55 m) | `01a169f1-22ab-738e-bdf2-21e01c7e017d` | 5 | 24-joint rig + free walk / run clips |
| animations 243 Idle_3, 32 Chair_Sit_Idle_F, 290 Wave_One_Hand | `01a169f1-770f-743a-abc0-a9e881d6e44a` | 9 | merged GLB |
| animations 58 Step_to_Sit_Transition, 307 Sitting_Answering_Questions | `01a169f5-b46e-76d3-97b9-1bf9d67a3938` | 6 | merged GLB |
| **total** | | **50** | |

Action 58 was chosen over 57 (male, ends with the knees wide) and 60 (Walk to Sit, a long walk first)
because it ends knees together with the hands on the knees, the same pose as Chair_Sit_Idle_F.

## Rebuild

Meshy only keeps results for 3 days, so the raw files have to be downloaded again with the same task ids
while they exist (or regenerated, which costs credits again):

```sh
cd games/never-ending-story/assets-src/grandma/meshy
export MESHY_API_KEY=...                 # never commit or print it
python meshy_api.py poll rigging 01a169f1-22ab-738e-bdf2-21e01c7e017d     # writes raw/task-*.json
python meshy_api.py poll animations 01a169f1-770f-743a-abc0-a9e881d6e44a
python meshy_api.py poll animations 01a169f5-b46e-76d3-97b9-1bf9d67a3938
# download the URLs from raw/task-*.json into raw/ with these names:
#   Character_output.glb                    rigging result.rigged_character_glb_url
#   Animation_Walking_withSkin.glb          rigging result.basic_animations.walking_glb_url
#   grandma-anims-idle3-chairsit-wave.glb   first animations task result.animation_glb_url
#   grandma-anims-steptosit-sittalk.glb     second animations task result.animation_glb_url
python meshy_api.py download "<url>" Character_output.glb   # etc.

cd ../build
python texture.py                        # raw/texture-1024.jpg
npm i && node build.mjs                  # → public/models/grandma-mali.glb
```

With the original downloads the build is byte-identical to the committed GLB.

What `build.mjs` does:

- Keeps the rigged mesh, drops its built-in clip, copies clips by node name in this order:
  **Idle, Wave, SitDown, SitIdle, SitTalk, Walk**. Run is dropped (does not suit an elderly character, saves size).
- **SitDown** is kept as Meshy made it: it starts standing at the origin facing +Z, steps forward ~0.9 m, turns
  90° and sits facing **+X** with the hips at (−0.35, 0.48, 0.90) m.
- **SitIdle** = Chair_Sit_Idle_F trimmed to 0–3.7 s (it slumps from ~4 s), last 0.6 s blended back to frame 0
  for a clean loop, rotated +90° and moved so its hips sit on the same anchor (3 cm lower to keep the seat
  contact). **SitTalk** gets the same rotation and anchor (4 cm lower). So Idle → SitDown → SitIdle / SitTalk is
  continuous without moving the model.
- Renames nodes (`GrandmaMali_Scene`, `GrandmaMali_Armature`, `GrandmaMali_Body`, material `GrandmaMali`).
- 1024 JPEG texture, resample + dedup + prune, `KHR_mesh_quantization` (three.js reads it without a decoder).

## Seat (pelvis offset)

A seat for the sitting clips (model space, metres; see `asset.json` → `exports.seat`):
top at **0.44 m**, front edge at x = −0.15, 0.55 m deep towards −X, centred on z = 0.903, character faces +X.
The hips are ~0.05 m above the seat top. `#/showcase` draws a simple seat block from these numbers
(there is no sofa model yet).

## License

Generated on a **Meshy Pro** plan. Meshy's terms give paid-plan users ownership and commercial-use rights for
their generated assets, so the model can ship in the game. The source art is the project's own mock-up.

## Known issues

- **Skirt in Walk:** the skirt is part of the single skinned mesh and is weighted to the thigh bones, so it splits
  like trousers while walking (also visible a little in SitTalk, which sits with the knees wide). A proper fix
  needs a skirt/cloth bone chain or a separate skirt mesh.
- **No fingers:** the Meshy rig has 24 joints and no finger bones; the hands are mittens.
- **SitIdle** is only the upright 3.7 s of the original clip, so it is a short loop.
- No blend shapes: the face (smile) is painted in the texture.
- The 3-day expiry on Meshy results means `meshy/raw/` cannot be refreshed from the same task ids later.
