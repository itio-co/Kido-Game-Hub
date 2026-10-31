import json,struct,numpy as np
CT={5120:np.int8,5121:np.uint8,5122:np.int16,5123:np.uint16,5125:np.uint32,5126:np.float32}
NC={"SCALAR":1,"VEC2":2,"VEC3":3,"VEC4":4,"MAT4":16}
def load(p):
  r=open(p,'rb').read();jl=struct.unpack_from("<I",r,12)[0];g=json.loads(r[20:20+jl]);b=r[28+jl:]
  return g,b
def acc(g,b,i):
  a=g['accessors'][i];bv=g['bufferViews'][a['bufferView']];n=NC[a['type']];dt=CT[a['componentType']]
  off=bv.get('byteOffset',0)+a.get('byteOffset',0);st=bv.get('byteStride')
  if st and st!=n*np.dtype(dt).itemsize:
    raw=np.frombuffer(b,np.uint8,count=st*a['count'],offset=off).reshape(a['count'],st)[:,:n*np.dtype(dt).itemsize].copy()
    x=raw.view(dt).reshape(a['count'],n)
  else: x=np.frombuffer(b,dt,count=a['count']*n,offset=off).reshape(a['count'],n).copy()
  if a.get('normalized'):
    x=x.astype(np.float32)/{np.int8:127,np.uint8:255,np.int16:32767,np.uint16:65535}[dt]
    if dt in (np.int8,np.int16): x=np.maximum(x,-1)
  return x
def q2m(q):
  x,y,z,w=q;return np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
def local(n):
  M=np.eye(4)
  if 'matrix' in n: return np.array(n['matrix']).reshape(4,4).T
  M[:3,:3]=q2m(n.get('rotation',[0,0,0,1]))@np.diag(n.get('scale',[1,1,1])); M[:3,3]=n.get('translation',[0,0,0]); return M
def worlds(g,loc=None):
  par={c:i for i,n in enumerate(g['nodes']) for c in n.get('children',[])}
  W={}
  def w(i):
    if i in W: return W[i]
    L=loc[i] if loc and i in loc else local(g['nodes'][i])
    W[i]=(w(par[i])@L) if i in par else L; return W[i]
  for i in range(len(g['nodes'])): w(i)
  return W,par
