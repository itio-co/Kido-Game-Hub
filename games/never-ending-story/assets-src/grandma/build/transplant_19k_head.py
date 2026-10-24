#!/usr/bin/env python3
"""
Transplant the Original 19.4k Head (living-grandma.jpg cutout, enable_pbr: false)
onto the T-Pose 6k Remesh Body with the 24-bone Mixamo skeleton.

Can be invoked by `build.mjs --raw ../meshy/raw-bigface --head19k` with `<tmpdir>`,
or run standalone to invoke `node build.mjs`.
"""
from __future__ import annotations

import io
import subprocess
import sys
from pathlib import Path

import numpy as np
import pygltflib
import trimesh
from PIL import Image
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import connected_components
from scipy.spatial import cKDTree

HERE = Path(__file__).resolve().parent
ASSET_DIR = HERE.parent
MESHY_DIR = ASSET_DIR / "meshy"
RAW_19K_GLB = MESHY_DIR / "raw" / "Character_output.glb"
RAW_19K_TEX = Path("/workspace/meshy/grandma/texture_0_base_color.png")
REMESH_6K_GLB = MESHY_DIR / "raw-bigface" / "grandma-bigface-remesh-6k.glb"
REMESH_6K_TEX = MESHY_DIR / "raw-bigface" / "remesh-pbr-base.jpg"
OUT_GLB = ASSET_DIR.parent.parent / "public" / "models" / "grandma-mali-head19k-tpose.glb"


def _acc_read(gltf: pygltflib.GLTF2, blob: bytes, idx: int | None, n_comp: int) -> np.ndarray | None:
    if idx is None:
        return None
    acc = gltf.accessors[idx]
    bv = gltf.bufferViews[acc.bufferView]
    dt = {
        5120: np.int8,
        5121: np.uint8,
        5122: np.int16,
        5123: np.uint16,
        5125: np.uint32,
        5126: np.float32,
    }[acc.componentType]
    off = (bv.byteOffset or 0) + (acc.byteOffset or 0)
    arr = np.frombuffer(blob, dtype=dt, count=acc.count * n_comp, offset=off)
    return arr.reshape(acc.count, n_comp).copy() if n_comp > 1 else arr.copy()


def _compute_smooth_normals(pos: np.ndarray, faces: np.ndarray) -> np.ndarray:
    pos_r = np.round(pos, 6)
    _, inv = np.unique(pos_r, axis=0, return_inverse=True)
    v0 = pos[faces[:, 0]]
    v1 = pos[faces[:, 1]]
    v2 = pos[faces[:, 2]]
    fn = np.cross(v1 - v0, v2 - v0)
    u_norm = np.zeros((inv.max() + 1, 3), dtype=np.float64)
    for k in range(3):
        np.add.at(u_norm, inv[faces[:, k]], fn)
    norms = u_norm[inv]
    lens = np.linalg.norm(norms, axis=1, keepdims=True)
    norms = np.where(lens > 1e-12, norms / np.maximum(lens, 1e-12), np.array([0.0, 1.0, 0.0]))
    return norms.astype(np.float32)


def _compact_submesh(
    pos: np.ndarray,
    uv: np.ndarray,
    faces: np.ndarray,
    keep_tri_mask: np.ndarray,
    largest_cc_only: bool = True,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    kept_faces = faces[keep_tri_mask]
    if largest_cc_only:
        pos_r = np.round(pos, 6)
        _, u_first, u_inv = np.unique(pos_r, axis=0, return_index=True, return_inverse=True)
        u_pos = pos[u_first]
        u_faces = u_inv[kept_faces]
        n_f = len(u_faces)
        n_v = len(u_pos)
        rows = np.repeat(np.arange(n_f), 3)
        cols = u_faces.reshape(-1)
        mat = csr_matrix((np.ones(len(rows), dtype=np.int8), (rows, cols)), shape=(n_f, n_v))
        adj = mat @ mat.T
        _, labels = connected_components(adj, directed=False)
        best_label = int(np.argmax(np.bincount(labels)))
        kept_faces = kept_faces[labels == best_label]

    used_v, new_idx = np.unique(kept_faces, return_inverse=True)
    sub_pos = pos[used_v].astype(np.float32).copy()
    sub_uv = uv[used_v].astype(np.float32).copy()
    sub_faces = new_idx.reshape(-1, 3).astype(np.uint32)
    sub_norm = _compute_smooth_normals(sub_pos, sub_faces)
    return sub_pos, sub_norm, sub_uv, sub_faces


def _align_to_tpose_bind(remesh_pos: np.ndarray, hi_pos: np.ndarray, hi_faces: np.ndarray) -> np.ndarray:
    mesh_hi = trimesh.Trimesh(vertices=hi_pos, faces=hi_faces, process=False)
    c0 = np.array(
        [
            (remesh_pos[:, 0].max() + remesh_pos[:, 0].min()) / 2.0,
            remesh_pos[:, 1].min(),
            (remesh_pos[:, 2].max() + remesh_pos[:, 2].min()) / 2.0,
        ],
        dtype=np.float64,
    )
    s0 = float(hi_pos[:, 1].max() - hi_pos[:, 1].min()) / float(remesh_pos[:, 1].max() - remesh_pos[:, 1].min())
    pts = (remesh_pos.astype(np.float64) - c0) * s0
    for _ in range(18):
        cp, _, tid = trimesh.proximity.closest_point(mesh_hi, pts)
        n = mesh_hi.face_normals[tid]
        r = ((cp - pts) * n).sum(axis=1)
        w = 1.0 / (np.abs(r) + 1e-4)
        A = np.column_stack([(pts * n).sum(axis=1), n])
        b = (cp * n).sum(axis=1)
        sol, _, _, _ = np.linalg.lstsq(A * w[:, None], b * w, rcond=None)
        pts = pts * sol[0] + sol[1:]
    return pts.astype(np.float32)


def _transfer_weights_knn(
    query_pos: np.ndarray,
    ref_pos: np.ndarray,
    ref_joints: np.ndarray,
    ref_weights: np.ndarray,
    k: int = 8,
) -> tuple[np.ndarray, np.ndarray]:
    tree = cKDTree(ref_pos)
    dists, idxs = tree.query(query_pos, k=k)
    inv_d = 1.0 / np.maximum(dists, 1e-6) ** 2
    inv_d /= inv_d.sum(axis=1, keepdims=True)
    n_verts = len(query_pos)
    n_joints = int(ref_joints.max()) + 1
    accum = np.zeros((n_verts, n_joints), dtype=np.float64)
    for ki in range(k):
        nb_j = ref_joints[idxs[:, ki]]
        nb_w = ref_weights[idxs[:, ki]]
        w_k = inv_d[:, ki : ki + 1] * nb_w
        for slot in range(4):
            np.add.at(accum, (np.arange(n_verts), nb_j[:, slot]), w_k[:, slot])
    top4_j = np.argsort(-accum, axis=1)[:, :4].astype(np.uint8)
    top4_w = np.take_along_axis(accum, top4_j, axis=1).astype(np.float32)
    w_sum = top4_w.sum(axis=1, keepdims=True)
    top4_w = np.where(w_sum > 1e-8, top4_w / np.maximum(w_sum, 1e-8), np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32))
    return top4_j, top4_w


def _prepare_head19k_texture(head_pos: np.ndarray, head_uv: np.ndarray) -> bytes:
    """Load the original 2048x2048 19.4k diffuse texture and clean only the 8 lower-neck rim texels."""
    im = np.array(Image.open(RAW_19K_TEX).convert("RGB"), dtype=np.uint8)
    H, W = im.shape[:2]
    px = np.clip((head_uv[:, 0] * (W - 1)).astype(int), 0, W - 1)
    py = np.clip((head_uv[:, 1] * (H - 1)).astype(int), 0, H - 1)
    rgb = im[py, px].astype(np.float32)
    purple_bleed = (head_pos[:, 1] < 1.178) & ((rgb[:, 2] - rgb[:, 1] > 8) & (rgb[:, 0] - rgb[:, 2] < 20))
    for vi in np.where(purple_bleed)[0]:
        cx, cy = int(px[vi]), int(py[vi])
        r_pad = 8
        y0, y1 = max(0, cy - r_pad), min(H, cy + r_pad + 1)
        x0, x1 = max(0, cx - r_pad), min(W, cx + r_pad + 1)
        patch = im[y0:y1, x0:x1].astype(np.float32)
        p_mask = (patch[:, :, 2] - patch[:, :, 1] > 6) & (patch[:, :, 0] - patch[:, :, 2] < 22)
        patch[p_mask] = np.array([224.0, 162.0, 122.0], dtype=np.float32)
        im[y0:y1, x0:x1] = np.clip(patch, 0, 255).astype(np.uint8)

    buf = io.BytesIO()
    Image.fromarray(im, mode="RGB").save(buf, format="JPEG", quality=95, optimize=True)
    return buf.getvalue()


def _prepare_body6k_texture() -> bytes:
    """Harmonize the 6k T-pose body diffuse texture so skin warmth matches the 19.4k head."""
    im = np.array(Image.open(REMESH_6K_TEX).convert("RGB"), dtype=np.float32)
    r, g, b = im[:, :, 0], im[:, :, 1], im[:, :, 2]
    skin_w = np.clip(((r - b) - 18.0) / 18.0, 0.0, 1.0) * np.clip((r - 110.0) / 30.0, 0.0, 1.0)
    im[:, :, 0] += skin_w * 13.0
    im[:, :, 1] += skin_w * 1.5
    im[:, :, 2] -= skin_w * 10.0
    im_u8 = np.clip(im, 0, 255).astype(np.uint8)
    buf = io.BytesIO()
    Image.fromarray(im_u8, mode="RGB").save(buf, format="JPEG", quality=93, optimize=True)
    return buf.getvalue()


def generate_into_dir(work_dir: Path) -> None:
    hi_pos = np.fromfile(work_dir / "hi_pos.bin", dtype=np.float32).reshape(-1, 3)
    hi_faces = np.fromfile(work_dir / "hi_idx.bin", dtype=np.uint32).reshape(-1, 3)
    hi_joints = np.fromfile(work_dir / "hi_j.bin", dtype=np.uint8).reshape(-1, 4)
    hi_weights = np.fromfile(work_dir / "hi_w.bin", dtype=np.float32).reshape(-1, 4)

    # 1. Extract 19.4k head above collar seam
    g19 = pygltflib.GLTF2().load(str(RAW_19K_GLB))
    b19 = g19.binary_blob()
    pr19 = g19.meshes[0].primitives[0]
    pos19 = _acc_read(g19, b19, pr19.attributes.POSITION, 3)
    uv19 = _acc_read(g19, b19, pr19.attributes.TEXCOORD_0, 2)
    idx19 = _acc_read(g19, b19, pr19.indices, 1).reshape(-1, 3)

    tri_c19 = pos19[idx19].mean(axis=1)
    y_thresh19 = 1.152 - 0.025 * np.clip((tri_c19[:, 2] - 0.02) / 0.08, 0.0, 1.0)
    keep19 = tri_c19[:, 1] >= y_thresh19
    head_pos, head_norm, head_uv, head_faces = _compact_submesh(pos19, uv19, idx19, keep19, largest_cc_only=True)

    # 2. Extract 6k T-pose body below collar seam
    g6 = pygltflib.GLTF2().load(str(REMESH_6K_GLB))
    b6 = g6.binary_blob()
    pr6 = g6.meshes[0].primitives[0]
    raw6_pos = _acc_read(g6, b6, pr6.attributes.POSITION, 3)
    raw6_uv = _acc_read(g6, b6, pr6.attributes.TEXCOORD_0, 2)
    raw6_faces = _acc_read(g6, b6, pr6.indices, 1).reshape(-1, 3)

    aligned6_pos = _align_to_tpose_bind(raw6_pos, hi_pos, hi_faces)
    tri_c6 = aligned6_pos[raw6_faces].mean(axis=1)
    y_cut6 = 1.185 - 0.023 * np.clip((tri_c6[:, 2] + 0.01) / 0.06, 0.0, 1.0)
    keep6 = tri_c6[:, 1] <= y_cut6
    body_pos, body_norm, body_uv, body_faces = _compact_submesh(
        aligned6_pos, raw6_uv, raw6_faces, keep6, largest_cc_only=True
    )

    neck_axis_x, neck_axis_z = 0.0, -0.025
    t_tuck = np.clip((body_pos[:, 1] - 1.145) / (1.182 - 1.145), 0.0, 1.0)
    radial_scale = 1.0 - 0.24 * (t_tuck ** 1.2)
    body_pos[:, 0] = neck_axis_x + (body_pos[:, 0] - neck_axis_x) * radial_scale
    body_pos[:, 2] = neck_axis_z + (body_pos[:, 2] - neck_axis_z) * radial_scale
    body_pos[:, 1] += 0.004 * (t_tuck ** 2)
    body_norm = _compute_smooth_normals(body_pos, body_faces)

    # 3. Skin weights
    body_j, body_w = _transfer_weights_knn(body_pos, hi_pos, hi_joints, hi_weights, k=8)
    head_j_knn, head_w_knn = _transfer_weights_knn(head_pos, hi_pos, hi_joints, hi_weights, k=8)
    head_j = np.zeros((len(head_pos), 4), dtype=np.uint8)
    head_w = np.zeros((len(head_pos), 4), dtype=np.float32)
    n_joints = int(hi_joints.max()) + 1
    for vi in range(len(head_pos)):
        alpha = float(np.clip((head_pos[vi, 1] - 1.148) / (1.185 - 1.148), 0.0, 1.0))
        alpha = alpha * alpha * (3.0 - 2.0 * alpha)
        if alpha >= 0.999:
            head_j[vi] = [5, 0, 0, 0]
            head_w[vi] = [1.0, 0.0, 0.0, 0.0]
        else:
            vec = np.zeros(n_joints, dtype=np.float64)
            for s in range(4):
                vec[head_j_knn[vi, s]] += (1.0 - alpha) * float(head_w_knn[vi, s])
            vec[5] += alpha
            top4 = np.argsort(-vec)[:4]
            w4 = vec[top4].astype(np.float32)
            w4 /= max(float(w4.sum()), 1e-8)
            head_j[vi] = top4.astype(np.uint8)
            head_w[vi] = w4

    head_pos.astype(np.float32).tofile(work_dir / "head_pos.bin")
    head_norm.astype(np.float32).tofile(work_dir / "head_nrm.bin")
    head_uv.astype(np.float32).tofile(work_dir / "head_uv.bin")
    head_j.astype(np.uint8).tofile(work_dir / "head_j.bin")
    head_w.astype(np.float32).tofile(work_dir / "head_w.bin")
    head_faces.reshape(-1).astype(np.uint32).tofile(work_dir / "head_idx.bin")
    (work_dir / "head_tex.jpg").write_bytes(_prepare_head19k_texture(head_pos, head_uv))

    body_pos.astype(np.float32).tofile(work_dir / "body_pos.bin")
    body_norm.astype(np.float32).tofile(work_dir / "body_nrm.bin")
    body_uv.astype(np.float32).tofile(work_dir / "body_uv.bin")
    body_j.astype(np.uint8).tofile(work_dir / "body_j.bin")
    body_w.astype(np.float32).tofile(work_dir / "body_w.bin")
    body_faces.reshape(-1).astype(np.uint32).tofile(work_dir / "body_idx.bin")
    (work_dir / "body_tex.jpg").write_bytes(_prepare_body6k_texture())
    print(
        f"transplant_19k_head.py: head={len(head_pos)}v/{len(head_faces)}t, body={len(body_pos)}v/{len(body_faces)}t"
    )


if __name__ == "__main__":
    if len(sys.argv) > 1 and Path(sys.argv[1]).is_dir():
        generate_into_dir(Path(sys.argv[1]))
    else:
        subprocess.run(
            ["node", str(HERE / "build.mjs"), "--raw", str(MESHY_DIR / "raw-bigface"), "--head19k", str(OUT_GLB)],
            check=True,
        )
