# GDD: ผัดกับย่า (Stir-fry with Grandma) (`stirfry`)

| ฟิลด์ | ค่า |
|---|---|
| kind | pack (mechanism: `rhythm`) |
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
ตาม `rhythm` (`ruleset.json` 1.2.0 คือ params ของแพ็ก + `paramsFor` ของ engine) เลือกระดับ ง่าย / ปกติ / ยาก ก่อนเริ่ม · กระดาน `stirfry` แยกตามระดับ **และ** กติกา `rhythm@1.1.0+stirfry@1.2.0` · ลิงก์ท้า `#/play/stirfry/<ระดับ>/<seed>/rhythm@1.1.0+stirfry@1.2.0` ได้ชาร์ตและหน้าต่างเวลาชุดเดียวกัน · ลิงก์ไม่มีเวอร์ชันยังเล่นได้ เป็นกติกา 0.6.10 ซึ่งตอนนี้เท่ากับชุดนี้

## 7. Progression
ดาวและคะแนนดีสุดตาม rhythm แสดงในสมุดของ FlowView

## 8. Content / config surface
**mechanism:** `rhythm` ^1.1.0. pack ปรับ (`pack` ใน `module.json`, โค้ดใน `pack.ts`):
- theme: `public/img/stirfry/kitchen.webp` (สร้างด้วย GenerateImage)
- Stage `WokStage.svelte`: `wok-raw/half/cooked/burnt/toss.webp`
- onJudge → hit: ภาพโยนกระทะ + ไอน้ำ 260 ms; miss: สั่น + โทนแดง 380 ms; ไหม้ >0.3: ควัน
- คำไทย prefix `stirfry.*` ใน locales
- params: ตรึงใน `ruleset.json` คีย์ `1.2.0` (ไม่ดึงค่าปัจจุบันของ engine ตอนเล่นลิงก์เก่า) รวมช่วงรูปกระทะ `cook` 30/70, ไหม้เริ่ม 78 ช่วง 18, ควันที่ burnt > 0.3, ท่า hit/miss 260/380 ms

## 9. UX / หน้าจอ
ครัวเป็นพื้นหลัง กระทะเต็มกรอบ ปุ่มผัด/ใส่วัตถุดิบด้านล่าง หน้าผลลัพธ์มีปุ่มกระดานคะแนน

## 10. Data & telemetry (ฟิลด์บนเซิร์ฟเวอร์)
แถว `runs` game = `stirfry`, difficulty = easy/normal/hard, seed = seed ของชาร์ต, `ruleset` = `rhythm@<engine>+stirfry@<pack>` (ตอนนี้ `rhythm@1.1.0+stirfry@1.2.0`). `version` มีเวอร์ชันแอปนำหน้า แต่ไม่ได้ใช้แยกกระดาน

## 11. Dependencies + เวอร์ชัน
rhythm ^1.1.0, core >=0.6.10

## 12. คำถามที่ยังเปิดอยู่ / Backlog
- **[backlog]** หลายเมนู (ภาพวัตถุดิบต่างกัน)
- **[backlog]** เสียงฉ่า

## 13. Changelog (ผูกกับเวอร์ชันโมดูล)
| เวอร์ชัน | แอป | การเปลี่ยนแปลง |
|---|---|---|
| 1.2.0 | 0.6.11 | เปลี่ยนชื่อ kind เป็น pack, ตรึงกติกา 1.2.0 ใน ruleset.json (ค่าเล่นไม่เปลี่ยน), ลิงก์แชร์ติด rhythm@+stirfry@ |
| 1.2.0 | 0.6.10 | เลือกระดับ, ชาร์ตตาม seed, ลิงก์ท้า, ท่ากระทะ miss/hit ไม่ซ้อนกัน |
| 1.1.0 | 0.6.9 | คะแนนขึ้นเซิร์ฟเวอร์, ธีมภาพจริง, กระทะเปลี่ยนตามจังหวะ, เป็น pack ของ rhythm |
| 1.0.0 | 0.6.5 | แยกเป็นโมดูล |
