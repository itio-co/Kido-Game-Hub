"""Join, merge and decimate a mesh to about <target> triangles: blender -b --python decimate.py -- <in> <out> <target>"""
import bpy, sys
a = sys.argv[sys.argv.index('--') + 1:]; src, dst, target = a[0], a[1], int(a[2])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
ms = [o for o in bpy.context.scene.objects if o.type == 'MESH']
bpy.context.view_layer.objects.active = ms[0]
for o in ms: o.select_set(True)
if len(ms) > 1: bpy.ops.object.join()
o = bpy.context.view_layer.objects.active
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.remove_doubles(threshold=1e-5)
bpy.ops.object.mode_set(mode='OBJECT')
n = sum(len(p.vertices) - 2 for p in o.data.polygons)
m = o.modifiers.new('d', 'DECIMATE'); m.ratio = min(1, target / n)
bpy.ops.object.modifier_apply(modifier='d')
print('TRIS', n, '->', sum(len(p.vertices) - 2 for p in o.data.polygons))
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', use_selection=False)
