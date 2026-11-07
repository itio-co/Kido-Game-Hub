"""Grandma 6k-meshopt mesh prep: symmetry, T-pose, parts, low-relief toy head, joints."""
import numpy as np, json, sys
from scipy.spatial import cKDTree
from scipy import sparse
from load6k import *
HEAD_TRIS=int(sys.argv[1]) if len(sys.argv)>1 else 3000
BODY_TRIS=int(sys.argv[2]) if len(sys.argv)>2 else 4200
NECK_Y=1.19; HEM_Y=0.112
def ss(x,a,b):
  t=np.clip((x-a)/(b-a),0,1); return t*t*(3-2*t)
d=load6k(); P0=d['P']; F=d['F']; UV=d['UV']; vcol=np.load('vcol.npy')
names=[d['g']['nodes'][j]['name'] for j in d['g']['skins'][0]['joints']]
jw={n:d['Wn'][j][:3,3].copy() for n,j in zip(names,d['g']['skins'][0]['joints'])}
# weld
q=np.round(P0*2e4).astype(np.int64); _,wid,inv=np.unique(q,axis=0,return_index=True,return_inverse=True); inv=inv.ravel()
V=P0[wid].copy(); WF=inv[F]
def adj_of(WF,n):
  r=np.r_[WF[:,0],WF[:,1],WF[:,2],WF[:,1],WF[:,2],WF[:,0]]; c=np.r_[WF[:,1],WF[:,2],WF[:,0],WF[:,0],WF[:,1],WF[:,2]]
  A=sparse.csr_matrix((np.ones(len(r)),(r,c)),shape=(n,n)); A.data[:]=1; return A
A=adj_of(WF,len(V))
# ---- 1. symmetry snap on X
V[:,0]-=np.median(V[np.abs(V[:,0])<0.03,0]) if False else 0
mir=V*[-1,1,1]; dist,j=cKDTree(V).query(mir)
ok=dist<0.012
Vs=V.copy(); Vs[ok]=(V[ok]+mir[j[ok]])/2
mid=np.abs(V[:,0])<0.004; Vs[mid,0]=0
print('symmetry: paired',ok.mean().round(3),'mean |asym| before',dist.mean().round(4))
V=Vs
# ---- 2. part labels (per welded vertex, in A-pose)
def arm_frame(side):
  S=jw[side+'Arm']; Hn=jw[side+'Hand']; ax=(Hn-S)/np.linalg.norm(Hn-S); return S,Hn,ax
part=np.full(len(V),'body',dtype=object)
fy=V[:,1]
part[(fy>NECK_Y)]='head'
ARMT={}
for side,sg in (('Left',1),('Right',-1)):
  S,Hn,ax=arm_frame(side); r=V-S; t=r@ax; rad=np.linalg.norm(r-np.outer(t,ax),axis=1)
  L=np.linalg.norm(Hn-S)
  arm=(sg*V[:,0]>0.10)&(t>-0.01)&(rad<0.075)&(fy<NECK_Y+0.02)&(fy>0.70)
  part[arm]='arm_'+side[0]; part[arm&(t>L-0.005)]='hand_'+side[0]
  ARMT[side]=(t,rad,ax,S,L)
part[(fy<HEM_Y)&(V[:,0]>0)]='foot_L'; part[(fy<HEM_Y)&(V[:,0]<0)]='foot_R'
# skirt vs cardigan: below cardigan hem (~0.80) and not arm
part[(part=='body')&(fy<0.80)]='skirt'
# hair inside head: grey low-saturation texture, or back/top
wc=np.zeros((len(V),3)); np.add.at(wc,inv,vcol); cnt=np.bincount(inv,minlength=len(V)); wc/=cnt[:,None]
sat=wc.max(1)-wc.min(1)
hair=(part=='head')&(sat<38)&(wc.mean(1)>120)
# clean hair label by majority over neighbours
h=hair.astype(float)
for _ in range(3): h=(A@h+h)/(np.asarray(A.sum(1)).ravel()+1)
part[(part=='head')&(h>0.5)]='hair'
# ---- 3. T-pose: rotate arms about shoulder joint (angle blended over shoulder cap)
Rd={}
for side,sg in (('Left',1),('Right',-1)):
  t,rad,ax,S,L=ARMT[side]
  ang=np.arctan2(-ax[1],abs(ax[0]))*sg  # rotate around +z (left arm needs CCW)
  Rz=lambda a: np.array([[np.cos(a),-np.sin(a),0],[np.sin(a),np.cos(a),0],[0,0,1]])
  Rd[side]=Rz(ang)
  w=ss(t,-0.035,0.035)*((sg*V[:,0])>0.06)*(fy>0.80)*(fy<NECK_Y+0.03)*(rad<0.12)
  w[np.isin(part,['arm_'+side[0],'hand_'+side[0]])]=1.0
  w[np.isin(part,['head','hair'])]=0
  m=w>0
  for i in np.where(m)[0]:
    V[i]=S+Rz(ang*w[i])@(V[i]-S)
  print(side,'arm rotated by',np.degrees(ang).round(2),'deg; verts',m.sum())
# ---- webbing cut: faces mixing arm and non-arm parts that got stretched
fp=part[WF]
is_arm=np.isin(fp,['arm_L','arm_R','hand_L','hand_R'])
mixed=is_arm.any(1)&~is_arm.all(1)
el=np.linalg.norm(V[WF]-V[np.roll(WF,1,1)],axis=2).max(1)
el0=np.linalg.norm(P0[F]-P0[np.roll(F,1,1)],axis=2).max(1)
web=mixed&(el>1.6*el0)&(V[WF][:,:,1].mean(1)<1.13)
print('webbing faces cut',web.sum())
np.savez('prep_stage1.npz',V=V,WF=WF,inv=inv,UV=UV,F=F,part=part.astype(str),web=web,Rd=np.stack([Rd['Left'],Rd['Right']]),P0=P0)
json.dump({k:v.tolist() for k,v in jw.items()},open('joints_orig.json','w'))
# ---- hands by skin colour on arm tips
for sd in 'LR':
  side='Left' if sd=='L' else 'Right'; t,rad,ax,S,L=ARMT[side]
  skin=(wc[:,0]-wc[:,2]>35)&(sat>45)
  m=np.isin(part,['arm_'+sd,'hand_'+sd])&(t>0.75*L)&skin
  hh=m.astype(float)
  for _ in range(2): hh=(A@hh+hh)/(np.asarray(A.sum(1)).ravel()+1)
  part[np.isin(part,['arm_'+sd])&(t>0.75*L)&(hh>0.45)]='hand_'+sd
# ---- split head/body by faces
fpart=part[WF]
def fmaj(fp):
  out=[]
  for r in fp:
    u,c=np.unique(r,return_counts=True); out.append(u[c.argmax()])
  return np.array(out)
fl=fmaj(fpart)
headf=np.isin(fl,['head','hair'])
# drop degenerate tiny components
area=np.linalg.norm(np.cross(V[WF[:,1]]-V[WF[:,0]],V[WF[:,2]]-V[WF[:,0]]),axis=1)
keep=area>1e-9
print('degenerate faces removed',(~keep).sum())
import head as H
hf=np.where(headf&keep)[0]
hv=np.unique(WF[hf]); bf=np.where(~headf&keep)[0]; bv=np.unique(WF[bf])
seam=np.intersect1d(hv,bv)
print('head faces',len(hf),'body faces',len(bf),'seam verts',len(seam))
# head submesh in split space
hs=np.unique(F[hf]); remap=-np.ones(len(UV),int); remap[hs]=np.arange(len(hs))
hw_=np.unique(inv[hs]); wre=-np.ones(len(V),int); wre[hw_]=np.arange(len(hw_))
HV=V[hw_]; HUV=UV[hs]; HF=remap[F[hf]]; Hinv=wre[inv[hs]]
HV_orig=HV.copy()
Vh,HUV2,HF2,Hinv2=H.toy_head(HV,HUV,HF,Hinv,(part[hw_]=='hair'),np.isin(hw_,seam))
np.savez('prep_stage2.npz',V=V,WF=WF,inv=inv,UV=UV,F=F,part=part.astype(str),fl=fl,hf=hf,bf=bf,seam=seam,
  HV=Vh,HUV=HUV2,HF=HF2,Hinv=Hinv2,HV_orig=HV_orig,HUV0=HUV,HF0=HF,Hinv0=Hinv,Rd=np.stack([Rd['Left'],Rd['Right']]))
# ---- chibi / art-toy big head: scale about neck pivot with a blend just above the seam
HEAD_SCALE=float(sys.argv[3]) if len(sys.argv)>3 else 1.38
seam_y=V[seam,1].max()
PIV=np.array([0.0,seam_y,jw['neck'][2]])
def headscale(X):
  s=1+(HEAD_SCALE-1)*ss(X[:,1],seam_y,seam_y+0.05)
  return PIV+(X-PIV)*s[:,None]
Vh=headscale(Vh)
# ---- texture clean-up on face: blur fine wrinkle lines, keep strong painted features
from PIL import Image, ImageDraw, ImageFilter
import io
tex=Image.open(io.BytesIO(d['tex'])).convert('RGB'); TW,TH=tex.size
mask=Image.new('L',(TW,TH),0); dr=ImageDraw.Draw(mask)
skinf=[f for f,pp in zip(HF2,Hinv2[HF2]) if True]
fcol=part[hw_][Hinv0] if False else None
for tri in HUV2[HF2]:
  dr.polygon([(u*TW,v*TH) for u,v in tri],fill=255)
from scipy.ndimage import gaussian_filter
T=np.asarray(tex).astype(float); M0=(np.asarray(mask)>0)
def nblur(m,sig):
  m=m.astype(float); num=np.stack([gaussian_filter(T[...,k]*m,sig) for k in range(3)],-1); den=gaussian_filter(m,sig)[...,None]
  return np.where(den>1e-3,num/np.maximum(den,1e-3),T)
_skin=((T[...,0]-T[...,2])>30)&((T.max(-1)-T.min(-1))>35)&M0
_hair=((T.max(-1)-T.min(-1))<38)&(T@[0.3,0.59,0.11]>110)&M0
Bl=nblur(_skin,7); Bm=nblur(_hair,2.5); Bh=nblur(_hair,6)
lum=lambda a:a@[0.3,0.59,0.11]
skinpx=((T[...,0]-T[...,2])>30)&((T.max(-1)-T.min(-1))>35)
drop=lum(Bl)-lum(T)
soft=np.clip(1-(drop-18)/22,0,1)*skinpx*(np.asarray(mask)>0)   # wrinkles (small drop) -> blurred skin
greyhair=((T.max(-1)-T.min(-1))<40)&(lum(T)>60)&(np.asarray(mask)>0)
_sk=T[_skin&(drop<10)]; _l=_sk@[0.3,0.59,0.11]; skin_med=np.median(_sk[_l>np.percentile(_l,70)],0); hair_med=np.median(T[_hair],0)
flat=skin_med*0.82+Bl*0.18
out=T*(1-soft[...,None])+flat*soft[...,None]
out[greyhair]=hair_med*0.6+Bm[greyhair]*0.4   # chunky vinyl hair: soften strand detail
TEX_OUT=Image.fromarray(np.clip(out,0,255).astype(np.uint8))
TEX_OUT.save('tex_clean.png')
np.savez('prep_stage2.npz',V=V,WF=WF,inv=inv,UV=UV,F=F,part=part.astype(str),fl=fl,hf=hf,bf=bf,seam=seam,
  HV=Vh,HUV=HUV2,HF=HF2,Hinv=Hinv2,HV_orig=HV_orig,HUV0=HUV,HF0=HF,Hinv0=Hinv,Rd=np.stack([Rd['Left'],Rd['Right']]),PIV=PIV,HEAD_SCALE=HEAD_SCALE)
