# GDD: โหมดท้าเพื่อน (Challenge) (`challenge`)

| ฟิลด์ | ค่า |
|---|---|
| kind | feature |
| เวอร์ชัน | 1.1.0 |
| เทมเพลต | `docs/gdd/TEMPLATE.md` |
| อ้างอิง | `docs/design/never-ending-story-game-spec-v0.4-th.md` |

## 1. จุดประสงค์ / Pitch
ทำให้มินิเกมเล่นซ้ำได้แบบมีคะแนน ท้าเพื่อนผ่านลิงก์ และขึ้นกระดานคะแนนออนไลน์

## 2. แฟนตาซีของผู้เล่น
แข่งกับเพื่อนในปริศนาชุดเดียวกัน

## 3. Core loop
1. เลือกเกม+ระดับ (seed) 2. เล่น 3. ได้คะแนน 4. แชร์ลิงก์ `#/challenge/<game>/<diff>/<seed>/<ruleset>` เช่น `challenge@1.1.0+crossword@1.0.0` 5. ส่งคะแนนออนไลน์พร้อม `ruleset`

## 4. กฎและ invariants
- seed เดียวกัน = ปริศนาเดียวกัน
- คะแนนสูงชนะ เท่ากันเวลาน้อยชนะ (`compare`)
- run token = protobuf + แท็ก SHA-256 6 ไบต์ (`runProto.ts`) ตรวจที่ Worker

## 5. Input / การควบคุม
ปุ่มเริ่ม แชร์ ดูกระดาน

## 6. คะแนนและความยาก
`scoreFor()` อ่าน `ruleset.json` คีย์ 1.1.0 (`correct` 100, `combo` 20, `mistake` 40, `hint` 150, `timeBonus` 10, `mult`, `par`) · ระดับ easy/medium/hard · จำนวนคำ/กริด/จำนวนสลับของแต่ละเกมอยู่ใน ruleset ของมินิเกมนั้น ไม่ได้อยู่ในไฟล์นี้

## 7. Progression
คะแนนดีสุดต่อเกม/ระดับในเครื่อง + อันดับออนไลน์

## 8. Content / config surface
`ruleset.json`, รายชื่อเกมบนกระดาน (`BOARD_GAMES` ใน `LeaderboardView`) รวม pack ของ rhythm (`stirfry`) · ป้ายกระดานแสดงกติกาที่กำลังดู

## 9. UX / หน้าจอ
ChallengeView, LeaderboardView (แท็บเกม; stirfry ใช้ระดับ easy/normal/hard) · แบนเนอร์แสดงกติกา · ลิงก์ที่อ้างเวอร์ชันที่ไม่มีใน registry ขึ้นข้อความแล้วให้เล่นกติกาปัจจุบัน

## 10. Data & telemetry (ฟิลด์บนเซิร์ฟเวอร์)
`POST /never/api/runs`: sessionId, playerId, game, difficulty, seed, score, timeMs, version, **ruleset**, ts, verified, integrity_ok · `GET` leaderboard ต่อ game + difficulty + ruleset (เวอร์ชันแอปไม่แยกกระดาน) · ruleset ว่างในโทเคนเก่า = กติกา 0.6.10

## 11. Dependencies + เวอร์ชัน
minigame-core ^1.0.0 (ลิงก์, เฟสจบรอบ, โทเคน, เปลือกกติกา), core, crossword, jigsaw, slide

โหมด challenge ไม่ถูกยุบเข้า minigame-core เพราะกระดานปริศนาและสูตรคะแนนเป็นของฟีเจอร์นี้ rhythm ไม่ควรต้องดึง crossword มาด้วย

## 12. คำถามที่ยังเปิดอยู่ / Backlog
- **[backlog]** กระดานรายสัปดาห์

## 13. Changelog (ผูกกับเวอร์ชันโมดูล)
| เวอร์ชัน | แอป | การเปลี่ยนแปลง |
|---|---|---|
| 1.1.0 | 0.6.11 | ตรึงสูตรคะแนน 1.1.0 ใน ruleset.json (ตัวเลขไม่เปลี่ยน), ลิงก์และกระดานติดกติกา |
| 1.1.0 | 0.6.9 | export `packRun`, กระดานรองรับ stirfry |
| 1.0.0 | 0.6.5 | แยกเป็นโมดูล |

## การแยก deployment space
ใช้ APP_BASE จาก Worker เพื่อแยกข้อมูลในเบราว์เซอร์ของแต่ละ space โดยไม่แก้ข้อมูล production; God ใช้ชื่อและ path ของ cookie แยกตาม base และต้องตั้ง secret แยกกัน
