import bpy,sys,math,os
a=sys.argv[sys.argv.index('--')+1:]; glb,out=a[0],a[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
sc=bpy.context.scene
arm=[o for o in sc.objects if o.type=='ARMATURE'][0]
sc.render.engine='CYCLES'; sc.cycles.samples=8; sc.cycles.device='CPU'
sc.render.resolution_x=480; sc.render.resolution_y=640
w=bpy.data.worlds.new('w'); sc.world=w; w.use_nodes=True; w.node_tree.nodes['Background'].inputs[1].default_value=1.0
w.node_tree.nodes['Background'].inputs[0].default_value=(.8,.8,.8,1)
cam=bpy.data.objects.new('c',bpy.data.cameras.new('c')); sc.collection.objects.link(cam); sc.camera=cam
cam.data.type='ORTHO'; cam.data.ortho_scale=1.9
L=bpy.data.objects.new('l',bpy.data.lights.new('l','SUN')); sc.collection.objects.link(L); L.rotation_euler=(0.8,0,0.5); L.data.energy=3
views={'front':((0,-5,0.8),(math.pi/2,0,0)),'side':((5,0,0.8),(math.pi/2,0,math.pi/2))}
clips=a[2].split(',') if len(a)>2 else None
if '--rest' in a:
  arm.data.pose_position='REST'
  for v,(loc,rot) in views.items():
    cam.location=loc; cam.rotation_euler=rot; sc.render.filepath=f"{out}/rest_{v}.png"; bpy.ops.render.render(write_still=True)
  raise SystemExit
print('ACTIONS',[x.name for x in bpy.data.actions])
for act in bpy.data.actions:
  if clips and not any(c in act.name for c in clips): continue
  arm.animation_data.action=act
  f0,f1=act.frame_range
  for i,t in enumerate([0,0.33,0.66]):
    sc.frame_set(int(f0+(f1-f0)*t))
    hp=arm.matrix_world@arm.pose.bones['Hips'].head
    for v,(loc,rot) in views.items():
      cam.location=(loc[0]+(hp.x if v=='front' else 0),loc[1]+(hp.y if v=='side' else 0),loc[2]); cam.rotation_euler=rot
      sc.render.filepath=f"{out}/{act.name}_{i}_{v}.png"; bpy.ops.render.render(write_still=True)
