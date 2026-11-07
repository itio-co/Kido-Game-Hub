import numpy as np, sys
sys.path.insert(0,'/workspace/rigprep')
from render import raster, lit
from PIL import Image
def view(V,F,C,path,side=False,W=420,H=640):
  V=np.asarray(V,float)
  if side: V=np.stack([-V[:,2],V[:,1],V[:,0]],1)  # look from +x
  T=V[F]; k=lit(T); col=np.asarray(C,float)*k[:,None]
  return raster(T,lambda i,b:col[i],W=W,Hh=H)
def both(V,F,C,path):
  a=view(V,F,C,None);b=view(V,F,C,None,True)
  g=Image.new('RGB',(a.width*2,a.height));g.paste(a,(0,0));g.paste(b,(a.width,0));g.save(path);return g
