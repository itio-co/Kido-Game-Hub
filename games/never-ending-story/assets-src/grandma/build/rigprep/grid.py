import sys,glob,os
from PIL import Image,ImageDraw
d,out=sys.argv[1],sys.argv[2]; clips=sys.argv[3].split(',')
rows=[]
for c in clips:
  fs=[f"{d}/{c}_GrandmaMali_Armature_{i}_{v}.png" for i in range(3) for v in ('front','side')]
  rows.append([Image.open(f).convert('RGB') for f in fs])
W,H=rows[0][0].size; g=Image.new('RGB',(W*6,H*len(rows)),'white'); dr=ImageDraw.Draw(g)
for r,(c,ims) in enumerate(zip(clips,rows)):
  for k,im in enumerate(ims): g.paste(im,(k*W,r*H))
  dr.text((5,r*H+5),c,fill='red')
g.save(out)
