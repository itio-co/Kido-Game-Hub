# GDD: ผัดกับย่า (Stir-fry with Grandma) (`stirfry`)

| ฟิลด์ | ค่า |
|---|---|
| kind | edition (mechanism: `rhythm`) |
| เวอร์ชัน | 1.2.0 |
| เทมเพลต | `docs/gdd/TEMPLATE.md` |
| อ้างอิง | `docs/design/never-ending-story-game-spec-v0.4-th.md` |

## 1. จุดประสงค์ / Pitch
ผัดกระทะกับย่ามะลิให้เข้าจังหวะ ภาพเหมือนจริง อาหารในกระทะเปลี่ยนตามการผัด

## 2. แฟนตาซีของผู้เล่น
ยืนหน้าเตาแก๊สในครัวไทย ผัดไปกับย่า เห็นอาหารสุกขึ้นทีละขั้น

## 3. Core loop
ใช้ core loop ของ `rhythm`: ผัดตามจังหวะ (ปุ่มหลัก) ใส่วัตถุดิบเมื่อย่าบอก (ปุ่มพิเศษ) คุมไฟ (แรงดัน = ความร้อน)

## 4. กฎและ invariants
- ไม่เปลี่ยนกฎของ rhythm
- `storageKey` = `nesg.stirfry.v1` เท่าเดิม เซฟเดิมไม่หาย
- ภาพกระทะ: progress <30 ดิบ, <70 สุกครึ่ง, ≥70 สุก; ความร้อน >78 เริ่มไหม้ (เต็มที่ 96)

## 5. Input / การควบคุม
ปุ่ม "ผัด" และ "ใส่วัตถุดิบ"

## 6. คะแนนและความยาก
ตาม `rhythm` (`DEFAULT_PARAMS` + `paramsFor`) เลือกระดับ ง่าย / ปกติ / ยาก ก่อนเริ่ม · กระดานคะแนน `stirfry` แยกตามระดับ · ลิงก์ท้า `#/play/stirfry/<ระดับ>/<seed>` ได้ชาร์ตใส่เครื่องเดียวกัน

## 7. Progression
ดาวและคะแนนดีสุดตาม rhythm แสดงในสมุดของ FlowView

## 8. Content / config surface
**mechanism:** `rhythm` ^1.1.0. edition ปรับ:
- theme: `public/img/stirfry/kitchen.webp` (สร้างด้วย GenerateImage)
- Stage `WokStage.svelte`: `wok-raw/half/cooked/burnt/toss.webp`
- onJudge → hit: ภาพโยนกระทะ + ไอน้ำ 260 ms; miss: สั่น + โทนแดง 380 ms; ไหม้ >0.3: ควัน
- คำไทย prefix `stirfry.*` ใน locales
- params: ค่าตั้งต้นทั้งหมด

## 9. UX / หน้าจอ
ครัวเป็นพื้นหลัง กระทะเต็มกรอบ ปุ่มผัด/ใส่วัตถุดิบด้านล่าง หน้าผลลัพธ์มีปุ่มกระดานคะแนน

## 10. Data & telemetry (ฟิลด์บนเซิร์ฟเวอร์)
แถว `runs` game = `stirfry`, difficulty = easy/normal/hard, seed = seed ของชาร์ต, version มี `rhythm@x;stirfry`

## 11. Dependencies + เวอร์ชัน
rhythm ^1.1.0, core >=0.6.10

## 12. คำถามที่ยังเปิดอยู่ / Backlog
- **[backlog]** หลายเมนู (ภาพวัตถุดิบต่างกัน)
- **[backlog]** เสียงฉ่า

## 13. Changelog (ผูกกับเวอร์ชันโมดูล)
| เวอร์ชัน | แอป | การเปลี่ยนแปลง |
|---|---|---|
| 1.2.0 | 0.6.10 | เลือกระดับ, ชาร์ตตาม seed, ลิงก์ท้า, ท่ากระทะ miss/hit ไม่ซ้อนกัน |
| 1.1.0 | 0.6.9 | คะแนนขึ้นเซิร์ฟเวอร์, ธีมภาพจริง, กระทะเปลี่ยนตามจังหวะ, เป็น edition ของ rhythm |
| 1.0.0 | 0.6.5 | แยกเป็นโมดูล |
