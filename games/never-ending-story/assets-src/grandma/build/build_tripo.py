#!/usr/bin/env python3
"""
Builds the smoothed-face Tripo3D Grandma Mali runtime GLBs from
`assets-src/grandma/tripo/raw/grandma-tripo-raw.glb` (1,913,192 tris, 1,111,497 verts):

1. Selects the facial skin region (forehead, temples, crow's feet / หางตา, under-eye bags,
   cheeks, nasolabial folds / ร่องแก้ม, chin/jawline, and neck) while strictly protecting
   the eyeballs/irises/eyelids, eyebrows, nose bridge/tip/nostrils, lips/smile line, ears, and hair.
2. Smooths the 3D facial geometry via upper-envelope macro-dome projection + topological
   Laplacian smoothing (both before and after QEM simplification) so physical 3D wrinkle
   ridges/trenches are completely smoothed into a clean, plump stylized contour.
3. Smooths the facial skin in the 2K `baseColor` texture via 3D upper-envelope lifting +
   barycentric UV triangle splatting with 2.5px UV gutter dilation, and omits the normal map
   so lighting hits a 100% smooth facial surface.
4. Simplifies with `MeshoptSimplifier.simplifyWithAttributes` using continuous 3D coordinates
   and smooth head-detail attributes (preserving UVs and prioritizing facial density with zero
   coordinate seams), aligns ONLY the T-pose arm vertices (`y < y_top` and `y > y_bot`) to the
   24-bone Mixamo bind pose (leaving the wide silver hair and head 100% untouched!), and transfers
   skin weights with `Head` (joint 5) 100% rigid across the entire head & silver hair above the neck seam.

Can be invoked by `build.mjs --raw ../meshy/raw-bigface --tripo <tris>` with `<tmpdir> <tris> [tex_sz]`,
or run standalone to build both `grandma-mali-tripo-smooth.glb` (42k) and `grandma-mali-tripo-6k.glb` (6k).
"""
from __future__ import annotations

import io
import json
import os
import struct
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import sparse
from scipy.ndimage import distance_transform_edt, gaussian_filter, percentile_filter
from scipy.spatial import cKDTree

HERE = Path(__file__).resolve().parent
ASSET_DIR = HERE.parent
REPO_ROOT = ASSET_DIR.parent.parent.parent.parent
RAW_BIGFACE_DIR = ASSET_DIR / "meshy" / "raw-bigface"
TRIPO_RAW_GLB = ASSET_DIR / "tripo" / "raw" / "grandma-tripo-raw.glb"
OUT_TRIPO_SMOOTH = ASSET_DIR.parent.parent / "public" / "models" / "grandma-mali-tripo-smooth.glb"
OUT_TRIPO_6K = ASSET_DIR.parent.parent / "public" / "models" / "grandma-mali-tripo-6k.glb"
CACHE_DIR = Path(tempfile.gettempdir()) / "grandma-tripo-smooth-cache-v2"


def _sstep(x: np.ndarray, a: float | np.ndarray, b: float | np.ndarray) -> np.ndarray:
    t = np.clip((x - a) / (b - a + 1e-12), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def _read_glb(glb_path: Path) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, Image.Image]:
    raw = glb_path.read_bytes()
    jlen, _ = struct.unpack_from("<II", raw, 12)
    gltf = json.loads(raw[20 : 20 + jlen].decode("utf-8"))
    bstart = 20 + jlen
    blen, _ = struct.unpack_from("<II", raw, bstart)
    bin_buf = raw[bstart + 8 : bstart + 8 + blen]

    def read_acc(acc_idx: int) -> np.ndarray:
        acc = gltf["accessors"][acc_idx]
        bv = gltf["bufferViews"][acc["bufferView"]]
        off = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
        cnt = acc["count"]
        ctype = {5121: np.uint8, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}[acc["componentType"]]
        ncomp = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[acc["type"]]
        return np.frombuffer(bin_buf, dtype=ctype, count=cnt * ncomp, offset=off).reshape(cnt, ncomp).copy()

    prim = gltf["meshes"][0]["primitives"][0]
    pos = read_acc(prim["attributes"]["POSITION"])
    nrm = read_acc(prim["attributes"]["NORMAL"])
    uv = read_acc(prim["attributes"]["TEXCOORD_0"])
    ind = read_acc(prim["indices"]).reshape(-1, 3)

    mat = gltf["materials"][prim.get("material", 0)]
    tex_idx = mat["pbrMetallicRoughness"]["baseColorTexture"]["index"]
    img_idx = gltf["textures"][tex_idx]["source"]
    img_bv = gltf["bufferViews"][gltf["images"][img_idx]["bufferView"]]
    img_off = img_bv.get("byteOffset", 0)
    img_bytes = bin_buf[img_off : img_off + img_bv["byteLength"]]
    base_im = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    return pos, nrm, uv, ind, base_im


def _compute_smooth_normals(pos: np.ndarray, faces: np.ndarray) -> np.ndarray:
    pos_r = np.round(pos * 100000.0).astype(np.int64)
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


def _compute_skin_weights(
    pts: np.ndarray, nrm: np.ndarray, v_rgb: np.ndarray
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    x, y, z = pts[:, 0], pts[:, 1], pts[:, 2]
    ax = np.abs(x)
    warm = v_rgb[:, 0] - v_rgb[:, 2]

    # Outer face + neck envelope (y from neck 1.155 up to forehead hairline 1.455)
    w_y = _sstep(y, 1.155, 1.175) * (1.0 - _sstep(y, 1.442, 1.458))
    max_x = np.where(y < 1.22, 0.055 + (y - 1.16) * 0.45, np.where(y > 1.38, 0.084 - (y - 1.38) * 0.22, 0.086))
    w_x = 1.0 - _sstep(ax, max_x - 0.012, max_x)
    min_z = np.where(y < 1.225, 0.042, 0.065)
    w_z = _sstep(z, min_z, min_z + 0.020) * _sstep(nrm[:, 2], 0.10, 0.30)

    # Protect silver hair at hairline/temples (where warm < 25), while allowing dark wrinkle lines (warm >= 22) inside the face
    hair_zone = (y > 1.415) | (ax > 0.070) | (y < 1.21)
    w_color = np.where(hair_zone, _sstep(warm, 32.0, 58.0), _sstep(warm, 16.0, 32.0))

    # Protected features (measured from exact 3D landmark profiles):
    # 1. Eyeballs, irises, eyelids & eyelashes: centered at (|x|=0.0450, y=1.3585), rx=0.0195, ry=0.0140
    #    This leaves under-eye bags (y=1.310..1.343) and crow's feet (|x|=0.065..0.082) 100% open for smoothing!
    d_eye = np.sqrt(((ax - 0.0450) / 0.0195) ** 2 + ((y - 1.3585) / 0.0140) ** 2)
    prot_eye = 1.0 - _sstep(d_eye, 0.80, 1.06)

    # 2. Eyebrows: centered at y=1.398 across |x|=0.018..0.063
    #    Protect 100% in texture so grey eyebrows never get chipped, and gently in 3D geometry.
    y_brow = 1.3985 - 0.16 * ((ax - 0.038) ** 2)
    d_brow = np.sqrt(((ax - 0.041) / 0.025) ** 2 + ((y - y_brow) / 0.0095) ** 2)
    brow_box = (y > 1.385) & (y < 1.410) & (ax > 0.016) & (ax < 0.066)
    prot_brow_tex = np.maximum(
        1.0 - _sstep(d_brow, 0.78, 1.12),
        np.where(brow_box, 1.0 - _sstep(warm, 62.0, 84.0), 0.0),
    )
    prot_brow_geom = 0.55 * (1.0 - _sstep(d_brow, 0.75, 1.05))

    # 3. Nose tip, nostrils & bridge (tight rx=0.0235 so nasolabial groove at |x|>=0.026 is 100% smoothed)
    d_nose_tip = np.sqrt((ax / 0.0235) ** 2 + ((y - 1.311) / 0.0205) ** 2)
    prot_nose_tip = 1.0 - _sstep(d_nose_tip, 0.76, 1.04)
    prot_nose_bridge = (1.0 - _sstep(ax, 0.013, 0.021)) * _sstep(y, 1.310, 1.322) * (1.0 - _sstep(y, 1.368, 1.380))
    prot_nose = np.maximum(prot_nose_tip, prot_nose_bridge)

    # 4. Mouth & smile line: y_lip = 1.2733 + 6.5 * x^2, |x| <= 0.033 (leaving outer nasolabial creases open)
    y_lip = 1.2733 + 6.5 * (x ** 2)
    d_mouth = np.sqrt((ax / 0.0325) ** 2 + ((y - y_lip) / 0.0120) ** 2)
    prot_mouth = 1.0 - _sstep(d_mouth, 0.74, 1.04)

    prot_geom = np.maximum(np.maximum(prot_eye, prot_brow_geom), np.maximum(prot_nose, prot_mouth))
    prot_tex = np.maximum(np.maximum(prot_eye, prot_brow_tex), np.maximum(prot_nose, prot_mouth))

    skin_w_geom = np.clip(w_y * w_x * w_z * w_color * (1.0 - prot_geom), 0.0, 1.0).astype(np.float32)
    skin_w_tex = np.clip(w_y * w_x * w_z * w_color * (1.0 - prot_tex), 0.0, 1.0).astype(np.float32)
    return skin_w_geom, skin_w_tex, prot_nose.astype(np.float32), prot_eye.astype(np.float32)


def _prepare_smoothed_highpoly(tex_sz: int = 2048) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, bytes]:
    cache_tag = CACHE_DIR / f"done_{tex_sz}.txt"
    if cache_tag.exists():
        pts_smooth = np.fromfile(CACHE_DIR / "pts_smooth.bin", dtype=np.float32).reshape(-1, 3)
        uv_raw = np.fromfile(CACHE_DIR / "uv_raw.bin", dtype=np.float32).reshape(-1, 2)
        ind_raw = np.fromfile(CACHE_DIR / "ind_raw.bin", dtype=np.uint32).reshape(-1, 3)
        skin_w = np.fromfile(CACHE_DIR / "skin_w.bin", dtype=np.float32)
        tex_jpg = (CACHE_DIR / f"out_tex_{tex_sz}.jpg").read_bytes()
        return pts_smooth, uv_raw, ind_raw, skin_w, tex_jpg

    t0 = time.time()
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    pos_raw, nrm_raw, uv_raw, ind_raw, base_im = _read_glb(TRIPO_RAW_GLB)

    scale = 1.55 / float(pos_raw[:, 1].max() - pos_raw[:, 1].min())
    center_offset = np.array(
        [
            (pos_raw[:, 0].max() + pos_raw[:, 0].min()) / 2.0,
            pos_raw[:, 1].min(),
            (pos_raw[:, 2].max() + pos_raw[:, 2].min()) / 2.0,
        ],
        dtype=np.float32,
    )
    pts = (pos_raw - center_offset) * scale

    tex_im = base_im.resize((tex_sz, tex_sz), Image.Resampling.LANCZOS)
    tex_arr = np.asarray(tex_im, dtype=np.float32)
    H_t, W_t, _ = tex_arr.shape
    upx = np.clip((uv_raw[:, 0] % 1.0) * (W_t - 1), 0, W_t - 1).astype(np.int32)
    vpx = np.clip((uv_raw[:, 1] % 1.0) * (H_t - 1), 0, H_t - 1).astype(np.int32)
    v_rgb = tex_arr[vpx, upx]
    warm = v_rgb[:, 0] - v_rgb[:, 2]

    skin_w_geom, skin_w_tex, prot_nose, prot_eye = _compute_skin_weights(pts, nrm_raw, v_rgb)

    # 1. 3D Macro-Surface Dome Projection
    GX, GY = 190, 320
    x_min, x_max = -0.095, 0.095
    y_min, y_max = 1.145, 1.465

    front_m = (
        (pts[:, 1] > y_min)
        & (pts[:, 1] < y_max)
        & (np.abs(pts[:, 0]) < x_max)
        & (pts[:, 2] > 0.035)
        & (nrm_raw[:, 2] > 0.08)
    )
    dome_m = front_m & (prot_nose < 0.25) & (prot_eye < 0.4) & (warm > 35.0)

    ix = np.clip(((pts[dome_m, 0] - x_min) / (x_max - x_min) * (GX - 1)).astype(np.int32), 0, GX - 1)
    iy = np.clip(((pts[dome_m, 1] - y_min) / (y_max - y_min) * (GY - 1)).astype(np.int32), 0, GY - 1)
    z_grid = np.full((GY, GX), -1e9, dtype=np.float32)
    np.maximum.at(z_grid, (iy, ix), pts[dome_m, 2])
    valid_z = z_grid > -1e8
    _, (ny_idx, nx_idx) = distance_transform_edt(~valid_z, return_indices=True)
    z_filled = z_grid[ny_idx, nx_idx]

    z_upper = percentile_filter(z_filled, percentile=84, size=(15, 15))
    z_macro = gaussian_filter(0.78 * z_upper + 0.22 * z_filled, sigma=(8.0, 7.0))

    vx_f = np.clip((pts[:, 0] - x_min) / (x_max - x_min) * (GX - 1), 0, GX - 1)
    vy_f = np.clip((pts[:, 1] - y_min) / (y_max - y_min) * (GY - 1), 0, GY - 1)
    vx0 = np.floor(vx_f).astype(np.int32)
    vy0 = np.floor(vy_f).astype(np.int32)
    vx1 = np.minimum(vx0 + 1, GX - 1)
    vy1 = np.minimum(vy0 + 1, GY - 1)
    wx = vx_f - vx0
    wy = vy_f - vy0
    z_target = (
        z_macro[vy0, vx0] * (1 - wx) * (1 - wy)
        + z_macro[vy0, vx1] * wx * (1 - wy)
        + z_macro[vy1, vx0] * (1 - wx) * wy
        + z_macro[vy1, vx1] * wx * wy
    )

    pts_smooth = pts.copy()
    dz = z_target - pts[:, 2]
    dz_clamped = np.clip(dz, -0.0070, 0.0120)
    pts_smooth[:, 2] += skin_w_geom * 0.95 * dz_clamped
    pts_smooth[:, 0] += skin_w_geom * 0.42 * dz_clamped * nrm_raw[:, 0]
    pts_smooth[:, 1] += skin_w_geom * 0.32 * dz_clamped * nrm_raw[:, 1]

    # 2. Welded Topological Laplacian Smoothing on the Head
    pos_q = np.round(pos_raw * 100000.0).astype(np.int64)
    _, u_inv = np.unique(pos_q, axis=0, return_inverse=True)
    V_w = int(u_inv.max()) + 1

    head_tri_m = pts[ind_raw[:, 0], 1] > 1.14
    h_tris = u_inv[ind_raw[head_tri_m]]
    rows = np.concatenate([h_tris[:, 0], h_tris[:, 1], h_tris[:, 2], h_tris[:, 1], h_tris[:, 2], h_tris[:, 0]])
    cols = np.concatenate([h_tris[:, 1], h_tris[:, 2], h_tris[:, 0], h_tris[:, 0], h_tris[:, 1], h_tris[:, 2]])
    adj = sparse.csr_matrix((np.ones(len(rows), dtype=np.float32), (rows, cols)), shape=(V_w, V_w))
    deg = np.array(adj.sum(axis=1)).ravel()
    deg_inv = np.where(deg > 0, 1.0 / np.maximum(deg, 1.0), 0.0)

    w_pts = np.zeros((V_w, 3), dtype=np.float32)
    w_skin = np.zeros(V_w, dtype=np.float32)
    w_pts[u_inv] = pts_smooth
    w_skin[u_inv] = skin_w_geom

    for _ in range(16):
        avg = (adj @ w_pts) * deg_inv[:, None]
        w_pts = w_pts + (0.60 * w_skin)[:, None] * (avg - w_pts)

    pts_smooth = w_pts[u_inv].astype(np.float32)

    # 3. 3D-to-UV Texture Wrinkle Removal
    TX, TY = 380, 640
    # Sample clean skin envelope from warm skin vertices (excluding dark wrinkle trenches warm < 75)
    skin_src_m = front_m & (skin_w_tex > 0.25) & (warm > 72.0)
    tx_i = np.clip(((pts[skin_src_m, 0] - x_min) / (x_max - x_min) * (TX - 1)).astype(np.int32), 0, TX - 1)
    ty_i = np.clip(((pts[skin_src_m, 1] - y_min) / (y_max - y_min) * (TY - 1)).astype(np.int32), 0, TY - 1)

    c_grid = np.zeros((TY, TX, 3), dtype=np.float32)
    c_cnt = np.zeros((TY, TX), dtype=np.float32)
    np.add.at(c_grid, (ty_i, tx_i), v_rgb[skin_src_m])
    np.add.at(c_cnt, (ty_i, tx_i), 1.0)
    valid_c = c_cnt > 0
    c_grid[valid_c] /= c_cnt[valid_c, None]
    _, (c_ny, c_nx) = distance_transform_edt(~valid_c, return_indices=True)
    c_filled = c_grid[c_ny, c_nx]

    c_env = np.zeros_like(c_filled)
    for ch in range(3):
        p85 = percentile_filter(c_filled[:, :, ch], percentile=85, size=(21, 21))
        c_env[:, :, ch] = gaussian_filter(p85, sigma=(9.0, 9.0))

    vtx_f = np.clip((pts[:, 0] - x_min) / (x_max - x_min) * (TX - 1), 0, TX - 1)
    vty_f = np.clip((pts[:, 1] - y_min) / (y_max - y_min) * (TY - 1), 0, TY - 1)
    vtx0 = np.floor(vtx_f).astype(np.int32)
    vty0 = np.floor(vty_f).astype(np.int32)
    vtx1 = np.minimum(vtx0 + 1, TX - 1)
    vty1 = np.minimum(vty0 + 1, TY - 1)
    twx = (vtx_f - vtx0)[:, None]
    twy = (vty_f - vty0)[:, None]
    rgb_target = (
        c_env[vty0, vtx0] * (1 - twx) * (1 - twy)
        + c_env[vty0, vtx1] * twx * (1 - twy)
        + c_env[vty1, vtx0] * (1 - twx) * twy
        + c_env[vty1, vtx1] * twx * twy
    )

    tri_skin = (
        (skin_w_tex[ind_raw[:, 0]] > 0.01)
        | (skin_w_tex[ind_raw[:, 1]] > 0.01)
        | (skin_w_tex[ind_raw[:, 2]] > 0.01)
    )
    f_tris = ind_raw[tri_skin]

    barys = []
    for i in range(5):
        for j in range(5 - i):
            b0 = i / 4.0
            b1 = j / 4.0
            b2 = 1.0 - b0 - b1
            barys.append((b0, b1, b2))

    uv0, uv1, uv2 = uv_raw[f_tris[:, 0]], uv_raw[f_tris[:, 1]], uv_raw[f_tris[:, 2]]
    c0, c1, c2 = rgb_target[f_tris[:, 0]], rgb_target[f_tris[:, 1]], rgb_target[f_tris[:, 2]]
    w0, w1, w2 = skin_w_tex[f_tris[:, 0]], skin_w_tex[f_tris[:, 1]], skin_w_tex[f_tris[:, 2]]

    uv_c_acc = np.zeros((H_t, W_t, 3), dtype=np.float32)
    uv_w_acc = np.zeros((H_t, W_t), dtype=np.float32)
    uv_cnt = np.zeros((H_t, W_t), dtype=np.float32)

    for b0, b1, b2 in barys:
        uv_s = b0 * uv0 + b1 * uv1 + b2 * uv2
        c_s = b0 * c0 + b1 * c1 + b2 * c2
        w_s = b0 * w0 + b1 * w1 + b2 * w2
        us = np.clip((uv_s[:, 0] % 1.0) * (W_t - 1), 0, W_t - 1).astype(np.int32)
        vs = np.clip((uv_s[:, 1] % 1.0) * (H_t - 1), 0, H_t - 1).astype(np.int32)
        np.add.at(uv_c_acc, (vs, us), c_s)
        np.add.at(uv_w_acc, (vs, us), w_s)
        np.add.at(uv_cnt, (vs, us), 1.0)

    hit = uv_cnt > 0
    uv_c_acc[hit] /= uv_cnt[hit, None]
    uv_w_acc[hit] /= uv_cnt[hit]

    dist_uv, (ny_uv, nx_uv) = distance_transform_edt(~hit, return_indices=True)
    near_hit = dist_uv <= 2.5
    uv_c_filled = np.where(hit[:, :, None], uv_c_acc, uv_c_acc[ny_uv, nx_uv])
    uv_w_filled = np.where(hit, uv_w_acc, uv_w_acc[ny_uv, nx_uv] * np.clip(1.0 - (dist_uv - 1.0) / 2.0, 0.0, 1.0))
    uv_w_filled = np.where(near_hit, uv_w_filled, 0.0)

    diff_dark_uv = np.clip((uv_c_filled - tex_arr) / 30.0, 0.0, 1.0)
    alpha_uv = uv_w_filled[:, :, None] * (0.88 + 0.10 * diff_dark_uv)
    tex_clean = np.clip(tex_arr * (1.0 - alpha_uv) + uv_c_filled * alpha_uv, 0, 255).astype(np.uint8)

    buf = io.BytesIO()
    Image.fromarray(tex_clean, mode="RGB").save(buf, format="JPEG", quality=93, optimize=True)
    tex_jpg = buf.getvalue()

    pts_smooth.tofile(CACHE_DIR / "pts_smooth.bin")
    uv_raw.astype(np.float32).tofile(CACHE_DIR / "uv_raw.bin")
    ind_raw.astype(np.uint32).tofile(CACHE_DIR / "ind_raw.bin")
    skin_w_geom.astype(np.float32).tofile(CACHE_DIR / "skin_w.bin")
    (CACHE_DIR / f"out_tex_{tex_sz}.jpg").write_bytes(tex_jpg)
    cache_tag.write_text("ok")
    print(f"build_tripo.py: smoothed 1.91M-tri face & {tex_sz}px texture in {time.time() - t0:.2f}s")
    return pts_smooth, uv_raw.astype(np.float32), ind_raw.astype(np.uint32), skin_w_geom, tex_jpg


def _simplify_with_meshopt(
    pts_smooth: np.ndarray,
    uv_raw: np.ndarray,
    ind_raw: np.ndarray,
    skin_w: np.ndarray,
    target_tris: int,
    work_dir: Path,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    # Keep 3D positions 100% continuous (no step-function jumps!), and guide facial density
    # via smooth auxiliary attributes centered on the head.
    w_head = _sstep(pts_smooth[:, 1], 1.12, 1.18) * (0.6 + 0.9 * _sstep(pts_smooth[:, 2], 0.01, 0.05))
    head_center = np.array([0.0, 1.30, 0.05], dtype=np.float32)
    attrs = np.column_stack([uv_raw, (pts_smooth - head_center) * w_head[:, None]]).astype(np.float32)

    pts_smooth.astype(np.float32).tofile(work_dir / "in_pos.bin")
    attrs.tofile(work_dir / "in_attr.bin")
    ind_raw.tofile(work_dir / "in_idx.bin")

    js_code = f"""
import fs from 'fs';
import {{ MeshoptSimplifier }} from 'meshoptimizer';
await MeshoptSimplifier.ready;
const rd = (f, T) => {{
  const b = fs.readFileSync(f);
  return new T(b.buffer, b.byteOffset, b.byteLength / T.BYTES_PER_ELEMENT);
}};
const pos = rd({json.dumps(str(work_dir / "in_pos.bin"))}, Float32Array);
const attr = rd({json.dumps(str(work_dir / "in_attr.bin"))}, Float32Array);
const idx = rd({json.dumps(str(work_dir / "in_idx.bin"))}, Uint32Array);
const [out, err] = MeshoptSimplifier.simplifyWithAttributes(
  idx, pos, 3, attr, 5, [6.0, 6.0, 2.2, 2.2, 2.2], null, {int(target_tris) * 3}, 0.5, ['Permissive', 'Regularize']
);
fs.writeFileSync({json.dumps(str(work_dir / "sim_idx.bin"))}, Buffer.from(out.buffer, out.byteOffset, out.byteLength));
console.log('meshopt simplified:', idx.length / 3, '->', out.length / 3, 'tris, err=', err.toFixed(5));
"""
    subprocess.run(["node", "--input-type=module", "-e", js_code], cwd=str(HERE), check=True)
    sim_idx = np.fromfile(work_dir / "sim_idx.bin", dtype=np.uint32).reshape(-1, 3)

    # Compact to referenced vertices
    used_v, new_idx = np.unique(sim_idx, return_inverse=True)
    sub_pts = pts_smooth[used_v].copy()
    sub_uv = uv_raw[used_v].copy()
    sub_skin = skin_w[used_v].copy()
    sub_faces = new_idx.reshape(-1, 3).astype(np.uint32)

    # Post-simplification topological Laplacian polish on facial skin vertices
    pos_q = np.round(sub_pts * 100000.0).astype(np.int64)
    _, u_inv = np.unique(pos_q, axis=0, return_inverse=True)
    V_w = int(u_inv.max()) + 1
    w_tris = u_inv[sub_faces]
    rows = np.concatenate([w_tris[:, 0], w_tris[:, 1], w_tris[:, 2], w_tris[:, 1], w_tris[:, 2], w_tris[:, 0]])
    cols = np.concatenate([w_tris[:, 1], w_tris[:, 2], w_tris[:, 0], w_tris[:, 0], w_tris[:, 1], w_tris[:, 2]])
    adj = sparse.csr_matrix((np.ones(len(rows), dtype=np.float32), (rows, cols)), shape=(V_w, V_w))
    deg = np.array(adj.sum(axis=1)).ravel()
    deg_inv = np.where(deg > 0, 1.0 / np.maximum(deg, 1.0), 0.0)

    w_pts = np.zeros((V_w, 3), dtype=np.float32)
    w_skin = np.zeros(V_w, dtype=np.float32)
    w_pts[u_inv] = sub_pts
    w_skin[u_inv] = sub_skin

    for _ in range(8):
        avg = (adj @ w_pts) * deg_inv[:, None]
        w_pts = w_pts + (0.48 * w_skin)[:, None] * (avg - w_pts)

    sub_pts = w_pts[u_inv].astype(np.float32)
    return sub_pts, sub_uv, sub_faces, sub_skin


def generate_into_dir(work_dir: Path, target_tris: int = 42000, tex_sz: int = 2048) -> None:
    ref_pos = np.fromfile(work_dir / "hi_pos.bin", dtype=np.float32).reshape(-1, 3)
    ref_joints = np.fromfile(work_dir / "hi_j.bin", dtype=np.uint8).reshape(-1, 4)
    ref_weights = np.fromfile(work_dir / "hi_w.bin", dtype=np.float32).reshape(-1, 4)

    pts_smooth, uv_raw, ind_raw, skin_w, tex_jpg = _prepare_smoothed_highpoly(tex_sz)
    sub_pts, sub_uv, sub_faces, _ = _simplify_with_meshopt(
        pts_smooth, uv_raw, ind_raw, skin_w, target_tris, work_dir
    )

    # Align ONLY horizontal T-pose arm vertices (`y < y_top` and `y > y_bot`) to the 24-bone Mixamo bind pose (`ref_pos`).
    # Crucially, `y_top = 1.222 - 0.14 * |x|` passes cleanly through the 4.5-12cm vertical gap between the shoulder tops
    # (`y <= 1.208`) and the wide silver hair (`y >= 1.254`), so the hair has ZERO arm rotation weight (`wL = wR = 0.0`)!
    pts_f64 = sub_pts.astype(np.float64)
    ax = np.abs(pts_f64[:, 0])
    y = pts_f64[:, 1]
    y_top = 1.222 - 0.14 * ax
    y_bot = 0.990 - 0.55 * (ax - 0.14)
    w_arm_region = (1.0 - _sstep(y, y_top - 0.008, y_top + 0.004)) * _sstep(y, y_bot - 0.015, y_bot + 0.015)

    wL = _sstep(pts_f64[:, 0], 0.125, 0.185) * w_arm_region
    wR = _sstep(-pts_f64[:, 0], 0.125, 0.185) * w_arm_region

    piv_L = np.array([0.1471, 1.125, -0.0256], dtype=np.float64)
    piv_R = np.array([-0.1471, 1.125, -0.0261], dtype=np.float64)
    th = np.deg2rad(-41.5)
    c, s = np.cos(th), np.sin(th)
    R_L = np.array([[c, -s, 0.0], [s, c, 0.0], [0.0, 0.0, 1.0]], dtype=np.float64)
    R_R = np.array([[c, s, 0.0], [-s, c, 0.0], [0.0, 0.0, 1.0]], dtype=np.float64)
    arm_scale = 0.92

    rel_L = pts_f64 - piv_L
    sL_x = 1.0 + (arm_scale - 1.0) * np.clip((pts_f64[:, 0] - 0.1471) / 0.12, 0.0, 1.0)
    rot_L = np.column_stack([rel_L[:, 0] * sL_x, rel_L[:, 1], rel_L[:, 2]]) @ R_L.T + piv_L

    rel_R = pts_f64 - piv_R
    sR_x = 1.0 + (arm_scale - 1.0) * np.clip((-pts_f64[:, 0] - 0.1471) / 0.12, 0.0, 1.0)
    rot_R = np.column_stack([rel_R[:, 0] * sR_x, rel_R[:, 1], rel_R[:, 2]]) @ R_R.T + piv_R

    aligned_pos = (pts_f64 * (1.0 - wL[:, None] - wR[:, None]) + rot_L * wL[:, None] + rot_R * wR[:, None]).astype(
        np.float32
    )
    aligned_norm = _compute_smooth_normals(aligned_pos, sub_faces)

    # Transfer 24-bone skin weights from body/arm vertices of `ref_pos` via 8-NN inverse-distance squared interpolation
    ref_ax = np.abs(ref_pos[:, 0])
    ref_y_top = 1.222 - 0.14 * ref_ax
    ref_body_idx = np.where(ref_pos[:, 1] < ref_y_top)[0]
    tree_body = cKDTree(ref_pos[ref_body_idx])
    dists, local_idxs = tree_body.query(aligned_pos, k=8)
    idxs = ref_body_idx[local_idxs]
    inv_d = 1.0 / np.maximum(dists, 1e-6) ** 2
    inv_d /= inv_d.sum(axis=1, keepdims=True)
    n_verts = len(aligned_pos)
    n_joints = int(ref_joints.max()) + 1
    accum = np.zeros((n_verts, n_joints), dtype=np.float64)
    for ki in range(8):
        nb_j = ref_joints[idxs[:, ki]]
        nb_w = ref_weights[idxs[:, ki]]
        w_k = inv_d[:, ki : ki + 1] * nb_w
        for slot in range(4):
            np.add.at(accum, (np.arange(n_verts), nb_j[:, slot]), w_k[:, slot])

    # Prevent any Head/head_end/headfront weights (joints 5, 6, 7) from leaking onto body/arm vertices below the neck
    body_no_head = (y < y_top - 0.025) | (ax > 0.075)
    accum[body_no_head, 5] = 0.0
    accum[body_no_head, 6] = 0.0
    accum[body_no_head, 7] = 0.0
    row_s = accum.sum(axis=1, keepdims=True)
    accum = np.where(row_s > 1e-8, accum / np.maximum(row_s, 1e-8), accum)

    # Enforce 100% rigid Head bone (joint 5) across the entire head & wide silver hair above the neck seam (`y >= y_top`)!
    head_rigid_w = _sstep(y, y_top - 0.018, y_top + 0.002)
    head_target = np.zeros_like(accum)
    head_target[:, 5] = 1.0
    accum = accum * (1.0 - head_rigid_w[:, None]) + head_target * head_rigid_w[:, None]

    top4_j = np.argsort(-accum, axis=1)[:, :4].astype(np.uint8)
    top4_w = np.take_along_axis(accum, top4_j, axis=1).astype(np.float32)
    w_sum = top4_w.sum(axis=1, keepdims=True)
    top4_w = np.where(
        w_sum > 1e-8, top4_w / np.maximum(w_sum, 1e-8), np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
    )

    aligned_pos.astype(np.float32).tofile(work_dir / "out_pos.bin")
    aligned_norm.astype(np.float32).tofile(work_dir / "out_nrm.bin")
    sub_uv.astype(np.float32).tofile(work_dir / "out_uv.bin")
    top4_j.astype(np.uint8).tofile(work_dir / "out_j.bin")
    top4_w.astype(np.float32).tofile(work_dir / "out_w.bin")
    sub_faces.reshape(-1).astype(np.uint32).tofile(work_dir / "out_idx.bin")
    (work_dir / "out_tex.jpg").write_bytes(tex_jpg)
    print(f"build_tripo.py: verts={len(aligned_pos)}, tris={len(sub_faces)}, tex={tex_sz}px")


if __name__ == "__main__":
    if len(sys.argv) > 1 and Path(sys.argv[1]).is_dir():
        tris = int(sys.argv[2]) if len(sys.argv) > 2 else 42000
        sz = int(sys.argv[3]) if len(sys.argv) > 3 else 2048
        generate_into_dir(Path(sys.argv[1]), tris, sz)
    else:
        for tris, tsz, out_path in [(42000, "2048", OUT_TRIPO_SMOOTH), (6000, "1536", OUT_TRIPO_6K)]:
            subprocess.run(
                [
                    "node",
                    str(HERE / "build.mjs"),
                    "--raw",
                    str(RAW_BIGFACE_DIR),
                    "--tripo",
                    str(tris),
                    "--tex",
                    tsz,
                    str(out_path),
                ],
                check=True,
                env={**os.environ, "NODE_PATH": str(Path("/workspace/meshy/tools/node_modules"))},
            )
