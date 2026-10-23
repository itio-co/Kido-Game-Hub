import numpy as np, cv2, json, os
HERE=os.path.dirname(os.path.abspath(__file__))
from scipy.optimize import least_squares
IW,IH=252,284; H=55.0
obs={'FLT':(16,90),'FRT':(199.6,112),'BLT':(80.4,62.4),'FLB':(16,110),'FRB':(199.6,130),
 'FLlegTL':(24,112),'FLfoot':(24.4,255),'FLlegTR':(42,113),'FRlegTR':(204,131),'FRlegTL':(174,130),
 'BRfoot':(245,249),'BLfootL':(76,224)}
def pts3(W,D,t,o,L):
    x0,x1,y0,y1=-W/2,W/2,-D/2,D/2
    return {'FLT':(x0,y0,H),'FRT':(x1,y0,H),'BLT':(x0,y1,H),'FLB':(x0,y0,H-t),'FRB':(x1,y0,H-t),
     'FLlegTL':(x0+o,y0+o,H-t),'FLfoot':(x0+o,y0+o,0),'FLlegTR':(x0+o+L,y0+o,H-t),
     'FRlegTR':(x1-o,y0+o,H-t),'FRlegTL':(x1-o-L,y0+o,H-t),
     'BRfoot':(x1-o,y1-o,0),'BLfootL':(x0+o,y1-o-L,0)}
def proj(p,P):
    W,D,t,o,L,f,rx,ry,rz,tx,ty,tz=p
    X=np.array(P,float)
    R,_=cv2.Rodrigues(np.array([rx,ry,rz]))
    c=(R@X.T).T+np.array([tx,ty,tz])
    return np.c_[f*c[:,0]/c[:,2]+IW/2, f*c[:,1]/c[:,2]+IH/2]
keys=list(obs)
def res(p):
    P=pts3(*p[:5]); uv=proj(p,[P[k] for k in keys]); r=(uv-np.array([obs[k] for k in keys])).ravel()
    # back edge line through (252,78.5)
    W,D=p[0],p[1]
    a,b=proj(p,[(-W/2,D/2,H),(W/2,D/2,H)]); q=np.array([252,78.5])
    d=b-a; n=np.array([-d[1],d[0]])/np.linalg.norm(d); r=np.r_[r,(q-a)@n]
    # priors (weak)
    r=np.r_[r,0.3*(p[0]-50),0.3*(p[1]-40)]
    return r
# init with solvePnP using guesses
W,D,t,o,L=50,40,4,2,5
P=pts3(W,D,t,o,L); obj=np.array([P[k] for k in keys],float); img=np.array([obs[k] for k in keys],float)
best=None
for f in [200,300,400,600,900]:
    K=np.array([[f,0,IW/2],[0,f,IH/2],[0,0,1.]])
    ok,rv,tv=cv2.solvePnP(obj,img,K,None,flags=cv2.SOLVEPNP_SQPNP)
    p0=np.r_[W,D,t,o,L,f,rv.ravel(),tv.ravel()]
    s=least_squares(res,p0,bounds=([30,25,2,0,3,80,-9,-9,-9,-500,-500,10],[80,70,10,10,10,3000,9,9,9,500,500,2000]))
    print(f, s.cost, np.round(s.x,2))
    if best is None or s.cost<best.cost: best=s
p=best.x; print('rms px',np.sqrt(np.mean(res(p)[:-3]**2)))
R,_=cv2.Rodrigues(p[6:9]); C=-R.T@p[9:12]
print('cam pos',C,'dims',p[:5],'f px',p[5])
json.dump({'p':p.tolist(),'R':R.tolist(),'C':C.tolist(),'IW':IW,'IH':IH,'H':H},open(os.path.join(HERE,'cam.json'),'w'))
P=pts3(*p[:5]); uv=proj(p,[P[k] for k in keys])
for k,u in zip(keys,uv): print(k,obs[k],np.round(u,1))
