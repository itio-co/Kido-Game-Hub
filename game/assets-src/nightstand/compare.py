import os, sys, numpy as np
from PIL import Image, ImageDraw, ImageFilter
r=Image.open(sys.argv[1]).convert('RGBA'); out=sys.argv[2]; label=sys.argv[3] if len(sys.argv)>3 else 'render'
ref=Image.open(os.path.dirname(os.path.abspath(__file__))+'/nightstand-ref.png').convert('RGB').resize(r.size,Image.LANCZOS)
bgc=(236,214,190,255)
rr=Image.new('RGBA',r.size,bgc); rr.alpha_composite(r)
# side by side
sbs=Image.new('RGB',(r.width*2+10,r.height+30),(255,255,255)); sbs.paste(ref,(0,30)); sbs.paste(rr.convert('RGB'),(r.width+10,30))
d=ImageDraw.Draw(sbs); d.text((8,8),'reference',fill=(0,0,0)); d.text((r.width+18,8),label,fill=(0,0,0))
sbs.save(out+'_side-by-side.png')
# 50% overlay (render composited onto ref)
ov=Image.blend(ref.convert('RGB'), Image.alpha_composite(ref.convert('RGBA'),r).convert('RGB'),0.5)
# plus outline of render silhouette in cyan
a=np.array(r)[...,3]>128; e=np.array(Image.fromarray(a.astype(np.uint8)*255).filter(ImageFilter.FIND_EDGES))>0
o=np.array(ov); o[e]=(0,255,255); Image.fromarray(o).save(out+'_overlay.png')
# IoU vs rembg mask
m=Image.open(os.path.dirname(os.path.abspath(__file__))+'/nightstand-ref-mask.png').convert('L').resize(r.size)
m=np.array(m)>128
print('IoU vs rembg mask: %.3f'%((a&m).sum()/(a|m).sum()))
