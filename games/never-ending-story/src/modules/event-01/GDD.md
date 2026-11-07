# GDD: คดีที่ 1: อัลบั้มครอบครัวที่หายไป (`event-01`)

| ฟิลด์ | ค่า |
|---|---|
| kind | event |
| เวอร์ชัน | 1.0.0 |
| เทมเพลต | `docs/gdd/TEMPLATE.md` |
| อ้างอิง | `docs/design/never-ending-story-game-spec-v0.4-th.md` |

## 1. จุดประสงค์ / Pitch
คดีแรกของเกม: ตามหาอัลบั้มครอบครัวที่หายไปในบ้านย่า

## 2. แฟนตาซีของผู้เล่น
นักสืบตัวน้อยที่ค้นบ้านย่า เก็บหลักฐาน และฟังเรื่องครอบครัว

## 3. Core loop
1. รับคดีจากย่า 2. สำรวจห้อง เก็บหลักฐาน 3. แก้มินิเกม (crossword, jigsaw, slide) 4. ตอบคำถาม 5. ฉากจบ

## 4. กฎและ invariants
- ข้อมูลทั้งหมดอยู่ใน `public/data/case-flow.json` (pages, evidence, slots, scenes, dialogues, games, questions, goals)
- โค้ดไม่ฝังเนื้อเรื่อง

## 5. Input / การควบคุม
แตะฉาก / หลักฐาน / ตัวเลือก

## 6. คะแนนและความยาก
ระดับตาม `difficulties` ใน story pack

## 7. Progression
ความคืบหน้าใน `player_events` และ funnel ในหน้า god Event

## 8. Content / config surface
story pack JSON (ดู `docs/design/story-pack-format-th.md`, `docs/design/never-ending-story-game-case-01-missing-family-album-th.md`)

## 9. UX / หน้าจอ
เนื้อหานี้เล่นผ่าน `event-core` (`FlowView`): ฉากตัด, แผนผังบ้าน, สมุดคดี, มินิเกม crossword / jigsaw / slide

## 10. Data & telemetry (ฟิลด์บนเซิร์ฟเวอร์)
`player_events`: eventId, status, progress_json

## 11. Dependencies + เวอร์ชัน
event-core ^1.0.0, core >=0.6.12, crossword, jigsaw, slide

## 12. คำถามที่ยังเปิดอยู่ / Backlog
- **[backlog]** ใส่ผัดกับย่าในเนื้อเรื่องคดี

## 13. Changelog (ผูกกับเวอร์ชันโมดูล)
| เวอร์ชัน | แอป | การเปลี่ยนแปลง |
|---|---|---|
| 1.0.0 | 0.6.12 | ยังเป็นคอนเทนต์คดี 1 วางบน event-core (`EVENT_ID` case-01, ฉากจบ case-01-ending) ไม่เปลี่ยนข้อมูล |
| 1.0.0 | 0.6.5 | แยกเป็นโมดูล |
