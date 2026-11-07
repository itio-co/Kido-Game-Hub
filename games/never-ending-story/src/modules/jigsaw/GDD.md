# GDD: จิ๊กซอว์ (`jigsaw`)

| ฟิลด์ | ค่า |
|---|---|
| kind | minigame |
| เวอร์ชัน | 1.0.0 |
| เทมเพลต | `docs/gdd/TEMPLATE.md` |
| อ้างอิง | `docs/design/never-ending-story-game-spec-v0.4-th.md` |

## 1. จุดประสงค์ / Pitch
ต่อภาพถ่ายเก่าของครอบครัว

## 2. แฟนตาซีของผู้เล่น
หลานช่วยย่าแก้ปริศนาของเก่าในบ้าน

## 3. Core loop
1. เลือกชิ้น 2. แตะช่องที่ถูก 3. วางครบ → ผ่าน

## 4. กฎและ invariants
- ชิ้นที่วางแล้วอยู่ใน `placed` · `jigPosition()` คำนวณตำแหน่งภาพของชิ้น

## 5. Input / การควบคุม
แตะชิ้นแล้วแตะช่อง

## 6. คะแนนและความยาก
สูตรอยู่ใน `challenge` ruleset 1.1.0 · โหมด challenge ใช้กริดจาก `ruleset.json` 1.0.0: 3×3 / 3×4 / 4×4 · par: 30/50/90 วินาที · เปลี่ยนกริดต้อง bump โมดูลนี้และเพิ่มคีย์ ruleset

## 7. Progression
ใช้ในคดีผ่าน flow engine และในโหมด challenge (คะแนนดีสุดต่อระดับ)

## 8. Content / config surface
ภาพและจำนวนชิ้นใน `puzzle.ts`

## 9. UX / หน้าจอ
บอร์ดปริศนา ปุ่มคำใบ้ หน้าผลลัพธ์ (ผ่าน challenge)

## 10. Data & telemetry (ฟิลด์บนเซิร์ฟเวอร์)
แถว `runs` game ตามคีย์ challenge (`cross`/`jig`/`slide`) difficulty easy/medium/hard

## 11. Dependencies + เวอร์ชัน
ไม่มี dependency (ถูกใช้โดย core, challenge, event-01)

## 12. คำถามที่ยังเปิดอยู่ / Backlog
- **[backlog]** ปริศนาสุ่มจาก seed ทุกระดับ

## 13. Changelog (ผูกกับเวอร์ชันโมดูล)
| เวอร์ชัน | แอป | การเปลี่ยนแปลง |
|---|---|---|
| 1.0.0 | 0.6.5 | แยกกฎเป็นโมดูล |
