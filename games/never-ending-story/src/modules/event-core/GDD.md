# GDD: แกนอีเวนต์ (`event-core`)

| ฟิลด์ | ค่า |
|---|---|
| kind | event-core |
| เวอร์ชัน | 1.0.0 |
| เทมเพลต | `docs/gdd/TEMPLATE.md` |
| อ้างอิง | `docs/design/story-pack-format-th.md` |

## 1. จุดประสงค์ / Pitch
เฟรมเวิร์กของทุกคดี: เปิด story pack, ฉากตัด, แผนผังบ้าน, สมุดคดี, HUD ของเหตุการณ์, มินิเกมในคดี และเอกสารความคืบหน้าที่ขึ้น D1

## 2. แฟนตาซีของผู้เล่น
หลานเดินในบ้านย่า เก็บหลักฐาน เปิดสมุดคดี แล้วเล่นมินิเกมที่ติดอยู่ในฉาก เนื้อเรื่องมาจากแพ็กอย่าง event-01

## 3. Core loop
1. `loadFlow` โหลด `screens.json` + `case-flow.json`
2. `createFlow` จำหน้าจอ หลักฐาน เวลา และด่านฝึก
3. `FlowView` วาดฉาก ฮอตสปอต ตัดฉาก (`ComicPanel`) แผนที่ด่าน และสมุดคดี
4. `primaryEventId` คือเหตุการณ์ที่ไม่มี `unlockAfter` ฉากจบคือ `endingIdFor`
5. `eventProgressBody` สร้างก้อนที่ `cloudSync` ส่ง `PUT /players/me/events/:id`

## 4. กฎและ invariants
- โค้ดเฟรมเวิร์กไม่ฝังบทคดี ข้อความที่ยังฝังใน `FlowView` / `Minigames` เป็นสำเนาเดิมของ UI ก่อนแยกโมดูล
- เหตุการณ์แรกในข้อมูลปัจจุบันคือ `case-01` ฉากจบ `case-01-ending` เหมือนเดิม
- สมุดคดีโชว์เมื่อ `showCaseUi` (context เป็น event และไม่ใช่โหมดฝึก)
- `playMode` คืน practice / story / challenge ตาม context ไม่เปลี่ยนเส้นทางหน้าจอ

## 5. Input / การควบคุม
แตะฮอตสปอต เลือกบทพูด พลิกหน้าการ์ตูน ปุ่มย้อน สมุดคดี ด่านฝึก บนจอแนวตั้ง

## 6. คะแนนและความยาก
มินิเกมในคดีใช้ดาวจากจำนวนคำใบ้ (`starCount`) ไม่ส่งกระดานออนไลน์ ระดับความยากเลือกในฉาก difficulty ของแพ็ก

## 7. Progression
หลักฐาน, ไขคดี, โปสเตอร์, ด่านฝึก เก็บในเซฟเดิม (`flow` ใน `nesg.player.v1`)

## 8. Content / config surface
story pack JSON รูปใน `public/img/` แพ็ก event-01 กำหนด `EVENT_ID`

## 9. UX / หน้าจอ
`FlowView` รวมแผนผังบ้าน ห้อง สมุดคดี กระดานคดี ฉากจบ และ `Minigames` (crossword, jigsaw, slide)

## 10. Data & telemetry (ฟิลด์บนเซิร์ฟเวอร์)
`eventProgressBody` ให้ `{ status, progress: { evidence, solved, deduced, reward, posterShown, endingSeen, seen } }` เหมือนเดิม ตาราง `player_events` ไม่เปลี่ยน

## 11. Dependencies + เวอร์ชัน
core >=0.6.12, minigame-core ^1.0.0, crossword, jigsaw, slide ^1.0.0, stirfry ^1.1.0 (สมุดคดีอ่านสถิติผัด)

## 12. คำถามที่ยังเปิดอยู่ / Backlog
- **[backlog]** ย้ายข้อความไทยที่ยังฝังใน FlowView เข้า locales
- **[backlog]** ให้แพ็กเหตุการณ์ถัดไปลงทะเบียนโดยไม่แก้เฟรมเวิร์ก

## 13. Changelog (ผูกกับเวอร์ชันโมดูล)
| เวอร์ชัน | แอป | การเปลี่ยนแปลง |
|---|---|---|
| 1.0.0 | 0.6.12 | ย้าย flow engine, ฉาก, สมุดคดี และเอกสาร D1 ออกจาก core |
