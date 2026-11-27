# GDD: แกนมินิเกม (`minigame-core`)

| ฟิลด์ | ค่า |
|---|---|
| kind | minigame-core |
| เวอร์ชัน | 1.1.0 |
| เทมเพลต | `docs/gdd/TEMPLATE.md` |
| อ้างอิง | `docs/modules.md` |

## 1. จุดประสงค์ / Pitch
เฟรมเวิร์กที่มินิเกม กลไก rhythm แพ็ก และโหมด challenge ใช้ร่วมกัน: ช่วงชีวิตของรอบ คีย์กติกา ลิงก์แชร์ โทเคนคะแนน เปลือก HUD ของกติกา และไดอะล็อกผลชนะที่ใช้ร่วมกันได้

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
ไม่มีสูตรดาวของตัวเอง ไดอะล็อกผลชนะแสดงดาวที่เกมคำนวณมาแล้ว และเก็บเวลาที่ดีที่สุดไว้ในเครื่องที่คีย์ `nesg.minigame-best.v1` (ต่อเกมและระดับความยาก หรือด่านฝึก) เวลาที่น้อยกว่าถือว่าดีกว่า รอบแรกนับเป็นสถิติใหม่

## 8. Content / config surface
เกมส่ง `gameCopy(prefix)` ไปอ่าน `src/locales` · ข้อความไดอะล็อกผลชนะอยู่ที่คีย์ `minigame.win*`

## 9. UX / หน้าจอ
ป้าย `data-testid="ruleset-banner"` และการ์ด `data-testid="ruleset-unsupported"`

`WinResultDialog` (`data-testid="minigame-win-dialog"`) เป็นแผ่นมืดกึ่งกลางสไตล์เดียวกับไดอะล็อกออกจากเหตุการณ์: ชื่อใหญ่ เยี่ยมมาก! คำว่าเล่นชนะแล้ว ระดับความยาก ดาวมีแอนิเมชัน เวลาเทียบสถิติดีที่สุด ป้ายสถิติใหม่เมื่อทำได้ดีกว่า จำนวนคำใบ้ที่ใช้ และปุ่มหลัก ต่อไป (`data-testid="minigame-win-continue"`) กดแล้วไปต่อโฟลว์เดิมของเกม (เช่น ได้หลักฐานหรือกลับไปที่คดี) กดพื้นหลังหรือ Escape ไม่ปิด

## 10. Data & telemetry (ฟิลด์บนเซิร์ฟเวอร์)
ฟิลด์ protobuf เดิม (ดู `proto/challenge_run.proto`) รวม `ruleset` ช่อง 15 คอลัมน์ D1 ไม่เปลี่ยน

## 11. Dependencies + เวอร์ชัน
core >=0.6.12

## 12. คำถามที่ยังเปิดอยู่ / Backlog
- **[backlog]** ปุ่มพักรอบที่ใช้ `nextPhase(..., 'pause')` จริงบน HUD
- **[done]** `WinResultDialog` เป็นเชลล์ผลชนะกลาง เริ่มใช้กับจิ๊กซอว์ ครอสเวิร์ด และเลื่อนบล็อกในอีเวนต์ · rhythm / stirfry / challenge ยังใช้หน้าผลของตัวเองจนกว่าจะย้ายมาถูกทาง

## 13. Changelog (ผูกกับเวอร์ชันโมดูล)
| เวอร์ชัน | แอป | การเปลี่ยนแปลง |
|---|---|---|
| 1.1.0 | 0.6.38 | เพิ่ม `WinResultDialog` ไดอะล็อกผลชนะที่ใช้ร่วมกันได้ พร้อมเก็บสถิติเวลาในเครื่อง |
| 1.0.0 | 0.6.12 | แยกเฟรมเวิร์กจาก challenge/rhythm โดยไม่เปลี่ยนตัวเลขกติกา |
