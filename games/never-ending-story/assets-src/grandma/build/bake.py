"""Re-bake the base-colour texture onto a simplified (low-poly) mesh.

Meshy's UV atlas is cut into hundreds of tiny islands (17k of 21k vertices sit on a UV seam), so QEM
simplification below ~6.5k triangles has to collapse across seams and the original UVs smear. For those LODs
build.mjs (--bake) hands the low-poly rest-pose mesh to this script, which
  1. unwraps it with xatlas (new UVs, a few vertices duplicated along the new seams),
  2. for every texel of the new atlas finds the matching point on the original high-poly surface
     (nearest of dense surface samples, preferring samples whose normal faces the same way), and
  3. copies the colour from the original 2048 texture, then pads the charts so mipmaps don't bleed.

Usage: python bake.py <workdir> <size>   (workdir holds the *.bin / tex files written by build.mjs)
Needs: numpy scipy xatlas pillow (see requirements.txt).
"""
import io
import sys
from pathlib import Path

import numpy as np
import xatlas
from PIL import Image
from scipy import ndimage
from scipy.spatial import cKDTree

W = Path(sys.argv[1])
SIZE = int(sys.argv[2]) if len(sys.argv) > 2 else 1024
SAMPLES = 4_000_000
rng = np.random.default_rng(1)


def load(name, dtype, cols):
    return np.fromfile(W / name, dtype=dtype).reshape(-1, cols)


hi_pos = load("hi_pos.bin", np.float32, 3).astype(np.float64)
hi_idx = load("hi_idx.bin", np.uint32, 3)
hi_uv = load("hi_uv.bin", np.float32, 2).astype(np.float64)
lo_pos = load("lo_pos.bin", np.float32, 3)
lo_idx = load("lo_idx.bin", np.uint32, 3)
src = np.asarray(Image.open(io.BytesIO((W / "src_tex").read_bytes())).convert("RGB"), dtype=np.float32)
SH, SW = src.shape[:2]

# 1. Unwrap the low-poly mesh.
atlas = xatlas.Atlas()
atlas.add_mesh(lo_pos, lo_idx)
chart = xatlas.ChartOptions()
pack = xatlas.PackOptions()
pack.resolution = SIZE
pack.padding = 4
pack.bilinear = True
pack.bruteForce = False
atlas.generate(chart, pack)
vmap, idx, uv = atlas[0]
print(f"xatlas: {len(lo_pos)} -> {len(vmap)} verts, {atlas.chart_count} charts, utilisation {float(np.ravel(atlas.utilization)[0]):.2f}")

# 2. Dense samples of the high-poly surface (position, normal, uv).
a, b, c = (hi_pos[hi_idx[:, k]] for k in range(3))
cross = np.cross(b - a, c - a)
area = np.linalg.norm(cross, axis=1)
fn = cross / np.maximum(area[:, None], 1e-12)
tri = rng.choice(len(hi_idx), SAMPLES, p=area / area.sum())
r1, r2 = rng.random(SAMPLES), rng.random(SAMPLES)
s = np.sqrt(r1)
w0, w1, w2 = 1 - s, s * (1 - r2), s * r2
spos = w0[:, None] * a[tri] + w1[:, None] * b[tri] + w2[:, None] * c[tri]
ti = hi_idx[tri]
suv = w0[:, None] * hi_uv[ti[:, 0]] + w1[:, None] * hi_uv[ti[:, 1]] + w2[:, None] * hi_uv[ti[:, 2]]
snrm = fn[tri]
tree = cKDTree(spos)

# 3. Rasterise the new atlas: texel centre -> barycentric -> low-poly position / face normal.
P = lo_pos[vmap].astype(np.float64)
T = uv.astype(np.float64) * SIZE - 0.5
lo_fn = np.cross(P[idx[:, 1]] - P[idx[:, 0]], P[idx[:, 2]] - P[idx[:, 0]])
lo_fn /= np.maximum(np.linalg.norm(lo_fn, axis=1)[:, None], 1e-12)
px, pts, nrm = [], [], []
for f, (i0, i1, i2) in enumerate(idx):
    t0, t1, t2 = T[i0], T[i1], T[i2]
    x0, y0 = np.floor(np.minimum(np.minimum(t0, t1), t2)).astype(int) - 1
    x1, y1 = np.ceil(np.maximum(np.maximum(t0, t1), t2)).astype(int) + 1
    xs, ys = np.meshgrid(np.arange(max(x0, 0), min(x1, SIZE - 1) + 1), np.arange(max(y0, 0), min(y1, SIZE - 1) + 1))
    q = np.stack([xs.ravel(), ys.ravel()], 1).astype(np.float64)
    m = np.array([[t1[0] - t0[0], t2[0] - t0[0]], [t1[1] - t0[1], t2[1] - t0[1]]])
    det = np.linalg.det(m)
    if abs(det) < 1e-12:
        continue
    l12 = np.linalg.solve(m, (q - t0).T).T
    l0 = 1 - l12.sum(1)
    bary = np.column_stack([l0, l12])
    inside = (bary >= -0.02).all(1)  # slight dilation so chart edges are covered
    if not inside.any():
        continue
    bary = np.clip(bary[inside], 0, None)
    bary /= bary.sum(1, keepdims=True)
    px.append(q[inside].astype(int))
    pts.append(bary[:, :1] * P[i0] + bary[:, 1:2] * P[i1] + bary[:, 2:] * P[i2])
    nrm.append(np.repeat(lo_fn[f][None], inside.sum(), 0))
px, pts, nrm = np.concatenate(px), np.concatenate(pts), np.concatenate(nrm)

# Nearest samples, preferring ones facing the same side (avoids picking the inside of an arm / the other leg).
K = 8
dist, nn = tree.query(pts, k=K, workers=-1)
facing = (snrm[nn] * nrm[:, None, :]).sum(2) > 0.2
score = dist + np.where(facing, 0, dist.max(1, keepdims=True) * 4 + 1e-6)
best = nn[np.arange(len(nn)), score.argmin(1)]
u = suv[best]
# glTF UVs: (0,0) = top-left of the image.
sx = np.clip(u[:, 0] * SW - 0.5, 0, SW - 1)
sy = np.clip(u[:, 1] * SH - 0.5, 0, SH - 1)
x0i, y0i = np.floor(sx).astype(int), np.floor(sy).astype(int)
x1i, y1i = np.minimum(x0i + 1, SW - 1), np.minimum(y0i + 1, SH - 1)
fx, fy = (sx - x0i)[:, None], (sy - y0i)[:, None]
col = (src[y0i, x0i] * (1 - fx) * (1 - fy) + src[y0i, x1i] * fx * (1 - fy) + src[y1i, x0i] * (1 - fx) * fy
       + src[y1i, x1i] * fx * fy)

out = np.zeros((SIZE, SIZE, 3), np.float32)
filled = np.zeros((SIZE, SIZE), bool)
out[px[:, 1], px[:, 0]] = col
filled[px[:, 1], px[:, 0]] = True
# Pad: every empty texel takes the colour of the nearest filled one.
_, (iy, ix) = ndimage.distance_transform_edt(~filled, return_indices=True)
out = out[iy, ix]
print(f"baked {filled.sum()} texels ({filled.mean():.0%}), median sample distance {np.median(dist[:, 0]):.4g}")

buf = io.BytesIO()
Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8)).save(buf, "JPEG", quality=85, optimize=True)
(W / "out_tex.jpg").write_bytes(buf.getvalue())
vmap.astype(np.uint32).tofile(W / "out_vmap.bin")
idx.astype(np.uint32).tofile(W / "out_idx.bin")
uv.astype(np.float32).tofile(W / "out_uv.bin")
