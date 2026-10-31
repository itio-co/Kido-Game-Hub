from glb import *
import io
from PIL import Image
SRC='/workspace/grandma-pr/games/never-ending-story/public/models/grandma-mali-tripo-6k.glb'
def load6k():
  g,b=load(SRC); W,par=worlds(g); p=g['meshes'][0]['primitives'][0]; sk=g['skins'][0]
  IBM=acc(g,b,sk['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)
  Ms=[W[j]@IBM[k] for k,j in enumerate(sk['joints'])]
  M=Ms[0]
  P=acc(g,b,p['attributes']['POSITION'])[:,:3].astype(float); P=P@M[:3,:3].T+M[:3,3]
  UV=acc(g,b,p['attributes']['TEXCOORD_0']).astype(float)
  F=acc(g,b,p['indices']).reshape(-1,3).astype(int)
  J=acc(g,b,p['attributes']['JOINTS_0']).astype(int); Wt=acc(g,b,p['attributes']['WEIGHTS_0']).astype(float)
  bv=g['bufferViews'][g['images'][0]['bufferView']]; o=bv.get('byteOffset',0)
  img=b[o:o+bv['byteLength']]
  return dict(g=g,b=b,P=P,UV=UV,F=F,J=J,W=Wt,tex=img,Ms=Ms,Wn=W)
