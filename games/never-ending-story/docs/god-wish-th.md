# God Mode Wish: คำขอจากในเกมถึงห้องแชตพัฒนา (เอกสารเทคนิค)

โมดูล: `god-mode@1.3.0` (ฝั่งแอป) และ `god@2.2.0` (ฝั่ง API + หน้าแอดมิน) GDD อยู่ที่ `src/modules/god-mode/GDD.md` และ `src/modules/god/GDD.md`

## 1. ภาพรวมของโฟลว์

1. คนที่เปิดโหมด GOD แล้วแตะไอคอนลอย เลือก «ขอสิ่งที่อยากได้» (Wish) หรือเปิด «รายการคำขอ» เพื่อดูคำขอทั้งหมดในเกม (ใหม่สุดก่อน แบ่งหน้าละ 20 รายการ god ดูได้อย่างเดียว)
2. แอปซ่อนไอคอน แล้วถ่ายภาพหน้าจอของกรอบโทรศัพท์ (`capture.ts`) พร้อมประกอบ JSON ตรวจข้อมูลของหน้านั้น (ชุดเดียวกับปุ่ม «ตรวจข้อมูล»)
3. แผ่นล่าง `WishSheet.svelte` เปิดขึ้น: ภาพย่อ ช่องพิมพ์ข้อความ ปุ่มส่ง/ยกเลิก
4. กดส่ง: `POST {APP_BASE}/api/wishes` ครั้งเดียว ส่ง `{text, screenshot, state, route, appVersion}`
5. เซิร์ฟเวอร์ตรวจเซสชัน GOD กรองความลับซ้ำ จำกัดขนาด ประทับเวลา สร้างลิงก์ตรวจข้อมูลอายุ 7 วัน และเก็บลง D1
6. ห้องแชตพัฒนาดึงคำขอที่ยังไม่อ่านด้วย `GET /api/god/wishes?since=…&unread=1` (หรือสคริปต์ `nes-wishes.py`) แล้วนำไปทำ

## 2. การถ่ายภาพหน้าจอ (`capture.ts`)

ไม่มีไลบรารี: โคลน DOM ของกรอบโทรศัพท์พร้อม computed style แปลงรูป พื้นหลัง และ canvas เป็น data URL ฝังฟอนต์ของเกม แล้ววาดผ่าน SVG `foreignObject` ลง canvas และบีบเป็น JPEG ให้ไม่เกิน ~150 KB (ลดความกว้าง 720→360 px และคุณภาพทีละขั้น)

- องค์ประกอบที่มี `data-wish-skip` (ไอคอน GOD) ไม่อยู่ในภาพ และไอคอนถูกซ่อนระหว่างถ่าย
- ถ่ายไม่ได้ (เบราว์เซอร์ปฏิเสธ หรือ DOM ใหญ่เกิน 4000 โหนด) → แผ่นยังเปิด ส่งได้เฉพาะข้อความและ state (`screenshot: null`)
- ข้อจำกัด: ภาพของ `::before/::after`, วิดีโอ และ canvas ที่ถูกปนเปื้อนจะไม่ติดมา

## 3. API

การส่งคำขอและการอ่านรายการ/รายละเอียด/ภาพต้องผ่าน `requireRole(..., 'god')` (เซสชันรหัสผ่านแอดมินซึ่งเป็น super_god หรือ Bearer ของผู้เล่น god / super_god) การทำเครื่องหมายว่าอ่านแล้วยังต้องเป็น super_god เท่านั้น ไม่มีสิทธิ์ตอบ 401 (ไม่มีเซสชัน/โทเคน) หรือ 403 (มีแต่บทบาทไม่พอ) การเขียนข้ามไซต์ได้ 403 จากกฎ same-origin เดิมของ Worker เมื่อส่งด้วย Bearer เซิร์ฟเวอร์เก็บ `playerId` และบทบาทตอนส่งไว้ด้วย

| เมธอด | เส้นทาง | หมายเหตุ |
|---|---|---|
| POST | `/api/wishes` (ชื่อย่อของ `/api/god/wishes`) | เก็บคำขอ ตอบ `{ok, wish}` ต้องมีบทบาท god ขึ้นไป |
| GET | `/api/god/wishes?since=&unread=1&limit=&order=&page=` | เมทาดาทาอย่างเดียว ไม่มีภาพและ state ค่าเริ่มต้น `page=1` ตอบ `page`, `pageSize`, `total` ต้องมีบทบาท god ขึ้นไป |
| GET | `/api/god/wishes/:id` | เมทาดาทา + `state` ที่กรองแล้ว ต้องมีบทบาท god ขึ้นไป |
| GET | `/api/god/wishes/:id/screenshot` | ไฟล์ภาพ (`private, no-store`) ต้องมีบทบาท god ขึ้นไป |
| POST | `/api/god/wishes/mark-read` | `{ids:[…]}` สูงสุด 100 ตอบ `{marked}` เฉพาะ super god |

- `since`: ISO เช่น `2026-11-28T09:00:00+07:00` หรือ `2026-11-28` (= 00:00 เวลากรุงเทพฯ) ค่าว่าง = ตั้งแต่ต้น เปรียบแบบ «มากกว่าหรือเท่ากับ»
- `unread=1`: เฉพาะ `read_at` ว่าง `limit` เริ่มต้น 50 สูงสุด 200 `order=desc` ใหม่สุดก่อน (หน้าแอดมิน) ค่าเริ่มต้นเก่าสุดก่อน
- ฟิลด์ของ wish: `id, createdAt (ISO UTC), createdMs, dayBangkok, text, route, screen, title, appVersion, modules, userAgent, inspectUrl, inspectExpiresAt, screenshotUrl, screenshotMime, stateUrl, readAt`

ข้อผิดพลาด: `bad-json` `empty-text` `bad-screenshot` `bad-state` `bad-since` `bad-ids` (400) · `unauthorized` (401) · `not-found` (404) · `text-too-long` `screenshot-too-large` `state-too-large` `too-large` `too-many-ids` (413) · `rate-limited` (429)

## 4. การเก็บและขีดจำกัด

D1 ตาราง `god_wishes` (`worker/schema.sql`, `worker/migrations/004_wishes.sql`) Worker รัน `CREATE TABLE IF NOT EXISTS` เองตอนใช้ครั้งแรก

| เรื่อง | ค่า |
|---|---|
| ภาพ | JPEG/PNG/WebP เก็บเป็น base64 ในคอลัมน์ `shot_b64` ตรวจ magic bytes ถอดรหัสแล้วไม่เกิน 400 KB รายการ (list) ไม่ select คอลัมน์นี้ |
| ข้อความ | 1–2000 ตัวอักษร |
| state | กรองความลับซ้ำ (ชื่อฟิลด์ token/password/secret/authorization/cookie/credential, JWT, `Bearer …`) ไม่เกิน 200 KB |
| body | ไม่เกิน 900 KB |
| อัตรา | ไม่เกิน 10 คำขอใน 10 นาที (นับรวมทุกคน เพราะมีแต่ผู้ดูแล) เกินตอบ 429 |
| เวลา | `created_at` (มิลลิวินาที) `created_iso` (UTC) `day_bkk` (YYYY-MM-DD กรุงเทพฯ) |
| ลิงก์ตรวจข้อมูล | ใช้กลไก snapshot เดิม (KV, ลงนามด้วย `GOD_ADMIN_PASSWORD`) อายุ 7 วัน หลังหมดอายุยังอ่าน state เดิมได้จาก `GET /api/god/wishes/:id` |

ไม่มี resource หรือ secret ใหม่ใน Cloudflare ใช้ D1 `DB`, KV `ASSETS_KV` และ `GOD_ADMIN_PASSWORD` เดิม

## 5. ดึงคำขอเข้าห้องแชตพัฒนา

สคริปต์ `/workspace/nes-tools/nes-wishes.py` (เฉพาะ production) อ่านรหัสผ่านแอดมินจาก env `NES_GOD_PASSWORD` เท่านั้น ไม่พิมพ์ ไม่เขียนลงดิสก์

```bash
export NES_GOD_PASSWORD=...             # ตั้งก่อนใช้ (ยังไม่ได้ตั้งบนเครื่องนี้)
nes-wishes.py --since 2026-11-28        # เฉพาะที่ยังไม่อ่าน บันทึกที่ /workspace/nes-wishes/<id>/
nes-wishes.py --since 2026-11-28 --all  # รวมที่อ่านแล้ว
nes-wishes.py --since 2026-11-28 --mark-read   # ดึงแล้วทำเครื่องหมายว่าอ่านแล้ว
nes-wishes.py --since 2026-11-28 --list        # แค่ดูรายการ
```

แต่ละโฟลเดอร์มี `wish.md` (ข้อความ + เมทาดาทา), `wish.json` (เมทาดาทา + state) และ `screenshot.jpg`

## 6. สิ่งที่ต้องมีตอน deploy

- D1: ไม่ต้องรันมิเกรชันก็ได้ (Worker สร้างตารางเอง) หรือรัน `004_wishes.sql` ครั้งเดียว
- Secret/binding ใหม่: ไม่มี
- ใช้ได้จริงเมื่อ `GOD_ADMIN_PASSWORD` ตั้งอยู่แล้ว (เป็นเงื่อนไขของโหมด GOD อยู่แล้ว)
