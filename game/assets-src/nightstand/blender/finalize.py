import bpy, bmesh, math
import os; HERE=os.path.dirname(os.path.abspath(__file__))+'/'
from mathutils import Vector

bpy.ops.wm.open_mainfile(filepath=HERE+'_parts.blend')
sc=bpy.context.scene
col=bpy.data.collections['Nightstand']; parts=list(col.objects)
# ---------- MASTER ----------
mcol=bpy.data.collections.new('Master_Export'); sc.collection.children.link(mcol)
dups=[]
for o in parts:
    d=o.copy(); d.data=o.data.copy(); mcol.objects.link(d); dups.append(d)
bpy.ops.object.select_all(action='DESELECT')
for d in dups: d.select_set(True)
bpy.context.view_layer.objects.active=dups[0]
bpy.ops.object.convert(target='MESH')
bpy.ops.object.join(); M=bpy.context.active_object; M.name='Nightstand_Master'
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=0.004,scale_to_bounds=False)
bpy.ops.object.mode_set(mode='OBJECT')
TEX=2048
img=bpy.data.images.new('Nightstand_BaseColor',TEX,TEX); img.colorspace_settings.name='sRGB'
for m in M.data.materials:
    n=m.node_tree.nodes.new('ShaderNodeTexImage'); n.image=img; m.node_tree.nodes.active=n
sc.render.engine='CYCLES'; sc.cycles.device='CPU'; sc.cycles.samples=4
sc.render.bake.use_pass_direct=False; sc.render.bake.use_pass_indirect=False; sc.render.bake.margin=8
bpy.ops.object.select_all(action='DESELECT'); M.select_set(True); bpy.context.view_layer.objects.active=M
bpy.ops.object.bake(type='DIFFUSE',pass_filter={'COLOR'})
img.filepath_raw=HERE+'../export/nightstand-master_basecolor.png'; img.file_format='PNG'; img.save()
bm_mat=bpy.data.materials.new('Wood_Baked'); bm_mat.use_nodes=True; nt=bm_mat.node_tree
t=nt.nodes.new('ShaderNodeTexImage'); t.image=img; b=nt.nodes['Principled BSDF']; b.inputs['Roughness'].default_value=0.55
nt.links.new(t.outputs['Color'],b.inputs['Base Color'])
M.data.materials.clear(); M.data.materials.append(bm_mat)
# keep crisp bevel shading: auto smooth by angle
for p in M.data.polygons: p.use_smooth=True
mod=M.modifiers.new('Smooth by Angle','NODES') if False else None
bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35))
bpy.ops.object.select_all(action='DESELECT'); M.select_set(True)
bpy.ops.export_scene.gltf(filepath=HERE+'../export/nightstand-master.glb',use_selection=True,export_format='GLB',export_apply=True)
print('MASTER tris',sum(len(p.vertices)-2 for p in M.data.polygons))
mcol.hide_render=True; mcol.hide_viewport=True
bpy.ops.wm.save_as_mainfile(filepath=HERE+'nightstand-master.blend')

# ---------- LOW POLY ----------
lcol=bpy.data.collections.new('LowPoly_Export'); sc.collection.children.link(lcol)
ld=[]
for o in parts:
    d=o.copy(); d.data=o.data.copy(); lcol.objects.link(d)
    for m in list(d.modifiers): d.modifiers.remove(m)
    if o.name=='TopSlab':
        bv=d.modifiers.new('Chamfer','BEVEL'); bv.width=0.006; bv.segments=1; bv.limit_method='ANGLE'
    ld.append(d)
bpy.ops.object.select_all(action='DESELECT')
for d in ld: d.select_set(True)
bpy.context.view_layer.objects.active=ld[0]
bpy.ops.object.convert(target='MESH'); bpy.ops.object.join(); Lo=bpy.context.active_object; Lo.name='Nightstand_LowPoly'
me=Lo.data
def hx(h): 
    c=[int(h[i:i+2],16)/255 for i in (0,2,4)]; return c+[1.0]
TOP,FRONT,SIDE,BACK,BOT,DARK=hx('e0995a'),hx('c47d42'),hx('a8652f'),hx('99592a'),hx('7a4520'),hx('3a2414')
ca=me.color_attributes.new('Col','BYTE_COLOR','CORNER')
dark_idx=[i for i,m in enumerate(me.materials) if m.name.startswith('Shadow')]
for p in me.polygons:
    n=p.normal
    if p.material_index in dark_idx: c=DARK
    elif n.z>0.5: c=TOP
    elif n.z<-0.5: c=BOT
    elif n.y<-0.5: c=FRONT
    elif n.y>0.5: c=BACK
    else: c=SIDE
    if n.z>0.5 and p.center.z<0.5: c=FRONT  # tops of stretchers/knob: slightly darker than table top
    for li in p.loop_indices: ca.data[li].color_srgb=c
    p.use_smooth=False
lm=bpy.data.materials.new('LowPoly_VertexColor'); lm.use_nodes=True; nt=lm.node_tree
a=nt.nodes.new('ShaderNodeVertexColor'); a.layer_name='Col'; b=nt.nodes['Principled BSDF']; b.inputs['Roughness'].default_value=0.8
nt.links.new(a.outputs['Color'],b.inputs['Base Color'])
me.materials.clear(); me.materials.append(lm)
bpy.ops.object.select_all(action='DESELECT'); Lo.select_set(True)
bpy.ops.export_scene.gltf(filepath=HERE+'../export/nightstand.glb',use_selection=True,export_format='GLB',export_vertex_color='ACTIVE' if bpy.app.version>=(4,2,0) else 'MATERIAL')
print('LOWPOLY tris',sum(len(p.vertices)-2 for p in me.polygons))
lcol.hide_render=True
bpy.ops.wm.save_as_mainfile(filepath=HERE+'nightstand-master.blend')
