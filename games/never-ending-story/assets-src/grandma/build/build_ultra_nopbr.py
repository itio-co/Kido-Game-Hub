#!/usr/bin/env python3
"""
Aligns the unrigged No-PBR Ultra mesh (`grandma-bigface-nopbr.glb`, generated with
`enable_pbr: false` and `image_enhancement: false`) to the 24-bone T-pose skeleton
and transfers `JOINTS_0` / `WEIGHTS_0`.

Can be invoked by `build.mjs --raw ../meshy/raw-bigface --nopbr-raw` with `<tmpdir> [tex_sz]`,
or run standalone to invoke `node build.mjs`.
"""
from __future__ import annotations

import io
import subprocess
import sys
from pathlib import Path

import numpy as np
import pygltflib
from PIL import Image
from scipy.spatial import cKDTree

HERE = Path(__file__).resolve().parent
ASSET_DIR = HERE.parent
MESHY_DIR = ASSET_DIR / "meshy"
RAW_DIR = MESHY_DIR / "raw-bigface"
NOPBR_GLB = RAW_DIR / "grandma-bigface-nopbr.glb"
NOPBR_PNG = RAW_DIR / "nopbr-base.png"
OUT_ULTRA_NOPBR = ASSET_DIR.parent.parent / "public" / "models" / "grandma-mali-ultra-nopbr.glb"
OUT_ULTRA = ASSET_DIR.parent.parent / "public" / "models" / "grandma-mali-ultra.glb"


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


def generate_into_dir(work_dir: Path, tex_sz: int = 2048) -> None:
    ref_pos = np.fromfile(work_dir / "hi_pos.bin", dtype=np.float32).reshape(-1, 3)
    ref_joints = np.fromfile(work_dir / "hi_j.bin", dtype=np.uint8).reshape(-1, 4)
    ref_weights = np.fromfile(work_dir / "hi_w.bin", dtype=np.float32).reshape(-1, 4)

    gn = pygltflib.GLTF2().load(str(NOPBR_GLB))
    bn = gn.binary_blob()
    prn = gn.meshes[0].primitives[0]
    raw_pos = _acc_read(gn, bn, prn.attributes.POSITION, 3)
    raw_uv = _acc_read(gn, bn, prn.attributes.TEXCOORD_0, 2)
    raw_faces = _acc_read(gn, bn, prn.indices, 1).reshape(-1, 3)

    c0 = np.array(
        [
            (raw_pos[:, 0].max() + raw_pos[:, 0].min()) / 2.0,
            raw_pos[:, 1].min(),
            (raw_pos[:, 2].max() + raw_pos[:, 2].min()) / 2.0,
        ],
        dtype=np.float64,
    )
    s0 = float(ref_pos[:, 1].max() - ref_pos[:, 1].min()) / float(raw_pos[:, 1].max() - raw_pos[:, 1].min())
    pts = (raw_pos.astype(np.float64) - c0) * s0

    piv_L = np.array([0.1471, 1.1395, -0.0256], dtype=np.float64)
    piv_R = np.array([-0.1471, 1.1428, -0.0261], dtype=np.float64)
    th = np.deg2rad(-41.5)
    c, s = np.cos(th), np.sin(th)
    R_L = np.array([[c, -s, 0.0], [s, c, 0.0], [0.0, 0.0, 1.0]], dtype=np.float64)
    R_R = np.array([[c, s, 0.0], [-s, c, 0.0], [0.0, 0.0, 1.0]], dtype=np.float64)
    arm_scale = 1.14

    wL = np.clip((pts[:, 0] - 0.115) / 0.065, 0.0, 1.0) * np.clip((pts[:, 1] - 0.78) / 0.14, 0.0, 1.0)
    wR = np.clip((-pts[:, 0] - 0.115) / 0.065, 0.0, 1.0) * np.clip((pts[:, 1] - 0.78) / 0.14, 0.0, 1.0)
    wL = wL * wL * (3.0 - 2.0 * wL)
    wR = wR * wR * (3.0 - 2.0 * wR)

    rel_L = pts - piv_L
    sL_x = 1.0 + (arm_scale - 1.0) * np.clip((pts[:, 0] - 0.1471) / 0.12, 0.0, 1.0)
    rel_L_scaled = np.column_stack([rel_L[:, 0] * sL_x, rel_L[:, 1], rel_L[:, 2]])
    rot_L = rel_L_scaled @ R_L.T + piv_L

    rel_R = pts - piv_R
    sR_x = 1.0 + (arm_scale - 1.0) * np.clip((-pts[:, 0] - 0.1471) / 0.12, 0.0, 1.0)
    rel_R_scaled = np.column_stack([rel_R[:, 0] * sR_x, rel_R[:, 1], rel_R[:, 2]])
    rot_R = rel_R_scaled @ R_R.T + piv_R

    aligned_pos = (pts * (1.0 - wL[:, None] - wR[:, None]) + rot_L * wL[:, None] + rot_R * wR[:, None]).astype(
        np.float32
    )
    aligned_norm = _compute_smooth_normals(aligned_pos, raw_faces)

    tree = cKDTree(ref_pos)
    dists, idxs = tree.query(aligned_pos, k=6)
    inv_d = 1.0 / np.maximum(dists, 1e-6) ** 2
    inv_d /= inv_d.sum(axis=1, keepdims=True)
    n_verts = len(aligned_pos)
    n_joints = int(ref_joints.max()) + 1
    accum = np.zeros((n_verts, n_joints), dtype=np.float32)
    for ki in range(6):
        nb_j = ref_joints[idxs[:, ki]]
        nb_w = ref_weights[idxs[:, ki]]
        w_k = inv_d[:, ki : ki + 1].astype(np.float32) * nb_w
        for slot in range(4):
            np.add.at(accum, (np.arange(n_verts), nb_j[:, slot]), w_k[:, slot])
    top4_j = np.argsort(-accum, axis=1)[:, :4].astype(np.uint8)
    top4_w = np.take_along_axis(accum, top4_j, axis=1).astype(np.float32)
    w_sum = top4_w.sum(axis=1, keepdims=True)
    top4_w = np.where(w_sum > 1e-8, top4_w / np.maximum(w_sum, 1e-8), np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32))

    im = Image.open(NOPBR_PNG).convert("RGB").resize((tex_sz, tex_sz), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=92, optimize=True)

    aligned_pos.astype(np.float32).tofile(work_dir / "out_pos.bin")
    aligned_norm.astype(np.float32).tofile(work_dir / "out_nrm.bin")
    raw_uv.astype(np.float32).tofile(work_dir / "out_uv.bin")
    top4_j.astype(np.uint8).tofile(work_dir / "out_j.bin")
    top4_w.astype(np.float32).tofile(work_dir / "out_w.bin")
    raw_faces.reshape(-1).astype(np.uint32).tofile(work_dir / "out_idx.bin")
    (work_dir / "out_tex.jpg").write_bytes(buf.getvalue())
    print(f"build_ultra_nopbr.py: verts={len(aligned_pos)}, tris={len(raw_faces)}, tex={tex_sz}px")


if __name__ == "__main__":
    if len(sys.argv) > 1 and Path(sys.argv[1]).is_dir():
        sz = int(sys.argv[2]) if len(sys.argv) > 2 else 2048
        generate_into_dir(Path(sys.argv[1]), sz)
    else:
        subprocess.run(
            [
                "node",
                str(HERE / "build.mjs"),
                "--raw",
                str(RAW_DIR),
                "--nopbr-raw",
                "--tex",
                "2048",
                str(OUT_ULTRA_NOPBR),
            ],
            check=True,
        )
