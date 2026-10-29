#!/usr/bin/env python3
"""
Transplant the 6k meshoptimizer-QEM head (grandma-mali-6k.glb: face + silver hair above the neck)
onto the Tripo3D 42k smoothed body (grandma-mali-tripo-smooth.glb), replacing the Tripo head.

Invoked by `build_headswap.mjs` with `<work_dir>` holding raw dumps of both GLBs
(`tripo/*.bin`, `m6k/*.bin`: pos, uv, j, w, idx, ibm in each file's own mesh space).

Alignment (all done in the Tripo mesh space):
1. 6k head verts are first mapped rigidly through the Head bone (inv(IBM_tripo[Head]) @ IBM_6k[Head]).
2. The neck ring (narrowest horizontal section between collar and chin) is measured on both models.
3. The 6k head is uniformly scaled about its neck-ring centre so its neck->crown height is HEAD_SCALE x the
   Tripo head, then translated so its neck ring centre lands exactly on the Tripo neck ring centre
   (so the chin sits where the Tripo chin was: no "head too low" like the 19.4k transplant).
4. The bottom of the 6k neck is radially blended to the Tripo neck radius and pushed into the Tripo collar
   (overlap collar), and the Tripo head/neck tris above the ring are removed.
Head verts are weighted 1.0 to Head (joint 5); the Tripo body keeps its 24-bone weights.
"""
from __future__ import annotations

import sys
from pathlib import Path

import io

import numpy as np
from PIL import Image, ImageDraw

HEAD = 5
COLLAR_Y = 1.205
NECK_SKIN_Y = 1.17  # Tripo neck skin above this is removed (covered by the 6k neck + cardigan collar)  # top of the Tripo cardigan collar (m); Tripo neck skin above it is replaced
HEAD_SCALE = 1.0  # big-face 6k face, same neck->crown height as than the Tripo head (neck->crown)


def _load(d: Path):
    p = np.fromfile(d / "pos.bin", np.float32).reshape(-1, 3).astype(np.float64)
    uv = np.fromfile(d / "uv.bin", np.float32).reshape(-1, 2)
    j = np.fromfile(d / "j.bin", np.uint8).reshape(-1, 4)
    w = np.fromfile(d / "w.bin", np.float32).reshape(-1, 4)
    idx = np.fromfile(d / "idx.bin", np.uint32).reshape(-1, 3)
    ibm = np.fromfile(d / "ibm.bin", np.float32).reshape(-1, 4, 4).transpose(0, 2, 1).astype(np.float64)
    return p, uv, j, w, idx, ibm


def _sstep(x, a, b):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def _neck_ring(p: np.ndarray, y_lo: float, y_hi: float, band: float, max_ax: float):
    """Return (y, cx, cz, r) of the narrowest horizontal section in [y_lo, y_hi]."""
    best = None
    for y in np.arange(y_lo, y_hi, band * 0.5):
        m = (np.abs(p[:, 1] - y) < band) & (np.abs(p[:, 0]) < max_ax)
        if m.sum() < 8:
            continue
        xs, zs = p[m, 0], p[m, 2]
        width = xs.max() - xs.min()
        if best is None or width < best[0]:
            cx = (xs.max() + xs.min()) / 2
            cz = (zs.max() + zs.min()) / 2
            best = (width, y, cx, cz, width / 2)
    return best[1:]


def _compact(faces: np.ndarray):
    used, inv = np.unique(faces, return_inverse=True)
    return used, inv.reshape(-1, 3).astype(np.uint32)


def _clean_neck_texture(tex_bytes: bytes, hp: np.ndarray, uv: np.ndarray, faces: np.ndarray, y_max: float) -> bytes:
    """The 6k cutout texture has the purple cardigan collar baked onto the neck; repaint it as neck skin."""
    im = np.asarray(Image.open(io.BytesIO(tex_bytes)).convert("RGB")).astype(np.float32)
    H, W, _ = im.shape
    mask = Image.new("L", (W, H), 0)
    dr = ImageDraw.Draw(mask)
    for tri in faces[hp[faces].min(axis=1)[:, 1] < y_max]:
        dr.polygon([(float(uv[v, 0]) * W, float(uv[v, 1]) * H) for v in tri], fill=255)
    m = np.asarray(mask.convert("L")) > 0
    m = np.asarray(Image.fromarray(m.astype(np.uint8) * 255).filter(__import__("PIL.ImageFilter").ImageFilter.MaxFilter(5))) > 0
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    purple = m & (b > g + 2)
    skin = im[m & ~purple & (r > g + 25)]
    skin_rgb = np.median(skin, axis=0) if len(skin) > 20 else np.array([221.0, 176.0, 147.0])
    im[purple] = skin_rgb * (0.92 + 0.08 * (im[purple].mean(axis=1, keepdims=True) / 255.0))
    buf = io.BytesIO()
    Image.fromarray(np.clip(im, 0, 255).astype(np.uint8)).save(buf, format="JPEG", quality=92)
    print(f"neck texture: repainted {int(purple.sum())} collar texels as skin {np.round(skin_rgb)}")
    return buf.getvalue()


def main(work: Path) -> None:
    pt, uvt, jt, wt, it, It = _load(work / "tripo")
    p6, uv6, j6, w6, i6, I6 = _load(work / "m6k")

    # Tripo mesh space is quantized to [-1, 1] over 1.55 m height: metres = (p + [0,1,0]) * 0.775.
    S = 0.775
    to_m = lambda p: (p + [0.0, 1.0, 0.0]) * S
    from_m = lambda p: p / S - [0.0, 1.0, 0.0]

    M = np.linalg.inv(It[HEAD]) @ I6[HEAD]
    h = to_m((np.c_[p6, np.ones(len(p6))] @ M.T)[:, :3])
    b = to_m(pt)

    # Neck rings (metres). Exclude shoulders/arms by |x| and look between collar and chin.
    yt, cxt, czt, rt = _neck_ring(b, 1.19, 1.26, 0.006, 0.13)
    y6, cx6, cz6, r6 = _neck_ring(h, 1.16, 1.24, 0.006, 0.13)
    top_t = b[:, 1].max()
    top_6 = h[:, 1].max()
    s = HEAD_SCALE * (top_t - yt) / (top_6 - y6)
    print(f"tripo neck y={yt:.3f} c=({cxt:.3f},{czt:.3f}) r={rt:.3f} top={top_t:.3f}")
    print(f"6k    neck y={y6:.3f} c=({cx6:.3f},{cz6:.3f}) r={r6:.3f} top={top_6:.3f} scale={s:.3f}")

    # Depth (z) is centred on the head bounding boxes above the chin (the neck-ring z centre is biased by
    # the chin overhang); x/y use the neck ring so the chin sits exactly at the Tripo neck height.
    hb = b[(b[:, 1] > yt + 0.03) & (np.abs(b[:, 0]) < 0.2)]
    h6 = h[h[:, 1] > y6 + 0.03]
    bz_t = (hb[:, 2].max() + hb[:, 2].min()) / 2
    bz_6 = (h6[:, 2].max() + h6[:, 2].min()) / 2
    c6 = np.array([cx6, y6, bz_6])
    ct = np.array([cxt, yt, bz_t])
    hp = (h - c6) * s + ct
    neck_h = (np.array([cx6, y6, cz6]) - c6) * s + ct  # 6k neck-ring centre after placement

    # Cut the 6k head: keep tris whose centroid is above (neck ring - 1.6 cm) in the scaled space.
    cut_h = COLLAR_Y - 0.008
    tc6 = hp[i6].mean(axis=1)
    rad6 = np.hypot(tc6[:, 0] - neck_h[0], tc6[:, 2] - neck_h[2])
    # Drop the 6k shoulder/collar flaps below the chin: only the neck tube (r <= 1.2 x neck radius) is kept there.
    keep6 = (tc6[:, 1] >= cut_h) & ((tc6[:, 1] >= yt - 0.004) | (rad6 <= 1.2 * r6 * s))
    used6, f6 = _compact(i6[keep6])
    hp = hp[used6]

    # Radially fit the lower neck to the Tripo neck radius (+4 mm so it covers the Tripo cut edge),
    # fading to the head's own shape 2.5 cm above the ring; sink the bottom rim 6 mm into the collar.
    r_target = rt + 0.004
    t = 1.0 - _sstep(hp[:, 1], COLLAR_Y + 0.006, yt - 0.004)  # below the chin only
    k = r_target / (r6 * s)
    for ax, c_t in ((0, cxt), (2, neck_h[2])):
        fitted = c_t + (hp[:, ax] - neck_h[ax]) * k
        hp[:, ax] = hp[:, ax] * (1.0 - t) + fitted * t
    hp[:, 1] -= 0.004 * (1.0 - _sstep(hp[:, 1], cut_h, yt))

    # Remove the Tripo head: tris above the neck ring (+5 mm), but keep the shoulders/arms (|x| large).
    cb = b[it].mean(axis=1)
    remove = ((cb[:, 1] > yt + 0.005) & ~((np.abs(cb[:, 0]) > 0.16) & (cb[:, 1] < 1.24))) | (
        (cb[:, 1] > COLLAR_Y) & (np.abs(cb[:, 0] - cxt) < 0.075) & (cb[:, 2] > czt - 0.09)  # incl. the Tripo chin underside
    )
    # Remaining Tripo neck skin a little wider than the neck box (left/right of the chin).
    remove |= (cb[:, 1] > COLLAR_Y - 0.006) & (np.abs(cb[:, 0] - cxt) < 0.085) & (cb[:, 2] > czt - 0.09)
    usedt, ft = _compact(it[~remove])

    out = work / "out"
    out.mkdir(exist_ok=True)
    from_m(b[usedt]).astype(np.float32).tofile(out / "body_pos.bin")
    uvt[usedt].astype(np.float32).tofile(out / "body_uv.bin")
    jt[usedt].astype(np.uint8).tofile(out / "body_j.bin")
    wt[usedt].astype(np.float32).tofile(out / "body_w.bin")
    ft.tofile(out / "body_idx.bin")

    n = len(hp)
    hj = np.zeros((n, 4), np.uint8)
    hj[:, 0] = HEAD
    hw = np.zeros((n, 4), np.float32)
    hw[:, 0] = 1.0
    from_m(hp).astype(np.float32).tofile(out / "head_pos.bin")
    uv6[used6].astype(np.float32).tofile(out / "head_uv.bin")
    hj.tofile(out / "head_j.bin")
    hw.tofile(out / "head_w.bin")
    f6.tofile(out / "head_idx.bin")
    tex = (work / "m6k" / "tex.bin").read_bytes()
    (out / "head_tex.jpg").write_bytes(_clean_neck_texture(tex, hp, uv6[used6], f6, yt + 0.02))
    print(
        f"head: {n}v/{len(f6)}t (chin-ring y={yt:.3f}, crown y={hp[:, 1].max():.3f}); "
        f"body: {len(usedt)}v/{len(ft)}t; total tris={len(f6) + len(ft)}"
    )


if __name__ == "__main__":
    main(Path(sys.argv[1]))
