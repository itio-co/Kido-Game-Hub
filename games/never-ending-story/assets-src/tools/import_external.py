"""Normalise a model from an external tool and compare it with the asset's reference.

    blender -b --python games/never-ending-story/assets-src/tools/import_external.py -- \
        <asset_dir> <model.glb|.gltf|.obj|.fbx|.ply|.stl> [options]

Options:
    --out DIR          output folder (default: <model folder>/compare)
    --name NAME        label / file prefix (default: model file stem)
    --rot X,Y,Z        extra rotation in degrees applied first (fix a model lying on its side)
    --yaw auto|DEG     turn around the vertical axis so the front faces the camera (default: auto =
                       best silhouette IoU; front vs back can be close, check yaw-candidates.png)
    --fit box|height|none
                       box: scale each axis to asset.json boundingBoxCm (or dimensionsCm) (default)
                       height: uniform scale to the height only (keeps proportions)
                       none: keep the size as imported
    --samples N        Cycles samples for the final render (default 48)
    --scale N          render at N x the reference size (default 4)
    --no-turntable     skip the 4-angle turntable

Reads <asset_dir>/asset.json (boundingBoxCm or dimensionsCm, ref.crop, ref.mask, ref.maskRembg) and the matched camera
<asset_dir>/blender/cam.json (OpenCV R, C in cm, focal p[5], IW, IH). Writes:
    <name>-normalised.glb   upright, front = -Y (glTF +Z), origin at the floor centre, metres
    <name>-render.png       matched-camera render, transparent background
    <name>-side-by-side.png reference | render
    <name>-overlay.png      50 % blend of the render over the reference + cyan outline
    <name>-turntable.png    0 / 90 / 180 / 270 deg
    <name>-yaw-candidates.png  overlays for each yaw tried (auto mode; left to right = yawCandidates)
    <name>-report.json      chosen yaw, scale, bbox, triangles, IoU vs the reference masks
Only Blender's bundled Python (numpy) is needed.
"""
import bpy, json, math, os, sys
import numpy as np
from mathutils import Matrix, Vector, Euler

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if len(argv) < 2:
    print(__doc__); sys.exit(2)
asset_dir = os.path.abspath(argv[0]); model = os.path.abspath(argv[1])
opts = {'out': None, 'name': None, 'rot': '0,0,0', 'yaw': 'auto', 'fit': 'box', 'samples': '48', 'scale': '4'}
flags = set(); i = 2
while i < len(argv):
    a = argv[i]
    if a == '--no-turntable': flags.add(a); i += 1; continue
    if a.startswith('--') and a[2:] in opts and i + 1 < len(argv): opts[a[2:]] = argv[i + 1]; i += 2; continue
    raise SystemExit(f'unknown option {a}')
name = opts['name'] or os.path.splitext(os.path.basename(model))[0]
out = os.path.abspath(opts['out'] or os.path.join(os.path.dirname(model), 'compare'))
os.makedirs(out, exist_ok=True)
P = lambda f: os.path.join(out, f'{name}-{f}')

asset = json.load(open(os.path.join(asset_dir, 'asset.json')))
dims = asset['dimensionsCm']
bb = asset.get('boundingBoxCm') or {'min': [-dims['width'] / 2, -dims['depth'] / 2, 0], 'max': [dims['width'] / 2, dims['depth'] / 2, dims['height']]}
BMIN, BMAX = np.array(bb['min']) / 100, np.array(bb['max']) / 100
TW, TD, TH = (BMAX - BMIN).tolist()
cam = json.load(open(os.path.join(asset_dir, 'blender', 'cam.json')))
IW, IH, F = cam['IW'], cam['IH'], cam['p'][5]
ref_path = os.path.join(asset_dir, asset['ref']['crop'])
masks = {k: os.path.join(asset_dir, asset['ref'][k]) for k in ('mask', 'maskRembg') if asset['ref'].get(k)}

# ---------- scene ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
ext = os.path.splitext(model)[1].lower()
if ext in ('.glb', '.gltf'): bpy.ops.import_scene.gltf(filepath=model)
elif ext == '.obj': bpy.ops.wm.obj_import(filepath=model)
elif ext == '.fbx': bpy.ops.import_scene.fbx(filepath=model)
elif ext == '.ply': bpy.ops.wm.ply_import(filepath=model)
elif ext == '.stl': bpy.ops.wm.stl_import(filepath=model)
else: raise SystemExit(f'unsupported file type {ext}')
for o in list(sc.objects):
    if o.type in ('CAMERA', 'LIGHT'): bpy.data.objects.remove(o)
meshes = [o for o in sc.objects if o.type == 'MESH']
if not meshes: raise SystemExit('no mesh in the file')
bpy.ops.object.select_all(action='DESELECT')
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1: bpy.ops.object.join()
obj = bpy.context.view_layer.objects.active
obj.parent = None; obj.rotation_mode = 'XYZ'  # glTF imports use quaternions
for o in list(sc.objects):
    if o is not obj: bpy.data.objects.remove(o)
bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
rx, ry, rz = [math.radians(float(v)) for v in opts['rot'].split(',')]
obj.data.transform(Euler((rx, ry, rz), 'XYZ').to_matrix().to_4x4())
obj.data.update()
tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
base = np.array([v.co[:] for v in obj.data.vertices])
bbox_in = (base.max(0) - base.min(0)).tolist()

def place(yaw_deg):
    """Rotate about Z, scale per --fit, origin to the floor centre. Returns the scale used."""
    c, s = math.cos(math.radians(yaw_deg)), math.sin(math.radians(yaw_deg))
    v = base @ np.array([[c, s, 0], [-s, c, 0], [0, 0, 1]])
    lo, hi = v.min(0), v.max(0); size = np.maximum(hi - lo, 1e-9)
    if opts['fit'] == 'box': k = np.array([TW, TD, TH]) / size
    elif opts['fit'] == 'height': k = np.full(3, TH / size[2])
    else: k = np.ones(3)
    if opts['fit'] == 'box':
        v = (v - lo) * k + BMIN                      # fill the target bounding box exactly
    else:
        ctr = np.array([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]])
        tgt = np.array([(BMIN[0] + BMAX[0]) / 2, (BMIN[1] + BMAX[1]) / 2, 0.0])
        v = (v - ctr) * k + tgt
    obj.data.vertices.foreach_set('co', v.astype(np.float32).ravel()); obj.data.update()
    return k.tolist()

# camera + light (same as the asset's render.py)
R = Matrix(cam['R']); C = Vector(cam['C']) * 0.01
cd = bpy.data.cameras.new('MatchCam'); cd.sensor_fit = 'HORIZONTAL'; cd.sensor_width = 36; cd.lens = F / IW * 36
# principal point from a camera-match export (cx/cy px); Blender shift is in units of the image width
cd.shift_x = (IW / 2 - cam.get('cx', IW / 2)) / IW; cd.shift_y = (cam.get('cy', IH / 2) - IH / 2) / IW
cd.clip_start = 0.1; cd.clip_end = 100
co = bpy.data.objects.new('MatchCam', cd); sc.collection.objects.link(co)
co.matrix_world = Matrix.Translation(C) @ (R.transposed() @ Matrix(((1, 0, 0), (0, -1, 0), (0, 0, -1)))).to_4x4()
sc.camera = co
sd = bpy.data.lights.new('Key', 'SUN'); sd.energy = 4.0; sd.color = (1.0, 0.86, 0.70); sd.angle = math.radians(3)
so = bpy.data.objects.new('Key', sd); sc.collection.objects.link(so)
so.rotation_euler = Vector((-1.3, -0.7, 1.9)).to_track_quat('Z', 'Y').to_euler()
wd = bpy.data.worlds.new('W'); wd.use_nodes = True
wd.node_tree.nodes['Background'].inputs[0].default_value = (1.0, 0.85, 0.7, 1)
wd.node_tree.nodes['Background'].inputs[1].default_value = 0.35
sc.world = wd
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'
sc.render.film_transparent = True; sc.view_settings.view_transform = 'Standard'
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
sc.render.resolution_percentage = 100

def render(path, s, samples, denoise=True):
    sc.render.resolution_x, sc.render.resolution_y = IW * s, IH * s
    sc.cycles.samples = samples; sc.cycles.use_denoising = denoise
    sc.render.filepath = path; bpy.ops.render.render(write_still=True)
    return load(path)

def load(path, size=None):
    """Image as float RGBA, top row first."""
    im = bpy.data.images.load(path, check_existing=False)
    if size and tuple(im.size) != size: im.scale(*size)
    w, h = im.size; a = np.empty(w * h * 4, np.float32); im.pixels.foreach_get(a)
    bpy.data.images.remove(im)
    return a.reshape(h, w, 4)[::-1].copy()

def save(arr, path):
    h, w = arr.shape[:2]
    im = bpy.data.images.new('tmp', w, h, alpha=True)
    rgba = np.ones((h, w, 4), np.float32); rgba[..., :arr.shape[2]] = arr
    im.pixels.foreach_set(rgba[::-1].ravel()); im.filepath_raw = path; im.file_format = 'PNG'; im.save()
    bpy.data.images.remove(im)

def iou(a, b): return float((a & b).sum() / max((a | b).sum(), 1))

def edges(g):
    gx = np.zeros_like(g); gy = np.zeros_like(g)
    gx[:, 1:-1] = g[:, 2:] - g[:, :-2]; gy[1:-1] = g[2:] - g[:-2]
    return np.hypot(gx, gy)

def blur(g, n=2):
    for _ in range(n):
        p = np.pad(g, 1, mode='edge')
        g = (p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:] + 4 * g) / 8
    return g

def ncc(a, b, m):
    a = a[m] - a[m].mean(); b = b[m] - b[m].mean()
    return float((a * b).sum() / (np.sqrt((a * a).sum() * (b * b).sum()) + 1e-9))

tmp = os.path.join(out, f'.{name}-probe.png')
gray = lambda x: x[..., :3] @ np.array([0.299, 0.587, 0.114], np.float32)

# ---------- yaw ----------
scores = {}; ambiguous = False
if opts['yaw'] == 'auto':
    # Silhouette IoU decides. Appearance scores (grey / edge NCC) were tried and preferred the back view
    # of the nightstand, so they are only reported. Front vs back is often close for furniture: when the
    # best two are within 0.015 the report says "ambiguous" and the candidates are saved for a visual check.
    cands = [0, 90, 180, 270]
    sx, sy = bbox_in[0], bbox_in[1]
    if abs(sx - sy) / max(sx, sy) > 0.1 and abs(TW - TD) / max(TW, TD) > 0.1:
        long_x = sx > sy
        cands = [0, 180] if long_x == (TW >= TD) else [90, 270]
    tiles = []
    for y in cands:
        place(y)
        r = render(tmp, 2, 16, True)
        sil = r[..., 3] > 0.5
        mk = load(masks['mask'], (sil.shape[1], sil.shape[0]))[..., 0] > 0.5 if 'mask' in masks else sil
        rf = load(ref_path, (sil.shape[1], sil.shape[0]))
        m = sil & mk
        g_r, g_f = gray(r), gray(rf)
        scores[y] = {'iou': round(iou(sil, mk), 4),
                     'grayNcc': round(ncc(g_r, g_f, m), 4) if m.sum() > 50 else 0.0,
                     'edgeNcc': round(ncc(blur(edges(g_r) * m), blur(edges(g_f) * m), m), 4) if m.sum() > 50 else 0.0}
        print(f'yaw {y}: {scores[y]}')
        ov = 0.5 * rf[..., :3] + 0.5 * (r[..., :3] * r[..., 3:] + rf[..., :3] * (1 - r[..., 3:]))
        tiles.append(ov)
    order = sorted(cands, key=lambda k: -scores[k]['iou'])
    yaw = order[0]
    ambiguous = len(order) > 1 and scores[order[0]]['iou'] - scores[order[1]]['iou'] < 0.015
    if ambiguous: print(f'WARNING: yaw {order[0]} vs {order[1]} is close; check {name}-yaw-candidates.png, rerun with --yaw if wrong')
    th, tw = tiles[0].shape[:2]
    sheet = np.ones((th, (tw + 10) * len(tiles) - 10, 3), np.float32)
    for j, t in enumerate(tiles): sheet[:, j * (tw + 10):j * (tw + 10) + tw] = t
    save(sheet, P('yaw-candidates.png'))
    if os.path.exists(tmp): os.remove(tmp)
else:
    yaw = float(opts['yaw'])
k = place(yaw)
v = np.array([vv.co[:] for vv in obj.data.vertices]); bbox_out = (v.max(0) - v.min(0)).tolist()

# ---------- export ----------
bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=P('normalised.glb'), use_selection=True, export_format='GLB', export_apply=True)

# ---------- matched render + compare ----------
S = int(opts['scale'])
r = render(P('render.png'), S, int(opts['samples']))
h, w = r.shape[:2]
ref = load(ref_path, (w, h))
bg = np.array([236, 214, 190], np.float32) / 255
over_bg = r[..., :3] * r[..., 3:] + bg * (1 - r[..., 3:])
gap = 10
sbs = np.ones((h, w * 2 + gap, 3), np.float32); sbs[:, :w] = ref[..., :3]; sbs[:, w + gap:] = over_bg
save(sbs, P('side-by-side.png'))
over_ref = r[..., :3] * r[..., 3:] + ref[..., :3] * (1 - r[..., 3:])
ov = 0.5 * ref[..., :3] + 0.5 * over_ref
sil = r[..., 3] > 0.5
edge = sil ^ (np.pad(sil, 1, mode='edge')[:-2, 1:-1] & np.pad(sil, 1, mode='edge')[2:, 1:-1]
              & np.pad(sil, 1, mode='edge')[1:-1, :-2] & np.pad(sil, 1, mode='edge')[1:-1, 2:])
ov[edge] = (0, 1, 1)
save(ov, P('overlay.png'))
ious = {}
for key, mp in masks.items():
    ious[key] = round(iou(sil, load(mp, (w, h))[..., 0] > 0.5), 4)

# ---------- turntable ----------
if '--no-turntable' not in flags:
    tiles = []
    for a in (0, 90, 180, 270):
        obj.rotation_euler = (0, 0, math.radians(a))
        t = render(tmp, 2, 24)
        tiles.append(t[..., :3] * t[..., 3:] + bg * (1 - t[..., 3:]))
    obj.rotation_euler = (0, 0, 0)
    th, tw = tiles[0].shape[:2]
    tt = np.ones((th, tw * 4 + gap * 3, 3), np.float32)
    for j, t in enumerate(tiles): tt[:, j * (tw + gap):j * (tw + gap) + tw] = t
    save(tt, P('turntable.png'))
    if os.path.exists(tmp): os.remove(tmp)

report = {'model': model, 'asset': asset.get('slug'), 'triangles': tris, 'rotDeg': opts['rot'], 'yawDeg': yaw,
          'yawScores': scores, 'yawCandidates': list(scores), 'yawAmbiguous': ambiguous, 'fit': opts['fit'], 'scale': k, 'bboxInput': bbox_in, 'bboxOutputM': bbox_out,
          'targetM': [TW, TD, TH], 'iou': ious, 'outputs': sorted(f for f in os.listdir(out) if f.startswith(name + '-'))}
json.dump(report, open(P('report.json'), 'w'), indent=2, ensure_ascii=False)
print('REPORT', json.dumps(report, ensure_ascii=False))
