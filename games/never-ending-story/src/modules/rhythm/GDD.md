# GDD: Rhythm tap (กลไกหลัก) (`rhythm`)

| ฟิลด์ | ค่า |
|---|---|
| kind | engine |
| เวอร์ชัน | 1.0.0 |
| เทมเพลต | `docs/gdd/TEMPLATE.md` |
| อ้างอิง | `docs/design/never-ending-story-game-spec-v0.4-th.md` |

## 1. จุดประสงค์ / Pitch
กลไกจังหวะแบบ white-label: แตะตามจังหวะ + ปุ่มพิเศษเมื่อมีคิว + คุมมาตรแรงดันให้อยู่ในโซน ใช้ซ้ำได้หลายธีมผ่าน *edition*

## 2. แฟนตาซีของผู้เล่น
ผู้เล่นทำงานอย่างหนึ่งให้เข้าจังหวะ (เช่น ผัดกระทะกับย่า) รู้สึกถึงจังหวะและความต่อเนื่อง

## 3. Core loop
1. นับจังหวะทุก `beatMs`
2. แตะปุ่มหลักใกล้จังหวะ → perfect / good / miss
3. คิวพิเศษเด้งมา → แตะปุ่มพิเศษในหน้าต่างเวลา
4. แรงดันขึ้นเอง แตะแต่ละครั้งลดแรงดัน รักษาให้อยู่ในโซน
5. progress ถึง 100 หรือหมดเวลา → ผลลัพธ์ + ส่งคะแนน

## 4. กฎและ invariants
- คะแนนไม่ติดลบ, combo สูงสุด 12 (perfect) / 8 (good)
- เมื่อคิวพิเศษรออยู่ แตะปุ่มหลักจะไม่ถูกตัดสิน
- engine ไม่รู้จักธีม: ภาพทั้งหมดมาจาก `edition.Stage` คำทั้งหมดมาจาก prefix `edition.copy`
- run ถูกเซฟที่ `edition.storageKey` (เล่นต่อได้)

## 5. Input / การควบคุม
ปุ่มหลัก (แตะตามจังหวะ) และปุ่มพิเศษ (เมื่อมีคิว)

## 6. คะแนนและความยาก
| เหตุการณ์ | คะแนน |
|---|---|
| perfect (±`perfectMs` 110) | 80 + โบนัสความแม่น ≤50 + combo×3, progress +4.2 |
| good (±`goodMs` 200) | 40 + combo, progress +2.4 |
| miss | −10, combo = 0 |
| extra-hit (±`extraWindowMs` 480) | 140 + combo×6, progress +9 |
| ในโซนแรงดัน | +10/วินาที, progress +1.1/วินาที |
| นอกโซน | −12/วินาที |

มีความยากเดียว `normal` (กระดานคะแนนใช้ `normal`) ค่าตั้งต้นอยู่ใน `DEFAULT_PARAMS`

## 7. Progression
ดาว: 2 ดาว ≥ `stars.two` (900), 3 ดาว ≥ `stars.three` (1400) และต้องทำ progress ครบ · บันทึกคะแนนดีสุดต่อ edition

## 8. Content / config surface
**edition interface** (`src/modules/rhythm/types.ts` → `RhythmEdition`):
- `id`, `leaderboardId`, `copy` (prefix i18n), `storageKey`, `route`
- `params: RhythmParams` (durationSec, beatMs, perfectMs, goodMs, extra*, pressure*, stars)
- `theme.background`, `theme.accent`
- `Stage: Component<StageProps>` รับ progress, pressure, pressureZone, combo, beat, extraDue, last (judgement), pulse
- hooks: `onBeat()`, `onJudge(j)`, `onFinish(score, progress)`

## 9. UX / หน้าจอ
intro → play (HUD: เวลา, คะแนน, combo, มาตรแรงดัน, Stage, ปุ่ม) → result (ดาว, คะแนนดีสุด, สถานะส่งออนไลน์, ปุ่มกระดานคะแนน)

## 10. Data & telemetry (ฟิลด์บนเซิร์ฟเวอร์)
`POST /never/api/runs` (Bearer player token) ด้วย protobuf run token: game = `edition.leaderboardId`, difficulty = `normal`, score, timeMs, version = `<app>;rhythm@<ver>;<edition>` จึงบันทึก mechanism และเวอร์ชันไว้ในแถว `runs` · Worker ตรวจ `maxMs` 65 วินาที, `maxScore` 25000

## 11. Dependencies + เวอร์ชัน
core >=0.6.9, challenge ^1.1.0 (`packRun`, `submitRun`)

## 12. คำถามที่ยังเปิดอยู่ / Backlog
- **[backlog]** chart แบบ seed (ตอนนี้คิวพิเศษสุ่มด้วย `Math.random`) เพื่อให้ท้าเพื่อนได้ชาร์ตเดียวกัน
- **[backlog]** หลายระดับความยาก
- **[backlog]** เสียง/ดนตรีต่อ edition ผ่าน hook

## 13. Changelog (ผูกกับเวอร์ชันโมดูล)
| เวอร์ชัน | แอป | การเปลี่ยนแปลง |
|---|---|---|
| 1.0.0 | 0.6.9 | แยกจาก stirfry เป็นกลไก white-label |
