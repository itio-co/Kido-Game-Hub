# blender -b --python render.py -- <input .blend|.glb> <out_prefix> [scale] [flat]
import bpy, json, math, sys
import os; HERE=os.path.dirname(os.path.abspath(__file__))+'/'
from mathutils import Matrix, Vector
argv=sys.argv[sys.argv.index('--')+1:]
src,out=argv[0],argv[1]; S=int(argv[2]) if len(argv)>2 else 4
if src.endswith('.blend'):
    bpy.ops.wm.open_mainfile(filepath=src)
else:
    bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=src)
sc=bpy.context.scene
for o in list(sc.objects):
    if o.type in ('CAMERA','LIGHT'): bpy.data.objects.remove(o)
c=json.load(open(HERE+'cam.json')); cm=0.01
R=Matrix(c['R']); C=Vector(c['C'])*cm; f=c['p'][5]; IW,IH=c['IW'],c['IH']
camd=bpy.data.cameras.new('MatchCam'); camd.sensor_fit='HORIZONTAL'; camd.sensor_width=36; camd.lens=f/IW*36
# principal point from a camera-match export (cx/cy, px); shift is in units of the image width
camd.shift_x=(IW/2-c.get('cx',IW/2))/IW; camd.shift_y=(c.get('cy',IH/2)-IH/2)/IW
camd.clip_start=0.1; camd.clip_end=100
cam=bpy.data.objects.new('MatchCam',camd); sc.collection.objects.link(cam)
M=R.transposed()@Matrix(((1,0,0),(0,-1,0),(0,0,-1)))
cam.matrix_world=Matrix.Translation(C)@M.to_4x4(); sc.camera=cam
# lights
sd=bpy.data.lights.new('Key','SUN'); sd.energy=4.0; sd.color=(1.0,0.86,0.70); sd.angle=math.radians(3)
sun=bpy.data.objects.new('Key',sd); sc.collection.objects.link(sun)
sun.rotation_euler=(Vector((-1.3,-0.7,1.9))).to_track_quat('Z','Y').to_euler()
wd=bpy.data.worlds.new('W'); wd.use_nodes=True; wd.node_tree.nodes['Background'].inputs[0].default_value=(1.0,0.85,0.7,1); wd.node_tree.nodes['Background'].inputs[1].default_value=0.35
sc.world=wd
sc.render.engine='CYCLES'; sc.cycles.device='CPU'; sc.cycles.samples=48; sc.cycles.use_denoising=True
sc.render.film_transparent=True; sc.render.resolution_x=IW*S; sc.render.resolution_y=IH*S; sc.render.resolution_percentage=100
sc.view_settings.view_transform='Standard'
sc.render.image_settings.file_format='PNG'; sc.render.image_settings.color_mode='RGBA'
# pivot for turntable
objs=[o for o in sc.objects if o.type not in ('CAMERA','LIGHT')]  # meshes and the root empty of a multi-part GLB
piv=bpy.data.objects.new('Pivot',None); sc.collection.objects.link(piv)
for o in objs:
    if o.parent is None: o.parent=piv
views=[0,90,180,270] if 'turn' in argv else [0]
for a in views:
    piv.rotation_euler=(0,0,math.radians(a))
    sc.render.filepath=f'{out}_{a:03d}.png'; bpy.ops.render.render(write_still=True)
