import numpy as np, json, struct, io, sys
from PIL import Image
from scipy import sparse
from glb import load, acc, worlds, local
OUT=sys.argv[1] if len(sys.argv)>1 else '/workspace/rigprep/grandma-mali-tripo6k-clean.glb'
SRC='/workspace/grandma-pr/games/never-ending-story/public/models/grandma-mali-tripo-6k.glb'
g,b=load(SRC); W0,par=worlds(g); sk=g['skins'][0]; jn=[g['nodes'][j]['name'] for j in sk['joints']]
d=np.load('rig_in.npz'); J={k:np.array(v) for k,v in json.load(open('joints_new.json')).items()}
pre=np.load('prep_stage2.npz'); Rd={'Left':pre['Rd'][0],'Right':pre['Rd'][1]}
def ss(x,a,b_):
  t=np.clip((x-a)/(b_-a),0,1); return t*t*(3-2*t)
BI={n:i for i,n in enumerate(jn)}
BP,BF,part=d['BP'],d['BF'],d['Bpart']; nB=len(BP)
WB=np.zeros((nB,24))
heat=np.load('heat.npz'); hb=json.load(open('heat_bones.json'))
for p,bones in hb.items():
  vs=heat[p+'_vs']; Wp=heat[p+'_W']
  for k,bn in enumerate(bones): WB[vs,BI[bn]]=Wp[:,k]
x,y,z=BP.T
for sd,s in (('L','Left'),('R','Right')):
  m=part=='hand_'+sd; WB[m]=0; WB[m,BI[s+'Hand']]=1
  m=part=='foot_'+sd; WB[m]=0; toe=ss(z,J[s+'ToeBase'][2]-0.03,J[s+'ToeBase'][2]+0.01)[m]
  WB[m,BI[s+'Foot']]=1-toe; WB[m,BI[s+'ToeBase']]=toe
# skirt: hips at waist -> smooth blend to upper/lower legs going down, continuous across the centre
m=part=='skirt'; ys=y[m]; xs=x[m]
leg=0.75*ss(0.80-ys,0.0,0.40)          # share given to legs
low=0.35*ss(0.50-ys,0.0,0.35)          # part of leg share going to Leg (knee) near hem
wl=ss(xs,-0.09,0.09)
Ws=np.zeros((m.sum(),24)); Ws[:,BI['Hips']]=1-leg
for side,ww in (('Left',wl),('Right',1-wl)):
  Ws[:,BI[side+'UpLeg']]=leg*ww*(1-low); Ws[:,BI[side+'Leg']]=leg*ww*low
WB[m]=Ws
# shoulder cap: torso verts near the arm socket follow the upper arm
for s_,sg in (('Left',1),('Right',-1)):
  xa=J[s_+'Arm'][0]*sg; from scipy.spatial import cKDTree
  am=part==('arm_'+s_[0]); out_=(part=='body')&(x*sg>xa+0.005)
  if out_.any():
    _,nn=cKDTree(BP[am]).query(BP[out_]); WB[out_]=WB[np.where(am)[0][nn]]
  w=ss(x*sg,xa-0.06,xa+0.005)*ss(y,0.94,1.04)*(part=='body')*(x*sg<=xa+0.005)
  WB=WB*(1-w[:,None]); WB[:,BI[s_+'Arm']]+=w*0.75; WB[:,BI[s_+'Shoulder']]+=w*0.25
# neck top -> Head so body meets head seam exactly
sy=float(d['seam_y']); hn=ss(y,sy-0.035,sy-0.002)*(np.abs(x)<0.12)*(part=='body')
WB=WB*(1-hn[:,None]); WB[:,BI['Head']]+=hn
# light smoothing only on part-boundary vertices (welded topology)
q=np.round(BP*2e4).astype(np.int64); _,wi=np.unique(q,axis=0,return_inverse=True); wi=wi.ravel(); nW=wi.max()+1
WF=wi[BF]; r=np.r_[WF[:,0],WF[:,1],WF[:,2],WF[:,1],WF[:,2],WF[:,0]]; c=np.r_[WF[:,1],WF[:,2],WF[:,0],WF[:,0],WF[:,1],WF[:,2]]
A=sparse.csr_matrix((np.ones(len(r)),(r,c)),shape=(nW,nW)); A.data[:]=1; L=sparse.diags(1/np.maximum(np.asarray(A.sum(1)).ravel(),1))@A
Ww=np.zeros((nW,24)); np.add.at(Ww,wi,WB); Ww/=np.bincount(wi,minlength=nW)[:,None]
pw=np.zeros(nW,object); pw[wi]=part
pid={p:i for i,p in enumerate(np.unique(part))}; pi=np.array([pid[p] for p in pw])
bd=np.zeros(nW,bool); bd[r[pi[r]!=pi[c]]]=True
ring=bd|(A@bd.astype(float)>0)
for _ in range(2): Ww[ring]=0.5*Ww[ring]+0.5*(L@Ww)[ring]
WB=Ww[wi]
WH=np.zeros((len(d['HP']),24)); WH[:,BI['Head']]=1
def top4(Wm):
  idx=np.argsort(-Wm,1)[:,:4]; w=np.take_along_axis(Wm,idx,1); w/=w.sum(1,keepdims=True); return idx.astype(np.uint8),w.astype(np.float32)
# ---- new rest pose (T-pose) and IBMs
NN=len(g['nodes']); name2i={n['name']:i for i,n in enumerate(g['nodes'])}
Wn={}
for i,n in enumerate(g['nodes']):
  nm=n['name']; Wn[i]=W0[i].copy()
  if nm in J:
    R=W0[i][:3,:3]
    for s in ('Left','Right'):
      if nm in (s+'Arm',s+'ForeArm',s+'Hand'): R=Rd[s]@R
    Wn[i][:3,:3]=R; Wn[i][:3,3]=J[nm]
newloc={}
for i,n in enumerate(g['nodes']):
  if n['name'] not in J: continue
  Lm=np.linalg.inv(Wn[par[i]])@Wn[i]; sc=np.linalg.norm(Lm[:3,:3],axis=0); R=Lm[:3,:3]/sc
  from scipy.spatial.transform import Rotation
  newloc[i]=dict(translation=Lm[:3,3].tolist(),rotation=Rotation.from_matrix(R).as_quat().tolist(),scale=n.get('scale',[1,1,1]))
# ---- build new glTF
bin_=bytearray(); views=[]; accs=[]
def add(arr,target=None,typ=None,ct=5126,minmax=False):
  a=np.ascontiguousarray(arr); off=len(bin_); bin_.extend(a.tobytes());
  while len(bin_)%4: bin_.append(0)
  v={'buffer':0,'byteOffset':off,'byteLength':a.nbytes}
  if target: v['target']=target
  views.append(v); n=a.shape[0]
  ac={'bufferView':len(views)-1,'componentType':ct,'count':n,'type':typ}
  if minmax: ac['min']=a.min(0).tolist(); ac['max']=a.max(0).tolist()
  accs.append(ac); return len(accs)-1
def smooth_normals(P,F):
  q=np.round(P*2e4).astype(np.int64); _,wi=np.unique(q,axis=0,return_inverse=True); wi=wi.ravel()
  fn=np.cross(P[F[:,1]]-P[F[:,0]],P[F[:,2]]-P[F[:,0]]); a=np.zeros((wi.max()+1,3))
  for k in range(3): np.add.at(a,wi[F[:,k]],fn)
  n=a[wi]; return (n/np.maximum(np.linalg.norm(n,axis=1,keepdims=True),1e-12)).astype(np.float32)
def prim(P,UV,F,Wm):
  ji,ww=top4(Wm)
  return {'attributes':{'POSITION':add(P.astype(np.float32),34962,'VEC3',minmax=True),'NORMAL':add(smooth_normals(P,F),34962,'VEC3'),
    'TEXCOORD_0':add(UV.astype(np.float32),34962,'VEC2'),'JOINTS_0':add(ji,34962,'VEC4',5121),'WEIGHTS_0':add(ww,34962,'VEC4')},
    'indices':add(F.astype(np.uint32).ravel(),34963,'SCALAR',5125),'material':0}
tex=Image.open('tex_clean.png'); bio=io.BytesIO(); tex.save(bio,'JPEG',quality=88)
img_bytes=bio.getvalue(); off=len(bin_); bin_.extend(img_bytes)
while len(bin_)%4: bin_.append(0)
views.append({'buffer':0,'byteOffset':off,'byteLength':len(img_bytes)}); imgview=len(views)-1
meshes=[{'name':'GrandmaMali_Body','primitives':[prim(BP,d['BUV'],BF,WB)]},{'name':'GrandmaMali_Head','primitives':[prim(d['HP'],d['HUV'],d['HF'],WH)]}]
IBM=np.stack([np.linalg.inv(Wn[j]).T for j in sk['joints']]).astype(np.float32).reshape(24,16)
ibm=add(IBM,None,'MAT4')
nodes=[]
for i,n in enumerate(g['nodes']):
  m={k:v for k,v in n.items() if k not in ('mesh','skin')}
  if i in newloc: m.update(newloc[i])
  nodes.append(m)
body_i=name2i['GrandmaMali_Body']; nodes[body_i]={'name':'GrandmaMali_Body','mesh':0,'skin':0}
nodes.append({'name':'GrandmaMali_Head','mesh':1,'skin':0}); head_i=len(nodes)-1
arm_i=name2i['GrandmaMali_Armature']; nodes[arm_i]['children']=nodes[arm_i]['children']+[head_i]
anims=[]
for a in g['animations']:
  ch=[];sm=[]
  for c in a['channels']:
    s=a['samplers'][c['sampler']]; tin=acc(g,b,s['input']).astype(np.float32); tout=acc(g,b,s['output']).astype(np.float32)
    ni=c['target']['node']; path=c['target']['path']
    if path=='translation' and g['nodes'][ni]['name']!='Hips' and ni in newloc:
      tout=np.tile(np.array(newloc[ni]['translation'],np.float32),(len(tin),1))
    ia=add(tin,None,'SCALAR'); accs[ia]['min']=[float(tin.min())]; accs[ia]['max']=[float(tin.max())]
    oa=add(tout,None,{1:'SCALAR',3:'VEC3',4:'VEC4'}[tout.shape[1]])
    sm.append({'input':ia,'output':oa,'interpolation':s.get('interpolation','LINEAR')}); ch.append({'sampler':len(sm)-1,'target':c['target']})
  anims.append({'name':a['name'],'channels':ch,'samplers':sm})
G={'asset':{'version':'2.0','generator':'grandma rigprep pipeline'},'scene':0,'scenes':g['scenes'],'nodes':nodes,'meshes':meshes,
 'skins':[{'name':sk.get('name','GrandmaMali_Skin'),'joints':sk['joints'],'inverseBindMatrices':ibm,**({'skeleton':sk['skeleton']} if 'skeleton' in sk else {})}],
 'materials':[{'name':'GrandmaMali','doubleSided':True,'pbrMetallicRoughness':{'roughnessFactor':0.9,'metallicFactor':0,'baseColorTexture':{'index':0}}}],
 'textures':[{'source':0,'sampler':0}],'samplers':[{'magFilter':9729,'minFilter':9987}],
 'images':[{'name':'GrandmaMali_BaseColor','mimeType':'image/jpeg','bufferView':imgview}],
 'animations':anims,'accessors':accs,'bufferViews':views,'buffers':[{'byteLength':len(bin_)}]}
js=json.dumps(G,separators=(',',':')).encode();
while len(js)%4: js+=b' '
out=struct.pack('<III',0x46546C67,2,12+8+len(js)+8+len(bin_))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(bin_),0x004E4942)+bytes(bin_)
open(OUT,'wb').write(out); print('wrote',OUT,len(out),'bytes; tris body',len(BF),'head',len(d['HF']))
