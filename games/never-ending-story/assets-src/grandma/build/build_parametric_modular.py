"""Build the Parametric Base Body + Modular Outfit + Head-Focus model for Grandma Mali
(public/models/grandma-mali-parametric.glb).

Architecture:
1. BodyParams: Reusable parametric standard human body & garment proportions tuned to Grandma Mali (1.55m).
2. Modular Parametric Geometry (100% symmetric, clean quad-grid topology):
   - Body_Skin: Parametric neck column, forearms/wrists/hands (with sculpted palm, thumb lobe, and finger grooves),
     and lower legs/ankles.
   - Outfit_Blouse: Ribbed soft lilac-rose crew collar & inner neckline.
   - Outfit_Cardigan: Long-sleeved lilac-purple fine-knit button-up cardigan with ribbed collar/cuffs/hem,
     center placket, and 4 round 3D buttons.
   - Outfit_Skirt: Full-length traditional Thai pha-sin sarong with wrap-over front fold and closed bottom hem.
   - Outfit_Shoes: Symmetric rounded slip-on slippers with flat soles and sculpted ankle openings.
3. Head_Focused: High-detail subdivided quad-dominant head & wavy silver bob hair (~8.4k tris dedicated to the head)
   projected onto the smoothed, bilaterally symmetrized Ultra head surface, with a dedicated high-res UV region
   (top 62% of the 2048x2048 atlas) projected directly from the airbrushed, albedo-calibrated 2-inch portrait
   (grandma-mali-2inch-photo.jpg) + 3D silver hair waves.
4. Rigged to the exact 24-bone Mixamo skeleton and 6 animation clips (Idle, Wave, SitDown, SitIdle, SitTalk, Walk).

Usage:
  python build_parametric_modular.py <workdir> [tex_size]   (called by build.mjs --parametric)
  python build_parametric_modular.py                        (standalone full build -> public/models/grandma-mali-parametric.glb)
"""
from dataclasses import dataclass
import subprocess
import sys
from pathlib import Path
import numpy as np
import pygltflib
import trimesh
from PIL import Image, ImageFilter
from scipy.ndimage import gaussian_filter
from scipy.spatial import cKDTree

from refine_face import (
    HERE,
    RAW_BIGFACE,
    REF_2INCH,
    REF_SHOWCASE_2INCH,
    build_adjacency,
    compute_normals,
    facial_spatial_weights,
    get_reference_fields,
    smooth_face_geometry,
)

CUTOUT_TPOSE = Path("/workspace/meshy/grandma/bigface-tpose/grandma-bigface-cutout.png")
SHOWCASE_TPOSE = HERE.parent.parent.parent / "public" / "showcase" / "characters" / "grandma-mali-tpose.jpg"


@dataclass
class BodyParams:
    height: float = 1.55
    # Neck
    neck_y_min: float = 1.148
    neck_y_max: float = 1.215
    neck_rx: float = 0.052
    neck_rz: float = 0.050
    neck_zc: float = -0.015
    # Torso / Blouse / Cardigan
    collar_y_min: float = 1.132
    collar_y_max: float = 1.182
    cardigan_y_min: float = 0.840
    cardigan_y_max: float = 1.168
    shoulder_y: float = 1.138
    shoulder_rx: float = 0.168
    bust_y: float = 1.040
    bust_rx: float = 0.172
    bust_rz: float = 0.126
    waist_y: float = 0.935
    waist_rx: float = 0.146
    waist_rz: float = 0.118
    hip_top_rx: float = 0.166
    hip_top_rz: float = 0.130
    # Skirt (Thai pha-sin sarong)
    skirt_y_min: float = 0.138
    skirt_y_max: float = 0.858
    hip_y: float = 0.740
    hip_rx: float = 0.192
    hip_rz: float = 0.146
    skirt_hem_rx: float = 0.195
    skirt_hem_rz: float = 0.150
    # Arms & Hands (along A-pose bone chain)
    upper_arm_r: float = 0.052
    elbow_r: float = 0.045
    cuff_r: float = 0.041
    wrist_rx: float = 0.022
    wrist_rz: float = 0.030
    palm_rx: float = 0.017
    palm_rz: float = 0.039
    # Lower legs & Shoes
    leg_x: float = 0.104
    ankle_r: float = 0.037
    shoe_y_max: float = 0.076
    shoe_rx: float = 0.054
    shoe_z_heel: float = -0.074
    shoe_z_toe: float = 0.174


def build_loft_grid(rings_xyz: np.ndarray, rings_uv: np.ndarray, flip_winding: bool = False):
    """Build (pos, uv, idx) from a (n_rings, n_seg + 1, 3) grid where column n_seg duplicates column 0 in 3D."""
    n_r, n_c, _ = rings_xyz.shape
    pos = rings_xyz.reshape(-1, 3).astype(np.float64)
    uv = rings_uv.reshape(-1, 2).astype(np.float64)
    tris = []
    for r in range(n_r - 1):
        for c in range(n_c - 1):
            i00 = r * n_c + c
            i01 = r * n_c + (c + 1)
            i10 = (r + 1) * n_c + c
            i11 = (r + 1) * n_c + (c + 1)
            if not flip_winding:
                tris.append((i00, i10, i11))
                tris.append((i00, i11, i01))
            else:
                tris.append((i00, i11, i10))
                tris.append((i00, i01, i11))
    return pos, uv, np.array(tris, dtype=np.int32)


def uv_remap(u01: np.ndarray, v01: np.ndarray, u_min: float, u_max: float, v_min: float, v_max: float):
    return np.stack([u_min + u01 * (u_max - u_min), v_min + v01 * (v_max - v_min)], axis=-1)


def generate_neck_and_blouse(P: BodyParams):
    """Generate parametric Neck (Body_Skin) and Blouse Collar (Outfit_Blouse)."""
    n_seg = 40
    u_t = np.linspace(0.0, 1.0, n_seg + 1)
    theta = u_t * 2.0 * np.pi  # 0 at +Z (front), pi/2 at +X, pi at -Z (back)
    sin_t, cos_t = np.sin(theta), np.cos(theta)

    # 1. Parametric Neck (y from 1.148 to 1.215)
    n_r = 8
    v_t = np.linspace(0.0, 1.0, n_r)
    ys = P.neck_y_min + (1.0 - v_t) * (P.neck_y_max - P.neck_y_min)
    rings_xyz = np.zeros((n_r, n_seg + 1, 3), dtype=np.float64)
    rings_uv = np.zeros((n_r, n_seg + 1, 2), dtype=np.float64)
    for i, y in enumerate(ys):
        t = (y - P.neck_y_min) / (P.neck_y_max - P.neck_y_min)
        # Base flares slightly into shoulders; top matches head base
        rx = P.neck_rx * (1.18 - 0.18 * t)
        rz = P.neck_rz * (1.15 - 0.15 * t)
        zc = P.neck_zc + 0.012 * (1.0 - t)
        rings_xyz[i, :, 0] = rx * sin_t
        rings_xyz[i, :, 1] = y
        rings_xyz[i, :, 2] = zc + rz * cos_t
        rings_uv[i] = uv_remap(u_t, np.full_like(u_t, v_t[i]), 0.02, 0.24, 0.91, 0.985)
    neck_pos, neck_uv, neck_idx = build_loft_grid(rings_xyz, rings_uv, flip_winding=True)

    # 2. Modular Blouse Collar & Inner Bodice (y from 1.125 to 1.182)
    n_rb = 7
    vb_t = np.linspace(0.0, 1.0, n_rb)
    rings_b_xyz = np.zeros((n_rb, n_seg + 1, 3), dtype=np.float64)
    rings_b_uv = np.zeros((n_rb, n_seg + 1, 2), dtype=np.float64)
    for i, s in enumerate(vb_t):
        # s=0 is inner rim touching neck at y=1.176; s=0.3 is top of rolled crew collar; s=1 is inner chest under cardigan
        if s < 0.35:
            u_s = s / 0.35
            y = 1.174 + 0.008 * np.sin(u_s * np.pi) - 0.004 * u_s * cos_t
            rx = 0.056 + 0.018 * u_s
            rz = 0.054 + 0.018 * u_s
            zc = -0.010 + 0.010 * u_s
        else:
            u_s = (s - 0.35) / 0.65
            y = 1.170 - 0.048 * u_s - 0.006 * cos_t
            rx = 0.074 + 0.055 * u_s
            rz = 0.072 + 0.036 * u_s
            zc = 0.000 + 0.022 * u_s
        rings_b_xyz[i, :, 0] = rx * sin_t
        rings_b_xyz[i, :, 1] = y
        rings_b_xyz[i, :, 2] = zc + rz * cos_t
        rings_b_uv[i] = uv_remap(u_t, np.full_like(u_t, s), 0.52, 0.74, 0.64, 0.715)
    blouse_pos, blouse_uv, blouse_idx = build_loft_grid(rings_b_xyz, rings_b_uv, flip_winding=False)
    return (neck_pos, neck_uv, neck_idx), (blouse_pos, blouse_uv, blouse_idx)


def generate_cardigan(P: BodyParams):
    """Generate Modular Outfit_Cardigan: Torso jacket + Left/Right long knit sleeves + 4 round 3D buttons."""
    parts_pos, parts_uv, parts_idx = [], [], []
    v_off = 0

    def append_part(p, u, f):
        nonlocal v_off
        parts_pos.append(p)
        parts_uv.append(u)
        parts_idx.append(f + v_off)
        v_off += len(p)

    # 1. Cardigan Torso (from neck collar edge y=1.168 down to ribbed bottom hem y=0.840, plus inner hem fold)
    n_seg = 56
    u_t = np.linspace(0.0, 1.0, n_seg + 1)
    theta = u_t * 2.0 * np.pi  # 0 at +Z (front), pi/2 at +X, pi at -Z (back)
    sin_t, cos_t = np.sin(theta), np.cos(theta)

    # Profile control points (s in [0, 1] from top collar to bottom hem, plus s=1.04 inner hem turn-under)
    s_vals = np.concatenate([np.linspace(0.0, 1.0, 22), [1.04]])
    rings_xyz = np.zeros((len(s_vals), n_seg + 1, 3), dtype=np.float64)
    rings_uv = np.zeros((len(s_vals), n_seg + 1, 2), dtype=np.float64)

    for i, s in enumerate(s_vals):
        s_clamped = min(s, 1.0)
        y = P.cardigan_y_max - s_clamped * (P.cardigan_y_max - P.cardigan_y_min)
        if s <= 0.08:
            # Collar / upper shoulder slope (y: 1.168 -> 1.142)
            t = s / 0.08
            rx = 0.072 + t * (P.shoulder_rx - 0.072)
            rz = 0.070 + t * (0.096 - 0.070)
            zc = 0.002 + t * 0.022
            # Slight crew-neck dip in front (cos_t > 0)
            y -= 0.014 * (1.0 - t) * np.maximum(cos_t, 0.0) ** 2
        elif s <= 0.40:
            # Shoulder to bust (y: 1.142 -> 1.037)
            t = (s - 0.08) / 0.32
            smooth_t = 0.5 - 0.5 * np.cos(t * np.pi)
            rx = P.shoulder_rx + smooth_t * (P.bust_rx - P.shoulder_rx)
            rz = 0.096 + smooth_t * (P.bust_rz - 0.096)
            zc = 0.024 + smooth_t * 0.024
        elif s <= 0.72:
            # Bust to waist (y: 1.037 -> 0.932)
            t = (s - 0.40) / 0.32
            smooth_t = 0.5 - 0.5 * np.cos(t * np.pi)
            rx = P.bust_rx + smooth_t * (P.waist_rx - P.bust_rx)
            rz = P.bust_rz + smooth_t * (P.waist_rz - P.bust_rz)
            zc = 0.048 - smooth_t * 0.008
        else:
            # Waist to ribbed hem over top of sarong (y: 0.932 -> 0.840)
            t = (s_clamped - 0.72) / 0.28
            smooth_t = 0.5 - 0.5 * np.cos(t * np.pi)
            rx = P.waist_rx + smooth_t * (P.hip_top_rx - P.waist_rx)
            rz = P.waist_rz + smooth_t * (P.hip_top_rz - P.waist_rz)
            zc = 0.040 - smooth_t * 0.022

        if s > 1.0:
            # Tuck inward at bottom of ribbed hem so the cardigan has a solid lower edge
            rx *= 0.92
            rz *= 0.92
            y = P.cardigan_y_min + 0.004

        # Subtle anatomical shaping: fuller rounded front bust, flatter upper back, and center-front placket ridge
        bust_env = np.exp(-((y - 1.035) / 0.065) ** 2)
        z_front_boost = 0.016 * bust_env * (np.maximum(cos_t, 0.0) ** 1.6) * (1.0 - 0.25 * np.cos(2.0 * theta))
        placket_boost = 0.0030 * np.exp(-((sin_t) / 0.09) ** 2) * (cos_t > 0.5)

        rings_xyz[i, :, 0] = rx * sin_t
        rings_xyz[i, :, 1] = y
        rings_xyz[i, :, 2] = zc + rz * cos_t + z_front_boost + placket_boost
        rings_uv[i] = uv_remap(u_t, np.full_like(u_t, s_clamped), 0.52, 0.80, 0.725, 0.90)

    append_part(*build_loft_grid(rings_xyz, rings_uv, flip_winding=False))

    # 2. Left & Right Long Knit Sleeves (lofted along the exact A-pose Shoulder -> Arm -> ForeArm bone centerline)
    # Left centerline control points from shoulder root (x=0.130) to ribbed cuff (x=0.362)
    n_sr = 18
    n_sc = 28
    u_s = np.linspace(0.0, 1.0, n_sc + 1)
    phi = u_s * 2.0 * np.pi
    cos_p, sin_p = np.cos(phi), np.sin(phi)

    # s_arm in [0..1] along sleeve, plus 1.05 cuff turn-in
    s_arm_vals = np.concatenate([np.linspace(0.0, 1.0, n_sr), [1.05]])
    for sign in (+1.0, -1.0):
        sl_xyz = np.zeros((len(s_arm_vals), n_sc + 1, 3), dtype=np.float64)
        sl_uv = np.zeros((len(s_arm_vals), n_sc + 1, 2), dtype=np.float64)

        # Piecewise-smooth centerline from shoulder cap (0.128, 1.088, 0.005) through elbow (0.268, 0.985, -0.016)
        # to ribbed cuff (0.360, 0.892, -0.016)
        for i, sa in enumerate(s_arm_vals):
            sc = min(sa, 1.0)
            if sc <= 0.52:
                t = sc / 0.52
                cx = 0.128 + t * (0.268 - 0.128)
                cy = 1.088 + t * (0.985 - 1.088) + 0.012 * np.sin(t * np.pi)
                cz = 0.008 + t * (-0.014 - 0.008)
                ry = 0.068 * (1.0 - t) + P.elbow_r * t
                rz = 0.064 * (1.0 - t) + (P.elbow_r * 0.95) * t
            else:
                t = (sc - 0.52) / 0.48
                cx = 0.268 + t * (0.362 - 0.268)
                cy = 0.985 + t * (0.890 - 0.985)
                cz = -0.014 + t * (-0.016 - (-0.014))
                # Slight fullness before the ribbed cuff gather
                cuff_puff = 0.004 * np.sin(t * np.pi)
                ry = P.elbow_r * (1.0 - t) + P.cuff_r * t + cuff_puff
                rz = (P.elbow_r * 0.95) * (1.0 - t) + (P.cuff_r * 0.94) * t + cuff_puff

            if sa > 1.0:
                # Inner cuff turn-back so wrist emerges from inside a solid cuff
                ry *= 0.72
                rz *= 0.72
                cx -= 0.008
                cy += 0.008

            # Orthogonal frame around arm axis tangent (~ (0.71, -0.70, 0)):
            # Normal 1 (up-outward in XY plane): (0.70, 0.71, 0), Normal 2 (Z): (0, 0, 1)
            nx, ny = 0.69, 0.724
            # At shoulder root (sc < 0.2), blend cross-section toward vertical torso wall so junction is super clean
            w_root = max(0.0, 1.0 - sc / 0.25)
            nx = (1.0 - w_root) * nx + w_root * 0.25
            ny = (1.0 - w_root) * ny + w_root * 0.968

            x_ring = cx + ry * cos_p * nx
            y_ring = cy + ry * cos_p * ny
            z_ring = cz + rz * sin_p
            sl_xyz[i, :, 0] = sign * x_ring
            sl_xyz[i, :, 1] = y_ring
            sl_xyz[i, :, 2] = z_ring
            sl_uv[i] = uv_remap(u_s, np.full_like(u_s, sc), 0.81, 0.98, 0.725, 0.90)

        append_part(*build_loft_grid(sl_xyz, sl_uv, flip_winding=(sign < 0)))

    # 3. Four 3D Round Buttons down the center placket of the cardigan
    btn_ys = [1.095, 1.025, 0.955, 0.885]
    n_bseg = 16
    ub = np.linspace(0.0, 1.0, n_bseg + 1)
    ang = ub * 2.0 * np.pi
    front_ys = rings_xyz[:-1, 0, 1][::-1]
    front_zs = rings_xyz[:-1, 0, 2][::-1]
    for by in btn_ys:
        # Interpolate exact front z of cardigan placket at (x=0, y=by)
        bz = float(np.interp(by, front_ys, front_zs)) + 0.0028
        r_btn = 0.0110
        b_xyz = np.zeros((3, n_bseg + 1, 3), dtype=np.float64)
        b_uv = np.zeros((3, n_bseg + 1, 2), dtype=np.float64)
        for ri, (r_scale, dz) in enumerate([(0.95, -0.001), (1.0, 0.0035), (0.05, 0.0048)]):
            b_xyz[ri, :, 0] = r_btn * r_scale * np.cos(ang)
            b_xyz[ri, :, 1] = by + r_btn * r_scale * np.sin(ang)
            b_xyz[ri, :, 2] = bz + dz
            b_uv[ri] = uv_remap(ub, np.full_like(ub, ri / 2.0), 0.76, 0.80, 0.65, 0.70)
        append_part(*build_loft_grid(b_xyz, b_uv, flip_winding=False))

    return np.vstack(parts_pos), np.vstack(parts_uv), np.vstack(parts_idx)


def generate_hands_and_ankles(P: BodyParams):
    """Generate Left & Right Forearms + Wrists + Sculpted Hands (with Thumb + Finger grooves) + Lower Legs/Ankles."""
    parts_pos, parts_uv, parts_idx = [], [], []
    v_off = 0

    def append_part(p, u, f):
        nonlocal v_off
        parts_pos.append(p)
        parts_uv.append(u)
        parts_idx.append(f + v_off)
        v_off += len(p)

    # 1. Forearm + Wrist + Hand + Thumb + Fingers (from inside cuff x=0.345 to fingertips x=0.508)
    n_hc = 32
    u_h = np.linspace(0.0, 1.0, n_hc + 1)
    phi = u_h * 2.0 * np.pi  # 0 at top-outer (+XY normal), pi/2 at +Z (anterior/thumb side), pi at bottom-inner (-XY), 3pi/2 at -Z
    cos_p, sin_p = np.cos(phi), np.sin(phi)

    s_hand = np.linspace(0.0, 1.0, 18)
    nx, ny = 0.69, 0.724

    for sign in (+1.0, -1.0):
        h_xyz = np.zeros((len(s_hand), n_hc + 1, 3), dtype=np.float64)
        h_uv = np.zeros((len(s_hand), n_hc + 1, 2), dtype=np.float64)

        for i, sh in enumerate(s_hand):
            # Centerline from inside cuff (0.345, 0.905, -0.016) through wrist (0.402, 0.850, -0.015)
            # to fingertips (0.508, 0.746, -0.012)
            cx = 0.345 + sh * (0.508 - 0.345)
            cy = 0.905 + sh * (0.746 - 0.905)
            cz = -0.016 + sh * 0.004

            if sh <= 0.35:
                # Distal forearm tapering to wrist
                t = sh / 0.35
                r_thick = 0.029 * (1.0 - t) + P.wrist_rx * t
                r_width = 0.032 * (1.0 - t) + P.wrist_rz * t
                thumb_lobe = 0.0
                finger_groove = 0.0
            elif sh <= 0.68:
                # Wrist widening into palm + opposable thumb lobe on +Z side (sin_p > 0)
                t = (sh - 0.35) / 0.33
                env_palm = np.sin(t * np.pi * 0.85)
                r_thick = P.wrist_rx * (1.0 - 0.22 * t)
                r_width = P.wrist_rz + env_palm * (P.palm_rz - P.wrist_rz)
                # Thumb extends toward +Z and slightly downward/inward around sh in [0.40, 0.66]
                thumb_env = np.exp(-((sh - 0.54) / 0.095) ** 2)
                thumb_ang = np.exp(-((phi - 0.46 * np.pi) / 0.28) ** 2)
                thumb_lobe = 0.022 * thumb_env * thumb_ang
                finger_groove = 0.0
            else:
                # Palm tapering to 4 fingers + rounded fingertips (sh=1 closes to a cap)
                t = (sh - 0.68) / 0.32
                cap_scale = np.sqrt(max(0.0004, 1.0 - (t ** 2.2)))
                r_thick = (P.wrist_rx * 0.74) * cap_scale
                r_width = (P.palm_rz * (1.0 - 0.18 * t)) * cap_scale
                thumb_lobe = 0.0
                # 4 subtle longitudinal finger scallops across Z (sin_p)
                finger_groove = 0.0022 * np.sin(t * np.pi) * np.cos(4.0 * sin_p * np.pi) * (np.abs(cos_p) > 0.3)

            rad_xy = r_thick * cos_p - finger_groove * np.sign(cos_p) - 0.25 * thumb_lobe
            rad_z = r_width * sin_p + thumb_lobe

            h_xyz[i, :, 0] = sign * (cx + rad_xy * nx)
            h_xyz[i, :, 1] = cy + rad_xy * ny
            h_xyz[i, :, 2] = cz + rad_z
            h_uv[i] = uv_remap(u_h, np.full_like(u_h, sh), 0.25, 0.48, 0.91, 0.985)

        append_part(*build_loft_grid(h_xyz, h_uv, flip_winding=(sign < 0)))

    # 2. Left & Right Lower Legs / Ankles (y from 0.168 down to 0.052 inside shoes)
    n_ac = 24
    u_a = np.linspace(0.0, 1.0, n_ac + 1)
    ang_a = u_a * 2.0 * np.pi
    sin_a, cos_a = np.sin(ang_a), np.cos(ang_a)
    s_ank = np.linspace(0.0, 1.0, 7)

    for sign in (+1.0, -1.0):
        a_xyz = np.zeros((len(s_ank), n_ac + 1, 3), dtype=np.float64)
        a_uv = np.zeros((len(s_ank), n_ac + 1, 2), dtype=np.float64)
        for i, sa in enumerate(s_ank):
            y = 0.168 - sa * (0.168 - 0.052)
            r = P.ankle_r * (1.12 - 0.14 * sa)
            zc = 0.006 - 0.006 * sa
            a_xyz[i, :, 0] = sign * P.leg_x + r * sin_a
            a_xyz[i, :, 1] = y
            a_xyz[i, :, 2] = zc + (r * 1.08) * cos_a
            a_uv[i] = uv_remap(u_a, np.full_like(u_a, sa), 0.02, 0.24, 0.91, 0.985)
        append_part(*build_loft_grid(a_xyz, a_uv, flip_winding=False))

    return np.vstack(parts_pos), np.vstack(parts_uv), np.vstack(parts_idx)


def generate_skirt(P: BodyParams):
    """Generate Modular Outfit_Skirt: Full-length traditional Thai pha-sin sarong with closed bottom hem."""
    n_seg = 64
    u_t = np.linspace(0.0, 1.0, n_seg + 1)
    theta = u_t * 2.0 * np.pi  # 0 at +Z (front), pi/2 at +X, pi at -Z (back)
    sin_t, cos_t = np.sin(theta), np.cos(theta)

    # s in [0..1] from waist (y=0.858) down to bottom hem (y=0.138), plus 1.035 inner hem turn-in to close the bottom
    s_vals = np.concatenate([np.linspace(0.0, 1.0, 28), [1.022, 1.045]])
    rings_xyz = np.zeros((len(s_vals), n_seg + 1, 3), dtype=np.float64)
    rings_uv = np.zeros((len(s_vals), n_seg + 1, 2), dtype=np.float64)

    for i, s in enumerate(s_vals):
        sc = min(s, 1.0)
        y = P.skirt_y_max - sc * (P.skirt_y_max - P.skirt_y_min)
        if sc <= 0.18:
            # Waistband into upper hip curve (y: 0.858 -> 0.728)
            t = sc / 0.18
            smooth_t = 0.5 - 0.5 * np.cos(t * np.pi)
            rx = 0.154 + smooth_t * (P.hip_rx - 0.154)
            rz = 0.120 + smooth_t * (P.hip_rz - 0.120)
            zc = 0.022 - smooth_t * 0.008
        else:
            # Hip curve into full-length column / gentle A-line drape (y: 0.728 -> 0.138)
            t = (sc - 0.18) / 0.82
            rx = P.hip_rx + t * (P.skirt_hem_rx - P.hip_rx)
            rz = P.hip_rz + t * (P.skirt_hem_rz - P.hip_rz)
            zc = 0.014 + t * 0.008

        # Traditional Thai pha-sin wrap-over front pleat at theta ~ +0.22 rad (x ~ +0.04m on front)
        wrap_step = 0.0035 * np.tanh((theta - 0.22) / 0.08) * np.exp(-((theta - 0.22) / 0.45) ** 2) * (cos_t > 0.3)

        if s > 1.03:
            # Close inner shadow disk at y = 0.146 around ankle columns so underside is completely opaque
            rx = 0.045
            rz = 0.035
            y = P.skirt_y_min + 0.010
            wrap_step = 0.0
        elif s > 1.0:
            rx *= 0.86
            rz *= 0.84
            y = P.skirt_y_min + 0.003
            wrap_step = 0.0

        rings_xyz[i, :, 0] = rx * sin_t
        rings_xyz[i, :, 1] = y
        rings_xyz[i, :, 2] = zc + rz * cos_t + wrap_step

        # Symmetric front/back horizontal UV mapping so both front and back show crisp diamond & kanok border
        # u_sym goes 0 -> 1 -> 0 around the circumference (or 0.5 + 0.5*sin_t) so front and back match seamlessly!
        u_sym = 0.5 + 0.48 * sin_t
        rings_uv[i] = uv_remap(u_sym, np.full_like(u_t, sc), 0.02, 0.50, 0.64, 0.90)

    return build_loft_grid(rings_xyz, rings_uv, flip_winding=False)


def generate_shoes(P: BodyParams):
    """Generate Modular Outfit_Shoes: Left & Right rounded slip-on slippers with flat soles on y=0."""
    parts_pos, parts_uv, parts_idx = [], [], []
    v_off = 0

    n_seg = 32
    u_t = np.linspace(0.0, 1.0, n_seg + 1)
    theta = u_t * 2.0 * np.pi  # 0 at +Z (toe), pi/2 at +X, pi at -Z (heel)
    sin_t, cos_t = np.sin(theta), np.cos(theta)

    # Rings from center of flat sole (s=0) -> sole outer rim (s=0.18) -> upper vamp/heel (s=0.75) -> ankle collar opening (s=1.0)
    s_vals = [0.0, 0.16, 0.24, 0.42, 0.62, 0.82, 0.94, 1.0]
    for sign in (+1.0, -1.0):
        sh_xyz = np.zeros((len(s_vals), n_seg + 1, 3), dtype=np.float64)
        sh_uv = np.zeros((len(s_vals), n_seg + 1, 2), dtype=np.float64)

        for i, s in enumerate(s_vals):
            # Foot centerline shifts slightly outward toward toe (from x=0.104 at heel/ankle to x=0.116 at toe)
            if s == 0.0:
                # Flat sole center on y=0.000
                sh_xyz[i, :, 0] = sign * 0.108
                sh_xyz[i, :, 1] = 0.000
                sh_xyz[i, :, 2] = 0.045
            else:
                if s <= 0.24:
                    # Flat sole to sole rim (y: 0.000 -> 0.012)
                    t = (s - 0.16) / 0.08
                    y = 0.012 * max(0.0, t)
                    scale_r = 0.97 + 0.03 * max(0.0, t)
                    z_toe = P.shoe_z_toe * scale_r
                    z_heel = P.shoe_z_heel * scale_r
                    rx = P.shoe_rx * scale_r
                elif s <= 0.82:
                    # Rounded slipper upper (y: 0.012 -> 0.064), toe box curves backward toward vamp
                    t = (s - 0.24) / 0.58
                    smooth_t = np.sin(t * np.pi * 0.5)
                    y = 0.012 + smooth_t * (0.066 - 0.012)
                    # Toe pulls back smoothly above y=0.035 to form the rounded toe cap and slip-on vamp opening
                    z_toe = P.shoe_z_toe * (1.0 - 0.52 * (t ** 1.7))
                    z_heel = P.shoe_z_heel * (1.0 - 0.12 * (t ** 1.5))
                    rx = P.shoe_rx * (1.0 - 0.25 * (t ** 1.5))
                else:
                    # Ankle collar rim tucking into the ankle at z_c = 0.002, r = 0.038
                    t = (s - 0.82) / 0.18
                    y = 0.066 + 0.006 * np.sin(t * np.pi)
                    z_toe = (1.0 - t) * (P.shoe_z_toe * 0.48) + t * 0.038
                    z_heel = (1.0 - t) * (P.shoe_z_heel * 0.88) + t * (-0.034)
                    rx = (1.0 - t) * (P.shoe_rx * 0.75) + t * 0.036

                zc = 0.5 * (z_toe + z_heel)
                rz = 0.5 * (z_toe - z_heel)
                z_ring = zc + rz * cos_t
                # Slight outward toe splay along +Z
                x_center = P.leg_x + 0.012 * np.clip((z_ring - 0.01) / 0.15, 0.0, 1.0)
                # Slightly wider at forefoot (cos_t > 0) than heel (cos_t < 0)
                rx_asym = rx * (1.0 + 0.10 * cos_t)

                sh_xyz[i, :, 0] = sign * x_center + rx_asym * sin_t
                sh_xyz[i, :, 1] = y
                sh_xyz[i, :, 2] = z_ring

            sh_uv[i] = uv_remap(u_t, np.full_like(u_t, s), 0.52, 0.98, 0.91, 0.985)

        p, u, f = build_loft_grid(sh_xyz, sh_uv, flip_winding=False)
        parts_pos.append(p)
        parts_uv.append(u)
        parts_idx.append(f + v_off)
        v_off += len(p)

    return np.vstack(parts_pos), np.vstack(parts_uv), np.vstack(parts_idx)


def head_azimuthal_uv(x: np.ndarray, y: np.ndarray, z: np.ndarray):
    """Map 3D head points (x, y, z) to a front-focused azimuthal UV island in u in [0.04, 0.96], v in [0.02, 0.605].
    Near the front face (theta in [-0.65, +0.65]), u is proportional to x so the 2D portrait maps orthographically;
    past the temples toward the back of the head (|theta| -> pi), u unwraps smoothly by angle so side triangles never stretch.
    """
    zc = -0.025
    dz = z - zc
    theta = np.arctan2(x, dz)  # 0 at front (+Z), +-pi at back (-Z)
    r_horiz = np.hypot(x, dz)
    # Blend orthographic x near front (|theta| < 0.7) with arc-length r_avg * theta toward sides/back
    w_ortho = np.exp(-((theta / 0.75) ** 2))
    s_horiz = w_ortho * (x / 0.135) + (1.0 - w_ortho) * (theta / np.pi) * 2.25
    # Map s_horiz in [-2.25, +2.25] -> u in [0.05, 0.95]
    u = 0.50 + (s_horiz / 2.25) * 0.44
    v = 0.025 + np.clip((1.552 - y) / (1.552 - 1.172), 0.0, 1.0) * 0.575
    return np.column_stack([u, v]), theta


def generate_focused_head(P: BodyParams, hi_pos: np.ndarray, hi_idx: np.ndarray):
    """Build Head_Focused (~8,412 subdivided quad-dominant triangles) projected onto the smoothed,
    bilaterally symmetrized Ultra head surface, with a front-focused 2K UV island."""
    # Load 6k quad-dominant remesh and align to hi_pos
    gltf_r = pygltflib.GLTF2().load(str(RAW_BIGFACE / "grandma-bigface-remesh-6k.glb"))
    blob_r = gltf_r.binary_blob()
    prim_r = gltf_r.meshes[0].primitives[0]

    def get_acc(idx, cols):
        acc = gltf_r.accessors[idx]
        dt = {5121: np.uint8, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}[acc.componentType]
        bv = gltf_r.bufferViews[acc.bufferView]
        off = (bv.byteOffset or 0) + (acc.byteOffset or 0)
        return np.frombuffer(blob_r, dtype=dt, count=acc.count * cols, offset=off).reshape(-1, cols)

    raw_pos = get_acc(prim_r.attributes.POSITION, 3).astype(np.float64)
    raw_idx = get_acc(prim_r.indices, 1).astype(np.int32).reshape(-1, 3)

    mesh_hi = trimesh.Trimesh(vertices=hi_pos, faces=hi_idx, process=False)
    c0 = np.array([
        (raw_pos[:, 0].max() + raw_pos[:, 0].min()) / 2.0,
        raw_pos[:, 1].min(),
        (raw_pos[:, 2].max() + raw_pos[:, 2].min()) / 2.0,
    ])
    s0 = (hi_pos[:, 1].max() - hi_pos[:, 1].min()) / (raw_pos[:, 1].max() - raw_pos[:, 1].min())
    pts = (raw_pos - c0) * s0
    for _ in range(12):
        cp, _, tid = trimesh.proximity.closest_point(mesh_hi, pts)
        n = mesh_hi.face_normals[tid]
        r = ((cp - pts) * n).sum(1)
        w = 1.0 / (np.abs(r) + 1e-4)
        A = np.column_stack([(pts * n).sum(1), n])
        b = (cp * n).sum(1)
        sol = np.linalg.lstsq(A * w[:, None], b * w, rcond=None)[0]
        pts = pts * sol[0] + sol[1:]

    # Extract head triangles cleanly above the collar (y >= 1.192 at front/sides, >= 1.185 at back hair)
    tri_c = pts[raw_idx].mean(axis=1)
    y_cut = np.where(tri_c[:, 2] > -0.04, 1.192, 1.185)
    head_faces0 = raw_idx[tri_c[:, 1] >= y_cut]
    m_head0 = trimesh.Trimesh(vertices=pts, faces=head_faces0, process=True)
    v_sub, f_sub = trimesh.remesh.subdivide(m_head0.vertices, m_head0.faces)

    # Project subdivided head vertices onto the smoothed Ultra head surface
    # First build the smoothed Ultra head mesh
    gltf_u = pygltflib.GLTF2().load(str(RAW_BIGFACE / "Character_output.glb"))
    blob_u = gltf_u.binary_blob()
    prim_u = gltf_u.meshes[0].primitives[0]
    acc_uv = gltf_u.accessors[prim_u.attributes.TEXCOORD_0]
    bv_uv = gltf_u.bufferViews[acc_uv.bufferView]
    hi_uv = np.frombuffer(
        blob_u, dtype=np.float32, count=acc_uv.count * 2, offset=(bv_uv.byteOffset or 0) + (acc_uv.byteOffset or 0)
    ).reshape(-1, 2)

    base_im = Image.open(RAW_BIGFACE / "ultra-pbr-base.jpg").convert("RGB")
    W_tex, H_tex = base_im.size
    base_np = np.array(base_im, dtype=np.float32)

    pos_r = np.round(hi_pos, 6)
    _, u_first, u_inv = np.unique(pos_r, axis=0, return_index=True, return_inverse=True)
    u_pts0 = hi_pos[u_first].astype(np.float64)
    u_faces = u_inv[hi_idx]
    u_uv0 = hi_uv[u_first]
    upx = np.clip((u_uv0[:, 0] * (W_tex - 1)).astype(int), 0, W_tex - 1)
    vpx = np.clip((u_uv0[:, 1] * (H_tex - 1)).astype(int), 0, H_tex - 1)
    u_rgb = base_np[vpx, upx]

    u_pts_smooth, _, _ = smooth_face_geometry(u_pts0, u_faces, u_rgb)
    # Extract Ultra head triangles for fast closest-point projection
    u_tri_y = u_pts_smooth[u_faces, 1].mean(axis=1)
    mesh_ultra_head = trimesh.Trimesh(vertices=u_pts_smooth, faces=u_faces[u_tri_y >= 1.165], process=False)

    cp_head, _, _ = trimesh.proximity.closest_point(mesh_ultra_head, v_sub)
    v_proj = cp_head.copy()

    # Apply bilateral symmetry + extra macro-surface polish on the facial skin of v_proj
    GX, GY, X0, X1, Y0, Y1, z_macro_grid, _, _ = get_reference_fields()
    # Symmetrize z_macro_grid horizontally (55% blend with mirrored X) so forehead/cheek contours are balanced
    z_macro_sym = 0.55 * z_macro_grid + 0.45 * z_macro_grid[:, ::-1]

    v_nrm = compute_normals(v_proj, f_sub)
    L_sub = build_adjacency(len(v_proj), f_sub)
    x, y, z = v_proj[:, 0], v_proj[:, 1], v_proj[:, 2]
    w_geom, _, _ = facial_spatial_weights(x, y, z, v_nrm[:, 2])
    for _ in range(4):
        w_geom = L_sub @ w_geom

    fx = np.clip((x - X0) / (X1 - X0) * (GX - 1), 0.0, GX - 1.0001)
    fy = np.clip((y - Y0) / (Y1 - Y0) * (GY - 1), 0.0, GY - 1.0001)
    ix, iy = fx.astype(int), fy.astype(int)
    dx, dy = fx - ix, fy - iy
    z_m = (
        z_macro_sym[iy, ix] * (1 - dx) * (1 - dy)
        + z_macro_sym[iy, ix + 1] * dx * (1 - dy)
        + z_macro_sym[iy + 1, ix] * (1 - dx) * dy
        + z_macro_sym[iy + 1, ix + 1] * dx * dy
    )
    dz = z - z_m
    v_proj[:, 2] = z - (np.where(dz < 0, 0.85, 0.65) * w_geom) * dz
    for _ in range(8):
        v_proj = v_proj + (w_geom[:, None] * 0.45) * ((L_sub @ v_proj) - v_proj)

    # Gentle global Laplacian polish on hair & ears (outside w_geom) so hair waves are silky-smooth
    w_hair_polish = (1.0 - w_geom) * np.clip((v_proj[:, 1] - 1.205) / 0.025, 0.0, 1.0)
    for _ in range(3):
        v_proj = v_proj + (w_hair_polish[:, None] * 0.32) * ((L_sub @ v_proj) - v_proj)

    # Blend the bottom neck boundary (y < 1.220) smoothly onto the parametric neck cylinder
    # and lift any low neck vertex to y >= 1.198 so it sits cleanly above Outfit_Blouse (y <= 1.186)
    w_neck_seam = np.clip((1.220 - v_proj[:, 1]) / 0.026, 0.0, 1.0) * np.clip((v_proj[:, 2] + 0.065) / 0.020, 0.0, 1.0)
    if w_neck_seam.any():
        ang_n = np.arctan2(v_proj[:, 0], v_proj[:, 2] - P.neck_zc)
        y_target = np.maximum(v_proj[:, 1], 1.198)
        t_n = np.clip((y_target - P.neck_y_min) / (P.neck_y_max - P.neck_y_min), 0.0, 1.0)
        rx_n = P.neck_rx * (1.14 - 0.14 * t_n)
        rz_n = P.neck_rz * (1.10 - 0.10 * t_n)
        zc_n = P.neck_zc + 0.010 * (1.0 - t_n)
        nx_target = rx_n * np.sin(ang_n)
        nz_target = zc_n + rz_n * np.cos(ang_n)
        v_proj[:, 0] = (1.0 - w_neck_seam) * v_proj[:, 0] + w_neck_seam * nx_target
        v_proj[:, 1] = (1.0 - w_neck_seam) * v_proj[:, 1] + w_neck_seam * y_target
        v_proj[:, 2] = (1.0 - w_neck_seam) * v_proj[:, 2] + w_neck_seam * nz_target

    # Compute azimuthal front-focused UVs, duplicating back-seam vertices where a triangle crosses theta = +-pi
    uv_base, theta = head_azimuthal_uv(v_proj[:, 0], v_proj[:, 1], v_proj[:, 2])
    pos_list = [v_proj]
    uv_list = [uv_base]
    faces_out = f_sub.copy()

    tri_th = theta[f_sub]
    # Back-seam crossing: triangle is at the back (z < -0.02) and spans across +-pi
    back_cross = (v_proj[f_sub, 2].mean(axis=1) < -0.02) & ((tri_th.max(axis=1) - tri_th.min(axis=1)) > np.pi)
    cross_ids = np.where(back_cross)[0]
    next_vid = len(v_proj)
    for tid in cross_ids:
        for k in range(3):
            vid = faces_out[tid, k]
            if theta[vid] < 0:
                # Duplicate vertex with theta + 2*pi -> u shifted to right side (> 0.94)
                th_pos = theta[vid] + 2.0 * np.pi
                u_pos = 0.50 + ((th_pos / np.pi) * 2.25 / 2.25) * 0.44
                v_pos = uv_base[vid, 1]
                pos_list.append(v_proj[vid : vid + 1])
                uv_list.append(np.array([[min(u_pos, 0.985), v_pos]]))
                faces_out[tid, k] = next_vid
                next_vid += 1

    return np.vstack(pos_list), np.vstack(uv_list), faces_out


def bake_parametric_atlas(
    P: BodyParams,
    head_pos: np.ndarray,
    head_uv: np.ndarray,
    head_idx: np.ndarray,
    hi_pos: np.ndarray,
    hi_uv: np.ndarray,
    hi_idx: np.ndarray,
    tex_sz: int = 2048,
):
    """Synthesize the 2048x2048 BaseColor, NormalMap, and MetallicRoughness atlas for:
    - Top 62% (v in [0.00, 0.62]): Head_Focused (high-res 2-inch portrait front projection + 3D silver hair waves)
    - Bottom 38% (v in [0.62, 1.00]): Modular Outfit (Skirt, Blouse, Cardigan, Shoes) & Parametric Body_Skin.
    """
    GX, GY, X0, X1, Y0, Y1, _, rgb_macro_grid, p2_matched = get_reference_fields()
    H2, W2, _ = p2_matched.shape

    atlas = np.full((tex_sz, tex_sz, 3), [218.0, 162.0, 128.0], dtype=np.float32)
    norm_atlas = np.full((tex_sz, tex_sz, 3), [128.0, 128.0, 255.0], dtype=np.float32)
    mr_atlas = np.full((tex_sz, tex_sz, 3), [255.0, 205.0, 0.0], dtype=np.float32)

    # Load T-pose reference cutout for crisp modular garment patterns
    tpose_path = CUTOUT_TPOSE if CUTOUT_TPOSE.exists() else SHOWCASE_TPOSE
    tpose_np = np.array(Image.open(tpose_path).convert("RGB"), dtype=np.float32)
    Ht, Wt, _ = tpose_np.shape

    # Load Ultra baseColor & normalMap for 3D hair waves on the sides/back of Head_Focused
    ultra_base = np.array(Image.open(RAW_BIGFACE / "ultra-pbr-base.jpg").convert("RGB"), dtype=np.float32)
    ultra_norm = np.array(Image.open(RAW_BIGFACE / "ultra-pbr-norm.jpg").convert("RGB"), dtype=np.float32)
    Hu, Wu, _ = ultra_base.shape

    # --- 1. Bake Top Region (v in [0.00, 0.62]): Head_Focused ---
    # Invert head_azimuthal_uv on a grid or rasterize + sample 3D head surface
    # Because head_azimuthal_uv is a smooth 2D parameterization of (theta, y), we can sample the 3D head surface directly!
    head_nrm = compute_normals(head_pos, head_idx)
    # Build KD-tree on (u, v) of Head_Focused vertices (subdivided to 8.4k tris -> dense in UV space!)
    # Even better: rasterize head triangles into the top (0.62 * tex_sz, tex_sz) UV buffer!
    H_head = int(0.625 * tex_sz)
    T = np.column_stack([head_uv[:, 0] * tex_sz - 0.5, head_uv[:, 1] * tex_sz - 0.5])
    uv_xyz = np.zeros((H_head, tex_sz, 3), dtype=np.float32)
    uv_nrm = np.zeros((H_head, tex_sz, 3), dtype=np.float32)
    uv_filled = np.zeros((H_head, tex_sz), dtype=bool)

    for i0, i1, i2 in head_idx:
        t0_, t1_, t2_ = T[i0], T[i1], T[i2]
        x0 = max(int(np.floor(min(t0_[0], t1_[0], t2_[0]))) - 1, 0)
        x1 = min(int(np.ceil(max(t0_[0], t1_[0], t2_[0]))) + 1, tex_sz - 1)
        y0 = max(int(np.floor(min(t0_[1], t1_[1], t2_[1]))) - 1, 0)
        y1 = min(int(np.ceil(max(t0_[1], t1_[1], t2_[1]))) + 1, H_head - 1)
        if x1 < x0 or y1 < y0:
            continue
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
        inside = (bary >= -0.03).all(1)
        if not inside.any():
            continue
        bary = np.clip(bary[inside], 0.0, None)
        bary /= np.maximum(bary.sum(1, keepdims=True), 1e-12)
        qi = q[inside].astype(int)
        uv_xyz[qi[:, 1], qi[:, 0]] = bary[:, :1] * head_pos[i0] + bary[:, 1:2] * head_pos[i1] + bary[:, 2:] * head_pos[i2]
        uv_nrm[qi[:, 1], qi[:, 0]] = bary[:, :1] * head_nrm[i0] + bary[:, 1:2] * head_nrm[i1] + bary[:, 2:] * head_nrm[i2]
        uv_filled[qi[:, 1], qi[:, 0]] = True

    from scipy.ndimage import distance_transform_edt
    dist_bg, (iy_d, ix_d) = distance_transform_edt(~uv_filled, return_indices=True)
    near_m = (~uv_filled) & (dist_bg <= 12.0)
    uv_xyz[near_m] = uv_xyz[iy_d[near_m], ix_d[near_m]]
    uv_nrm[near_m] = uv_nrm[iy_d[near_m], ix_d[near_m]]
    uv_filled[near_m] = True

    # Lookup closest Ultra head vertex for every filled head texel to get base 3D color & normal
    head_u_mask = hi_pos[:, 1] >= 1.160
    tree_u = cKDTree(hi_pos[head_u_mask])
    hi_uv_head = hi_uv[head_u_mask]

    ys_h, xs_h = np.where(uv_filled)
    pts_h = uv_xyz[ys_h, xs_h]
    nrms_h = uv_nrm[ys_h, xs_h]
    dists_u, nn_idx = tree_u.query(pts_h, k=8)
    w_idw = 1.0 / (dists_u + 1e-4) ** 2
    w_idw /= w_idw.sum(axis=1, keepdims=True)
    uv_u = hi_uv_head[nn_idx]  # (N, 8, 2)
    upx_u = np.clip((uv_u[:, :, 0] * (Wu - 1)).astype(int), 0, Wu - 1)
    vpx_u = np.clip((uv_u[:, :, 1] * (Hu - 1)).astype(int), 0, Hu - 1)
    c_3d = (ultra_base[vpx_u, upx_u] * w_idw[:, :, None]).sum(axis=1)
    n_3d = (ultra_norm[vpx_u, upx_u] * w_idw[:, :, None]).sum(axis=1)

    # Now apply our facial skin de-wrinkling + high-res 2-inch portrait projection onto Head_Focused!
    xh, yh, zh = pts_h[:, 0], pts_h[:, 1], pts_h[:, 2]
    nzh, nyh = nrms_h[:, 2], nrms_h[:, 1]
    warm_h = c_3d[:, 0] - c_3d[:, 2]
    w_skin_color = np.clip((warm_h - 18.0) / 15.0, 0.0, 1.0) * np.clip((c_3d[:, 0] - 85.0) / 35.0, 0.0, 1.0)
    w_geom_h, w_tex_skin_h, w_proj_h = facial_spatial_weights(xh, yh, zh, nzh)
    w_skin_h = w_skin_color * w_tex_skin_h

    fx = np.clip((xh - X0) / (X1 - X0) * (GX - 1), 0.0, GX - 1.0001)
    fy = np.clip((yh - Y0) / (Y1 - Y0) * (GY - 1), 0.0, GY - 1.0001)
    ix, iy = fx.astype(int), fy.astype(int)
    dx, dy = fx - ix, fy - iy
    c_macro = (
        rgb_macro_grid[iy, ix] * ((1 - dx) * (1 - dy))[:, None]
        + rgb_macro_grid[iy, ix + 1] * (dx * (1 - dy))[:, None]
        + rgb_macro_grid[iy + 1, ix] * ((1 - dx) * dy)[:, None]
        + rgb_macro_grid[iy + 1, ix + 1] * (dx * dy)[:, None]
    ).astype(np.float32)

    diff_c = c_3d - c_macro
    luma_diff = 0.299 * diff_c[:, 0] + 0.587 * diff_c[:, 1] + 0.114 * diff_c[:, 2]
    k_dewrinkle = np.where(luma_diff < 0, 0.92, 0.60)[:, None] * w_skin_h[:, None]
    c_head = c_3d - k_dewrinkle * diff_c

    # Project airbrushed, albedo-calibrated 2-inch portrait (p2_matched) strongly onto the front face of Head_Focused
    px2 = np.clip(298.9705 + xh * 1395.0199, 0.0, W2 - 1.0001)
    py2 = np.clip(75.0012 + (1.55 - yh) * 1395.0199, 0.0, H2 - 1.0001)
    ix2, iy2 = px2.astype(int), py2.astype(int)
    dx2, dy2 = (px2 - ix2)[:, None], (py2 - iy2)[:, None]
    c_p2 = (
        p2_matched[iy2, ix2] * (1 - dx2) * (1 - dy2)
        + p2_matched[iy2, ix2 + 1] * dx2 * (1 - dy2)
        + p2_matched[iy2 + 1, ix2] * (1 - dx2) * dy2
        + p2_matched[iy2 + 1, ix2 + 1] * dx2 * dy2
    )
    w_p2 = w_proj_h * w_skin_h * np.clip((nyh + 0.45) / 0.30, 0.0, 1.0) * 0.55
    c_head = (1.0 - w_p2[:, None]) * c_head + w_p2[:, None] * c_p2

    # Subtle rosy cheek warmth
    d_blush = ((np.abs(xh) - 0.048) / 0.022) ** 2 + ((yh - 1.300) / 0.024) ** 2
    w_blush = w_skin_h * np.exp(-d_blush)
    c_head[:, 0] += 5.0 * w_blush
    c_head[:, 1] -= 1.2 * w_blush
    c_head[:, 2] -= 1.8 * w_blush

    # Smoothly transition neck base (yh < 1.215, front/side neck zh > -0.045) toward unified parametric skin tone [224, 166, 131]
    # including replacing any purple collar bleed from Ultra near yh < 1.208
    w_neck_front = np.clip((zh + 0.045) / 0.025, 0.0, 1.0) * np.clip((0.078 - np.abs(xh)) / 0.020, 0.0, 1.0)
    w_neck_blend = np.clip((1.216 - yh) / 0.024, 0.0, 1.0) * np.maximum(w_skin_color, w_neck_front)
    neck_skin_rgb = np.array([[224.0, 166.0, 131.0]], dtype=np.float32)
    c_head = (1.0 - w_neck_blend[:, None]) * c_head + w_neck_blend[:, None] * neck_skin_rgb

    atlas[ys_h, xs_h] = np.clip(c_head, 0.0, 255.0)

    # Flatten normal map on facial skin (95% flat) and soften tangent-space UV-chart noise on hair (85% flat)
    # so the 8,224-tri sculpted hair geometry shines cleanly without UV-chart normal grain
    w_nrm_flat = np.maximum(0.85, np.clip(w_skin_color * w_geom_h, 0.0, 1.0) * 0.95)
    flat_n = np.array([[128.0, 128.0, 255.0]], dtype=np.float32)
    norm_atlas[ys_h, xs_h] = (1.0 - w_nrm_flat[:, None]) * n_3d + w_nrm_flat[:, None] * flat_n

    # --- 2. Bake Bottom Region (v in [0.625, 1.00]): Modular Outfit & Parametric Body_Skin ---
    # 2a. Outfit_Skirt (u in [0.015, 0.505], v in [0.635, 0.905]):
    # Sample directly from the T-pose cutout skirt region (y_3d in [0.858 -> 0.138], x_3d in [-0.185 -> +0.185]),
    # symmetrized left-right so the purple geometric diamond pattern & kanok floral hem border are 100% symmetric & crisp!
    x0_sk, x1_sk = int(0.015 * tex_sz), int(0.505 * tex_sz)
    y0_sk, y1_sk = int(0.635 * tex_sz), int(0.905 * tex_sz)
    us_sk = np.linspace(0.0, 1.0, x1_sk - x0_sk)
    vs_sk = np.linspace(0.0, 1.0, y1_sk - y0_sk)
    uu_sk, vv_sk = np.meshgrid(us_sk, vs_sk)
    # Map uu_sk in [0, 1] -> x_3d in [-0.155, +0.155] (staying inside the clean central portion of the sarong away from silhouette edges)
    x3d_sk = (uu_sk - 0.5) * 2.0 * 0.150
    y3d_sk = P.skirt_y_max - vv_sk * (P.skirt_y_max - P.skirt_y_min)
    px_cut_r = np.clip(431.5 + np.abs(x3d_sk) * 674.2484, 0, Wt - 1).astype(int)
    px_cut_l = np.clip(431.5 - np.abs(x3d_sk) * 674.2484, 0, Wt - 1).astype(int)
    py_cut = np.clip(48.0 + (1.55 - y3d_sk) * 674.2484, 0, Ht - 1).astype(int)
    skirt_patch = 0.5 * (tpose_np[py_cut, px_cut_r] + tpose_np[py_cut, px_cut_l])
    # Lift slight ambient shading toward unlit PBR fabric brightness (+12%)
    skirt_patch = np.clip(skirt_patch * 1.12 + 4.0, 0.0, 255.0)
    atlas[y0_sk:y1_sk, x0_sk:x1_sk] = skirt_patch
    # Subtle woven silk/cotton normal detail on skirt
    weave_x = np.sin(uu_sk * 180.0 * np.pi) * 3.5
    weave_y = np.sin(vv_sk * 240.0 * np.pi) * 3.5
    norm_atlas[y0_sk:y1_sk, x0_sk:x1_sk, 0] = 128.0 + weave_x
    norm_atlas[y0_sk:y1_sk, x0_sk:x1_sk, 1] = 128.0 + weave_y
    mr_atlas[y0_sk:y1_sk, x0_sk:x1_sk] = [250.0, 215.0, 0.0]

    # 2b. Outfit_Blouse Collar & Inner Bodice (u in [0.515, 0.745], v in [0.635, 0.720]):
    x0_bl, x1_bl = int(0.515 * tex_sz), int(0.745 * tex_sz)
    y0_bl, y1_bl = int(0.635 * tex_sz), int(0.720 * tex_sz)
    us_bl = np.linspace(0.0, 1.0, x1_bl - x0_bl)
    vs_bl = np.linspace(0.0, 1.0, y1_bl - y0_bl)
    uu_bl, vv_bl = np.meshgrid(us_bl, vs_bl)
    rib_bl = np.sin(uu_bl * 96.0 * np.pi)
    base_bl = np.array([[[192.0, 166.0, 206.0]]], dtype=np.float32) + rib_bl[:, :, None] * 5.5
    atlas[y0_bl:y1_bl, x0_bl:x1_bl] = np.clip(base_bl, 0.0, 255.0)
    norm_atlas[y0_bl:y1_bl, x0_bl:x1_bl, 0] = 128.0 + np.cos(uu_bl * 96.0 * np.pi) * 9.0

    # 2c. Round Buttons (u in [0.750, 0.808], v in [0.640, 0.710]):
    x0_bt, x1_bt = int(0.750 * tex_sz), int(0.808 * tex_sz)
    y0_bt, y1_bt = int(0.640 * tex_sz), int(0.710 * tex_sz)
    us_bt = np.linspace(0.0, 1.0, x1_bt - x0_bt)
    vs_bt = np.linspace(0.0, 1.0, y1_bt - y0_bt)
    uu_bt, vv_bt = np.meshgrid(us_bt, vs_bt)
    # Polished lilac-mauve button with subtle rim bevel and center buttonholes
    rim_bt = np.exp(-((vv_bt - 0.55) / 0.14) ** 2) * 14.0 - np.exp(-((vv_bt - 0.85) / 0.10) ** 2) * 18.0
    atlas[y0_bt:y1_bt, x0_bt:x1_bt] = np.clip(np.array([[[176.0, 150.0, 196.0]]]) + rim_bt[:, :, None], 0.0, 255.0)
    mr_atlas[y0_bt:y1_bt, x0_bt:x1_bt] = [255.0, 120.0, 0.0]  # semi-glossy button

    # 2d. Outfit_Cardigan Torso (u in [0.515, 0.805], v in [0.720, 0.905]) & Sleeves (u in [0.805, 0.985], v in [0.720, 0.905]):
    x0_cd, x1_cd = int(0.515 * tex_sz), int(0.805 * tex_sz)
    y0_cd, y1_cd = int(0.720 * tex_sz), int(0.905 * tex_sz)
    us_cd = np.linspace(0.0, 1.0, x1_cd - x0_cd)
    vs_cd = np.linspace(0.0, 1.0, y1_cd - y0_cd)
    uu_cd, vv_cd = np.meshgrid(us_cd, vs_cd)
    # Sample base lilac-purple cardigan color from T-pose chest & blend with crisp procedural knit + placket + ribbed hem
    # u=0 and u=1 correspond to +Z (center front!), u=0.5 is -Z (center back)
    dist_front = np.minimum(uu_cd, 1.0 - uu_cd)
    y3d_cd = P.cardigan_y_max - vv_cd * (P.cardigan_y_max - P.cardigan_y_min)
    x3d_cd = np.sin(uu_cd * 2.0 * np.pi) * 0.125
    px_cd = np.clip(431.5 + np.abs(x3d_cd) * 674.2484, 0, Wt - 1).astype(int)
    py_cd = np.clip(48.0 + (1.55 - y3d_cd) * 674.2484, 0, Ht - 1).astype(int)
    sampled_cd = tpose_np[py_cd, px_cd] * 1.08 + 6.0
    base_lilac = np.array([[[182.0, 158.0, 199.0]]], dtype=np.float32)
    # Blend 45% sampled chest shading + 55% clean lilac knit so sides/back have zero silhouette dark edge artifacts
    w_sample = np.exp(-((dist_front / 0.18) ** 2)) * np.clip((vv_cd - 0.08) / 0.10, 0.0, 1.0) * 0.45
    cd_tex = (1.0 - w_sample[:, :, None]) * base_lilac + w_sample[:, :, None] * sampled_cd
    # Fine knit texture + stronger vertical ribbing on collar (vv < 0.09), bottom hem (vv > 0.86), and center placket (dist_front < 0.032)
    is_rib = np.clip((0.09 - vv_cd) / 0.03, 0.0, 1.0) + np.clip((vv_cd - 0.86) / 0.03, 0.0, 1.0)
    is_placket = np.exp(-((dist_front / 0.024) ** 2))
    knit_wave = np.sin(uu_cd * 160.0 * np.pi) * (2.2 + 4.5 * is_rib) + np.sin(vv_cd * 140.0 * np.pi) * 1.5
    placket_seam = -10.0 * np.exp(-(((dist_front - 0.022) / 0.004) ** 2)) - 6.0 * np.exp(-((dist_front / 0.003) ** 2))
    cd_tex += (knit_wave + placket_seam)[:, :, None]
    atlas[y0_cd:y1_cd, x0_cd:x1_cd] = np.clip(cd_tex, 0.0, 255.0)
    norm_atlas[y0_cd:y1_cd, x0_cd:x1_cd, 0] = 128.0 + np.cos(uu_cd * 160.0 * np.pi) * (4.0 + 7.0 * is_rib)
    norm_atlas[y0_cd:y1_cd, x0_cd:x1_cd, 1] = 128.0 + np.cos(vv_cd * 140.0 * np.pi) * 3.0

    # Cardigan Sleeves (u in [0.805, 0.985], v in [0.720, 0.905])
    x0_sl, x1_sl = int(0.805 * tex_sz), int(0.985 * tex_sz)
    us_sl = np.linspace(0.0, 1.0, x1_sl - x0_sl)
    uu_sl, vv_sl = np.meshgrid(us_sl, vs_cd)
    is_cuff = np.clip((vv_sl - 0.84) / 0.04, 0.0, 1.0)
    sl_wave = np.sin(uu_sl * 84.0 * np.pi) * (2.2 + 5.0 * is_cuff) + np.sin(vv_sl * 110.0 * np.pi) * 1.5
    cuff_groove = -8.0 * np.exp(-(((vv_sl - 0.84) / 0.012) ** 2))
    sl_tex = base_lilac + (sl_wave + cuff_groove)[:, :, None]
    atlas[y0_cd:y1_cd, x0_sl:x1_sl] = np.clip(sl_tex, 0.0, 255.0)
    norm_atlas[y0_cd:y1_cd, x0_sl:x1_sl, 0] = 128.0 + np.cos(uu_sl * 84.0 * np.pi) * (4.0 + 7.0 * is_cuff)

    # 2e. Parametric Body_Skin: Neck/Ankles (u in [0.015, 0.245], v in [0.905, 0.990]) & Hands (u in [0.245, 0.490], v in [0.905, 0.990])
    x0_skn, x1_skn = int(0.015 * tex_sz), int(0.490 * tex_sz)
    y0_skn, y1_skn = int(0.905 * tex_sz), int(0.990 * tex_sz)
    us_skn = np.linspace(0.0, 1.0, x1_skn - x0_skn)
    vs_skn = np.linspace(0.0, 1.0, y1_skn - y0_skn)
    uu_skn, vv_skn = np.meshgrid(us_skn, vs_skn)
    # Match the warm peach-tan unlit PBR skin tone of the refined face & neck ([224, 166, 131])
    skin_base = np.array([[[224.0, 166.0, 131.0]]], dtype=np.float32)
    # Add gentle rosy warmth toward the fingertips (vv_skn > 0.7, right half of skin island)
    is_hand = (uu_skn > 0.48).astype(np.float32)
    tip_warm = is_hand * np.clip((vv_skn - 0.65) / 0.35, 0.0, 1.0)
    skin_patch = skin_base.copy() + np.stack([3.0 * tip_warm, -2.0 * tip_warm, -2.5 * tip_warm], axis=-1)
    atlas[y0_skn:y1_skn, x0_skn:x1_skn] = np.clip(skin_patch, 0.0, 255.0)
    mr_atlas[y0_skn:y1_skn, x0_skn:x1_skn] = [255.0, 195.0, 0.0]

    # 2f. Outfit_Shoes (u in [0.515, 0.985], v in [0.905, 0.990]):
    # Solid medium plum-purple upper matching the skirt ([102, 72, 118]) with dark plum-brown outsole (vv < 0.24)
    x0_sh, x1_sh = int(0.515 * tex_sz), int(0.985 * tex_sz)
    y0_sh, y1_sh = int(0.905 * tex_sz), int(0.990 * tex_sz)
    us_sh = np.linspace(0.0, 1.0, x1_sh - x0_sh)
    vs_sh = np.linspace(0.0, 1.0, y1_sh - y0_sh)
    uu_sh, vv_sh = np.meshgrid(us_sh, vs_sh)
    w_upper = np.clip((vv_sh - 0.21) / 0.04, 0.0, 1.0)[:, :, None]
    sole_rgb = np.array([[[62.0, 44.0, 72.0]]], dtype=np.float32)
    upper_rgb = np.array([[[106.0, 76.0, 122.0]]], dtype=np.float32)
    # Subtle collar piping trim near vv_sh ~ 0.92
    collar_trim = 10.0 * np.exp(-(((vv_sh - 0.92) / 0.03) ** 2))[:, :, None]
    shoe_patch = (1.0 - w_upper) * sole_rgb + w_upper * (upper_rgb + collar_trim)
    atlas[y0_sh:y1_sh, x0_sh:x1_sh] = np.clip(shoe_patch, 0.0, 255.0)
    mr_atlas[y0_sh:y1_sh, x0_sh:x1_sh] = [250.0, 185.0, 0.0]

    base_out = Image.fromarray(np.clip(np.round(atlas), 0, 255).astype(np.uint8))
    norm_out = Image.fromarray(np.clip(np.round(norm_atlas), 0, 255).astype(np.uint8))
    mr_sz = min(max(tex_sz // 2, 512), 1024)
    mr_out = Image.fromarray(np.clip(np.round(mr_atlas), 0, 255).astype(np.uint8)).resize((mr_sz, mr_sz), Image.BILINEAR)
    return base_out, norm_out, mr_out


def build_parametric_workdir(wdir: Path, tex_sz: int = 2048):
    """Assemble Head_Focused + Body_Skin + Outfit_Blouse + Outfit_Cardigan + Outfit_Skirt + Outfit_Shoes,
    transfer 24-bone Mixamo skin weights, weld (pos, uv), and write workdir binaries for build.mjs."""
    hi_pos = np.fromfile(wdir / "hi_pos.bin", np.float32).reshape(-1, 3)
    hi_idx = np.fromfile(wdir / "hi_idx.bin", np.uint32).reshape(-1, 3)
    hi_j = np.fromfile(wdir / "hi_j.bin", np.uint8).reshape(-1, 4)
    hi_w = np.fromfile(wdir / "hi_w.bin", np.float32).reshape(-1, 4)
    hi_uv = np.fromfile(wdir / "hi_uv.bin", np.float32).reshape(-1, 2)

    P = BodyParams()

    # Generate all 6 modular components
    head_pos, head_uv, head_idx = generate_focused_head(P, hi_pos, hi_idx)
    (neck_pos, neck_uv, neck_idx), (blouse_pos, blouse_uv, blouse_idx) = generate_neck_and_blouse(P)
    card_pos, card_uv, card_idx = generate_cardigan(P)
    limbs_pos, limbs_uv, limbs_idx = generate_hands_and_ankles(P)
    skirt_pos, skirt_uv, skirt_idx = generate_skirt(P)
    shoes_pos, shoes_uv, shoes_idx = generate_shoes(P)

    parts = [
        ("Head_Focused", head_pos, head_uv, head_idx),
        ("Body_Neck", neck_pos, neck_uv, neck_idx),
        ("Outfit_Blouse", blouse_pos, blouse_uv, blouse_idx),
        ("Outfit_Cardigan", card_pos, card_uv, card_idx),
        ("Body_Hands_Ankles", limbs_pos, limbs_uv, limbs_idx),
        ("Outfit_Skirt", skirt_pos, skirt_uv, skirt_idx),
        ("Outfit_Shoes", shoes_pos, shoes_uv, shoes_idx),
    ]

    all_pos, all_uv, all_nrm, all_idx = [], [], [], []
    v_off = 0
    summary = []
    for name, p, u, f in parts:
        # Compute clean per-component vertex normals on deduplicated positions of that component
        p_r = np.round(p, 6)
        _, uf, uinv = np.unique(p_r, axis=0, return_index=True, return_inverse=True)
        unrm = compute_normals(p[uf], uinv[f])
        vnrm = unrm[uinv]
        all_pos.append(p)
        all_uv.append(u)
        all_nrm.append(vnrm)
        all_idx.append(f + v_off)
        v_off += len(p)
        summary.append(f"{name}:{len(f)}t")

    raw_pos = np.vstack(all_pos)
    raw_uv = np.vstack(all_uv)
    raw_nrm = np.vstack(all_nrm)
    raw_idx = np.vstack(all_idx).astype(np.uint32)

    # Transfer 24-bone skin weights from the rigged reference mesh via closest-triangle barycentric interpolation
    n_joints = int(hi_j.max()) + 1
    hi_W = np.zeros((len(hi_pos), n_joints), dtype=np.float64)
    for k in range(4):
        np.add.at(hi_W, (np.arange(len(hi_pos)), hi_j[:, k]), hi_w[:, k])

    pos_r = np.round(raw_pos, 6)
    _, u_first, u_inv = np.unique(pos_r, axis=0, return_index=True, return_inverse=True)
    u_pts = raw_pos[u_first]

    mesh_hi = trimesh.Trimesh(vertices=hi_pos, faces=hi_idx, process=False)
    cp, dist, tid = trimesh.proximity.closest_point(mesh_hi, u_pts)
    bary = trimesh.triangles.points_to_barycentric(mesh_hi.triangles[tid], cp)
    f_hi = hi_idx[tid]
    u_W = bary[:, 0:1] * hi_W[f_hi[:, 0]] + bary[:, 1:2] * hi_W[f_hi[:, 1]] + bary[:, 2:3] * hi_W[f_hi[:, 2]]

    # Smooth skin weights slightly on the modular garment shells (skirt/cardigan) so symmetric vertices deform smoothly
    u_faces = u_inv[raw_idx]
    L_all = build_adjacency(len(u_pts), u_faces)
    body_mask = (u_pts[:, 1] < 1.18)[:, None].astype(np.float64)
    for _ in range(3):
        u_W = (1.0 - 0.45 * body_mask) * u_W + (0.45 * body_mask) * (L_all @ u_W)

    top4 = np.argsort(-u_W, axis=1)[:, :4]
    top4_w = np.take_along_axis(u_W, top4, axis=1)
    top4_w = np.maximum(top4_w, 0.0)
    w_sum = top4_w.sum(axis=1, keepdims=True)
    top4_w = np.where(w_sum > 0, top4_w / w_sum, np.array([[1.0, 0.0, 0.0, 0.0]]))
    top4_j = np.where(top4_w > 0, top4, 0).astype(np.uint8)
    top4_w = top4_w.astype(np.float32)

    out_pos = raw_pos.astype(np.float32)
    out_nrm = raw_nrm.astype(np.float32)
    out_uv = raw_uv.astype(np.float32)
    out_j = top4_j[u_inv]
    out_w = top4_w[u_inv]
    out_idx = raw_idx

    out_pos.tofile(wdir / "out_pos.bin")
    out_nrm.tofile(wdir / "out_nrm.bin")
    out_uv.tofile(wdir / "out_uv.bin")
    out_j.tofile(wdir / "out_j.bin")
    out_w.tofile(wdir / "out_w.bin")
    out_idx.tofile(wdir / "out_idx.bin")

    base_out, norm_out, mr_out = bake_parametric_atlas(
        P, head_pos, head_uv, head_idx, hi_pos, hi_uv, hi_idx, tex_sz
    )
    base_out.save(wdir / "out_tex.jpg", quality=90, optimize=True)
    norm_out.save(wdir / "out_norm.jpg", quality=86, optimize=True)
    mr_out.save(wdir / "out_mr.jpg", quality=85, optimize=True)
    print(f"parametric modular build: {len(out_idx)} tris ({', '.join(summary)}), {len(out_pos)} verts")


def main():
    if len(sys.argv) > 1 and not sys.argv[1].startswith("--"):
        build_parametric_workdir(Path(sys.argv[1]), int(sys.argv[2]) if len(sys.argv) > 2 else 2048)
    else:
        env = dict(**__import__("os").environ, PYTHON=sys.executable)
        subprocess.run(
            [
                "node",
                "build.mjs",
                "--raw",
                "../meshy/raw-bigface",
                "--parametric",
                "--pbr",
                "--tex",
                "2048",
                "../../../public/models/grandma-mali-parametric.glb",
            ],
            cwd=HERE,
            env=env,
            check=True,
        )


if __name__ == "__main__":
    main()
