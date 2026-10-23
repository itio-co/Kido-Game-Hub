"""Clean up a normalised Hunyuan3D shape and paint it with the nightstand's flat palette.

    blender -b --python finish.py -- <normalised.glb> <out.glb> [min_part_fraction=0.02]

Merges split vertices, drops loose parts smaller than min_part_fraction of the faces (spikes, floating bits),
mirrors the +X half (the left side, unseen in the ref, comes out wrong), then sets a flat
vertex colour per face from its normal: top / front (-Y) / side / back / bottom from ../../asset.json.
"""
import bpy, bmesh, json, os, sys
a = sys.argv[sys.argv.index('--') + 1:]
src, dst = a[0], a[1]; frac = float(a[2]) if len(a) > 2 else 0.02
pal = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'asset.json')))['colors']
rgb = lambda h: tuple(int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)) + (1.0,)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
o = [x for x in bpy.context.scene.objects if x.type == 'MESH'][0]
bm = bmesh.new(); bm.from_mesh(o.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
seen, parts = set(), []
for f in bm.faces:
    if f in seen: continue
    stack, part = [f], []
    seen.add(f)
    while stack:
        g = stack.pop(); part.append(g)
        for e in g.edges:
            for h in e.link_faces:
                if h not in seen: seen.add(h); stack.append(h)
    parts.append(part)
n = len(bm.faces)
drop = [f for p in parts if len(p) < frac * n for f in p]
bmesh.ops.delete(bm, geom=drop, context='FACES')
print('PARTS', len(parts), 'dropped faces', len(drop), 'of', n)
# The unseen left side (+X in the ref view is the right) gets made-up geometry: keep +X and mirror it.
bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, 0), plane_no=(1, 0, 0), clear_inner=True)
half = bm.verts[:] + bm.edges[:] + bm.faces[:]
dup = bmesh.ops.duplicate(bm, geom=half)['geom']
dv = [v for v in dup if isinstance(v, bmesh.types.BMVert)]
for v in dv: v.co.x = -v.co.x
bmesh.ops.reverse_faces(bm, faces=[f for f in dup if isinstance(f, bmesh.types.BMFace)])
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
bm.normal_update()
col = bm.loops.layers.color.new('Col')  # byte colours: sRGB as is
for f in bm.faces:
    x, y, z = f.normal
    k = 'top' if z > 0.6 else 'bottom' if z < -0.6 else 'front' if -y > abs(x) else 'back' if y > abs(x) else 'side'
    for l in f.loops: l[col] = rgb(pal[k])
bm.to_mesh(o.data); bm.free()
for p in o.data.polygons: p.use_smooth = False
m = bpy.data.materials.new('nightstand'); m.use_nodes = True
nt = m.node_tree; bsdf = nt.nodes['Principled BSDF']
vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 0.9
o.data.color_attributes.active_color = o.data.color_attributes['Col']
o.data.materials.clear(); o.data.materials.append(m)
o.name = o.data.name = 'nightstand'
print('TRIS', sum(len(p.vertices) - 2 for p in o.data.polygons))
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_vertex_color='ACTIVE')
