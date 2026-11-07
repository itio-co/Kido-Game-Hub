import bpy, numpy as np, json, bmesh
d=np.load('/workspace/rigprep/rig_in.npz'); J=json.load(open('/workspace/rigprep/joints_new.json'))
PAR={'Spine02':'Hips','Spine01':'Spine02','Spine':'Spine01','neck':'Spine','Head':'neck'}
for s in ('Left','Right'):
  PAR.update({s+'Shoulder':'Spine',s+'Arm':s+'Shoulder',s+'ForeArm':s+'Arm',s+'Hand':s+'ForeArm',s+'UpLeg':'Hips',s+'Leg':s+'UpLeg',s+'Foot':s+'Leg',s+'ToeBase':s+'Foot'})
TAIL={'Hips':'Spine02','Spine02':'Spine01','Spine01':'Spine','Spine':'neck','neck':'Head','Head':'head_end'}
for s in ('Left','Right'):
  TAIL.update({s+'Shoulder':s+'Arm',s+'Arm':s+'ForeArm',s+'ForeArm':s+'Hand',s+'UpLeg':s+'Leg',s+'Leg':s+'Foot',s+'Foot':s+'ToeBase'})
bpy.ops.wm.read_factory_settings(use_empty=True)
ad=bpy.data.armatures.new('A'); ao=bpy.data.objects.new('A',ad); bpy.context.scene.collection.objects.link(ao)
bpy.context.view_layer.objects.active=ao; bpy.ops.object.mode_set(mode='EDIT')
v=lambda k: np.array(J[k])
for b in ['Hips']+list(PAR):
  e=ad.edit_bones.new(b); e.head=v(b)
  if b in TAIL: e.tail=v(TAIL[b])
  elif 'Hand' in b: e.tail=v(b)+ (v(b)-v(b.replace('Hand','ForeArm')))*0.5
  else: e.tail=v(b)+np.array([0,0,0.05])
for b,p in PAR.items(): ad.edit_bones[b].parent=ad.edit_bones[p]
bpy.ops.object.mode_set(mode='OBJECT')
BP,BF,part=d['BP'],d['BF'],d['Bpart']
GROUPS={'body':['Hips','Spine02','Spine01','Spine','neck','LeftShoulder','RightShoulder'],
 'arm_L':['LeftShoulder','LeftArm','LeftForeArm'],'arm_R':['RightShoulder','RightArm','RightForeArm']}
out={}
for pname,bones in GROUPS.items():
  vs=np.where(part==pname)[0]; fm=np.isin(BF,vs).all(1); fs=BF[fm]
  remap=-np.ones(len(BP),int); remap[vs]=np.arange(len(vs))
  me=bpy.data.meshes.new(pname); me.from_pydata(BP[vs].tolist(),[],remap[fs].tolist()); me.update()
  ob=bpy.data.objects.new(pname,me); bpy.context.scene.collection.objects.link(ob)
  for b in ad.bones: b.use_deform = b.name in bones
  bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); ao.select_set(True); bpy.context.view_layer.objects.active=ao
  bpy.ops.object.parent_set(type='ARMATURE_AUTO')
  W=np.zeros((len(vs),len(bones)))
  gi={g.index:g.name for g in ob.vertex_groups}
  for i,vx in enumerate(me.vertices):
    for g in vx.groups:
      n=gi[g.group]
      if n in bones: W[i,bones.index(n)]=g.weight
  print(pname,'verts',len(vs),'unweighted',(W.sum(1)<1e-6).sum())
  out[pname]=(vs,bones,W)
np.savez('/workspace/rigprep/heat.npz',**{f'{k}_vs':v[0] for k,v in out.items()},**{f'{k}_W':v[2] for k,v in out.items()})
json.dump({k:v[1] for k,v in out.items()},open('/workspace/rigprep/heat_bones.json','w'))
