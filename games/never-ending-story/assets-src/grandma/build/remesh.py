"""Align a Meshy Remesh GLB to the rigged mesh's bind pose, transfer skin weights (barycentric on closest
triangle), smooth facial geometry & refine facial PBR textures via refine_face.py, weld duplicate (pos, uv)
vertices with smooth vertex normals, and downscale its base-colour (plus optional PBR normal + metallic-roughness)
textures to JPEG.

Usage (called by build.mjs --remesh): python remesh.py <workdir> <remesh.glb> [tex_size]
Reads from workdir: hi_pos.bin (f32x3), hi_idx.bin (u32x3), hi_j.bin (u8x4), hi_w.bin (f32x4)
Writes to workdir:  out_pos.bin, out_nrm.bin, out_uv.bin, out_j.bin, out_w.bin, out_idx.bin, out_tex.jpg
                    (and out_norm.jpg, out_mr.jpg if present on the remesh GLB)
"""
import io, sys
from pathlib import Path
import numpy as np
import pygltflib
import trimesh
from PIL import Image
from refine_face import smooth_face_geometry, refine_face_textures

W = Path(sys.argv[1])
REMESH_GLB = Path(sys.argv[2])
TEX_SZ = int(sys.argv[3]) if len(sys.argv) > 3 else 1024

hi_pos = np.fromfile(W / "hi_pos.bin", np.float32).reshape(-1, 3)
hi_idx = np.fromfile(W / "hi_idx.bin", np.uint32).reshape(-1, 3)
hi_j = np.fromfile(W / "hi_j.bin", np.uint8).reshape(-1, 4)
hi_w = np.fromfile(W / "hi_w.bin", np.float32).reshape(-1, 4)

# 24-joint dense weight table on the rigged mesh
n_joints = int(hi_j.max()) + 1
hi_W = np.zeros((len(hi_pos), n_joints), dtype=np.float64)
for k in range(4):
    np.add.at(hi_W, (np.arange(len(hi_pos)), hi_j[:, k]), hi_w[:, k])

# Read remeshed mesh and its textures from the Meshy Remesh GLB
gltf = pygltflib.GLTF2().load(str(REMESH_GLB))
blob = gltf.binary_blob()
prim = gltf.meshes[0].primitives[0]

def get_acc(idx, cols):
    acc = gltf.accessors[idx]
    dt = {5121: np.uint8, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}[acc.componentType]
    bv = gltf.bufferViews[acc.bufferView]
    off = (bv.byteOffset or 0) + (acc.byteOffset or 0)
    arr = np.frombuffer(blob, dtype=dt, count=acc.count * cols, offset=off)
    return arr.reshape(-1, cols) if cols > 1 else arr

raw_pos = get_acc(prim.attributes.POSITION, 3).astype(np.float64)
raw_uv = get_acc(prim.attributes.TEXCOORD_0, 2).astype(np.float32)
raw_idx = get_acc(prim.indices, 1).astype(np.uint32).reshape(-1, 3)

# Align raw_pos to hi_pos: initial bbox match (height 1.55 m, floor at y=0) + point-to-plane IRLS
mesh_hi = trimesh.Trimesh(vertices=hi_pos, faces=hi_idx, process=False)
c0 = np.array([
    (raw_pos[:, 0].max() + raw_pos[:, 0].min()) / 2.0,
    raw_pos[:, 1].min(),
    (raw_pos[:, 2].max() + raw_pos[:, 2].min()) / 2.0,
])
s0 = (hi_pos[:, 1].max() - hi_pos[:, 1].min()) / (raw_pos[:, 1].max() - raw_pos[:, 1].min())
pts = (raw_pos - c0) * s0
for _ in range(15):
    cp, _, tid = trimesh.proximity.closest_point(mesh_hi, pts)
    n = mesh_hi.face_normals[tid]
    r = ((cp - pts) * n).sum(1)
    w = 1.0 / (np.abs(r) + 1e-4)
    A = np.column_stack([(pts * n).sum(1), n])
    b = (cp * n).sum(1)
    sol = np.linalg.lstsq(A * w[:, None], b * w, rcond=None)[0]
    pts = pts * sol[0] + sol[1:]

# Deduplicate unique 3D positions so seam vertices share identical normals and skin weights
pos_r = np.round(pts, 6)
_, u_first, u_inv = np.unique(pos_r, axis=0, return_index=True, return_inverse=True)
u_pts0 = pts[u_first]
u_faces = u_inv[raw_idx]

# Transfer skin weights via barycentric interpolation on the closest triangle of the rigged mesh (before face smoothing)
cp, dist, tid = trimesh.proximity.closest_point(mesh_hi, u_pts0)
bary = trimesh.triangles.points_to_barycentric(mesh_hi.triangles[tid], cp)
f = hi_idx[tid]
u_W = bary[:, 0:1] * hi_W[f[:, 0]] + bary[:, 1:2] * hi_W[f[:, 1]] + bary[:, 2:3] * hi_W[f[:, 2]]
top4 = np.argsort(-u_W, axis=1)[:, :4]
top4_w = np.take_along_axis(u_W, top4, axis=1)
top4_w = np.maximum(top4_w, 0.0)
w_sum = top4_w.sum(axis=1, keepdims=True)
top4_w = np.where(w_sum > 0, top4_w / w_sum, np.array([[1.0, 0.0, 0.0, 0.0]]))
top4_j = np.where(top4_w > 0, top4, 0).astype(np.uint8)
top4_w = top4_w.astype(np.float32)

def load_pil(tinfo):
    if tinfo is None:
        return None
    img_idx = gltf.textures[tinfo.index].source
    bv = gltf.bufferViews[gltf.images[img_idx].bufferView]
    return Image.open(io.BytesIO(blob[bv.byteOffset : bv.byteOffset + bv.byteLength])).convert("RGB")

mat = gltf.materials[0]
base_im = load_pil(mat.pbrMetallicRoughness.baseColorTexture)
norm_im = load_pil(mat.normalTexture)
mr_im = load_pil(mat.pbrMetallicRoughness.metallicRoughnessTexture)

# Sample vertex colour on unique positions and smooth facial skin geometry + normals
base_small = np.array(base_im.resize((1024, 1024), Image.BILINEAR), dtype=np.float32)
u_uv0 = raw_uv[u_first]
upx = np.clip((u_uv0[:, 0] * 1023).astype(int), 0, 1023)
vpx = np.clip((u_uv0[:, 1] * 1023).astype(int), 0, 1023)
u_rgb = base_small[vpx, upx]

u_pts, u_nrm, _ = smooth_face_geometry(u_pts0, u_faces, u_rgb)

# Weld vertices with identical (unique_pos_id, uv)
uv_r = np.round(raw_uv, 6)
pu_keys = np.column_stack([u_inv.astype(np.float64), uv_r])
_, pu_first, pu_inv = np.unique(pu_keys, axis=0, return_index=True, return_inverse=True)
u_for_pu = u_inv[pu_first]

out_pos = u_pts[u_for_pu].astype(np.float32)
out_nrm = u_nrm[u_for_pu].astype(np.float32)
out_uv = raw_uv[pu_first].astype(np.float32)
out_j = top4_j[u_for_pu]
out_w = top4_w[u_for_pu]
out_idx = pu_inv[raw_idx].astype(np.uint32)

out_pos.tofile(W / "out_pos.bin")
out_nrm.tofile(W / "out_nrm.bin")
out_uv.tofile(W / "out_uv.bin")
out_j.tofile(W / "out_j.bin")
out_w.tofile(W / "out_w.bin")
out_idx.tofile(W / "out_idx.bin")

base_out, norm_out, mr_out = refine_face_textures(
    out_pos.astype(np.float64),
    out_nrm.astype(np.float64),
    out_uv.astype(np.float64),
    out_idx.reshape(-1, 3).astype(np.int32),
    base_im,
    norm_im,
    mr_im,
    TEX_SZ,
)
base_out.save(W / "out_tex.jpg", quality=88, optimize=True)
if norm_out is not None:
    norm_out.save(W / "out_norm.jpg", quality=86, optimize=True)
if mr_out is not None:
    mr_out.save(W / "out_mr.jpg", quality=85, optimize=True)

print(
    f"remesh: {len(raw_idx)} tris, verts {len(raw_pos)} -> {len(out_pos)} ({len(u_pts)} positions), "
    f"median surface dist {np.median(dist):.6f} m (face refined)"
)
