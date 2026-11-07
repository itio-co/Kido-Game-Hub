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
1. เลือกเกม+ระดับ (seed) 2. เล่น 3. ได้คะแนน 4. แชร์ลิงก์ `#/challenge/<game>/<diff>/<seed>` 5. ส่งคะแนนออนไลน์

## 4. กฎและ invariants
- seed เดียวกัน = ปริศนาเดียวกัน
- คะแนนสูงชนะ เท่ากันเวลาน้อยชนะ (`compare`)
- run token = protobuf + แท็ก SHA-256 6 ไบต์ (`runProto.ts`) ตรวจที่ Worker

## 5. Input / การควบคุม
ปุ่มเริ่ม แชร์ ดูกระดาน

## 6. คะแนนและความยาก
`scoreFor()` + `DIFF_MULT` + `PAR_SECONDS` (ดู GDD มินิเกม) · ระดับ easy/medium/hard

## 7. Progression
คะแนนดีสุดต่อเกม/ระดับในเครื่อง + อันดับออนไลน์

## 8. Content / config surface
`PAR_SECONDS`, `DIFF_MULT`, รายชื่อเกมบนกระดาน (`BOARD_GAMES` ใน `LeaderboardView`) รวม edition ของ rhythm (`stirfry`)

## 9. UX / หน้าจอ
ChallengeView, LeaderboardView (แท็บเกม; stirfry ไม่มีแท็บระดับ)

## 10. Data & telemetry (ฟิลด์บนเซิร์ฟเวอร์)
`POST /never/api/runs`: sessionId, playerId, game, difficulty, seed, score, timeMs, version, ts, verified, integrity_ok · `GET` leaderboard ต่อ game/difficulty

## 11. Dependencies + เวอร์ชัน
core, crossword, jigsaw, slide

## 12. คำถามที่ยังเปิดอยู่ / Backlog
- **[backlog]** กระดานรายสัปดาห์

## 13. Changelog (ผูกกับเวอร์ชันโมดูล)
| เวอร์ชัน | แอป | การเปลี่ยนแปลง |
|---|---|---|
| 1.1.0 | 0.6.9 | export `packRun`, กระดานรองรับ stirfry |
| 1.0.0 | 0.6.5 | แยกเป็นโมดูล |
