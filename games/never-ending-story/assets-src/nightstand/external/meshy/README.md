# Meshy 7.1 result (1.5k target)

`model.glb`: image-to-3D from `ref/nightstand-isolated-1024.png` via Meshy `POST /openapi/v1/image-to-3d`
(`ai_model: "meshy-7.1"`, `topology: "triangle"`, `target_polycount: 1500`, `should_remesh: true`,
`should_texture: true`, `enable_pbr: true`; task `01a16c77-3840-7395-b624-2f2bf168a529`).

- **Triangles:** `961` (`2,133` vertices)
- **File size:** `367,108` bytes (~367 KB, 1K JPEG PBR maps: `baseColor`, `normal`, `metallicRoughness` + glTF `KHR_mesh_quantization`)
- **Normalised pose:** upright, `yawDeg: 180` (drawer + knob facing glTF `+Z`), `61 × 43 × 55 cm`, origin on floor centre
- **Silhouette IoU:** **0.9143** (refined mask) / **0.7718** (rembg mask), vs 0.925 / 0.743 for the Blender master
- **Runtime copy:** `games/never-ending-story/public/models/nightstand-meshy-1k5.glb` (exposed as `meshy1k5` in `#/showcase?asset=player-room/nightstand`)
