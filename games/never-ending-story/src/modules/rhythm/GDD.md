# GDD: Rhythm tap (กลไกหลัก) (`rhythm`)

| ฟิลด์ | ค่า |
|---|---|
| kind | engine |
| เวอร์ชัน | 1.1.0 |
| เทมเพลต | `docs/gdd/TEMPLATE.md` |
| อ้างอิง | `docs/design/never-ending-story-game-spec-v0.4-th.md` |

## 1. จุดประสงค์ / Pitch
กลไกจังหวะแบบ white-label: แตะตามจังหวะ + ปุ่มพิเศษเมื่อมีคิว + คุมมาตรแรงดันให้อยู่ในโซน ใช้ซ้ำได้หลายธีมผ่าน *pack*

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
- engine ไม่รู้จักธีม: ภาพทั้งหมดมาจาก `pack.Stage` คำทั้งหมดมาจาก prefix `pack.copy`
- run ถูกเซฟที่ `pack.storageKey` (เล่นต่อได้) พร้อม difficulty, seed และ index ของคิวถัดไป
- **ชาร์ตกำหนดตายตัว:** `buildChart(packId, difficulty, seed, params)` ใช้ mulberry32 กับ FNV-1a ของ `pack|difficulty|seed` → pack + ระดับ + seed + params เดียวกัน = ลำดับเวลาคิวเดียวกันทุกเครื่อง (`chartId()` เป็นลายนิ้วมือของชาร์ต)
- **กติกาอยู่ที่ `ruleset.json`:** เวอร์ชัน 1.1.0 เก็บ `params`, `tuning` (easy/normal/hard), `scoring` และ `chart: v1`. เปลี่ยนค่าพวกนี้ต้อง bump เป็น 1.2.0 แล้วเพิ่มคีย์ใหม่ ทิ้งคีย์ 1.1.0 ไว้ให้ลิงก์เก่าเล่นได้ `check:modules` บังคับว่า `module.json` version ต้องมีในไฟล์นี้
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
ดาว: 2 ดาว ≥ `stars.two` (900), 3 ดาว ≥ `stars.three` (1400) และต้องทำ progress ครบ · บันทึกคะแนนดีสุดต่อ pack

## 8. Content / config surface
**pack interface** (`src/modules/rhythm/types.ts` → `RhythmPack`):
- `id`, `leaderboardId`, `copy` (prefix i18n), `storageKey`, `route`
- `params: RhythmParams` (durationSec, beatMs, perfectMs, goodMs, extra*, pressure*, stars)
- `theme.background`, `theme.accent`
- `Stage: Component<StageProps>` รับ progress, pressure, pressureZone, combo, beat, extraDue, last (judgement), pulse
- hooks: `onBeat()`, `onJudge(j)`, `onFinish(score, progress)`

## 9. UX / หน้าจอ
intro (เลือกระดับ, ชาร์ต #seed, สุ่มชาร์ตใหม่, แชร์ลิงก์ชาร์ต, ป้ายท้าจากเพื่อน) → play (HUD: เวลา, คะแนน, combo, มาตรแรงดัน, Stage, ปุ่ม) → result (ดาว, คะแนนดีสุด, สถานะส่งออนไลน์, ปุ่มกระดานคะแนน)

## 10. Data & telemetry (ฟิลด์บนเซิร์ฟเวอร์)
`POST /never/api/runs` (Bearer player token) ด้วย protobuf run token: game = `pack.leaderboardId`, difficulty = ระดับที่เลือก, **seed = seed ของชาร์ต**, score, timeMs, `version` = `<app>;<ruleset>` (แอปไว้ดูอย่างเดียว ไม่ใช้แยกกระดาน), **`ruleset` = `rhythm@<engine>+<pack>@<packVer>`** เช่น `rhythm@1.1.0+stirfry@1.2.0` เก็บในคอลัมน์ `runs.ruleset` · Worker ตรวจว่า ruleset อยู่ใน allowlist, difficulty ∈ easy/normal/hard, seed เป็นจำนวนเต็ม 1..2^31−1, เวลาและคะแนนไม่เกินค่าใน ruleset (`minMs` 3000, `slackSec` 5, `maxScore` 25000)

ลิงก์ท้า: `<pack.route>/<difficulty>/<seed>[/rhythm@1.1.0+<pack>@<ver>][/vs/<nick>?score=&time=]` (`parseRhythmHash` / `rhythmHash`). ไม่มี segment กติกา = กติกาสมัยแอป 0.6.10 (`rhythm@1.1.0` + pack legacy). กติกาที่ไม่มีใน registry แสดงข้อความใน locale แล้วให้เล่นกติกาปัจจุบันแทน

## 11. Dependencies + เวอร์ชัน
minigame-core ^1.0.0 (เฟสจบรอบ, ลิงก์, `submitFinishedRun`, ป้ายกติกา), core >=0.6.12

`make build` เขียน chunk `dist/modules/rhythm/<เวอร์ชัน>/<hash>.js` และบันทึกใน `modules/manifest.json` core โหลดไฟล์นี้แบบ dynamic ลิงก์ที่ปักเวอร์ชันเก่าจะโหลด chunk ที่ยังอยู่ใน `retained` ถ้าไม่มีไฟล์นั้นจะใช้โค้ดชุดปัจจุบันคู่กับค่าใน `ruleset.json` ของเวอร์ชันนั้น `make deploy-modules` อัปโหลดเฉพาะเวอร์ชันที่ KV ยังไม่มี และไม่ลบของเก่า

## 12. คำถามที่ยังเปิดอยู่ / Backlog
- **[backlog]** เซิร์ฟเวอร์ replay ชาร์ตจาก seed เพื่อตรวจคะแนนสูงสุดที่เป็นไปได้
- **[backlog]** คะแนนดีสุดแยกตามระดับในเครื่อง
- **[backlog]** เสียง/ดนตรีต่อ pack ผ่าน hook

## 13. Changelog (ผูกกับเวอร์ชันโมดูล)
| เวอร์ชัน | แอป | การเปลี่ยนแปลง |
|---|---|---|
| 1.1.0 | 0.6.11 | ค่าเกมเท่า 0.6.10 แต่ถูกตรึงใน `ruleset.json` ลิงก์แชร์ติด `rhythm@1.1.0` คู่กับเวอร์ชัน pack กระดานแยกตามกติกานี้ |
| 1.1.0 | 0.6.10 | ชาร์ตแบบ seed, ระดับ easy/normal/hard, ลิงก์ท้า, seed ใน run token, ป้าย judgement ไม่ค้าง |
| 1.0.0 | 0.6.9 | แยกจาก stirfry เป็นกลไก white-label |

## การแยก deployment space
ใช้ APP_BASE จาก Worker เพื่อแยกข้อมูลในเบราว์เซอร์ของแต่ละ space โดยไม่แก้ข้อมูล production; God ใช้ชื่อและ path ของ cookie แยกตาม base และต้องตั้ง secret แยกกัน
