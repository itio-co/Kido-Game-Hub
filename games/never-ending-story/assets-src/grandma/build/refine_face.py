"""Refine ONLY the facial skin region of Grandma Mali (geometry + baseColor + normalMap + metallicRoughness)
so her face looks softer, warmer, and closer in age/expression to the 2D reference portrait
(/workspace/meshy/family/grandma-mali-2inch-photo.jpg & grandma-mali-tpose.jpg).

Can be imported by build.mjs / remesh.py OR executed directly:
  python refine_face.py <workdir> [tex_size]
  python refine_face.py --build-all
"""
import io
import subprocess
import sys
from pathlib import Path
import numpy as np
import pygltflib
from PIL import Image
from scipy import sparse
from scipy.ndimage import distance_transform_edt, gaussian_filter

HERE = Path(__file__).resolve().parent
RAW_BIGFACE = HERE.parent / "meshy" / "raw-bigface"
REF_2INCH = Path("/workspace/meshy/family/grandma-mali-2inch-photo.jpg")
REF_SHOWCASE_2INCH = HERE.parent.parent.parent / "public" / "showcase" / "characters" / "grandma-mali-2inch-photo.jpg"


def compute_normals(pts: np.ndarray, faces: np.ndarray) -> np.ndarray:
    v0, v1, v2 = pts[faces[:, 0]], pts[faces[:, 1]], pts[faces[:, 2]]
    fn = np.cross(v1 - v0, v2 - v0)
    vn = np.zeros_like(pts, dtype=np.float64)
    for k in range(3):
        np.add.at(vn, faces[:, k], fn)
    vn /= np.maximum(np.linalg.norm(vn, axis=1, keepdims=True), 1e-12)
    return vn


def build_adjacency(n_u: int, u_faces: np.ndarray):
    e0 = np.concatenate([u_faces[:, 0], u_faces[:, 1], u_faces[:, 2]])
    e1 = np.concatenate([u_faces[:, 1], u_faces[:, 2], u_faces[:, 0]])
    rows = np.concatenate([e0, e1])
    cols = np.concatenate([e1, e0])
    adj = sparse.coo_matrix((np.ones(len(rows), dtype=np.float64), (rows, cols)), shape=(n_u, n_u)).tocsr()
    adj.data[:] = 1.0
    deg = np.array(adj.sum(axis=1)).flatten()
    return sparse.diags(1.0 / np.maximum(deg, 1.0)) @ adj


def facial_spatial_weights(x: np.ndarray, y: np.ndarray, z: np.ndarray, nz: np.ndarray):
    """Return (w_geom, w_tex_skin, w_proj) in [0, 1] for 3D points (x, y, z) with normal z-component nz."""
    w_y = np.clip((y - 1.185) / 0.025, 0.0, 1.0) * np.clip((1.455 - y) / 0.025, 0.0, 1.0)
    w_z = np.clip((z - 0.040) / 0.035, 0.0, 1.0) * np.clip((nz - 0.12) / 0.25, 0.0, 1.0)
    w_x = np.clip((0.096 - np.abs(x)) / 0.020, 0.0, 1.0)
    w_box = w_y * w_z * w_x

    # Landmark protections so nose tip/bridge, eyes/eyelashes, eyebrows, and lip vermilion stay crisp
    d_nose = (x / 0.021) ** 2 + ((y - 1.314) / 0.021) ** 2 + ((z - 0.146) / 0.024) ** 2
    prot_nose_geom = 1.0 - 0.90 * np.exp(-d_nose)
    d_nostril = (x / 0.021) ** 2 + ((y - 1.306) / 0.010) ** 2
    prot_nostril_tex = 1.0 - 0.95 * np.exp(-d_nostril * 1.4)

    d_eye = ((np.abs(x) - 0.040) / 0.022) ** 2 + ((y - 1.344) / 0.014) ** 2
    prot_eye = 1.0 - 0.96 * np.exp(-d_eye * 1.3)

    d_brow = ((np.abs(x) - 0.042) / 0.026) ** 2 + ((y - 1.370) / 0.013) ** 2
    prot_brow = 1.0 - 0.94 * np.exp(-d_brow * 1.4)

    d_lip = (x / 0.026) ** 2 + ((y - 1.271) / 0.009) ** 2
    prot_lip_geom = 1.0 - 0.85 * np.exp(-d_lip)
    d_lip_tex = (x / 0.035) ** 2 + ((y - 1.271) / 0.010) ** 2
    prot_lip_tex = 1.0 - 0.96 * np.exp(-d_lip_tex * 1.4)

    w_geom = w_box * prot_nose_geom * prot_eye * prot_lip_geom
    w_tex_skin = w_box * prot_nostril_tex * prot_eye * prot_brow * prot_lip_tex

    # Front-projection feather weight (only on direct front-facing surfaces, avoiding grazing nose sides / under-chin)
    w_proj = (
        np.clip((y - 1.205) / 0.025, 0.0, 1.0)
        * np.clip((1.445 - y) / 0.025, 0.0, 1.0)
        * np.clip((0.088 - np.abs(x)) / 0.020, 0.0, 1.0)
        * np.clip((z - 0.065) / 0.030, 0.0, 1.0)
        * (np.clip((nz - 0.38) / 0.35, 0.0, 1.0) ** 1.4)
    )
    return w_geom, w_tex_skin, w_proj


_REFERENCE_CACHE = None


def get_reference_fields():
    """Build and cache the macro 3D facial heightfield Z_macro(x, y), macro skin albedo RGB_macro(x, y),
    and color-matched airbrushed 2D reference portrait from the Ultra source."""
    global _REFERENCE_CACHE
    if _REFERENCE_CACHE is not None:
        return _REFERENCE_CACHE

    gltf = pygltflib.GLTF2().load(str(RAW_BIGFACE / "Character_output.glb"))
    blob = gltf.binary_blob()
    prim = gltf.meshes[0].primitives[0]

    def get_acc(idx, cols):
        acc = gltf.accessors[idx]
        dt = {5121: np.uint8, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}[acc.componentType]
        bv = gltf.bufferViews[acc.bufferView]
        off = (bv.byteOffset or 0) + (acc.byteOffset or 0)
        arr = np.frombuffer(blob, dtype=dt, count=acc.count * cols, offset=off)
        return arr.reshape(-1, cols) if cols > 1 else arr

    pos = get_acc(prim.attributes.POSITION, 3).astype(np.float64)
    uv = get_acc(prim.attributes.TEXCOORD_0, 2).astype(np.float64)
    idx = get_acc(prim.indices, 1).astype(np.int32).reshape(-1, 3)

    base_im = Image.open(RAW_BIGFACE / "ultra-pbr-base.jpg").convert("RGB")
    W_tex, H_tex = base_im.size
    base_np = np.array(base_im, dtype=np.float32)

    pos_r = np.round(pos, 6)
    _, u_first, u_inv = np.unique(pos_r, axis=0, return_index=True, return_inverse=True)
    u_pts = pos[u_first]
    u_faces = u_inv[idx]
    u_nrm = compute_normals(u_pts, u_faces)
    L_avg = build_adjacency(len(u_pts), u_faces)

    u_uv = uv[u_first]
    upx = np.clip((u_uv[:, 0] * (W_tex - 1)).astype(int), 0, W_tex - 1)
    vpx = np.clip((u_uv[:, 1] * (H_tex - 1)).astype(int), 0, H_tex - 1)
    u_rgb = base_np[vpx, upx].astype(np.float64)

    rgb_smooth = u_rgb.copy()
    for _ in range(10):
        rgb_smooth = L_avg @ rgb_smooth

    warm = rgb_smooth[:, 0] - rgb_smooth[:, 2]
    w_color = np.clip((warm - 18.0) / 14.0, 0.0, 1.0) * np.clip((rgb_smooth[:, 0] - 90.0) / 30.0, 0.0, 1.0)

    x, y, z = u_pts[:, 0], u_pts[:, 1], u_pts[:, 2]
    nz = u_nrm[:, 2]
    w_geom, w_tex_skin, _ = facial_spatial_weights(x, y, z, nz)
    w_geom_full = w_color * w_geom
    for _ in range(8):
        w_geom_full = L_avg @ w_geom_full

    # 2D (x, y) macro grid covering front of head: X in [-0.11, 0.11], Y in [1.17, 1.47]
    GX, GY = 240, 300
    X0, X1 = -0.11, 0.11
    Y0, Y1 = 1.17, 1.47
    front_m = (z > 0.03) & (nz > 0.05) & (x >= X0) & (x <= X1) & (y >= Y0) & (y <= Y1)
    gx = np.clip(((x[front_m] - X0) / (X1 - X0) * (GX - 1)).astype(int), 0, GX - 1)
    gy = np.clip(((y[front_m] - Y0) / (Y1 - Y0) * (GY - 1)).astype(int), 0, GY - 1)

    z_grid = np.zeros((GY, GX), dtype=np.float64)
    w_grid = np.zeros((GY, GX), dtype=np.float64)
    vw = 0.2 + 0.8 * w_geom_full[front_m]
    np.add.at(z_grid, (gy, gx), z[front_m] * vw)
    np.add.at(w_grid, (gy, gx), vw)
    z_macro_grid = gaussian_filter(z_grid, sigma=8.5) / np.maximum(gaussian_filter(w_grid, sigma=8.5), 1e-8)

    # Macro skin albedo grid (weighted toward bright/unshadowed warm peach skin so baked dark trenches disappear)
    raw_warm = u_rgb[front_m, 0] - u_rgb[front_m, 2]
    raw_luma = 0.299 * u_rgb[front_m, 0] + 0.587 * u_rgb[front_m, 1] + 0.114 * u_rgb[front_m, 2]
    w_skin_pure = (
        np.clip((raw_warm - 28.0) / 15.0, 0.0, 1.0)
        * np.clip((u_rgb[front_m, 0] - 130.0) / 35.0, 0.0, 1.0)
        * w_tex_skin[front_m]
    )
    # Weight brighter skin samples exponentially higher so dark wrinkle grooves don't pull down the local envelope!
    w_bright = w_skin_pure * np.exp(np.clip((raw_luma - 150.0) / 22.0, -3.0, 3.0))
    rgb_grid = np.zeros((GY, GX, 3), dtype=np.float64)
    wb_grid = np.zeros((GY, GX), dtype=np.float64)
    for c in range(3):
        np.add.at(rgb_grid[:, :, c], (gy, gx), u_rgb[front_m, c] * w_bright)
    np.add.at(wb_grid, (gy, gx), w_bright)

    rgb_env_local = np.zeros((GY, GX, 3), dtype=np.float64)
    rgb_env_broad = np.zeros((GY, GX, 3), dtype=np.float64)
    wb_local = np.maximum(gaussian_filter(wb_grid, sigma=7.5), 1e-8)
    wb_broad = np.maximum(gaussian_filter(wb_grid, sigma=22.0), 1e-8)
    for c in range(3):
        rgb_env_local[:, :, c] = gaussian_filter(rgb_grid[:, :, c], sigma=7.5) / wb_local
        rgb_env_broad[:, :, c] = gaussian_filter(rgb_grid[:, :, c], sigma=22.0) / wb_broad
    # Combine 55% local upper-skin envelope + 45% broad cheek/forehead envelope so hollow cheeks & eye bags brighten too
    rgb_macro_grid = 0.55 * rgb_env_local + 0.45 * rgb_env_broad
    # Gentle warm rosy-peach boost (+4 R, +2 G)
    rgb_macro_grid[:, :, 0] = np.clip(rgb_macro_grid[:, :, 0] + 4.0, 0.0, 245.0)
    rgb_macro_grid[:, :, 1] = np.clip(rgb_macro_grid[:, :, 1] + 2.0, 0.0, 230.0)

    # Also prepare airbrushed, albedo-matched 2D portrait (grandma-mali-2inch-photo.jpg)
    ref_path = REF_2INCH if REF_2INCH.exists() else REF_SHOWCASE_2INCH
    p2 = np.array(Image.open(ref_path).convert("RGB"), dtype=np.float32)
    H2, W2, _ = p2.shape
    yy, xx = np.mgrid[0:H2, 0:W2]
    x_2d = (xx - 298.9705) / 1395.0199
    y_2d = 1.55 - (yy - 75.0012) / 1395.0199
    r2, g2, b2 = p2[:, :, 0], p2[:, :, 1], p2[:, :, 2]
    w_s2 = np.clip((r2 - b2 - 30.0) / 15.0, 0.0, 1.0) * np.clip((r2 - 115.0) / 35.0, 0.0, 1.0)
    _, w_t2, _ = facial_spatial_weights(x_2d, y_2d, np.full_like(x_2d, 0.12), np.full_like(x_2d, 0.9))
    w_air = gaussian_filter(w_s2 * w_t2, sigma=2.5)
    sw2 = np.maximum(w_s2, 1e-4)
    p2_low = np.zeros_like(p2)
    for c in range(3):
        p2_low[:, :, c] = gaussian_filter(p2[:, :, c] * sw2, sigma=14.0) / gaussian_filter(sw2, sigma=14.0)
    diff2 = p2 - p2_low
    luma_d2 = 0.299 * diff2[:, :, 0] + 0.587 * diff2[:, :, 1] + 0.114 * diff2[:, :, 2]
    k_lift2 = np.where(luma_d2 < 0, 0.88, 0.50)[:, :, None] * w_air[:, :, None]
    p2_soft = p2 - k_lift2 * diff2
    # Match 2D portrait skin brightness to the 3D unlit PBR skin albedo so blending is seamless
    # Map skin mean [185, 125, 88] -> [224, 166, 130] on skin while keeping dark eye/brow pixels dark
    luma2 = (0.299 * p2_soft[:, :, 0] + 0.587 * p2_soft[:, :, 1] + 0.114 * p2_soft[:, :, 2]) / 255.0
    skin_boost = np.clip((luma2 - 0.22) / 0.35, 0.0, 1.0)[:, :, None]
    p2_matched = p2_soft + skin_boost * np.array([[[36.0, 38.0, 38.0]]], dtype=np.float32)
    p2_matched = np.clip(p2_matched, 0.0, 250.0)

    _REFERENCE_CACHE = (GX, GY, X0, X1, Y0, Y1, z_macro_grid, rgb_macro_grid, p2_matched)
    return _REFERENCE_CACHE


def smooth_face_geometry(u_pts0: np.ndarray, u_faces: np.ndarray, u_rgb: np.ndarray):
    """Smooth facial skin geometry on deduplicated 3D vertices u_pts0 and return (p_out, nrm_out, w_color)."""
    GX, GY, X0, X1, Y0, Y1, z_macro_grid, _, _ = get_reference_fields()
    u_nrm0 = compute_normals(u_pts0, u_faces)
    L_avg = build_adjacency(len(u_pts0), u_faces)

    # Adaptive hop count based on vertex count (more hops on 124k Ultra, fewer on 6k/1.5k remesh)
    n_hops_rgb = 10 if len(u_pts0) > 20000 else (3 if len(u_pts0) > 2000 else 1)
    rgb_smooth = u_rgb.copy().astype(np.float64)
    for _ in range(n_hops_rgb):
        rgb_smooth = L_avg @ rgb_smooth

    warm = rgb_smooth[:, 0] - rgb_smooth[:, 2]
    w_color = np.clip((warm - 16.0) / 14.0, 0.0, 1.0) * np.clip((rgb_smooth[:, 0] - 88.0) / 30.0, 0.0, 1.0)

    x, y, z = u_pts0[:, 0], u_pts0[:, 1], u_pts0[:, 2]
    nz = u_nrm0[:, 2]
    w_geom, _, _ = facial_spatial_weights(x, y, z, nz)
    w_smooth = w_color * w_geom
    n_hops_w = 8 if len(u_pts0) > 20000 else (2 if len(u_pts0) > 2000 else 1)
    for _ in range(n_hops_w):
        w_smooth = L_avg @ w_smooth

    # Bilinear lookup of z_macro_grid at (x, y)
    fx = np.clip((x - X0) / (X1 - X0) * (GX - 1), 0.0, GX - 1.0001)
    fy = np.clip((y - Y0) / (Y1 - Y0) * (GY - 1), 0.0, GY - 1.0001)
    ix, iy = fx.astype(int), fy.astype(int)
    dx, dy = fx - ix, fy - iy
    z_macro = (
        z_macro_grid[iy, ix] * (1 - dx) * (1 - dy)
        + z_macro_grid[iy, ix + 1] * dx * (1 - dy)
        + z_macro_grid[iy + 1, ix] * (1 - dx) * dy
        + z_macro_grid[iy + 1, ix + 1] * dx * dy
    )

    dz = z - z_macro
    blend_z = np.where(dz < 0, 0.92, 0.74) * w_smooth
    p_out = u_pts0.copy()
    p_out[:, 2] = z - blend_z * dz

    # Subtle plumpness (+1.0 mm) on under-eye / cheek / nasolabial region
    d_plump = ((np.abs(x) - 0.042) / 0.032) ** 2 + ((y - 1.288) / 0.045) ** 2
    w_plump = w_smooth * np.exp(-d_plump)
    p_out = p_out + (w_plump[:, None] * 0.0010) * u_nrm0

    n_lap = 25 if len(u_pts0) > 20000 else (4 if len(u_pts0) > 2000 else 2)
    alpha_lap = 0.55 if len(u_pts0) > 20000 else 0.35
    for _ in range(n_lap):
        p_out = p_out + (w_smooth[:, None] * alpha_lap) * ((L_avg @ p_out) - p_out)

    u_nrm_out = compute_normals(p_out, u_faces)
    n_nrm_lap = 10 if len(u_pts0) > 20000 else 3
    for _ in range(n_nrm_lap):
        u_nrm_out = (1.0 - 0.65 * w_smooth[:, None]) * u_nrm_out + (0.65 * w_smooth[:, None]) * (L_avg @ u_nrm_out)
    u_nrm_out /= np.maximum(np.linalg.norm(u_nrm_out, axis=1, keepdims=True), 1e-12)
    return p_out, u_nrm_out, w_color


def rasterize_front_head_uv(pos: np.ndarray, v_nrm: np.ndarray, uv: np.ndarray, idx: np.ndarray, W_tex: int, H_tex: int):
    """Rasterize front-head triangles into a (H_tex, W_tex) UV grid returning (uv_xyz, uv_nrm, uv_filled)."""
    tp = pos[idx]
    fmask = (
        (tp[:, :, 1].max(axis=1) >= 1.17)
        & (tp[:, :, 1].min(axis=1) <= 1.47)
        & (tp[:, :, 2].max(axis=1) >= 0.01)
        & (np.abs(tp[:, :, 0]).min(axis=1) <= 0.12)
    )
    f_idx = idx[fmask]
    T = np.column_stack([uv[:, 0] * W_tex - 0.5, uv[:, 1] * H_tex - 0.5])
    t0_uv, t1_uv, t2_uv = T[f_idx[:, 0]], T[f_idx[:, 1]], T[f_idx[:, 2]]
    xmin = np.floor(np.minimum(np.minimum(t0_uv[:, 0], t1_uv[:, 0]), t2_uv[:, 0])).astype(int)
    xmax = np.ceil(np.maximum(np.maximum(t0_uv[:, 0], t1_uv[:, 0]), t2_uv[:, 0])).astype(int)
    ymin = np.floor(np.minimum(np.minimum(t0_uv[:, 1], t1_uv[:, 1]), t2_uv[:, 1])).astype(int)
    ymax = np.ceil(np.maximum(np.maximum(t0_uv[:, 1], t1_uv[:, 1]), t2_uv[:, 1])).astype(int)
    spans = np.maximum(xmax - xmin, ymax - ymin)

    uv_xyz = np.zeros((H_tex, W_tex, 3), dtype=np.float32)
    uv_nrm = np.zeros((H_tex, W_tex, 3), dtype=np.float32)
    uv_filled = np.zeros((H_tex, W_tex), dtype=bool)

    small_m = spans <= 6
    if small_m.any():
        s_idx = f_idx[small_m]
        B_grid = []
        for i in range(7):
            for j in range(7 - i):
                b0, b1 = i / 6.0, j / 6.0
                B_grid.append((b0, b1, 1.0 - b0 - b1))
        B_grid = np.array(B_grid, dtype=np.float64)
        q_uv = np.einsum("kb,nbd->nkd", B_grid, T[s_idx])
        q_pos = np.einsum("kb,nbd->nkd", B_grid, pos[s_idx])
        q_nrm = np.einsum("kb,nbd->nkd", B_grid, v_nrm[s_idx])
        qx = np.clip(np.round(q_uv[:, :, 0]).astype(int).ravel(), 0, W_tex - 1)
        qy = np.clip(np.round(q_uv[:, :, 1]).astype(int).ravel(), 0, H_tex - 1)
        uv_xyz[qy, qx] = q_pos.reshape(-1, 3)
        uv_nrm[qy, qx] = q_nrm.reshape(-1, 3)
        uv_filled[qy, qx] = True

    for i0, i1, i2 in f_idx[~small_m]:
        t0_, t1_, t2_ = T[i0], T[i1], T[i2]
        x0 = max(int(np.floor(min(t0_[0], t1_[0], t2_[0]))) - 1, 0)
        x1 = min(int(np.ceil(max(t0_[0], t1_[0], t2_[0]))) + 1, W_tex - 1)
        y0 = max(int(np.floor(min(t0_[1], t1_[1], t2_[1]))) - 1, 0)
        y1 = min(int(np.ceil(max(t0_[1], t1_[1], t2_[1]))) + 1, H_tex - 1)
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        q = np.stack([xs.ravel(), ys.ravel()], 1).astype(np.float64)
        m = np.array([[t1_[0] - t0_[0], t2_[0] - t0_[0]], [t1_[1] - t0_[1], t2_[1] - t0_[1]]])
        det = m[0, 0] * m[1, 1] - m[0, 1] * m[1, 0]
        if abs(det) < 1e-12:
            continue
        inv_m = np.array([[m[1, 1], -m[0, 1]], [-m[1, 0], m[0, 0]]]) / det
        l12 = (q - t0_) @ inv_m.T
        l0 = 1.0 - l12[:, 0] - l12[:, 1]
        bary = np.column_stack([l0, l12])
        inside = (bary >= -0.04).all(1)
        if not inside.any():
            continue
        bary = np.clip(bary[inside], 0.0, None)
        bary /= np.maximum(bary.sum(1, keepdims=True), 1e-12)
        qi = q[inside].astype(int)
        uv_xyz[qi[:, 1], qi[:, 0]] = bary[:, :1] * pos[i0] + bary[:, 1:2] * pos[i1] + bary[:, 2:] * pos[i2]
        uv_nrm[qi[:, 1], qi[:, 0]] = bary[:, :1] * v_nrm[i0] + bary[:, 1:2] * v_nrm[i1] + bary[:, 2:] * v_nrm[i2]
        uv_filled[qi[:, 1], qi[:, 0]] = True

    # Dilate by 4 pixels into unmapped UV gutters so bilinear filtering / mipmaps never sample unrefined borders
    dist_bg, (iy, ix) = distance_transform_edt(~uv_filled, return_indices=True)
    near_m = (~uv_filled) & (dist_bg <= 4.5)
    uv_xyz[near_m] = uv_xyz[iy[near_m], ix[near_m]]
    uv_nrm[near_m] = uv_nrm[iy[near_m], ix[near_m]]
    uv_filled[near_m] = True
    return uv_xyz, uv_nrm, uv_filled


def refine_face_textures(
    pos: np.ndarray,
    v_nrm: np.ndarray,
    uv: np.ndarray,
    idx: np.ndarray,
    base_im: Image.Image,
    norm_im: Image.Image | None,
    mr_im: Image.Image | None,
    tex_sz: int,
):
    """Return refined (base_out_im, norm_out_im, mr_out_im) resized to tex_sz."""
    GX, GY, X0, X1, Y0, Y1, _, rgb_macro_grid, p2_matched = get_reference_fields()
    H2, W2, _ = p2_matched.shape

    base_resized = base_im.convert("RGB").resize((tex_sz, tex_sz), Image.LANCZOS)
    base_np = np.array(base_resized, dtype=np.float32)

    uv_xyz, uv_nrm, uv_filled = rasterize_front_head_uv(pos, v_nrm, uv, idx, tex_sz, tex_sz)
    ys, xs = np.where(uv_filled)
    pts = uv_xyz[ys, xs]
    nrms = uv_nrm[ys, xs]
    x, y, z = pts[:, 0], pts[:, 1], pts[:, 2]
    nz = nrms[:, 2]
    ny = nrms[:, 1]

    c_orig = base_np[ys, xs]
    # Use smoothed local color in UV space + 3D macro color so dark wrinkle pixels are still recognized as skin
    warm_orig = c_orig[:, 0] - c_orig[:, 2]
    w_skin_color = np.clip((warm_orig - 18.0) / 15.0, 0.0, 1.0) * np.clip((c_orig[:, 0] - 85.0) / 35.0, 0.0, 1.0)

    w_geom, w_tex_skin, w_proj = facial_spatial_weights(x, y, z, nz)
    w_skin = w_skin_color * w_tex_skin

    # Lookup 3D macro skin albedo RGB_macro(x, y)
    fx = np.clip((x - X0) / (X1 - X0) * (GX - 1), 0.0, GX - 1.0001)
    fy = np.clip((y - Y0) / (Y1 - Y0) * (GY - 1), 0.0, GY - 1.0001)
    ix, iy = fx.astype(int), fy.astype(int)
    dx, dy = fx - ix, fy - iy
    c_macro = (
        rgb_macro_grid[iy, ix] * ((1 - dx) * (1 - dy))[:, None]
        + rgb_macro_grid[iy, ix + 1] * (dx * (1 - dy))[:, None]
        + rgb_macro_grid[iy + 1, ix] * ((1 - dx) * dy)[:, None]
        + rgb_macro_grid[iy + 1, ix + 1] * (dx * dy)[:, None]
    ).astype(np.float32)

    # Lift dark baked wrinkles & hollow shadows toward c_macro (90% lift for dark creases, 55% smooth for bright bumps)
    diff_c = c_orig - c_macro
    luma_diff = 0.299 * diff_c[:, 0] + 0.587 * diff_c[:, 1] + 0.114 * diff_c[:, 2]
    k_dewrinkle = np.where(luma_diff < 0, 0.90, 0.55)[:, None] * w_skin[:, None]
    c_dewrinkled = c_orig - k_dewrinkle * diff_c

    # Also sample the airbrushed, color-matched 2D portrait (p2_matched) on front-facing skin
    px2 = np.clip(298.9705 + x * 1395.0199, 0.0, W2 - 1.0001)
    py2 = np.clip(75.0012 + (1.55 - y) * 1395.0199, 0.0, H2 - 1.0001)
    ix2, iy2 = px2.astype(int), py2.astype(int)
    dx2, dy2 = (px2 - ix2)[:, None], (py2 - iy2)[:, None]
    c_p2 = (
        p2_matched[iy2, ix2] * (1 - dx2) * (1 - dy2)
        + p2_matched[iy2, ix2 + 1] * dx2 * (1 - dy2)
        + p2_matched[iy2 + 1, ix2] * (1 - dx2) * dy2
        + p2_matched[iy2 + 1, ix2 + 1] * dx2 * dy2
    )
    # Avoid projecting onto underside of nose/chin (ny < -0.35)
    w_p2 = w_proj * w_skin * np.clip((ny + 0.45) / 0.30, 0.0, 1.0) * 0.45
    c_final = (1.0 - w_p2[:, None]) * c_dewrinkled + w_p2[:, None] * c_p2

    # Subtle warm rosy cheek blush on the cheek apples (|x| in [0.032, 0.068], y in [1.275, 1.325])
    d_blush = ((np.abs(x) - 0.048) / 0.022) ** 2 + ((y - 1.300) / 0.024) ** 2
    w_blush = w_skin * np.exp(-d_blush)
    c_final[:, 0] += 4.5 * w_blush
    c_final[:, 1] -= 1.5 * w_blush
    c_final[:, 2] -= 2.0 * w_blush

    base_np[ys, xs] = np.clip(c_final, 0.0, 255.0)
    base_out_im = Image.fromarray(np.round(base_np).astype(np.uint8))

    # Flatten normalMap on facial skin (92% toward flat (128, 128, 255)) so PBR normals don't carve wrinkle grooves
    norm_out_im = None
    if norm_im is not None:
        norm_resized = norm_im.convert("RGB").resize((tex_sz, tex_sz), Image.LANCZOS)
        norm_np = np.array(norm_resized, dtype=np.float32)
        w_nrm_flat = np.clip(np.clip((c_final[:, 0] - c_final[:, 2] - 18.0) / 14.0, 0.0, 1.0) * w_geom, 0.0, 1.0) * 0.92
        flat_n = np.array([[128.0, 128.0, 255.0]], dtype=np.float32)
        norm_np[ys, xs] = (1.0 - w_nrm_flat[:, None]) * norm_np[ys, xs] + w_nrm_flat[:, None] * flat_n
        norm_out_im = Image.fromarray(np.clip(np.round(norm_np), 0, 255).astype(np.uint8))

    # Clean metallicRoughness (ORM) on facial skin: R=255 (no dark AO), G=195 (soft matte skin), B=0 (non-metallic)
    mr_out_im = None
    if mr_im is not None:
        mr_sz = min(max(tex_sz // 2, 512), 1024)
        mr_resized = mr_im.convert("RGB").resize((mr_sz, mr_sz), Image.LANCZOS)
        mr_np = np.array(mr_resized, dtype=np.float32)
        ys_mr = np.clip((ys * mr_sz) // tex_sz, 0, mr_sz - 1)
        xs_mr = np.clip((xs * mr_sz) // tex_sz, 0, mr_sz - 1)
        w_mr = np.clip(w_skin, 0.0, 1.0) * 0.88
        clean_mr = np.array([[255.0, 195.0, 0.0]], dtype=np.float32)
        mr_np[ys_mr, xs_mr] = (1.0 - w_mr[:, None]) * mr_np[ys_mr, xs_mr] + w_mr[:, None] * clean_mr
        mr_out_im = Image.fromarray(np.clip(np.round(mr_np), 0, 255).astype(np.uint8))

    return base_out_im, norm_out_im, mr_out_im


def refine_ultra_workdir(wdir: Path, tex_sz: int = 2048):
    """Called by build.mjs when building Ultra (reads hi_pos.bin, hi_idx.bin, hi_uv.bin and raw-bigface PBR textures)."""
    pos = np.fromfile(wdir / "hi_pos.bin", np.float32).reshape(-1, 3).astype(np.float64)
    idx = np.fromfile(wdir / "hi_idx.bin", np.uint32).reshape(-1, 3).astype(np.int32)
    uv = np.fromfile(wdir / "hi_uv.bin", np.float32).reshape(-1, 2).astype(np.float64)

    base_im = Image.open(RAW_BIGFACE / "ultra-pbr-base.jpg").convert("RGB")
    norm_im = Image.open(RAW_BIGFACE / "ultra-pbr-norm.jpg").convert("RGB")
    mr_im = Image.open(RAW_BIGFACE / "ultra-pbr-mr.jpg").convert("RGB")

    W_tex, H_tex = base_im.size
    base_np = np.array(base_im, dtype=np.float32)

    pos_r = np.round(pos, 6)
    _, u_first, u_inv = np.unique(pos_r, axis=0, return_index=True, return_inverse=True)
    u_pts0 = pos[u_first].copy()
    u_faces = u_inv[idx]
    u_uv = uv[u_first]
    upx = np.clip((u_uv[:, 0] * (W_tex - 1)).astype(int), 0, W_tex - 1)
    vpx = np.clip((u_uv[:, 1] * (H_tex - 1)).astype(int), 0, H_tex - 1)
    u_rgb = base_np[vpx, upx]

    p_out, u_nrm_out, _ = smooth_face_geometry(u_pts0, u_faces, u_rgb)
    out_pos = p_out[u_inv].astype(np.float32)
    out_nrm = u_nrm_out[u_inv].astype(np.float32)
    out_pos.tofile(wdir / "out_pos.bin")
    out_nrm.tofile(wdir / "out_nrm.bin")

    base_out, norm_out, mr_out = refine_face_textures(out_pos, out_nrm, uv, idx, base_im, norm_im, mr_im, tex_sz)
    base_out.save(wdir / "out_tex.jpg", quality=88, optimize=True)
    if norm_out is not None:
        norm_out.save(wdir / "out_norm.jpg", quality=86, optimize=True)
    if mr_out is not None:
        mr_out.save(wdir / "out_mr.jpg", quality=85, optimize=True)
    print(f"refine_face (Ultra): smoothed {len(u_pts0)} unique positions and refined {tex_sz}px PBR textures")


def build_all():
    """Rebuild grandma-mali-ultra.glb, grandma-mali-remesh-6k.glb, grandma-mali.glb, and grandma-mali-remesh-1k5.glb."""
    env = dict(**__import__("os").environ, PYTHON=sys.executable)
    cmds = [
        ["node", "build.mjs", "--raw", "../meshy/raw-bigface", "--pbr", "../../../public/models/grandma-mali-ultra.glb"],
        ["node", "build.mjs", "--raw", "../meshy/raw-bigface", "--remesh", "--pbr", "../../../public/models/grandma-mali-remesh-6k.glb"],
        ["node", "build.mjs", "--raw", "../meshy/raw-bigface", "--remesh", "../meshy/raw-bigface/grandma-bigface-remesh-1k5.glb", "--pbr", "--tex", "1024", "../../../public/models/grandma-mali-remesh-1k5.glb"],
    ]
    for cmd in cmds:
        subprocess.run(cmd, cwd=HERE, env=env, check=True)
    import shutil
    models_dir = HERE.parent.parent.parent / "public" / "models"
    shutil.copyfile(models_dir / "grandma-mali-remesh-6k.glb", models_dir / "grandma-mali.glb")
    print("Copied grandma-mali-remesh-6k.glb -> grandma-mali.glb")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--build-all":
        build_all()
    elif len(sys.argv) > 1:
        refine_ultra_workdir(Path(sys.argv[1]), int(sys.argv[2]) if len(sys.argv) > 2 else 2048)
    else:
        build_all()
