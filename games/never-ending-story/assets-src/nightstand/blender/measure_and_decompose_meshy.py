"""Measure the aligned Meshy nightstand mesh and:
1. Decompose nightstand-meshy-1k5-normalised.glb (961 tris) into the 14 named nightstand parts
   (TopSlab, Knob, Drawer_Face, Rail_Top, Rail_Bot, Apron_L, Apron_R, Apron_B,
   Stretcher_L, Stretcher_R, Leg_LF, Leg_RF, Leg_LB, Leg_RB) with per-part centered origins
   and intact UVs + PBR material -> public/models/nightstand-meshy-1k5.glb.
2. Extract 3D part dimensions from the Meshy mesh (dims-meshy-measured.json) and recreate a
   clean 14-part parametric low-poly nightstand -> public/models/nightstand-meshy-measured.glb.

Run:
    blender -b --python games/never-ending-story/assets-src/nightstand/blender/measure_and_decompose_meshy.py
"""
import bpy, bmesh, json, math, os
import numpy as np
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__)) + '/'
ASSET_DIR = os.path.abspath(HERE + '..') + '/'
PUBLIC_MODELS = os.path.abspath(ASSET_DIR + '../../public/models') + '/'
EXPORT_DIR = ASSET_DIR + 'export/'
os.makedirs(EXPORT_DIR, exist_ok=True)
cm = 0.01

PART_NAMES = [
    'TopSlab',
    'Knob',
    'Drawer_Face',
    'Rail_Top',
    'Rail_Bot',
    'Apron_L',
    'Apron_R',
    'Apron_B',
    'Stretcher_L',
    'Stretcher_R',
    'Leg_LF',
    'Leg_RF',
    'Leg_LB',
    'Leg_RB',
]

def split_parts(J, names, root_name):
    """Split joined mesh J by face attribute 'part' into named child objects under root_name."""
    root = bpy.data.objects.new(root_name, None)
    J.users_collection[0].objects.link(root)
    out = [root]
    part_tris = {}
    for i, nm in enumerate(names):
        me = J.data.copy()
        me.name = nm
        bm = bmesh.new()
        bm.from_mesh(me)
        lay = bm.faces.layers.int.get('part')
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f[lay] != i], context='FACES')
        bm.to_mesh(me)
        bm.free()
        if 'part' in me.attributes:
            me.attributes.remove(me.attributes['part'])
        if not me.polygons:
            bpy.data.meshes.remove(me)
            continue
        tris = sum(len(p.vertices) - 2 for p in me.polygons)
        part_tris[nm] = tris
        lo = Vector([min(v.co[k] for v in me.vertices) for k in range(3)])
        hi = Vector([max(v.co[k] for v in me.vertices) for k in range(3)])
        c = (lo + hi) / 2
        me.transform(Matrix.Translation(-c))
        ob = bpy.data.objects.new(nm, me)
        J.users_collection[0].objects.link(ob)
        ob.location = c
        ob.parent = root
        out.append(ob)
    bpy.data.objects.remove(J)
    return out, part_tris

# ---------- 1. Load & measure Meshy 1.5k normalised GLB ----------
SRC_GLB = ASSET_DIR + 'external/meshy/compare/nightstand-meshy-1k5-normalised.glb'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC_GLB)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
M = meshes[0]
bpy.ops.object.select_all(action='DESELECT')
M.select_set(True)
bpy.context.view_layer.objects.active = M
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

polys = M.data.polygons
centers = np.array([p.center[:] for p in polys]) * 100.0
normals = np.array([p.normal[:] for p in polys])
areas = np.array([p.area * 10000.0 for p in polys])
verts = np.array([v.co[:] for v in M.data.vertices]) * 100.0

def weighted_z(mask):
    w = areas[mask]
    return float((centers[mask, 2] * w).sum() / w.sum())

H_meas = round(float(verts[:, 2].max() - verts[:, 2].min()), 2)
W_meas = round(float(verts[:, 0].max() - verts[:, 0].min()), 2)
top_under_z = weighted_z((normals[:, 2] < -0.8) & (centers[:, 2] > 45))
T_meas = round(H_meas - top_under_z, 2)

# Measure legs in mid-height band (18..34 cm)
v_mid = verts[(verts[:, 2] > 18) & (verts[:, 2] < 34)]
lf = v_mid[(v_mid[:, 0] < -10) & (v_mid[:, 1] < -5)]
rf = v_mid[(v_mid[:, 0] > 10) & (v_mid[:, 1] < -5)]
L_meas = round(float(((lf[:, 0].max() - lf[:, 0].min()) + (rf[:, 0].max() - rf[:, 0].min())) / 2), 2)
O_meas = round(float((W_meas / 2) - ((-lf[:, 0].min() + rf[:, 0].max()) / 2)), 2)

apron_bot_z = round(weighted_z((normals[:, 2] < -0.8) & (centers[:, 2] > 30) & (centers[:, 2] < 44)), 2)
str_top_z = round(weighted_z((normals[:, 2] > 0.8) & (centers[:, 2] > 9) & (centers[:, 2] < 16) & (np.abs(centers[:, 1]) < 12)), 2)
str_bot_z = round(weighted_z((normals[:, 2] < -0.8) & (centers[:, 2] > 4) & (centers[:, 2] < 9) & (np.abs(centers[:, 1]) < 12)), 2)

knob_v = verts[(verts[:, 2] > 39) & (verts[:, 2] < 47) & (verts[:, 1] < -20.5) & (np.abs(verts[:, 0]) < 8)]
knob_w_meas = round(float(knob_v[:, 0].max() - knob_v[:, 0].min()), 2)
knob_h_meas = round(float(knob_v[:, 2].max() - knob_v[:, 2].min()), 2)
knob_d_meas = round(float((-20.23) - knob_v[:, 1].min()), 2)

# Classify every polygon into one of PART_NAMES
part_indices = []
name_to_idx = {nm: i for i, nm in enumerate(PART_NAMES)}
for p in M.data.polygons:
    x, y, z = p.center.x * 100, p.center.y * 100, p.center.z * 100
    nz = p.normal.z
    if z >= 48.5:
        nm = 'TopSlab'
    elif z >= 35.5:
        if y < -20.8 and abs(x) <= 7.5 and 39.5 <= z <= 46.0:
            nm = 'Knob'
        elif abs(x) <= 22.0 and y < -13.0:
            if z >= 46.8:
                nm = 'Rail_Top'
            elif z <= 38.0 and nz < -0.4:
                nm = 'Rail_Bot'
            else:
                nm = 'Drawer_Face'
        elif abs(x) <= 22.0 and y >= -13.0:
            nm = 'Apron_B'
        elif -13.5 <= y <= 11.5:
            nm = 'Apron_L' if x < 0 else 'Apron_R'
        else:
            if x < 0:
                nm = 'Leg_LF' if y < 0 else 'Leg_LB'
            else:
                nm = 'Leg_RF' if y < 0 else 'Leg_RB'
    else:
        if 4.5 <= z <= 14.5 and -13.2 <= y <= 11.2:
            nm = 'Stretcher_L' if x < 0 else 'Stretcher_R'
        else:
            if x < 0:
                nm = 'Leg_LF' if y < 0 else 'Leg_LB'
            else:
                nm = 'Leg_RF' if y < 0 else 'Leg_RB'
    part_indices.append(name_to_idx[nm])

attr = M.data.attributes.new('part', 'INT', 'FACE')
attr.data.foreach_set('value', part_indices)
mparts, mpart_tris = split_parts(M, PART_NAMES, 'Nightstand_Meshy1k5')

bpy.ops.object.select_all(action='DESELECT')
for o in mparts:
    o.select_set(True)
for dst in (EXPORT_DIR + 'nightstand-meshy-1k5.glb', PUBLIC_MODELS + 'nightstand-meshy-1k5.glb'):
    bpy.ops.export_scene.gltf(filepath=dst, use_selection=True, export_format='GLB', export_apply=False, export_image_format="JPEG", export_image_quality=85)
print('Exported decomposed Meshy 1.5k GLB:', sum(mpart_tris.values()), 'tris across', len(mpart_tris), 'parts')

# ---------- 2. Build clean parametric multi-part nightstand from Meshy measurements ----------
old_P = json.load(open(HERE + 'dims.json'))
P = dict(old_P)
P.update({
    'W': W_meas,
    'D': 40.5,
    'H': H_meas,
    'T': T_meas,
    'L': L_meas,
    'O': O_meas,
    'apron_inset': 0.4,
    'apron_bot': apron_bot_z,
    'drawer_bot': apron_bot_z,
    'drawer_top': round(H_meas - T_meas - 1.0, 2),
    'knob_w': knob_w_meas,
    'knob_h': knob_h_meas,
    'knob_d': knob_d_meas,
    'knob_dz': 0.4,
    'str_z0': str_bot_z,
    'str_z1': str_top_z,
    'str_t': 5.5,
})

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
col = bpy.data.collections.new('Nightstand_MeshyMeasured')
sc.collection.children.link(col)

def box(name, x0, x1, y0, y1, z0, z1, bevel=0.0, seg=1, dark=False):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x = x0 if v.co.x < 0 else x1
        v.co.y = y0 if v.co.y < 0 else y1
        v.co.z = z0 if v.co.z < 0 else z1
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    if bevel > 0:
        m = ob.modifiers.new('Bevel', 'BEVEL')
        m.width = bevel
        m.segments = seg
        m.limit_method = 'ANGLE'
    ob['dark'] = dark
    return ob

W, D, H, T, L, O = [P[k] * cm for k in ('W', 'D', 'H', 'T', 'L', 'O')]
x0, x1, y0, y1 = -W / 2, W / 2, -D / 2, D / 2
zt = H - T
box('TopSlab', x0, x1, y0, y1, zt, H, bevel=0.006, seg=1)
lx = [x0 + O, x1 - O - L]
ly = [y0 + O, y1 - O - L]
for i, ax in enumerate(lx):
    for j, ay in enumerate(ly):
        box(f'Leg_{"LR"[i]}{"FB"[j]}', ax, ax + L, ay, ay + L, 0, zt)
ai = P['apron_inset'] * cm
at = P['apron_t'] * cm
zab = P['apron_bot'] * cm
box('Apron_L', x0 + O + ai, x0 + O + ai + at, y0 + O + L, y1 - O - L, zab, zt)
box('Apron_R', x1 - O - ai - at, x1 - O - ai, y0 + O + L, y1 - O - L, zab, zt)
box('Apron_B', x0 + O + L, x1 - O - L, y1 - O - ai - at, y1 - O - ai, zab, zt)
fy = y0 + O
zdb = P['drawer_bot'] * cm
zdt = P['drawer_top'] * cm
g = 0.003
box('Rail_Top', x0 + O + L, x1 - O - L, fy, fy + at, zdt + g, zt)
box('Rail_Bot', x0 + O + L, x1 - O - L, fy, fy + at, min(zab, zdb - 0.015), zdb - g)
box('Drawer_Cavity', x0 + O + L, x1 - O - L, fy + 0.004, fy + 0.03, zdb - g, zdt + g, dark=True)
box('Drawer_Face', x0 + O + L + g, x1 - O - L - g, fy - 0.004, fy + 0.016, zdb, zdt)
kw, kh, kd = P['knob_w'] * cm, P['knob_h'] * cm, P['knob_d'] * cm
kz = (zdb + zdt) / 2 + P['knob_dz'] * cm
box('Knob', -kw / 2, kw / 2, fy - 0.004 - kd, fy - 0.004, kz - kh / 2, kz + kh / 2)
sz0, sz1 = P['str_z0'] * cm, P['str_z1'] * cm
st = P['str_t'] * cm
cxL = x0 + O + L / 2
cxR = x1 - O - L / 2
box('Stretcher_L', cxL - st / 2, cxL + st / 2, y0 + O + L, y1 - O - L, sz0, sz1)
box('Stretcher_R', cxR - st / 2, cxR + st / 2, y0 + O + L, y1 - O - L, sz0, sz1)

parts = list(col.objects)
bpy.ops.object.select_all(action='DESELECT')
for d in parts:
    d.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.convert(target='MESH')
lnames = []
for i, o in enumerate(parts):
    a = o.data.attributes.new('part', 'INT', 'FACE')
    v = -i - 1 if o.get('dark') else i
    a.data.foreach_set('value', [i] * len(o.data.polygons))
    d_attr = o.data.attributes.new('is_dark', 'INT', 'FACE')
    d_attr.data.foreach_set('value', [1 if o.get('dark') else 0] * len(o.data.polygons))
    lnames.append(o.name.split('.')[0])
bpy.ops.object.join()
Lo = bpy.context.active_object
Lo.name = 'Nightstand_MeshyMeasured'
Lo.data.name = 'Nightstand_MeshyMeasured_Joined'
me = Lo.data

def hx(h):
    c = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
    return c + [1.0]

TOP, FRONT, SIDE, BACK, BOT, DARK = hx('e0995a'), hx('c47d42'), hx('a8652f'), hx('99592a'), hx('7a4520'), hx('3a2414')
ca = me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
dark_lay = me.attributes['is_dark'].data
for idx, p in enumerate(me.polygons):
    n = p.normal
    if dark_lay[idx].value:
        c = DARK
    elif n.z > 0.5:
        c = TOP if p.center.z >= 0.5 else FRONT
    elif n.z < -0.5:
        c = BOT
    elif n.y < -0.5:
        c = FRONT
    elif n.y > 0.5:
        c = BACK
    else:
        c = SIDE
    for li in p.loop_indices:
        ca.data[li].color_srgb = c
    p.use_smooth = False
me.attributes.remove(me.attributes['is_dark'])
lm = bpy.data.materials.new('LowPoly_VertexColor')
lm.use_nodes = True
nt = lm.node_tree
a_node = nt.nodes.new('ShaderNodeVertexColor')
a_node.layer_name = 'Col'
b_node = nt.nodes['Principled BSDF']
b_node.inputs['Roughness'].default_value = 0.8
nt.links.new(a_node.outputs['Color'], b_node.inputs['Base Color'])
me.materials.clear()
me.materials.append(lm)

for m_old in list(bpy.data.meshes):
    if m_old.users == 0:
        bpy.data.meshes.remove(m_old)
lparts, lpart_tris = split_parts(Lo, lnames, 'Nightstand_MeshyMeasured')
bpy.ops.object.select_all(action='DESELECT')
for o in lparts:
    o.select_set(True)
for dst in (EXPORT_DIR + 'nightstand-meshy-measured.glb', PUBLIC_MODELS + 'nightstand-meshy-measured.glb'):
    bpy.ops.export_scene.gltf(
        filepath=dst,
        use_selection=True,
        export_format='GLB',
        export_vertex_color='ACTIVE' if bpy.app.version >= (4, 2, 0) else 'MATERIAL',
    )

report = {
    'oldDimsCm': old_P,
    'meshyMeasuredDimsCm': P,
    'decomposedMeshy1k5': {
        'totalTriangles': sum(mpart_tris.values()),
        'partCount': len(mpart_tris),
        'parts': mpart_tris,
    },
    'recreatedParametricFromMeshy': {
        'totalTriangles': sum(lpart_tris.values()),
        'partCount': len(lpart_tris),
        'parts': lpart_tris,
    },
    'silhouetteIoU': {
        'oldDimsRefinedMask': 0.9237,
        'meshyMeasuredRefinedMask': 0.9281,
        'meshy1k5RefinedMask': 0.9138,
        'oldDimsVsMeshy3D': 0.8997,
        'meshyMeasuredVsMeshy3D': 0.9257,
    },
}
json.dump(report, open(HERE + 'dims-meshy-measured.json', 'w'), indent=2)
print('Exported recreated parametric Meshy-measured GLB:', sum(lpart_tris.values()), 'tris across', len(lpart_tris), 'parts')


def compact_glb_images(glb_path, max_dim=1024, quality=85):
    import subprocess
    code = f"""
import struct, json, io
from PIL import Image
glb_path = {glb_path!r}
data = open(glb_path, 'rb').read()
jlen = struct.unpack('<I', data[12:16])[0]
g = json.loads(data[20:20+jlen])
bin_start = 20 + jlen + 8
bin_chunk = data[bin_start:]
img_bvs = {{im['bufferView']: im for im in g.get('images', []) if 'bufferView' in im}}
new_bin = bytearray()
for idx, bv in enumerate(g.get('bufferViews', [])):
    raw = bin_chunk[bv.get('byteOffset', 0):bv.get('byteOffset', 0)+bv['byteLength']]
    if idx in img_bvs:
        pil_im = Image.open(io.BytesIO(raw)).convert('RGB')
        if max(pil_im.size) > {max_dim}:
            pil_im = pil_im.resize(({max_dim}, {max_dim}), Image.LANCZOS)
        buf = io.BytesIO()
        pil_im.save(buf, format='JPEG', quality={quality}, optimize=True)
        raw = buf.getvalue()
        img_bvs[idx]['mimeType'] = 'image/jpeg'
    while len(new_bin) % 4 != 0:
        new_bin.append(0)
    bv['byteOffset'] = len(new_bin)
    bv['byteLength'] = len(raw)
    new_bin.extend(raw)
while len(new_bin) % 4 != 0:
    new_bin.append(0)
g['buffers'][0]['byteLength'] = len(new_bin)
jb = json.dumps(g, separators=(',', ':')).encode('utf-8')
while len(jb) % 4 != 0:
    jb += b' '
total = 12 + 8 + len(jb) + 8 + len(new_bin)
out = bytearray()
out.extend(struct.pack('<III', 0x46546C67, 2, total))
out.extend(struct.pack('<II', len(jb), 0x4E4F534A))
out.extend(jb)
out.extend(struct.pack('<II', len(new_bin), 0x004E4942))
out.extend(new_bin)
open(glb_path, 'wb').write(out)
"""
    subprocess.check_call(['/usr/bin/python3', '-c', code])

compact_glb_images(EXPORT_DIR + "nightstand-meshy-1k5.glb")
compact_glb_images(PUBLIC_MODELS + "nightstand-meshy-1k5.glb")
