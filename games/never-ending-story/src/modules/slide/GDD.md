# GDD: บล็อกเลื่อน (`slide`)

| ฟิลด์ | ค่า |
|---|---|
| kind | minigame |
| เวอร์ชัน | 1.0.0 |
| เทมเพลต | `docs/gdd/TEMPLATE.md` |
| อ้างอิง | `docs/design/never-ending-story-game-spec-v0.4-th.md` |

## 1. จุดประสงค์ / Pitch
เลื่อนบล็อกเพื่อพากุญแจออกทางออก

## 2. แฟนตาซีของผู้เล่น
หลานช่วยย่าแก้ปริศนาของเก่าในบ้าน

## 3. Core loop
1. แตะบล็อก 2. บล็อกเลื่อนตามแนว 3. กุญแจ `K` ถึงขอบ → ชนะ

## 4. กฎและ invariants
- บล็อกซ้อนกันไม่ได้ · `stepBlock()` คืน 0/1/'win'

## 5. Input / การควบคุม
แตะบล็อกเพื่อเลื่อน

## 6. คะแนนและความยาก
สูตรอยู่ใน `challenge` ruleset 1.1.0 · โหมด challenge ใช้ `ruleset.json` 1.0.0: ขนาด 3/3/4, สลับ 16/40/70 ครั้ง · par: 40/70/150 วินาที · เปลี่ยนค่าต้อง bump โมดูลนี้และเพิ่มคีย์ ruleset

## 7. Progression
ใช้ในคดีผ่าน flow engine และในโหมด challenge (คะแนนดีสุดต่อระดับ)

## 8. Content / config surface
ตำแหน่งเริ่มต้นใน `freshSlide()`

## 9. UX / หน้าจอ
บอร์ดปริศนา ปุ่มคำใบ้ หน้าผลลัพธ์ (ผ่าน challenge)

## 10. Data & telemetry (ฟิลด์บนเซิร์ฟเวอร์)
แถว `runs` game ตามคีย์ challenge (`cross`/`jig`/`slide`) difficulty easy/medium/hard

## 11. Dependencies + เวอร์ชัน
minigame-core ^1.0.0 (`slideGame`) ถูกใช้โดย challenge และ event-core

## 12. คำถามที่ยังเปิดอยู่ / Backlog
- **[backlog]** ปริศนาสุ่มจาก seed ทุกระดับ

## 13. Changelog (ผูกกับเวอร์ชันโมดูล)
| เวอร์ชัน | แอป | การเปลี่ยนแปลง |
|---|---|---|
| 1.0.0 | 0.6.5 | แยกกฎเป็นโมดูล |
