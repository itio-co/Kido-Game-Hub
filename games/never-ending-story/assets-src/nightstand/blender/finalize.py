import bpy, bmesh, math
import os; HERE=os.path.dirname(os.path.abspath(__file__))+'/'
from mathutils import Matrix, Vector

def tag_parts(objs):
    """Store each part's index as a face attribute so the joined mesh can be split again after baking."""
    names=[]
    for i,o in enumerate(objs):
        a=o.data.attributes.get('part') or o.data.attributes.new('part','INT','FACE')
        a.data.foreach_set('value',[i]*len(o.data.polygons)); names.append(o.name.split('.')[0])
    return names

def split_parts(J,names,root_name):
    """Split the joined mesh J back into one named object per part (origin at the part's bounds centre),
    parented to an empty called root_name. UVs, bake, vertex colours and sharp edges are kept.
    Objects already holding those names are renamed while exporting; call the returned restore() after export."""
    held=[]
    def claim(nm):
        o=bpy.data.objects.get(nm)
        if o: o.name=nm+'__held'; held.append((o,nm))
    J.name=root_name+'__joined'; claim(root_name)
    root=bpy.data.objects.new(root_name,None); J.users_collection[0].objects.link(root)
    out=[root]
    for i,nm in enumerate(names):
        me=J.data.copy(); me.name=nm
        bm=bmesh.new(); bm.from_mesh(me)
        lay=bm.faces.layers.int.get('part')
        bmesh.ops.delete(bm,geom=[f for f in bm.faces if f[lay]!=i],context='FACES')
        bm.to_mesh(me); bm.free()
        if 'part' in me.attributes: me.attributes.remove(me.attributes['part'])
        if not me.polygons: bpy.data.meshes.remove(me); continue
        lo=Vector([min(v.co[k] for v in me.vertices) for k in range(3)]); hi=Vector([max(v.co[k] for v in me.vertices) for k in range(3)])
        c=(lo+hi)/2; me.transform(Matrix.Translation(-c))
        claim(nm); ob=bpy.data.objects.new(nm,me); J.users_collection[0].objects.link(ob)
        ob.location=c; ob.parent=root; out.append(ob)
    bpy.data.objects.remove(J)
    def restore():
        for o in out: o.name=root_name+('' if o is root else '_'+o.name)
        for o,nm in held: o.name=nm
    return out,restore

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
mnames=tag_parts(dups)
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
mtris=sum(len(p.vertices)-2 for p in M.data.polygons)
# one named node per part (TopSlab, Leg_LF, Stretcher_L…) under the root, so the web editor can pick parts
mparts,mrestore=split_parts(M,mnames,'Nightstand_Master')
bpy.ops.object.select_all(action='DESELECT')
for o in mparts: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=HERE+'../export/nightstand-master.glb',use_selection=True,export_format='GLB',export_apply=True)
print('MASTER tris',mtris,'parts',len(mparts)-1); mrestore()
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
bpy.ops.object.convert(target='MESH'); lnames=tag_parts(ld); bpy.ops.object.join(); Lo=bpy.context.active_object; Lo.name='Nightstand_LowPoly'
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
ltris=sum(len(p.vertices)-2 for p in me.polygons)
lparts,lrestore=split_parts(Lo,lnames,'Nightstand_LowPoly')
bpy.ops.object.select_all(action='DESELECT')
for o in lparts: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=HERE+'../export/nightstand.glb',use_selection=True,export_format='GLB',export_vertex_color='ACTIVE' if bpy.app.version>=(4,2,0) else 'MATERIAL')
print('LOWPOLY tris',ltris,'parts',len(lparts)-1); lrestore()
lcol.hide_render=True
bpy.ops.wm.save_as_mainfile(filepath=HERE+'nightstand-master.blend')
