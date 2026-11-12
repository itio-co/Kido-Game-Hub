# GDD: God admin (`god`)

| ฟิลด์ | ค่า |
|---|---|
| kind | admin |
| เวอร์ชัน | 1.1.0 |
| เทมเพลต | `docs/gdd/TEMPLATE.md` |
| อ้างอิง | `docs/modules.md` |

## 1. จุดประสงค์ / Pitch
หน้าแอดมิน `/never/god` และ API `/never/api/god/*` สำหรับดูผู้เล่น รอบคะแนน อีเวนต์ และทะเบียนโมดูล แยกจาก core ใน 0.6.11 โดยพฤติกรรมและการล็อกอินไม่เปลี่ยน

## 2. แฟนตาซีของผู้เล่น
ไม่มีฝั่งผู้เล่น ใช้โดยคนดูแลเกม

## 3. Core loop
1. เปิด `/never/god` 2. ใส่รหัส `GOD_ADMIN_PASSWORD` 3. ได้คุกกี้เซสชัน 12 ชม. 4. ดูแดชบอร์ด / ผู้เล่น / เกม / อีเวนต์ / โมดูล

## 4. กฎและ invariants
- รหัสผ่านไม่ถูกเก็บใน JS เซสชันเป็นคุกกี้ `nes_god` (HttpOnly, Secure, SameSite=Strict, path `/never`) ลงนาม HMAC
- ล็อกอินผิด 5 ครั้งล็อก 15 นาทีต่อ IP (IPv6 ใช้ prefix /64) ตาราง `god_login`
- ไม่เลือกและไม่ส่ง `token_hash`
- ชนิดโมดูล `edition` ใน registry เก่าถูกจัดกลุ่มเป็น `pack`
- เกมย่อยแสดงกติกาที่ build นี้เล่นได้ และจำนวนรอบต่อ `ruleset` จาก D1

## 5. Input / การควบคุม
ฟอร์มรหัสผ่าน เมนูด้านข้าง แท็บ ช่องค้นหา ปุ่มลบรอบ (มี confirm) ใช้ได้บนจอ 390px (ตารางเลื่อนข้าง)

## 6. คะแนนและความยาก
ไม่ให้คะแนน แสดงสถิติรายระดับและรายกติกา

## 7. Progression
ไม่มี

## 8. Content / config surface
รหัสผ่านเป็น secret ของ Worker ไม่ได้อยู่ใน repo ทะเบียนโมดูลมาจาก `dist/modules.json` ผ่าน `GET /never/api/god/modules`

## 9. UX / หน้าจอ
`God.svelte` + `GodModule.svelte` บูตจาก `main.ts` (`god.html`)

- `#/dashboard` จำนวนผู้เล่น รอบ คน active
- `#/players` และ `#/players/<id>`
- `#/games` และ `#/games/<moduleId>`: ภาพรวม, กระดาน, GDD, ตารางกติกา (runs / players)
- `#/events` กรวยคดี
- `#/modules` จัดกลุ่มตาม kind รวม `admin` และ `pack`

## 10. Data & telemetry (ฟิลด์บนเซิร์ฟเวอร์)
`server.ts` ตอบใต้ `/never/api/god` (auth เดิม):

| เมธอด | เส้นทาง | ทำอะไร |
|---|---|---|
| POST | `/login` `/logout` | เซสชัน |
| GET | `/me` `/dashboard` `/players` `/players/:id` | อ่าน |
| PATCH/DELETE | `/players/:id` | เปลี่ยนชื่อ / ลบ |
| GET | `/games` | สถิติรายระดับ + `byRuleset` |
| GET | `/games/:game/board?difficulty=&ruleset=` | กระดาน `ruleset` ว่าง = ทุกรอบ |
| DELETE | `/runs/:sessionId` | ลบรอบ |
| GET | `/events` `/modules` | กรวยคดี / registry |

## 11. Dependencies + เวอร์ชัน
core >=0.6.11 (`i18n`, catalog กติกา) Worker (`worker/index.ts`) เรียก `godApi` จาก public entry `server.ts`

## 12. คำถามที่ยังเปิดอยู่ / Backlog
- **[backlog]** สิทธิ์มากกว่าหนึ่งคน

## 13. Changelog (ผูกกับเวอร์ชันโมดูล)
| เวอร์ชัน | แอป | การเปลี่ยนแปลง |
|---|---|---|
| 1.1.0 | 0.6.13 | แท็บคลังของโมดูล character และ cutscene |
| 1.0.0 | 0.6.11 | ย้ายออกจาก core, kind `admin`, แสดงกติกาและจำนวนรอบต่อเวอร์ชัน |

## การแยก deployment space
ใช้ APP_BASE จาก Worker เพื่อแยกข้อมูลในเบราว์เซอร์ของแต่ละ space โดยไม่แก้ข้อมูล production; God ใช้ชื่อและ path ของ cookie แยกตาม base และต้องตั้ง secret แยกกัน
