# GDD: ปริศนาอักษรไขว้ (`crossword`)

| ฟิลด์ | ค่า |
|---|---|
| kind | minigame |
| เวอร์ชัน | 1.0.0 |
| เทมเพลต | `docs/gdd/TEMPLATE.md` |
| อ้างอิง | `docs/design/never-ending-story-game-spec-v0.4-th.md` |

## 1. จุดประสงค์ / Pitch
อักษรไขว้คำไทยสั้นๆ

## 2. แฟนตาซีของผู้เล่น
หลานช่วยย่าแก้ปริศนาของเก่าในบ้าน

## 3. Core loop
1. เลือกช่อง 2. เลือกตัวอักษรจากแป้น 3. ถูกครบทุกช่อง → ผ่าน

## 4. กฎและ invariants
- คำตอบอยู่ใน `CROSS_SOLUTION` · `crossCorrect()` ตรวจทุกช่อง

## 5. Input / การควบคุม
แตะช่องแล้วแตะตัวอักษรบนแป้น (`CROSS_KEYS`)

## 6. คะแนนและความยาก
สูตร `challenge.scoreFor`: (correct×100 + maxCombo×20 − mistakes×40 − hints×150 + (par − วินาที)×10) × ตัวคูณ (easy 1, medium 1.5, hard 2) · par: 45/75/110 วินาที

## 7. Progression
ใช้ในคดีผ่าน flow engine และในโหมด challenge (คะแนนดีสุดต่อระดับ)

## 8. Content / config surface
กริด `CROSS_GRID`, หมายเลข `CROSS_NUM`, แป้น `CROSS_KEYS` ใน `puzzle.ts`

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
