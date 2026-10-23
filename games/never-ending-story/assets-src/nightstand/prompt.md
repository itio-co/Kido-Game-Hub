# Nightstand: prompt and settings for image-to-3D tools

**Input image:** `ref/nightstand-isolated-1024.png` (1024 × 1024, transparent background, about 86 % fill).
If a tool rejects transparency or shows a dark fringe, use `ref/nightstand-isolated-1024-white.png` (same image on white).
Keep `ref/nightstand-ref.png` (the original crop) open as the reference for what it should look like in the room.

The source crop is only 252 × 284 px, so the 1024 image is upscaled and soft. Expect the tool to make up
detail; the prompt below says what is really there.

## Prompt (English, paste as is)

```
A stylized low-poly cartoon wooden bedside table (nightstand) for a cozy mobile game, single object, centered.
Rectangular box-shaped top cabinet with one shallow drawer on the front and a small horizontal rectangular wooden knob in the middle of the drawer.
Four straight square legs, one at each corner. Sturdy horizontal stretcher bars (about 4.5 x 7 cm) low between the front and back legs on the left side and on the right side only; there is NO front stretcher and NO back stretcher, the space under the cabinet is open (no shelf or board under the drawer).
Proportions: 61 cm wide, 40.5 cm deep, 55 cm tall; the cabinet is about the top 28 % of the height, the legs are long.
Warm orange-honey wood, flat colours, soft hand-painted look, very little wood grain, no varnish shine.
Clean simple geometry with slightly bevelled edges, game-ready, low polygon count.
```

## Negative prompt / exclude

```
bed, bed post, mattress, pillow, blanket, wall, skirting board, floor, floor planks, rug, shadow, ground plane, lamp, objects on top, text, multiple drawers, doors, handles on the sides, curved legs, cabriole legs, back panel, shelf under the cabinet, metal, glass, photorealistic, high detail grain
```

## Settings per tool

Free tiers and option names change; these are the settings to look for.

| Tool | Mode | Settings |
| --- | --- | --- |
| **Meshy** (Image to 3D) | single image | Art style / topology: *Low Poly* or *Quad*; target polycount **~5k–10k**; Symmetry **on**; PBR **off** (we only need base colour); Remesh on; download **GLB**. Paste the prompt into the texture prompt if offered. |
| **Tripo** (Image to Model) | single image | Model version: latest; Style: none / *cartoon*; Texture **on**, PBR **off**; Quad / smart low-poly on, face limit **~10k**; Auto-size off; export **GLB**. |
| **Rodin** (Hyper3D) | Image to 3D | Quality *Medium* (or *Low* for a draft); Mesh mode **Raw** or **Quad**, faces **~8k–20k**; Material **Shaded** (not PBR); bounding box: W 61 × D 40.5 × H 55 if the size option is there; export **GLB**. |
| **Hunyuan3D** (2.x Space or local) | image to shape + texture | Remove background **off** (already transparent); Octree resolution 256; Steps 30–50; Guidance 5–7.5; Seed fixed (e.g. 1234) so you can repeat it; Texture **on**; Face reduction **on**, target **~10k**; export **GLB**. |
| **TRELLIS** (your own HF Space / account) | single image | Preprocess **off** (or on if it adds a white border); Seed fixed; SS guidance 7.5 / steps 12; SLat guidance 3 / steps 12; GLB simplify **0.95**; texture size **1024**; extract **GLB**. A ZeroGPU quota needs a logged-in account. |
| **Blender** (by hand) | — | Open `blender/nightstand-master.blend`. Camera **MatchCam** already has the reference as background (Numpad 0). Keep size 61 × 40.5 × 55 cm and the origin at the floor centre. Export **GLB** to `external/blender/`. |

After download, put the file in `external/<tool>/` and run the import check (see `external/README.md`).

## วิธีใช้ (ภาษาไทย ฉบับย่อ)

1. เปิดเว็บเครื่องมือ (Meshy / Tripo / Rodin / Hunyuan3D / TRELLIS) แล้วเลือกโหมด **Image to 3D**
2. อัปโหลดรูป `ref/nightstand-isolated-1024.png` (พื้นหลังโปร่งใส) ถ้าเครื่องมือไม่รับพื้นโปร่งใส ให้ใช้ `ref/nightstand-isolated-1024-white.png`
3. คัดลอก **Prompt** และ **Negative prompt** ด้านบนไปวาง (ถ้าเครื่องมือมีช่องให้ใส่)
4. ตั้งค่าตามตาราง: low-poly ประมาณ 5k–20k faces, ปิด PBR, export เป็น **GLB**
5. ดาวน์โหลดไฟล์แล้ววางที่ `external/<ชื่อเครื่องมือ>/` เช่น `external/meshy/model.glb`
6. รันสคริปต์ตรวจ (ต้องมี Blender):
   `blender -b --python games/never-ending-story/assets-src/tools/import_external.py -- games/never-ending-story/assets-src/nightstand games/never-ending-story/assets-src/nightstand/external/meshy/model.glb`
7. เปิดดู `external/meshy/compare/model-side-by-side.png` และ `model-overlay.png` เทียบกับภาพต้นฉบับ ค่า IoU ใน `model-report.json` ยิ่งใกล้ 1 ยิ่งตรง

ข้อควรจำ: เสาสีเข้มทางซ้ายคือ **เตียง** และก้อนสีขาวคือ **ที่นอน/หมอน** ไม่ใช่ส่วนของตู้ ตู้มีลิ้นชักเดียว ขา 4 ขา มีคานล่างเฉพาะด้านซ้าย-ขวา **ไม่มีคานหลัง**
