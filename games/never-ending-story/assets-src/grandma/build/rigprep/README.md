# grandma 6k rig-prep pipeline (tripo6kClean)
Run from this dir (paths inside scripts point at /workspace/rigprep; adjust as needed):
1. `python3 prep.py 3000 4000 1.38` – weld, X-symmetry snap, part labels, A→T pose, head/body split, low-relief art-toy head, texture clean.
2. `HEAD_TRIS=3000 BODY_TRIS=4000 python3 build.py` – meshopt simplify per part, joints from cross-sections → rig_in.npz, joints_new.json.
3. `blender -b -P bl_weights.py` – heat weights restricted per part (body / arms).
4. `python3 write_glb.py out.glb` – analytic weights (head/hair→Head, hands→Hand, skirt Hips→UpLeg/Leg blend, feet), new T-pose rest, IBMs, original 6 clips.
5. `blender -b -P render_clips.py -- out.glb outdir` + `grid.py`, `dbg_bones.py` for checks.
