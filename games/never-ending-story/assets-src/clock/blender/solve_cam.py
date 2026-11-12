"""Approximate a pinhole camera from eight manually picked front-rim landmarks.

The small painted reference cannot determine physical size or a unique lens. Keep
42 cm height and a 220 px focal length as explicit artist assumptions; optimize
only pose, not shape. Requires numpy, scipy and Pillow, but not Blender.
"""
from pathlib import Path
import json
import numpy as np
from scipy.optimize import least_squares
from scipy.spatial.transform import Rotation
from PIL import Image

HERE = Path(__file__).resolve().parent
ASSET = HERE.parent
GAME = ASSET.parent.parent
W, H, D = 38, 42, 5.4
IW, IH, F = 96, 108, 220
# The original full-image crop is retained without repainting or upscaling.
Image.open(GAME / 'public/img/living-wide.jpg').crop((48, 108, 144, 216)).save(ASSET / 'ref/clock-ref.png')
Image.open(ASSET / 'ref/clock-ref.png').save(GAME / 'public/showcase/clock-ref.png')
# Clockwise from the upper-left corner; source-image pixel coordinates.
image = np.array([[88, 124], [112, 130], [130, 153], [131, 184],
                  [112, 205], [85, 201], [68, 178], [68, 144]], dtype=float) - [48, 108]
q = (2**.5 - 1) / 2
shape = [(-q, .5), (q, .5), (.5, q), (.5, -q),
         (q, -.5), (-q, -.5), (-.5, -q), (-.5, q)]
world = np.array([[x*W, -D/2+.65, (z+.5)*H] for x,z in shape])

def project(p):
    R = Rotation.from_rotvec(p[:3]).as_matrix()
    camera = world @ R.T + p[3:]
    return F * camera[:, :2] / camera[:, 2:] + [IW/2, IH/2]

initial = [np.pi/2, 0, 0, 0, 21, 115]
fit = least_squares(lambda p: (project(p)-image).ravel(), initial, max_nfev=3000)
R = Rotation.from_rotvec(fit.x[:3]).as_matrix()
C = -R.T @ fit.x[3:]
errors = np.linalg.norm(project(fit.x)-image, axis=1)
B = np.array([[1,0,0],[0,0,1],[0,-1,0]])
flip = np.diag([1,-1,-1])
M = B @ R.T @ flip
camera = {
    'p': [W,D,3.4,0,0,F,*fit.x.tolist()], 'R': R.tolist(), 'C': C.tolist(),
    'IW': IW, 'IH': IH, 'H': H, 'cx': IW/2, 'cy': IH/2,
    'fitNotes': 'Approximate pose from hand-picked front-rim corners. Focal length and physical size are assumed, not calibrated.',
    'rmsPx': float(np.sqrt(np.mean(errors**2))),
    'three': {'hfovDeg': float(np.degrees(2*np.arctan(IW/2/F))),
              'position': (B @ C / 100).tolist(),
              'quaternion': Rotation.from_matrix(M).as_quat().tolist()},
    'landmarks': [{'id': f'Rim{i+1:02}', 'p': p.tolist(), 'pixel': xy.tolist()}
                  for i,(p,xy) in enumerate(zip(world,image))]
}
( HERE / 'cam.json').write_text(json.dumps(camera, indent=2)+'\n')
print(json.dumps({'rmsPx': camera['rmsPx'], 'three': camera['three']}, indent=2))
