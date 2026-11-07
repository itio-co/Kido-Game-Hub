# GDD: Rhythm tap (กลไกหลัก) (`rhythm`)

| ฟิลด์ | ค่า |
|---|---|
| kind | engine |
| เวอร์ชัน | 1.1.0 |
| เทมเพลต | `docs/gdd/TEMPLATE.md` |
| อ้างอิง | `docs/design/never-ending-story-game-spec-v0.4-th.md` |

## 1. จุดประสงค์ / Pitch
กลไกจังหวะแบบ white-label: แตะตามจังหวะ + ปุ่มพิเศษเมื่อมีคิว + คุมมาตรแรงดันให้อยู่ในโซน ใช้ซ้ำได้หลายธีมผ่าน *edition*

## 2. แฟนตาซีของผู้เล่น
ผู้เล่นทำงานอย่างหนึ่งให้เข้าจังหวะ (เช่น ผัดกระทะกับย่า) รู้สึกถึงจังหวะและความต่อเนื่อง

## 3. Core loop
1. นับจังหวะทุก `beatMs`
2. แตะปุ่มหลักใกล้จังหวะ → perfect / good / miss
3. คิวพิเศษเด้งมาตาม **ชาร์ต** (กำหนดจาก seed) → แตะปุ่มพิเศษในหน้าต่างเวลา
4. แรงดันขึ้นเอง แตะแต่ละครั้งลดแรงดัน รักษาให้อยู่ในโซน
5. progress ถึง 100 หรือหมดเวลา → ผลลัพธ์ + ส่งคะแนน

## 4. กฎและ invariants
- คะแนนไม่ติดลบ, combo สูงสุด 12 (perfect) / 8 (good)
- เมื่อคิวพิเศษรออยู่ แตะปุ่มหลักจะไม่ถูกตัดสิน
- engine ไม่รู้จักธีม: ภาพทั้งหมดมาจาก `edition.Stage` คำทั้งหมดมาจาก prefix `edition.copy`
- run ถูกเซฟที่ `edition.storageKey` (เล่นต่อได้) พร้อม difficulty, seed และ index ของคิวถัดไป
- **ชาร์ตกำหนดตายตัว:** `buildChart(editionId, difficulty, seed, params)` ใช้ mulberry32 กับ FNV-1a ของ `edition|difficulty|seed` → edition + ระดับ + seed เดียวกัน = ลำดับเวลาคิวเดียวกันทุกเครื่อง (`chartId()` เป็นลายนิ้วมือของชาร์ต)
- ป้าย judgement ใหม่แทนป้ายเดิมทันที (miss ไม่ค้าง Perfect!) และ Stage ยกเลิกท่าทางเดิมทันที

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

ระดับ `easy` / `normal` / `hard` (`paramsFor`): easy = จังหวะ ×1.15, หน้าต่างตัดสิน ×1.25, ช่องว่างคิว ×1.2, แรงดันขึ้น ×0.8 · hard = ×0.85, ×0.8, ×0.8, ×1.25 · ค่าตั้งต้นอยู่ใน `DEFAULT_PARAMS`

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
intro (เลือกระดับ, ชาร์ต #seed, สุ่มชาร์ตใหม่, แชร์ลิงก์ชาร์ต, ป้ายท้าจากเพื่อน) → play (HUD: เวลา, คะแนน, combo, มาตรแรงดัน, Stage, ปุ่ม) → result (ดาว, คะแนนดีสุด, สถานะส่งออนไลน์, ปุ่มกระดานคะแนน)

## 10. Data & telemetry (ฟิลด์บนเซิร์ฟเวอร์)
`POST /never/api/runs` (Bearer player token) ด้วย protobuf run token: game = `edition.leaderboardId`, difficulty = ระดับที่เลือก, **seed = seed ของชาร์ต**, score, timeMs, version = `<app>;rhythm@<ver>;<edition>` จึงบันทึก mechanism และเวอร์ชันไว้ในแถว `runs` · Worker ตรวจ difficulty ∈ easy/normal/hard, seed เป็นจำนวนเต็ม 1..2^31−1, `maxMs` 65 วินาที, `maxScore` 25000

ลิงก์ท้า: `<edition.route>/<difficulty>/<seed>[/vs/<nick>?score=&time=]` (`parseRhythmHash` / `rhythmHash`)

## 11. Dependencies + เวอร์ชัน
core >=0.6.9, challenge ^1.1.0 (`packRun`, `submitRun`)

## 12. คำถามที่ยังเปิดอยู่ / Backlog
- **[backlog]** เซิร์ฟเวอร์ replay ชาร์ตจาก seed เพื่อตรวจคะแนนสูงสุดที่เป็นไปได้
- **[backlog]** คะแนนดีสุดแยกตามระดับในเครื่อง
- **[backlog]** เสียง/ดนตรีต่อ edition ผ่าน hook

## 13. Changelog (ผูกกับเวอร์ชันโมดูล)
| เวอร์ชัน | แอป | การเปลี่ยนแปลง |
|---|---|---|
| 1.1.0 | 0.6.10 | ชาร์ตแบบ seed, ระดับ easy/normal/hard, ลิงก์ท้า, seed ใน run token, ป้าย judgement ไม่ค้าง |
| 1.0.0 | 0.6.9 | แยกจาก stirfry เป็นกลไก white-label |
