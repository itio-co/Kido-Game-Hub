import numpy as np,io
from render import raster,lit
from PIL import Image
from load6k import load6k
TEX=None
def tex():
  global TEX
  if TEX is None: TEX=np.asarray(Image.open(io.BytesIO(load6k()['tex'])).convert('RGB')).astype(float)
  return TEX
def tview(V,UV,F,side=False,W=500,H=560,smooth=True):
  V=np.asarray(V,float)
  if side: V=np.stack([-V[:,2],V[:,1],V[:,0]],1)
  T=V[F]; t=tex(); Ht,Wt=t.shape[:2]; UVf=UV[F]
  # smooth vertex normals for vinyl look
  n=np.cross(T[:,1]-T[:,0],T[:,2]-T[:,0]); vn=np.zeros_like(V)
  q=np.round(V*2e4).astype(np.int64); _,wi=np.unique(q,axis=0,return_inverse=True); wi=wi.ravel()
  acc=np.zeros((wi.max()+1,3)); 
  for k in range(3): np.add.at(acc,wi[F[:,k]],n)
  vn=acc[wi]; vn/=np.linalg.norm(vn,axis=1,keepdims=True)+1e-12
  Lt=np.array([-0.4,0.5,0.75]);Lt/=np.linalg.norm(Lt)
  def f(i,b):
    uv=b@UVf[i]; x=np.clip((uv[:,0]%1)*(Wt-1),0,Wt-1).astype(int); y=np.clip((uv[:,1]%1)*(Ht-1),0,Ht-1).astype(int)
    nn=b@vn[F[i]] if smooth else np.repeat(n[i][None]/np.linalg.norm(n[i]),len(b),0)
    k=0.55+0.5*np.clip(nn@Lt,0,1)
    return t[y,x]*k[:,None]
  return raster(T,f,W=W,Hh=H)
