#!/usr/bin/env python3
"""Regenerate livingroom_v2 normals from colour+alpha using relief classes in normals.json.
Does not touch colour images. Writes comparison sheets under verify/.
"""
from __future__ import annotations
import json, math
from pathlib import Path
import numpy as np, cv2
from PIL import Image

ROOT = Path('/workspace/nes-lowpoly2d/livingroom_v2')
OBJ = ROOT / 'objects'
OLD = ROOT / '_work/normals_old'
VERIFY = ROOT / 'verify'
VERIFY.mkdir(exist_ok=True)

CFG = json.load(open(OBJ / 'normals.json'))
LAYOUT = json.load(open(OBJ / 'layout.json'))
LIGHT = LAYOUT['light']
W, H = LAYOUT['canvas']

CLASS_OF = {}
for cls, names in CFG['classes'].items():
    for n in names:
        CLASS_OF[n] = cls


def class_of(name: str) -> str:
    return CLASS_OF.get(name, CFG.get('default', 'low'))


def encode_n(n: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """n xyz float in [-1,1] → RGBA uint8 OpenGL."""
    out = ((n * 0.5 + 0.5) * 255).round().clip(0, 255).astype(np.uint8)
    return np.dstack([out, alpha])


def flat_n(h, w):
    n = np.zeros((h, w, 3), np.float32)
    n[..., 2] = 1.0
    return n


def silhouette_bevel(alpha: np.ndarray, width_px: float, strength: float) -> np.ndarray:
    """Outward-pointing soft bevel from alpha edge. Returns nx,ny,nz deviation from flat."""
    a = (alpha.astype(np.float32) / 255.0)
    # distance inside object
    bin_ = (a > 0.5).astype(np.uint8)
    dist = cv2.distanceTransform(bin_, cv2.DIST_L2, 5).astype(np.float32)
    # gradient of dist → inward normal in image space; flip for outward relief
    gx = cv2.Sobel(dist, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(dist, cv2.CV_32F, 0, 1, ksize=3)
    # bevel weight near edge
    w = np.clip(1.0 - dist / max(width_px, 1e-3), 0, 1)
    w *= (a > 0.05).astype(np.float32)
    # soften
    w = cv2.GaussianBlur(w, (0, 0), max(0.6, width_px / 4))
    # image-y down; OpenGL ny up → flip gy sign for encode later via +gy in ny if we use image coords carefully
    # Use: nx points right for rightward depth increase (into surface from left edge → positive nx on left)
    mag = np.sqrt(gx * gx + gy * gy) + 1e-6
    nx = -(gx / mag) * strength * w   # left edge: dist increases rightward → gx>0 → nx negative? 
    # Want left silhouette to tilt toward light-ish: standard bevel: normal tips outward.
    # Outside is left of left-edge: outward is -X → nx negative on left edge where gx (d dist/dx) > 0
    ny = (gy / mag) * strength * w    # OpenGL +Y up; image gy>0 means dist increases downward → outward is up → +ny
    nz = np.ones_like(nx)
    n = np.stack([nx, ny, nz], -1)
    n /= np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-6)
    # kill outside
    n[a < 0.05] = np.array([0, 0, 1], np.float32)
    return n


def luminance(rgb: np.ndarray) -> np.ndarray:
    return (0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]).astype(np.float32)


def sobel_facets(gray: np.ndarray, strength: float, spike_clip: float = 0.6) -> np.ndarray:
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    # clip spikes
    lim = np.percentile(np.abs(gx), 99) * spike_clip + 1e-3
    gx = np.clip(gx, -lim, lim)
    gy = np.clip(gy, -lim, lim)
    nx = -gx * strength
    ny = gy * strength
    nz = np.ones_like(nx)
    n = np.stack([nx, ny, nz], -1)
    n /= np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-6)
    return n


def blend_normals(a: np.ndarray, b: np.ndarray, w: np.ndarray) -> np.ndarray:
    """w in [0,1] toward b. Renormalize."""
    w = w[..., None] if w.ndim == 2 else w
    n = a * (1 - w) + b * w
    n /= np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-6)
    return n


def make_normal(rgba: np.ndarray, cls: str, name: str) -> np.ndarray:
    rgb = rgba[..., :3].astype(np.float32)
    alpha = rgba[..., 3]
    h, w = alpha.shape
    p = CFG['params'][cls if cls in CFG['params'] else 'low']
    a_f = alpha.astype(np.float32) / 255.0

    if cls == 'flat':
        n = silhouette_bevel(alpha, p['bevel_px'], p['bevel_strength'])
        # force interior to flat
        dist = cv2.distanceTransform((alpha > 128).astype(np.uint8), cv2.DIST_L2, 5)
        interior = dist > (p['bevel_px'] + 0.5)
        n[interior] = np.array([0, 0, 1], np.float32)
        # room_shell: almost entirely flat (walls/floor already painted; tiny trim bevel only on alpha edge — shell is opaque full frame)
        if name == 'room_shell':
            n = flat_n(h, w)
            # very subtle large-scale shading from heavily blurred luminance only at ultra-low strength
            g = luminance(rgb)
            g = cv2.GaussianBlur(g, (0, 0), 12)
            n2 = sobel_facets(g, strength=0.004, spike_clip=0.3)
            n = blend_normals(n, n2, np.full((h, w), 0.35, np.float32))
        # no bright edge rims: flatten soft alpha fringe
        n[a_f < 0.35] = np.array([0, 0, 1], np.float32)
        return encode_n(n, alpha)

    if cls == 'low':
        # heavy smooth → almost no interior detail
        g = luminance(rgb)
        g = cv2.bilateralFilter(g.astype(np.uint8), p['bilateral_d'], p['bilateral_sigma'], p['bilateral_sigma']).astype(np.float32)
        g = cv2.GaussianBlur(g, (0, 0), 2.5)
        n_int = sobel_facets(g, strength=p['interior_strength'], spike_clip=0.4)
        n_edge = silhouette_bevel(alpha, p['edge_bevel_px'], p['edge_strength'])
        # prefer edge bevel near silhouette, weak interior elsewhere
        dist = cv2.distanceTransform((alpha > 128).astype(np.uint8), cv2.DIST_L2, 5)
        edge_w = np.clip(1.0 - dist / max(p['edge_bevel_px'] * 1.5, 1), 0, 1)
        n = blend_normals(n_int, n_edge, edge_w)
        n[a_f < 0.2] = np.array([0, 0, 1], np.float32)
        return encode_n(n, alpha)

    if cls == 'soft_faceted':
        g = luminance(rgb)
        g = cv2.bilateralFilter(g.astype(np.uint8), p['bilateral_d'], p['bilateral_sigma'], p['bilateral_sigma']).astype(np.float32)
        # kill fabric print: large blur of high-freq
        base = cv2.GaussianBlur(g, (0, 0), 2.0)
        # prior v2 used ~0.045–0.065; scale 0.35 → ~0.016–0.023
        strength = 0.048 * p['strength_scale']
        n = sobel_facets(base, strength=strength, spike_clip=p['spike_clip'])
        # soft edge bevel blend
        n_edge = silhouette_bevel(alpha, 3.5, 0.02)
        dist = cv2.distanceTransform((alpha > 128).astype(np.uint8), cv2.DIST_L2, 5)
        edge_w = np.clip(1.0 - dist / 4.0, 0, 1) * 0.5
        n = blend_normals(n, n_edge, edge_w)
        n[a_f < 0.2] = np.array([0, 0, 1], np.float32)
        return encode_n(n, alpha)

    if cls == 'character':
        g = luminance(rgb)
        g = cv2.bilateralFilter(g.astype(np.uint8), p['bilateral_d'], p['bilateral_sigma'], p['bilateral_sigma']).astype(np.float32)
        base = cv2.GaussianBlur(g, (0, 0), 1.8)
        # Heuristic: upper ~38% of opaque bbox ≈ head/hair
        ys, xs = np.where(alpha > 128)
        n = flat_n(h, w)
        if len(ys):
            y0, y1 = ys.min(), ys.max()
            head_cut = y0 + int(0.38 * (y1 - y0 + 1))
            body_m = np.zeros((h, w), np.float32)
            face_m = np.zeros((h, w), np.float32)
            body_m[head_cut:] = 1
            face_m[:head_cut] = 1
            body_m *= (alpha > 128)
            face_m *= (alpha > 128)
            n_body = sobel_facets(base, strength=0.048 * p['body_strength_scale'], spike_clip=p['spike_clip'])
            n_face = sobel_facets(cv2.GaussianBlur(base, (0, 0), 2.5),
                                  strength=0.048 * p['face_strength_scale'], spike_clip=p['spike_clip'])
            # crow's feet flat: suppress high-freq on mid-face band (eyes region ~ 20–45% of head height)
            if p.get('crows_feet_flat'):
                head_h = max(1, head_cut - y0)
                eye0 = y0 + int(0.22 * head_h)
                eye1 = y0 + int(0.55 * head_h)
                cf = np.zeros((h, w), np.float32)
                cf[eye0:eye1, :] = 1
                cf *= face_m
                # flatten those pixels toward flat
                n_face = blend_normals(n_face, flat_n(h, w), cf * 0.85)
            n = blend_normals(n_body, n_face, face_m)
            # hair: slightly more than face but still soft — use face mask upper third of head
            hair_cut = y0 + int(0.55 * (head_cut - y0 + 1))
            hair_m = np.zeros((h, w), np.float32)
            hair_m[y0:hair_cut] = 1
            hair_m *= (alpha > 128)
            n_hair = sobel_facets(base, strength=0.048 * p['hair_strength_scale'], spike_clip=p['spike_clip'])
            n = blend_normals(n, n_hair, hair_m * 0.7)
        n_edge = silhouette_bevel(alpha, 3.0, 0.018)
        dist = cv2.distanceTransform((alpha > 128).astype(np.uint8), cv2.DIST_L2, 5)
        edge_w = np.clip(1.0 - dist / 3.5, 0, 1) * 0.4
        n = blend_normals(n, n_edge, edge_w)
        n[a_f < 0.2] = np.array([0, 0, 1], np.float32)
        return encode_n(n, alpha)

    # fallback low
    return make_normal(rgba, 'low', name)


def light_vector():
    elev = math.radians(float(LIGHT.get('elevationDeg', 40)))
    # shadows module: shadowAngleDeg = direction shadows fall (0=right, 90=down)
    # incoming light is opposite
    ang = math.radians(float(LIGHT.get('shadowAngleDeg', 300)) - 180)
    return np.array([
        math.cos(elev) * math.cos(ang),
        math.cos(elev) * math.sin(ang),
        math.sin(elev),
    ], np.float32)


LVEC = light_vector()


def relight(rgba: np.ndarray, normal_rgba: np.ndarray) -> np.ndarray:
    rgb = rgba[..., :3].astype(np.float32)
    a = rgba[..., 3:4].astype(np.float32) / 255.0
    n = (normal_rgba[..., :3].astype(np.float32) / 255.0) * 2 - 1
    # normalize
    n /= np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-6)
    ndotl = np.clip((n * LVEC).sum(-1, keepdims=True), 0.0, 1.0)
    # ambient + diffuse matching soft showcase feel
    lit = rgb * (0.45 + 0.55 * ndotl)
    bg = np.full_like(rgb, 36)
    out = bg * (1 - a) + lit * a
    return np.clip(out, 0, 255).astype(np.uint8)


def fit_thumb(im: np.ndarray, s=140) -> np.ndarray:
    if im.ndim == 3 and im.shape[2] == 4:
        bg = np.full((im.shape[0], im.shape[1], 3), 36, np.uint8)
        a = im[..., 3:4] / 255.0
        im = (bg * (1 - a) + im[..., :3] * a).astype(np.uint8)
    h, w = im.shape[:2]
    sc = s / max(h, w)
    im = cv2.resize(im, (max(1, int(w * sc)), max(1, int(h * sc))), interpolation=cv2.INTER_AREA)
    canvas = np.full((s, s, 3), 28, np.uint8)
    y = (s - im.shape[0]) // 2
    x = (s - im.shape[1]) // 2
    canvas[y:y + im.shape[0], x:x + im.shape[1]] = im[..., :3]
    return canvas


def compose_lit(use_old: bool) -> np.ndarray:
    canvas = np.zeros((H, W, 3), np.float32)
    for o in sorted(LAYOUT['objects'], key=lambda x: x['z']):
        name = o['name']
        rgba = np.array(Image.open(OBJ / name / 'color.png').convert('RGBA')).astype(np.float32)
        if use_old:
            npath = OLD / f'{name}.normal.png'
            if not npath.exists():
                npath = OBJ / name / 'normal.png'
            nrgba = np.array(Image.open(npath).convert('RGBA')).astype(np.float32)
        else:
            nrgba = np.array(Image.open(OBJ / name / 'normal.png').convert('RGBA')).astype(np.float32)
        if name == 'room_shell':
            n = (nrgba[..., :3] / 255.0) * 2 - 1
            n /= np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-6)
            ndotl = np.clip((n * LVEC).sum(-1, keepdims=True), 0, 1)
            canvas[:] = rgba[..., :3] * (0.45 + 0.55 * ndotl)
            continue
        x0, y0 = o['bbox'][0], o['bbox'][1]
        ph, pw = rgba.shape[:2]
        xA, yA = max(0, x0), max(0, y0)
        xB, yB = min(W, x0 + pw), min(H, y0 + ph)
        if xB <= xA or yB <= yA:
            continue
        src = rgba[yA - y0:yB - y0, xA - x0:xB - x0]
        ns = nrgba[yA - y0:yB - y0, xA - x0:xB - x0]
        a = src[..., 3:4] / 255.0
        n = (ns[..., :3] / 255.0) * 2 - 1
        n /= np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-6)
        ndotl = np.clip((n * LVEC).sum(-1, keepdims=True), 0, 1)
        lit = src[..., :3] * (0.45 + 0.55 * ndotl)
        canvas[yA:yB, xA:xB] = canvas[yA:yB, xA:xB] * (1 - a) + lit * a
    return np.clip(canvas, 0, 255).astype(np.uint8)


def main():
    rows = []
    assignments = {}
    for o in LAYOUT['objects']:
        name = o['name']
        cls = class_of(name)
        assignments[name] = cls
        rgba = np.array(Image.open(OBJ / name / 'color.png').convert('RGBA'))
        new_n = make_normal(rgba, cls, name)
        Image.fromarray(new_n).save(OBJ / name / 'normal.png')
        old_p = OLD / f'{name}.normal.png'
        old_n = np.array(Image.open(old_p).convert('RGBA')) if old_p.exists() else new_n
        lit_old = relight(rgba, old_n)
        lit_new = relight(rgba, new_n)
        # visualize normals as RGB (drop alpha on dark bg)
        def nvis(nr):
            bg = np.full((*nr.shape[:2], 3), 36, np.uint8)
            a = nr[..., 3:4] / 255.0
            return (bg * (1 - a) + nr[..., :3] * a).astype(np.uint8)
        cells = [fit_thumb(nvis(old_n)), fit_thumb(nvis(new_n)), fit_thumb(lit_old), fit_thumb(lit_new)]
        row = np.concatenate(cells, 1)
        bar = np.full((22, row.shape[1], 3), 18, np.uint8)
        cv2.putText(bar, f'{name}  [{cls}]   oldN | newN | lit-old | lit-new', (6, 15),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.42, (210, 210, 210), 1, cv2.LINE_AA)
        rows.append(np.concatenate([bar, row], 0))
        print(f'{name:16s} → {cls}')

    sheet = np.concatenate(rows, 0)
    Image.fromarray(sheet).save(VERIFY / 'normals_flatten_sheet.png')

    lit_old = compose_lit(True)
    lit_new = compose_lit(False)
    Image.fromarray(lit_old).save(VERIFY / 'lit_old.png')
    Image.fromarray(lit_new).save(VERIFY / 'lit_new.png')
    # side by side with labels
    lab_h = 28
    pair = np.zeros((H + lab_h, W * 2, 3), np.uint8)
    pair[:lab_h] = 20
    cv2.putText(pair, 'lit OLD (bumpy)', (12, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (220, 220, 220), 1, cv2.LINE_AA)
    cv2.putText(pair, 'lit NEW (classed relief)', (W + 12, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (220, 220, 220), 1, cv2.LINE_AA)
    pair[lab_h:, :W] = lit_old
    pair[lab_h:, W:] = lit_new
    Image.fromarray(pair).save(VERIFY / 'lit_old_vs_new.png')

    # export webp normals into game showcase v2
    DST = Path('/workspace/grandma-pr/games/never-ending-story/public/showcase/livingroom-layers-v2')
    if DST.exists():
        for o in LAYOUT['objects']:
            n = o['name']
            Image.open(OBJ / n / 'normal.png').save(DST / f'{n}.normal.webp', lossless=True)
        print('exported normals to', DST)

    json.dump(assignments, open(VERIFY / 'normal_class_assignments.json', 'w'), indent=2)
    print('wrote', VERIFY / 'normals_flatten_sheet.png')
    print('wrote', VERIFY / 'lit_old_vs_new.png')


if __name__ == '__main__':
    main()
