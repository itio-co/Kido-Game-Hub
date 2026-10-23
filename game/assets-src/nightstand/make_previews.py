# python make_previews.py  (after render.py runs for master/lowpoly with "turn")
import os, subprocess
from PIL import Image, ImageDraw
HERE=os.path.dirname(os.path.abspath(__file__))+'/'
for name,out in [('master','turntable-master.png'),('lowpoly','turntable.png')]:
    ims=[]
    for a in (0,90,180,270):
        r=Image.open(f'{HERE}render/{name}_{a:03d}.png').convert('RGBA'); r=r.resize((r.width//2,r.height//2),Image.LANCZOS)
        bg=Image.new('RGBA',r.size,(236,214,190,255)); bg.alpha_composite(r); d=ImageDraw.Draw(bg); d.text((8,8),f'{a} deg',fill=(0,0,0)); ims.append(bg)
    s=Image.new('RGB',(sum(i.width for i in ims)+30,ims[0].height),(255,255,255)); x=0
    for i in ims: s.paste(i.convert('RGB'),(x,0)); x+=i.width+10
    s.save(HERE+out)
