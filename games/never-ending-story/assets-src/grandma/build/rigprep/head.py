import numpy as np,sys
from scipy import sparse
def ss(x,a,b):
  t=np.clip((x-a)/(b-a),0,1); return t*t*(3-2*t)
def subdivide(V,UV,F,inv):
  """midpoint subdivision on split mesh F (uv) with welded map inv -> V."""
  WF=inv[F]; nS=len(UV); nW=len(V)
  e_s=np.sort(np.stack([F,np.roll(F,-1,1)],2).reshape(-1,2),1)
  e_w=np.sort(np.stack([WF,np.roll(WF,-1,1)],2).reshape(-1,2),1)
  us,si=np.unique(e_s,axis=0,return_inverse=True); si=si.ravel()
  uw,wi=np.unique(e_w,axis=0,return_inverse=True); wi=wi.ravel()
  newUV=(UV[us[:,0]]+UV[us[:,1]])/2; newV=(V[uw[:,0]]+V[uw[:,1]])/2
  # map split-edge -> welded-edge
  s2w=np.zeros(len(us),int); s2w[si]=wi
  UV2=np.r_[UV,newUV]; V2=np.r_[V,newV]; inv2=np.r_[inv,nW+s2w]
  m=(nS+si).reshape(-1,3)  # m[:,k] midpoint of edge (k,k+1)
  a,b,c=F.T; ab,bc,ca=m.T
  F2=np.r_[np.c_[a,ab,ca],np.c_[ab,b,bc],np.c_[ca,bc,c],np.c_[ab,bc,ca]]
  return V2,UV2,F2,inv2
def lap(WF,n):
  r=np.r_[WF[:,0],WF[:,1],WF[:,2],WF[:,1],WF[:,2],WF[:,0]]; c=np.r_[WF[:,1],WF[:,2],WF[:,0],WF[:,0],WF[:,1],WF[:,2]]
  A=sparse.csr_matrix((np.ones(len(r)),(r,c)),shape=(n,n)); A.data[:]=1
  dg=np.asarray(A.sum(1)).ravel(); return sparse.diags(1/np.maximum(dg,1))@A
def taubin(V,L,w,it,lam=0.6,mu=-0.63):
  for _ in range(it):
    V=V+(lam*w)[:,None]*(L@V-V); V=V+(mu*w)[:,None]*(L@V-V)
  return V
BASE_IT=150; FACE_RELIEF=0.12; HAIR_RELIEF=0.35
def toy_head(V,UV,F,inv,ishair_w,fixed_w,n_sub=1,face_it=40,hair_it=25):
  for _ in range(n_sub):
    V,UV,F,inv=subdivide(V,UV,F,inv)
    ishair_w=np.r_[ishair_w,np.zeros(len(V)-len(ishair_w))]; fixed_w=np.r_[fixed_w,np.zeros(len(V)-len(fixed_w))]
  WF=inv[F]; L=lap(WF,len(V))
  # propagate labels to midpoints via laplacian averaging (only new verts were zero)
  hw=ishair_w.astype(float); fw=fixed_w.astype(float)
  for _ in range(2): hw=np.maximum(hw,0)*0+np.where(hw>0,hw,L@hw)
  fw=np.where(fw>0,fw,(L@fw>0.5).astype(float))
  free=1-fw
  base=taubin(V,L,free,BASE_IT)
  nose=np.exp(-((V[:,0]/0.03)**2+((V[:,1]-1.318)/0.03)**2))*(V[:,2]>0.05)
  rel=np.where(hw>0.5,HAIR_RELIEF,FACE_RELIEF+0.45*nose)[:,None]
  Vh=base+rel*(V-base)
  Vh=taubin(Vh,L,free,4,0.5,-0.52)
  return Vh,UV,F,inv
