"""Make review sheets from the source crop and Blender renders (Pillow only)."""
from pathlib import Path
from PIL import Image, ImageDraw
HERE = Path(__file__).resolve().parent.parent
ref = Image.open(HERE / 'ref/clock-ref.png').convert('RGBA').resize((384,432))
for variant in ('lowpoly','master'):
    model = Image.open(HERE / f'compare/matched-{variant}.png').convert('RGBA')
    studio = Image.new('RGBA',model.size,'#dbc4a4')
    studio.alpha_composite(model)
    out = Image.new('RGB',(768,464),'#f7f0e5')
    out.paste(ref,(0,32))
    out.paste(studio,(384,32))
    text = ImageDraw.Draw(out)
    text.text((12,10),'Original game reference (96 x 108 px)',fill='#402b1d')
    text.text((396,10),f'{variant} / approximate matched camera',fill='#402b1d')
    out.save(HERE / f'compare/side-by-side-{variant}.png')
    overlay = ref.copy()
    model.putalpha(model.getchannel('A').point(lambda a: round(a*.5)))
    overlay.alpha_composite(model)
    overlay.convert('RGB').save(HERE / f'compare/overlay-{variant}.png')
views=['front','three-quarter','rear']
out=Image.new('RGB',(512*len(views),544),'#f7f0e5')
text=ImageDraw.Draw(out)
for i,name in enumerate(views):
    render=Image.open(HERE / f'compare/{name}.png').convert('RGBA')
    base=Image.new('RGBA',render.size,'#dbc4a4')
    base.alpha_composite(render)
    out.paste(base,(512*i,32))
    text.text((512*i+12,10),name,fill='#402b1d')
out.save(HERE / 'compare/turntable-master.png')
