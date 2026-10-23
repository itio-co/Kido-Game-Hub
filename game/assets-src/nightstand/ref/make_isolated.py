# Isolate the nightstand from the crop: rembg mask + matched master render silhouette as GrabCut priors.
# Run from anywhere with Python (pillow, numpy, opencv). Needs ../blender/render/master_000.png (render_all.sh).
# The rectangle 'hole' is the see-through gap in the right side frame (manual sure-background).
import os
from PIL import Image
import numpy as np, cv2
os.chdir(os.path.dirname(os.path.abspath(__file__)))
crop=Image.open('nightstand-ref.png').convert('RGB')
S=4; W,H=crop.size[0]*S,crop.size[1]*S
up=np.array(crop.resize((W,H),Image.LANCZOS))
rend=np.array(Image.open('../blender/render/master_000.png').convert('RGBA').resize((W,H)))[...,3]>127
rem=np.array(Image.open('nightstand-ref-mask-rembg.png').convert('L').resize((W,H)))>127
n,lab,st,_=cv2.connectedComponentsWithStats(rem.astype(np.uint8)); rem=lab==(1+np.argmax(st[1:,4]))
k=lambda r: cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(2*r+1,2*r+1))
er=lambda m,r: cv2.erode(m.astype(np.uint8),k(r))>0
di=lambda m,r: cv2.dilate(m.astype(np.uint8),k(r))>0
hole=np.zeros((H,W),np.uint8)
cv2.fillPoly(hole,[(np.array([(205,160),(217,157),(217,207),(205,209)])*S).astype(np.int32)],1); hole=hole>0
gc=np.full((H,W),cv2.GC_BGD,np.uint8)
gc[di(rend|rem,24)]=cv2.GC_PR_BGD
gc[di(rend,10)|rem]=cv2.GC_PR_FGD
gc[er(rend,14)|er(rem,10)]=cv2.GC_FGD
gc[hole]=cv2.GC_BGD
bg=np.zeros((1,65)); fg=np.zeros((1,65))
cv2.grabCut(cv2.cvtColor(up,cv2.COLOR_RGB2BGR),gc,None,bg,fg,6,cv2.GC_INIT_WITH_MASK)
m=((gc==cv2.GC_FGD)|(gc==cv2.GC_PR_FGD)).astype(np.uint8)
n,lab,st,_=cv2.connectedComponentsWithStats(m); m=(lab==(1+np.argmax(st[1:,4]))).astype(np.uint8)
m=cv2.morphologyEx(m,cv2.MORPH_OPEN,k(2)); m=cv2.morphologyEx(m,cv2.MORPH_CLOSE,k(3))
a=cv2.GaussianBlur(m.astype(np.float32)*255,(0,0),1.2).astype(np.uint8)
mb=m.astype(bool); print('iou vs render', (mb&rend).sum()/(mb|rend).sum(), 'vs rembg', (mb&rem).sum()/(mb|rem).sum())
# outputs
Image.fromarray(a).save('nightstand-ref-mask.png',optimize=True)               # 4x (1008x1136)
rgba_hi=np.dstack([up,a])
small_a=np.array(Image.fromarray(a).resize(crop.size,Image.LANCZOS))
Image.fromarray(np.dstack([np.array(crop),small_a])).save('nightstand-isolated.png',optimize=True)
ys,xs=np.where(a>8); x0,x1,y0,y1=xs.min(),xs.max()+1,ys.min(),ys.max()+1
print('bbox in crop px', x0/S,y0/S,(x1-x0)/S,(y1-y0)/S)
sub=Image.fromarray(rgba_hi[y0:y1,x0:x1]); s=int(max(sub.size)/0.86)
sq=Image.new('RGBA',(s,s),(0,0,0,0)); sq.paste(sub,((s-sub.width)//2,(s-sub.height)//2))
big=sq.resize((1024,1024),Image.LANCZOS); big.save('nightstand-isolated-1024.png',optimize=True)
w=Image.new('RGBA',big.size,(255,255,255,255)); w.alpha_composite(big); w.convert('RGB').save('nightstand-isolated-1024-white.png',optimize=True)
