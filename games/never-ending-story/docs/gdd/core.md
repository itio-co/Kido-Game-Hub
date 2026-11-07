# GDD: Core / เกมหลัก (`core`)

| ฟิลด์ | ค่า |
|---|---|
| kind | core |
| เวอร์ชัน | app (ตาม `package.json`, ตอนนี้ 0.6.12) |
| เทมเพลต | `docs/gdd/TEMPLATE.md` |
| อ้างอิง | `docs/design/never-ending-story-game-spec-v0.4-th.md` |

## 1. จุดประสงค์ / Pitch
เปลือกแอปของ Never Ending Story: ห้องโถงบ้านย่า, เซฟ, i18n, cloud sync, prologue. เฟรมมินิเกมอยู่ `minigame-core` เฟรมเหตุการณ์อยู่ `event-core` หน้า admin อยู่โมดูล `god`

## 2. แฟนตาซีของผู้เล่น
เป็นหลานที่กลับมาบ้านย่ามะลิ ช่วยย่าไขคดีของเก่าในบ้าน (ย่ามะลิผมสั้นสีเงินปล่อยหลวม ไม่มวยผม)

## 3. Core loop
1. เข้าเกม → prologue (ครั้งแรก) → ตั้งชื่อ
2. ห้องโถง: เลือกคดี / แผนผังบ้าน / สมุดคดี / มินิเกม
3. `event-core` เล่นฉาก บทสนทนา หลักฐาน และเรียกมินิเกม
4. จบคดี → เซฟความคืบหน้า และ sync ขึ้นเซิร์ฟเวอร์

## 4. กฎและ invariants
- โค้ดเป็นภาษาอังกฤษ ข้อความไทยอยู่เฉพาะ `src/locales/*.json`
- โมดูลอื่นเข้าถึงกันผ่าน public entry (`index.ts`) เท่านั้น ตรวจด้วย `npm run check:modules`
- ไม่พิมพ์ player token ลง log
- `/never/god/*` และ `modules.json` เป็น network-only ใน SW และเป็น admin-only (โค้ดอยู่โมดูล `god`)
- กระดานคะแนนแยกด้วยกติกา (`runs.ruleset`) ไม่แยกด้วยเวอร์ชันแอป

## 5. Input / การควบคุม
แตะ/คลิกบนมือถือแนวตั้ง 390x844 เป็นหลัก แถบล่างมีปุ่มแผนผังบ้านข้างสมุดคดี

## 6. คะแนนและความยาก
core ไม่มีคะแนนเอง คะแนนมาจากมินิเกม / challenge / rhythm

## 7. Progression
ความคืบหน้าคดี (`save`), `prologueSeen`, ชื่อผู้เล่น, ไอเทมในบ้าน

## 8. Content / config surface
story pack JSON (`public/data/case-flow.json`) และรูปใน `public/img/` ปรับได้โดยไม่แตะโค้ด ดู `docs/design/story-pack-format-th.md`

## 9. UX / หน้าจอ
Prologue, Hub, FlowView, Settings, Leaderboard. god admin อยู่ในโมดูล `god`

## 10. Data & telemetry (ฟิลด์บนเซิร์ฟเวอร์)
D1: `players`, `player_state`, `player_events`, `player_home`, `runs` (มีคอลัมน์ `ruleset`), `god_login` · localStorage เซฟหลัก

## 11. Dependencies + เวอร์ชัน
ใช้ minigame-core, event-core, crossword, jigsaw, slide, stirfry, challenge, event-01, god (ดู `module.json`)

## 12. คำถามที่ยังเปิดอยู่ / Backlog
- **[backlog]** แยก flow engine เป็นโมดูลของตัวเอง
- **[backlog]** หลายคดี (event-02+)

## 13. Changelog (ผูกกับเวอร์ชันโมดูล)
| เวอร์ชัน | แอป | การเปลี่ยนแปลง |
|---|---|---|
| 0.6.12 | 0.6.12 | แยก minigame-core กับ event-core ค่ากติกาและ URL เดิม |
| 0.6.11 | 0.6.11 | ลิงก์แชร์ติดกติกา engine+pack, กระดานแยกตาม ruleset, ย้าย god เป็นโมดูล, เปลี่ยนชื่อ edition เป็น pack |
| 0.6.10 | 0.6.10 | rhythm ชาร์ต seed + ระดับ, ป้าย judgement |
| 0.6.9 | 0.6.9 | god หน้าย่อยต่อเกม, แท็บ GDD, rhythm engine/edition |
| 0.6.8 | 0.6.8 | แก้ sw.js syntax |
| 0.6.5 | 0.6.5 | modular monolith + หน้า Modules |
| 0.6.4 | 0.6.4 | god admin |
| 0.6.3 | 0.6.3 | prologue |
