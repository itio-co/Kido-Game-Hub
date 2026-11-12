# Selection and reference presets

- **ทั้งชิ้น (whole object)** is the default selection scope. Tapping any mesh selects the asset, with a shared center and bounding box. Translation and rotation affect every non-deleted part, including hidden parts. Scaling is uniform to preserve the assembled object's proportions. Each completed gesture or property adjustment is one model Undo step.
- **แยกชิ้น (individual part)** keeps the existing per-part transforms, color and pivot editing. Selecting a part from the properties list also enters this mode. Switching scopes does not change geometry.
- Model Undo/Redo buttons in the whole-object properties are available even in alignment view, whose main Undo/Redo controls remain dedicated to reference guides.
- **ทั้งห้อง / เฉพาะชิ้น** are separate reference presets, available in image and alignment views for assets with mapped references. They reuse each asset's existing room image and crop association; switching keeps the camera and separate guide histories. They do not segment arbitrary images or generate new meshes.
- Full-room references preserve composition/context; isolated references support inspecting the asset. Existing crop mapping and camera calibration remain the source of truth.

Tests in `tests/modelEditorBring.test.mjs` load the real clock and nightstand GLBs (both variants), exercising group transforms, distances, hidden/deleted parts, invalid scale, switching scopes, part transforms, gizmo drag and model undo/redo. Renderer/browser plumbing is mocked, not asset geometry.
