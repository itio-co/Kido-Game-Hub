# GDD: แกนมินิเกม (`minigame-core`)

| ฟิลด์ | ค่า |
|---|---|
| kind | minigame-core |
| เวอร์ชัน | 1.0.0 |
| เทมเพลต | `docs/gdd/TEMPLATE.md` |
| อ้างอิง | `docs/modules.md` |

## 1. จุดประสงค์ / Pitch
เฟรมเวิร์กที่มินิเกม กลไก rhythm แพ็ก และโหมด challenge ใช้ร่วมกัน: ช่วงชีวิตของรอบ คีย์กติกา ลิงก์แชร์ โทเคนคะแนน และเปลือก HUD ของกติกา

## 2. แฟนตาซีของผู้เล่น
ผู้เล่นไม่เห็นโมดูลนี้ตรงๆ เห็นป้ายกติกา ลิงก์ท้าเพื่อน และผลส่งคะแนนเหมือนเดิม

## 3. Core loop
1. `defineMinigame` ลงทะเบียนโมดูล (โหมด practice / story / challenge)
2. `minigameRoute` แยกแฮช `#/challenge` `#/play/` `#/leaderboard`
3. `nextPhase` เปลี่ยน ready → play → result (มี pause/resume ใน API)
4. `seededPath` + `withChallenger` สร้างลิงก์
5. `submitFinishedRun` แพ็ก protobuf แล้วเข้าคิว `POST /api/runs`

## 4. กฎและ invariants
- ไม่มีตัวเลขเกมของตัวเอง ไม่มี `ruleset.json` การเปลี่ยนพารามิเตอร์เกมยังอยู่ที่โมดูลนั้น
- ลิงก์และโทเคนได้ไบต์เดิม: `runProto.ts` ย้ายมาที่นี่ `challenge/proto.ts` ส่งต่อให้ Worker
- คีย์กติกาเรียงชื่อโมดูล (`canonicalRuleset`) เหมือน `src/lib/ruleset.ts` ซึ่ง re-export จากที่นี่
- ปุ่ม pause ยังไม่ขึ้นบนจอ เกมเรียก `nextPhase(..., 'end')` ตอนจบรอบเท่านั้น

## 5. Input / การควบคุม
`RulesetBanner` และ `UnsupportedRuleset` เป็นเปลือกที่ใช้ใน rhythm และ challenge ปุ่มเล่นกติกาปัจจุบันกับออก

## 6. คะแนนและความยาก
ไม่คำนวณคะแนน ส่งรายงานที่เกมคำนวณแล้ว (`ChallengeRunPb`) พร้อม `ruleset`

## 7. Progression
ไม่มีดาวของตัวเอง

## 8. Content / config surface
ไม่มี เกมส่ง `gameCopy(prefix)` ไปอ่าน `src/locales`

## 9. UX / หน้าจอ
ป้าย `data-testid="ruleset-banner"` และการ์ด `data-testid="ruleset-unsupported"`

## 10. Data & telemetry (ฟิลด์บนเซิร์ฟเวอร์)
ฟิลด์ protobuf เดิม (ดู `proto/challenge_run.proto`) รวม `ruleset` ช่อง 15 คอลัมน์ D1 ไม่เปลี่ยน

## 11. Dependencies + เวอร์ชัน
core >=0.6.12

## 12. คำถามที่ยังเปิดอยู่ / Backlog
- **[backlog]** ปุ่มพักรอบที่ใช้ `nextPhase(..., 'pause')` จริงบน HUD
- **[backlog]** รวมหน้าผลลัพธ์ของ puzzle กับ rhythm ให้เป็นเชลล์เดียวทั้งก้อน

## 13. Changelog (ผูกกับเวอร์ชันโมดูล)
| เวอร์ชัน | แอป | การเปลี่ยนแปลง |
|---|---|---|
| 1.0.0 | 0.6.12 | แยกเฟรมเวิร์กจาก challenge/rhythm โดยไม่เปลี่ยนตัวเลขกติกา |
