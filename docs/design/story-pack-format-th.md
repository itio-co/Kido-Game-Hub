# รูปแบบไฟล์คดี (Story Pack) — ร่าง v0.1

**สถานะ:** รูปแบบโฟลเดอร์อนุมัติแล้ว 22 ต.ค. 2026 · สคีมาด้านล่างเป็นร่าง · ไม่มีโค้ดเกม

## หลักการ
- หนึ่งคดี = หนึ่งโฟลเดอร์: ไฟล์ข้อมูล `case.json` + รูปภาพ + เสียง
- เกมอ่านไฟล์แล้วสร้างคดีเอง เพิ่มคดีที่ 2 ได้โดย **ไม่ต้องแก้โค้ด**
- ข้อเท็จจริงของคดีคงที่ตลอดการเล่น สิ่งที่ผู้เล่นรู้เก็บแยกในเซฟ

```text
story-packs/
  case-01/
    case.json
    images/   (ภาพมุมกว้าง มุมใกล้ แผนผัง)
    audio/    (ดนตรี เสียงประกอบ เสียงพากย์ถ้าอัดจริง)
```

ตัวอย่าง: [`story-packs/case-01/case.json`](story-packs/case-01/case.json) — ตอนนี้ชี้ภาพไปที่ `concepts/v2/` ชั่วคราว ของจริงจะย้ายเข้า `images/` ของคดี

## โครงสร้าง `case.json`

| ส่วน | เนื้อหา |
|---|---|
| `meta` | `id` `title` `version` ภาษา และระบบพิกัด (เปอร์เซ็นต์ของภาพ 9:16; แผนผังใช้พิกเซล) |
| `start` | ห้อง hub ห้องเริ่ม ตัวเลือกความยาก และลำดับเริ่ม (`flow`: hub → event-select → cutscene → difficulty → map) |
| `event` | ข้อมูลการ์ดในหน้าเลือกเหตุการณ์: `id` `title` `subtitle` `cover` (ภาพปก) `order` `unlock` (`null` = เปิดเลย หรือ `{afterCase:"case-01"}`) `lockedHint` (เช่น "ปลดล็อกเมื่อจบคดี 01") |
| `rooms[].calendar` | ปฏิทินในห้อง: `hotspot` (polygon + label) `purpose` (`upcoming`/`clue`) `theme` `themeSwitch` `month` `entries[]` (`date` `icon` `label` และ `clue` หรือ `eventRef`) `timeControl:"day"` |
| `rooms[].clock` | นาฬิกาในห้อง: `hotspot` และ `timeControl:"hour"` |
| `calendarThemes[]` | `id` `name` `colors` `frame` `paperTexture` `font` `headerArt` `unlock` `lockedHint` `asDecor` (ใช้เป็นของตกแต่งได้) |
| `timeSlots[]` | `id` `kind` (`day`/`hour`) `label` `unlockBy` (รหัสหลักฐาน; `null` = เปิดตั้งแต่เริ่ม) `lockedHint` |
| `rooms[].states{slot}` | ภาพห้องต่อช่วงเวลา: `image` `lighting` `changes[]` และ `hotspots[]` ของช่วงนั้น (ช่วง `now` ใช้ hotspots หลัก) — ผู้เขียนเพิ่มสภาพห้องได้โดยไม่แก้โค้ด |
| `cutscene[]` | การ์ตูนเปิดเรื่อง 2–3 หน้า: ต่อหน้ามี `image` (ภาพแนวตั้ง ไม่มีตัวหนังสือ) `caption` (คำบรรยาย) และ `lines[]` (`speaker` `name` `text` `bubble:{x,y}` เป็น % ของภาพ) — ข้อความซ้อนเป็น HTML ใช้ TTS ได้ |
| `rooms[]` | `id` ชื่อ ภาพมุมกว้าง (`wide`) ประตู (`doors`) มุมใกล้ (`closeups`) และเงื่อนไขล็อก |
| `map` | ภาพแผนผังบ้าน ขนาด และพื้นที่แตะของแต่ละห้อง |
| `hotspots[]` | `view` (ห้อง/มุมใกล้) `polygon` `label` `action` (`go` `closeup` `evidence` `minigame` `say` `dialogue` `toast` `hook`) และ `requires` |
| `characters[]` | `id` ชื่อ ภาพ บุคลิก |
| `dialogue[]` | `id` ผู้พูด `text` (ใช้เป็นข้อความ TTS ด้วย; เพิ่ม `tts` ได้ถ้าต้องอ่านต่างจากที่แสดง) ตัวเลือก ลำดับถัดไป และสถานะ (`draft`/`approved`) |
| `evidence[]` | `id` (E01…) ชื่อ ที่พบ (`foundAt`) |
| `hooks[]` | ปมส่งต่อคดีถัดไป (เช่น H01 โปสการ์ด) |
| `minigames[]` | `type` (`crossword` `jigsaw` `sliding-block`) `params` `onComplete` และ `targetTimesHidden` ต่อระดับ (ไม่แสดงต่อผู้เล่น) |
| `stars` | สูตรดาว (อ้างอิงบันทึกการตัดสินใจ) |
| `deduction` | เงื่อนไขเปิด (`unlockWhen`) คำถาม 3 ข้อ ตัวเลือก คำตอบ หลักฐานที่รับ บทใบ้ของย่าเมื่อตอบผิด และสิ่งที่ปลดล็อก |
| `hints[]` | ต่อเป้าหมาย: ระดับ 1 (ข้อความบอกห้อง) ระดับ 2 (วัตถุที่ไฮไลต์) — ระดับ 3 อยู่ในตัวมินิเกม |
| `rewards[]` | ของตกแต่ง/ของที่ระลึก และช่องที่วางได้ |
| `savePoints` | `evidenceFound` `minigameFinished` `caseEnd` |
| `audio` | ดนตรี เสียงประกอบ และเสียงพากย์ (TTS ภาษาไทยในต้นแบบแรก) |

## หน้าเลือกเหตุการณ์และการ์ตูนเปิดเรื่อง
- เกมรวม `event` จากทุก Story Pack ที่ติดตั้งเป็นรายการการ์ด (เรียงตาม `order`) ตัวอย่างผลลัพธ์: [`story-packs/events.json`](story-packs/events.json) — คดีที่ยังไม่มีไฟล์ใส่เป็นรายการ `upcoming` ได้
- ตรวจ `unlock` กับความคืบหน้าของผู้เล่น ถ้ายังไม่ผ่าน แสดงเงาสีเข้ม + `lockedHint`
- เลือกเหตุการณ์แล้วเล่น `cutscene[]` ตามลำดับ (ข้ามได้) แล้วไปตัวเลือกความยาก คดีใหม่กำหนดการ์ตูนของตัวเองได้โดยไม่แก้โค้ด
- กติกาตรวจไฟล์: `cutscene` 2–3 หน้า ทุกหน้ามี `image` และ `caption` ข้อความสั้นภาษาง่าย

## ชุดด่านโหมดฝึก (Practice Level Pack)
- โจทย์ในคดีอยู่ใน `minigames[]` ของคดี ส่วนโหมดฝึกใช้ **ชุดด่านที่เขียนไว้ล่วงหน้า** แยกต่อประเภทมินิเกม แสดงเป็นแผนที่ด่าน (Map Travel)
- ความยากไล่ตามลำดับด่าน ตัวเลือกง่าย/ปานกลาง/ยากใช้เฉพาะในคดี
- คดีระบุ `type` ให้ตรงกัน เพื่อให้รู้ว่าเล่นแล้วปลดล็อกแผนที่ด่านของประเภทใด
- ดาว ความชำนาญ และสถิติดีที่สุดใช้สูตรเดียวกับในคดี

```text
practice-packs/
  jigsaw/
    pack.json        (ธีม ภาพพื้นหลังแผนที่ รายการด่าน)
    levels/001.json  …
    images/
```

```json
{ "type": "jigsaw", "version": "0.1", "theme": "paper-map",
  "mapBackground": "images/map-bg.jpg",
  "levels": [
    { "n": 1, "params": { "image": "images/l001.jpg", "pieces": 6 },  "targetTimeHidden": "02:00" },
    { "n": 2, "params": { "image": "images/l002.jpg", "pieces": 9 },  "targetTimeHidden": "02:30", "unlockAfter": 1 }
  ] }
```
- ความคืบหน้าในเซฟ: `practice.<type>.levels[n] = { bestStars, bestTime }` ด่านถัดไปเปิดเมื่อผ่านด่านก่อนหน้า (≥1 ดาว)

## ทะเบียนมินิเกม (Minigame Registry)
- `minigame-registry.json`: ต่อ `type` มี `name` `icon` `category` (คำ/ภาพ/ตรรกะ) `practicePack` — มุมฝึกเล่นสร้างการ์ดจากทะเบียนนี้ และปลดล็อกเมื่อผู้เล่นเล่น `type` นั้นในคดี

## กติกาตรวจไฟล์ (เสนอ)
- `id` ไม่ซ้ำ ทุกการอ้างอิง (`to` `hotspot` `evidence` `minigame` `line`) ต้องมีอยู่จริง
- หลักฐานที่ `deduction.unlockWhen` ต้องการ ต้องหาได้ก่อนกล่องถูกล็อก
- มินิเกมต้องมีเส้นทางแก้ได้จริง และมีเวลาเป้าหมายครบทุกระดับ
- ภาพทุกภาพมีอยู่ในโฟลเดอร์คดี

## ยังไม่ล็อก
- ชื่อไฟล์/นามสกุล (`.json` หรือรูปแบบอื่น) การแปลหลายภาษา และการบีบอัดแพ็กสำหรับดาวน์โหลด
