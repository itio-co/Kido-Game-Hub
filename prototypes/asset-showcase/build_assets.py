#!/usr/bin/env python3
"""Build assets.json from the real prototype images + Story Pack case.json, then embed it into index.html.
Run: python3 prototypes/asset-showcase/build_assets.py  (from repo root or anywhere)"""
import json,os,re,glob
from PIL import Image
H=os.path.dirname(os.path.abspath(__file__));ROOT=os.path.abspath(H+'/../..')
IMG=ROOT+'/prototypes/poc-clickthrough/img';CON=ROOT+'/docs/design/concepts/v2'
case=json.load(open(ROOT+'/docs/design/story-packs/case-01/case.json'))
html=open(ROOT+'/prototypes/poc-clickthrough/index.html').read()
P=lambda f:'../poc-clickthrough/img/'+f
def A(id,th,en,cat,src,crop,scenes,status='concept-only',note=''):
  return dict(id=id,nameTh=th,nameEn=en,category=cat,thumb=dict(src=src,crop=crop) if src else None,scenes=scenes,status=status,note=note)
a3=[
 A('grandma-mali','ย่ามะลิ','Grandma Mali','character',P('living-grandma.jpg'),[22,8,58,58],['living','cutscene p2-p3'],'concept-only','ภาพอ้างอิงสไตล์ low-poly'),
 A('child-player','หนู (ตัวละครผู้เล่น)','Child (player)','character',P('cutscene-01-p1.jpg'),[8,34,40,32],['cutscene p1-p3'],'concept-only','ผมทรงกะลาครอบสีดำ เสื้อเหลือง กางเกงน้ำเงิน — พลังควบคุมเวลา'),
 A('mom','แม่','Mom','character',P('cutscene-01-p1.jpg'),[34,0,46,32],['cutscene p1-p2']),
 A('uncle-mek','ลุงเมฆ','Uncle Mek','character',P('uncle-mek.jpg'),[28,10,52,48],['living']),
 A('aunt-rin','น้าริน','Aunt Rin','character',P('rin.jpg'),[22,8,58,58],['living@afternoon','deduction','ending'],'concept-only','ผมหางม้าต่ำ เสื้อเขียวอ่อน ผ้ากันเปื้อน — ผู้ย้ายอัลบั้ม (ไม่ใช่คนร้าย)'),
 A('room-player','ห้องของฉัน','Player room (hub)','room',P('player-room-wide.jpg'),[0,0,100,100],['room']),
 A('room-living','ห้องนั่งเล่นบ้านย่า','Grandma living room','room',P('living-wide.jpg'),[0,0,100,100],['living (3 ช่วงเวลา)']),
 A('room-study','ห้องทำงาน','Study','room',P('study-wide.jpg'),[0,0,100,100],['study']),
 A('room-kitchen','ครัว','Kitchen','room',P('kitchen-wide.jpg'),[0,0,100,100],['kitchen']),
 A('house-exterior','บ้านไม้ของย่า (ภายนอก)','Grandma house exterior','room',P('cutscene-01-p2.jpg'),[0,0,100,32],['cutscene p2']),
 A('album','อัลบั้มครอบครัว (ปกดอกไม้)','Family album','prop',P('living-wide-afternoon.jpg'),[46,63,24,11],['living@afternoon','living@yesterday','album'],'to-model'),
 A('star-box','กล่องสีน้ำเงินรูปดาว','Blue star box','prop',P('study-box.jpg'),[4,33,92,48],['study','box'],'to-model'),
 A('sliding-lock','ตัวล็อกเลื่อนบล็อก','Sliding-block lock','prop',P('study-box.jpg'),[16,34,72,24],['box'],'to-model'),
 A('leaf-box','กล่องรูปใบไม้','Leaf box (decoy)','prop',P('study-wide.jpg'),[57,57,20,14],['study'],'to-model'),
 A('toy-star-box','กล่องของเล่นรูปดาว','Toy star box (decoy)','prop',P('living-wide.jpg'),[74,65,20,12],['living'],'to-model'),
 A('coffee-table','โต๊ะกลาง','Coffee table','prop',P('living-table.jpg'),[0,8,100,70],['living','table'],'to-model'),
 A('rin-note','ข้อความของน้าริน','Rin\'s note','prop',P('living-table.jpg'),[16,21,38,20],['table'],'to-model'),
 A('vase','แจกันดอกไม้','Flower vase','prop',P('kitchen-close.jpg'),[43,32,52,55],['living','kitchen'],'to-model'),
 A('wet-cloth','ผ้าเปียก','Wet cloth','prop',P('kitchen-close.jpg'),[6,17,45,50],['kitchen'],'to-model'),
 A('map-pieces','ชิ้นแผนผังแม่เหล็ก + ถาด','Magnetic map pieces + tray','prop',P('living-shelf-tray.jpg'),[0,47,100,38],['tray','jigsaw'],'to-model'),
 A('postcard','โปสการ์ดห้องสมุดวันวาน','Library postcard','prop',P('album-found.jpg'),[60,30,40,30],['album'],'to-model'),
 A('calendar-wall','ปฏิทินแขวน (ห้องเด็ก)','Wall calendar (kid room)','prop',P('player-room-wide.jpg'),[33,25,17,13],['room'],'to-model','แตะเพื่อเปิด UI ปฏิทิน · ใช้ธีมได้'),
 A('calendar-grandma','ปฏิทินของย่า','Grandma calendar','prop',P('living-wide.jpg'),[72,21,17,12],['living'],'to-model','ควบคุมวัน (ย้อนวัน)'),
 A('clock','นาฬิกาแขวน','Wall clock','prop',P('living-wide.jpg'),[6,8,14,9],['living'],'to-model','ควบคุมชั่วโมง (ย้อนเวลา)'),
 A('grandpa-photo','กรอบรูปตา','Grandpa photo frame','decor',P('album-found.jpg'),[18,30,38,30],['ของรางวัล → ช่องตกแต่ง'],'to-model'),
 A('keepsake-shelf','ชั้นของที่ระลึก','Keepsake shelf','decor',P('player-room-wide.jpg'),[57,23,28,12],['room'],'to-model'),
 A('rug','พรมห้องเด็ก','Kid room rug','decor',P('player-room-wide.jpg'),[3,64,96,34],['room'],'to-model'),
]
# 2D images actually in the prototype
used=lambda f:sorted(set(re.findall(r"(\w+):\{title:'([^']+)'[^\n]*"+re.escape(f),html)))
def cat(f):
  if f.startswith('cutscene'):return 'cutscene'
  if '-afternoon' in f or '-yesterday' in f:return 'time-state'
  if 'map' in f:return 'map'
  if f.endswith('-wide.jpg'):return 'background'
  return 'closeup'
i2=[]
for p in sorted(glob.glob(IMG+'/*.jpg')):
  f=os.path.basename(p);im=Image.open(p);w=[f"{k} ({t})" for k,t in used(f)]
  if f.startswith('cutscene'):w=['cutscene: case-01 page '+f[-5]]
  if '-afternoon' in f or '-yesterday' in f:w=['living @ '+f.split('-')[-1][:-4]]
  if f=='cutscene-01-p2.jpg':w.append('event card cover')
  if f=='rin.jpg':w=['น้าริน portrait · deduction (ใครย้ายอัลบั้ม?)']
  if f=='living-wide.jpg':w=['living @ now (ค่าเริ่ม)']
  if f=='house-map.jpg':w.append('jigsaw pieces / deduction mini-map')
  i2.append(dict(file='prototypes/poc-clickthrough/img/'+f,thumb=P(f),category=cat(f),usedIn=w or ['(closeup)'],size=f"{im.width}×{im.height}",kb=round(os.path.getsize(p)/1024)))
for p in sorted(glob.glob(CON+'/minigame-*.png')):
  f=os.path.basename(p);im=Image.open(p)
  i2.append(dict(file='docs/design/concepts/v2/'+f,thumb='../../docs/design/concepts/v2/'+f,category='minigame',usedIn=['minigame screenshot ('+f[9:-4]+')'],size=f"{im.width}×{im.height}",kb=round(os.path.getsize(p)/1024)))
states=[]
for r in case['rooms']:
  for k,v in (r.get('states') or {}).items():states.append(dict(room=r['id'],slot=k,image=v['image'],changes=v.get('changes',[]),lighting=v.get('lighting','')))
data=dict(generatedFrom=['prototypes/poc-clickthrough/img/*','docs/design/story-packs/case-01/case.json'],assets3d=a3,images2d=i2,calendarThemes=case.get('calendarThemes',[]),timeSlots=case.get('timeSlots',[]),roomStates=states)
js=json.dumps(data,ensure_ascii=False,indent=1)
open(H+'/assets.json','w').write(js+'\n')
ix=open(H+'/index.html').read()
ix=re.sub(r'(<script id="fallback" type="application/json">).*?(</script>)',lambda m:m.group(1)+js.replace('</','<\\/')+m.group(2),ix,flags=re.S)
open(H+'/index.html','w').write(ix);print(len(a3),'3D assets,',len(i2),'2D images,',len(states),'states')
