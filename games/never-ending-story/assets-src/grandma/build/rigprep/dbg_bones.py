import numpy as np, json
from PIL import Image, ImageDraw
from viz import view
d=np.load('rig_in.npz'); J={k:np.array(v) for k,v in json.load(open('joints_new.json')).items()}
cols={'head':(240,200,170),'hair':(235,235,235),'body':(170,140,220),'skirt':(120,70,160),'arm_L':(80,200,80),'arm_R':(80,160,220),'hand_L':(250,150,60),'hand_R':(250,220,60),'foot_L':(200,60,60),'foot_R':(60,60,200)}
P=np.r_[d['BP'],d['HP']]; F=np.r_[d['BF'],d['HF']+len(d['BP'])]
fc=[cols[p] for p in d['Bpart'][d['BF'][:,0]]]+[(255,215,180)]*len(d['HF'])
C=np.array(fc,float)
PAR={'Spine02':'Hips','Spine01':'Spine02','Spine':'Spine01','neck':'Spine','Head':'neck','head_end':'Head','headfront':'Head'}
for s in ('Left','Right'):
  PAR.update({s+'Shoulder':'Spine',s+'Arm':s+'Shoulder',s+'ForeArm':s+'Arm',s+'Hand':s+'ForeArm',s+'UpLeg':'Hips',s+'Leg':s+'UpLeg',s+'Foot':s+'Leg',s+'ToeBase':s+'Foot'})
def proj(V,side,W,H):
  V=np.asarray(V,float)
  if side: V=np.stack([-V[:,2],V[:,1],V[:,0]],1)
  return V
def go(side,path,bones=True):
  W,H=520,820; img=view(P,F,C,None,side,W,H)
  if not bones: img.save(path); return
  Vp=proj(P,side,W,H); mn=Vp.min(0); mx=Vp.max(0); s=min(W*0.9/(mx[0]-mn[0]),H*0.92/(mx[1]-mn[1])); cx=(mn[0]+mx[0])/2; cy=(mn[1]+mx[1])/2
  def p2(q): q=proj(q[None],side,W,H)[0]; return ((q[0]-cx)*s+W/2, -(q[1]-cy)*s+H/2)
  im=img.convert('RGBA'); ov=Image.new('RGBA',im.size,(0,0,0,0)); dr=ImageDraw.Draw(ov)
  for c,p in PAR.items(): dr.line([p2(J[p]),p2(J[c])],fill=(255,0,0,230),width=3)
  for k,v in J.items():
    x,y=p2(v); dr.ellipse([x-4,y-4,x+4,y+4],fill=(255,255,0,255),outline=(0,0,0,255))
  Image.alpha_composite(im,ov).convert('RGB').save(path)
go(False,'/workspace/pw/shots/rigprep/parts-colored.png',False)
go(False,'/workspace/pw/shots/rigprep/bones-front.png'); go(True,'/workspace/pw/shots/rigprep/bones-side.png')
