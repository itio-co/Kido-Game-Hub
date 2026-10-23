import bpy,json
import os; HERE=os.path.dirname(os.path.abspath(__file__))+'/'
from mathutils import Matrix,Vector
sc=bpy.context.scene
for o in [o for o in sc.objects if o.type in ('CAMERA','LIGHT')]: bpy.data.objects.remove(o)
for i in [i for i in bpy.data.images if i.name.startswith('nightstand-ref')]: bpy.data.images.remove(i)
c=json.load(open(HERE+'cam.json')); R=Matrix(c['R']); C=Vector(c['C'])*0.01; f=c['p'][5]
cd=bpy.data.cameras.new('MatchCam'); cd.sensor_fit='HORIZONTAL'; cd.sensor_width=36; cd.lens=f/252*36
# principal point (camera-match export may carry cx/cy); Blender shift is in units of the image width (sensor_fit HORIZONTAL)
cd.shift_x=(126-c.get('cx',126))/252; cd.shift_y=(c.get('cy',142)-142)/252
cam=bpy.data.objects.new('MatchCam',cd); sc.collection.objects.link(cam)
cam.matrix_world=Matrix.Translation(C)@(R.transposed()@Matrix(((1,0,0),(0,-1,0),(0,0,-1)))).to_4x4(); sc.camera=cam
img=bpy.data.images.load(HERE+'../ref/nightstand-ref.png'); cd.show_background_images=True
bg=cd.background_images.new(); bg.image=img; bg.alpha=0.5; bg.display_depth='FRONT'
sc.render.resolution_x=1008; sc.render.resolution_y=1136
sd=bpy.data.lights.new('Key','SUN'); sd.energy=4; sd.color=(1,0.86,0.7); s=bpy.data.objects.new('Key',sd); sc.collection.objects.link(s)
s.rotation_euler=Vector((-1.3,-0.7,1.9)).to_track_quat('Z','Y').to_euler()
bpy.ops.wm.save_as_mainfile(filepath=HERE+'nightstand-master.blend', relative_remap=True)
bpy.ops.file.make_paths_relative(); bpy.ops.wm.save_mainfile()
print('CAM OK')
