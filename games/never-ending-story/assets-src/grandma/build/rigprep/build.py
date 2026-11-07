import numpy as np, json, subprocess, os, sys
HEAD_TRIS=int(os.environ.get('HEAD_TRIS',3000)); BODY_TRIS=int(os.environ.get('BODY_TRIS',4000))
d=np.load('prep_stage2.npz',allow_pickle=True); jw={k:np.array(v) for k,v in json.load(open('joints_orig.json')).items()}
def simp(P,UV,F,target,tag):
  if target>=len(F): return F
  os.makedirs('/tmp/ms',exist_ok=True)
  P.astype(np.float32).tofile('/tmp/ms/pos.bin'); UV.astype(np.float32).tofile('/tmp/ms/attr.bin'); F.astype(np.uint32).tofile('/tmp/ms/idx.bin')
  print(tag,end=' '); subprocess.run(['node','meshopt_simp.mjs','/tmp/ms',str(target)],check=True)
  return np.fromfile('/tmp/ms/out.bin',np.uint32).reshape(-1,3).astype(int)
def compact(P,UV,F):
  u,ni=np.unique(F,return_inverse=True); return P[u],UV[u],ni.reshape(-1,3),u
# head
HP=d['HV'][d['Hinv']]; HF=simp(HP,d['HUV'],d['HF'],HEAD_TRIS,'head')
HP,HUV,HF,hu=compact(HP,d['HUV'],HF); Hpart=np.where(np.isin(np.arange(len(d['HV'])),[]),'',''); 
# head per-vertex part (hair/face) via nearest original welded label
# body
V,F,inv,UV,part,bf=d['V'],d['F'],d['inv'],d['UV'],d['part'],d['bf']
BP=V[inv]; BF=simp(BP,UV,F[bf],BODY_TRIS,'body')
BP,BUV,BF,bu=compact(BP,UV,BF); Bpart=part[inv[bu]]
print('tris head',len(HF),'body',len(BF))
# ---------- joints
J={k:v.copy() for k,v in jw.items()}
Rd={'Left':d['Rd'][0],'Right':d['Rd'][1]}
for sd,s in (('Left',1),('Right',-1)):
  S=jw[sd+'Arm']
  for b in ('Arm','ForeArm','Hand'): J[sd+b]=S+Rd[sd]@(jw[sd+b]-S)
  arm=np.isin(Bpart,['arm_'+sd[0],'hand_'+sd[0]]); A=BP[arm]
  hand=BP[Bpart=='hand_'+sd[0]]
  wx=np.abs(hand[:,0]).min()  # wrist = start of hand
  J[sd+'Hand'][0]=s*wx
  for b in ('Arm','ForeArm','Hand'):
    x=J[sd+b][0]; m=np.abs(A[:,0]-x)<0.015
    if m.sum()>4: J[sd+b][1:]=(A[m,1:].max(0)+A[m,1:].min(0))/2   # cross-section centre
  ft=BP[(Bpart=='foot_'+sd[0])&(BP[:,1]>0.06)]
  J[sd+'Foot'][[0,2]]=ft[:,[0,2]].mean(0)
  off=jw[sd+'ToeBase']-jw[sd+'Foot']; J[sd+'ToeBase']=J[sd+'Foot']+off
  hip=J[sd+'UpLeg']; an=J[sd+'Foot']; t=(hip[1]-jw[sd+'Leg'][1])/(hip[1]-an[1])
  J[sd+'Leg']=hip+t*(an-hip)   # straight leg: knee on hip-ankle line
# centre line
nk=BP[(np.abs(BP[:,1]-1.17)<0.012)&(np.abs(BP[:,0])<0.07)]
for b in ('Hips','Spine','Spine01','Spine02','neck','Head','head_end','headfront'): J[b][0]=0
for b in ('Spine02','Spine01','Spine'):
  m=(np.abs(BP[:,1]-J[b][1])<0.012)&(np.abs(BP[:,0])<0.12)&np.isin(Bpart,['body','skirt'])
  J[b][2]=0.5*J[b][2]+0.5*(BP[m,2].max()+BP[m,2].min())/2
sy=float(d['PIV'][1]); hn=HP[(HP[:,1]<sy+0.03)]
J['neck'][2]=(hn[:,2].max()+hn[:,2].min())/2
# head joints follow big-head scale
PIV=d['PIV']; HS=float(d['HEAD_SCALE'])
for b in ('Head','head_end','headfront'):
  y=J[b][1]; ssv=np.clip((y-PIV[1])/0.05,0,1); ssv=ssv*ssv*(3-2*ssv); J[b]=PIV+(J[b]-PIV)*(1+(HS-1)*ssv)
J['Head'][2]=J['neck'][2]; J['Head'][1]=max(J['Head'][1],sy+0.02)
# mirror symmetry of L/R joints
for b in ('Shoulder','Arm','ForeArm','Hand','UpLeg','Leg','Foot','ToeBase'):
  l,r=J['Left'+b],J['Right'+b]; m=(l*[1,1,1]+r*[-1,1,1])/2; J['Left'+b]=m; J['Right'+b]=m*[-1,1,1]
for k in J: print(f'{k:14s}',np.round(jw[k],3),'->',np.round(J[k],3))
np.savez('rig_in.npz',HP=HP,HUV=HUV,HF=HF,BP=BP,BUV=BUV,BF=BF,Bpart=Bpart.astype(str),seam_y=PIV[1])
json.dump({k:v.tolist() for k,v in J.items()},open('joints_new.json','w'),indent=1)
