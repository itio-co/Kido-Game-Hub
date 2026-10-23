# blender -b --python build_master.py
import bpy, bmesh, json, math, sys
import os; HERE=os.path.dirname(os.path.abspath(__file__))+'/'
from mathutils import Matrix, Vector
cm=0.01
P=json.load(open(HERE+'dims.json'))
W,D,H,T,L,O=[P[k]*cm for k in ('W','D','H','T','L','O')]
bpy.ops.wm.read_factory_settings(use_empty=True)
sc=bpy.context.scene
col=bpy.data.collections.new('Nightstand'); sc.collection.children.link(col)

def box(name,x0,x1,y0,y1,z0,z1,bevel=0.0,seg=1,mat=None):
    me=bpy.data.meshes.new(name); bm=bmesh.new()
    bmesh.ops.create_cube(bm,size=1.0)
    for v in bm.verts:
        v.co.x=x0 if v.co.x<0 else x1; v.co.y=y0 if v.co.y<0 else y1; v.co.z=z0 if v.co.z<0 else z1
    bm.to_mesh(me); bm.free()
    ob=bpy.data.objects.new(name,me); col.objects.link(ob)
    if bevel>0:
        m=ob.modifiers.new('Bevel','BEVEL'); m.width=bevel; m.segments=seg; m.limit_method='ANGLE'; m.harden_normals=False
    if mat: me.materials.append(mat)
    return ob

# --- wood material (procedural grain) ---
def wood(name,base,dark):
    m=bpy.data.materials.new(name); m.use_nodes=True; nt=m.node_tree; n=nt.nodes; l=nt.links
    bsdf=n['Principled BSDF']; bsdf.inputs['Roughness'].default_value=0.55
    tc=n.new('ShaderNodeTexCoord'); mp=n.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value=(0.6,14,14)
    wave=n.new('ShaderNodeTexWave'); wave.wave_type='BANDS'; wave.bands_direction='X'
    wave.inputs['Scale'].default_value=2.0; wave.inputs['Distortion'].default_value=2.0; wave.inputs['Detail'].default_value=3.0
    noise=n.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value=3.0
    mix=n.new('ShaderNodeMix'); mix.data_type='FLOAT'; mix.inputs[0].default_value=0.5
    ramp=n.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].color=dark+(1,); ramp.color_ramp.elements[1].color=base+(1,)
    ramp.color_ramp.elements[0].position=0.15; ramp.color_ramp.elements[1].position=0.85
    l.new(tc.outputs['Object'],mp.inputs['Vector']); l.new(mp.outputs['Vector'],wave.inputs['Vector']); l.new(mp.outputs['Vector'],noise.inputs['Vector'])
    l.new(wave.outputs['Fac'],mix.inputs[2]); l.new(noise.outputs['Fac'],mix.inputs[3])
    l.new(mix.outputs[0],ramp.inputs['Fac']); l.new(ramp.outputs['Color'],bsdf.inputs['Base Color'])
    return m
def srgb(h):
    c=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(((x+0.055)/1.055)**2.4 if x>0.04045 else x/12.92 for x in c)
WOOD=wood('Wood',srgb(P['wood']),srgb(P['wood_dark']))
DARK=bpy.data.materials.new('Shadow'); DARK.use_nodes=True; DARK.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=srgb('3a2414')+(1,)

x0,x1,y0,y1=-W/2,W/2,-D/2,D/2
zt=H-T
# top slab with chamfer
top=box('TopSlab',x0,x1,y0,y1,zt,H,bevel=P['chamfer']*cm,seg=1,mat=WOOD)
# legs
lx=[x0+O,x1-O-L]; ly=[y0+O,y1-O-L]
for i,ax in enumerate(lx):
    for j,ay in enumerate(ly):
        box(f'Leg_{"LR"[i]}{"FB"[j]}',ax,ax+L,ay,ay+L,0,zt,bevel=0.003,seg=2,mat=WOOD)
# aprons
ai=P['apron_inset']*cm; at=P['apron_t']*cm
zab=P['apron_bot']*cm
box('Apron_L',x0+O+ai,x0+O+ai+at,y0+O+L,y1-O-L,zab,zt,bevel=0.002,mat=WOOD)
box('Apron_R',x1-O-ai-at,x1-O-ai,y0+O+L,y1-O-L,zab,zt,bevel=0.002,mat=WOOD)
box('Apron_B',x0+O+L,x1-O-L,y1-O-ai-at,y1-O-ai,zab,zt,bevel=0.002,mat=WOOD)
# front: drawer frame rails + drawer
fy=y0+O  # leg front plane
zdb=P['drawer_bot']*cm; zdt=P['drawer_top']*cm; g=0.003
box('Rail_Top',x0+O+L,x1-O-L,fy,fy+at,zdt+g,zt,mat=WOOD)
box('Rail_Bot',x0+O+L,x1-O-L,fy,fy+at,zdb-0.02,zdb-g,mat=WOOD)
box('Drawer_Cavity',x0+O+L,x1-O-L,fy+0.004,fy+0.03,zdb-g,zdt+g,mat=DARK)
dr=box('Drawer_Face',x0+O+L+g,x1-O-L-g,fy-0.004,fy+0.016,zdb,zdt,bevel=0.003,seg=2,mat=WOOD)
kw,kh,kd=P['knob_w']*cm,P['knob_h']*cm,P['knob_d']*cm; kz=(zdb+zdt)/2+P['knob_dz']*cm
box('Knob',-kw/2,kw/2,fy-0.004-kd,fy-0.004,kz-kh/2,kz+kh/2,bevel=0.003,seg=2,mat=WOOD)
# stretchers
sz0,sz1=P['str_z0']*cm,P['str_z1']*cm; st=P['str_t']*cm
cxL=x0+O+L/2; cxR=x1-O-L/2; cyB=y1-O-L/2
box('Stretcher_L',cxL-st/2,cxL+st/2,y0+O+L,y1-O-L,sz0,sz1,bevel=0.002,mat=WOOD)
box('Stretcher_R',cxR-st/2,cxR+st/2,y0+O+L,y1-O-L,sz0,sz1,bevel=0.002,mat=WOOD)
for ob in col.objects:
    for p in ob.data.polygons: p.use_smooth=False
bpy.ops.wm.save_as_mainfile(filepath=HERE+'_parts.blend')
print('built',len(col.objects))
