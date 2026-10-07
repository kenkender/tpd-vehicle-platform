# 🛡️ รายงานความมั่นคงปลอดภัยและนโยบายคุ้มครองข้อมูลส่วนบุคคล (Security & PDPA Policy)
> **ระบบลงทะเบียนและเก็บบันทึกข้อมูลยานพาหนะ กองบัญชาการตำรวจท่องเที่ยว**

---

## 1. การคุ้มครองข้อมูลส่วนบุคคล (PDPA & Data Protection)

### 🔒 1.1 การเข้ารหัสข้อมูลเลขบัตรประชาชน (AES-256-GCM Encryption)
- **เลขบัตรประชาชน (National ID 13 หลัก)** จะ **ไม่ถูกเก็บเป็นข้อความธรรมดา (Plain Text)** ลงในฐานข้อมูลเด็ดขาด
- ระบบใช้การเข้ารหัสระดับชั้นนำ **AES-256-GCM** ร่วมกับคีย์ลับความปลอดภัย (`DATA_ENCRYPTION_KEY` ในไฟล์ `.env`)
- **Blind Index (HMAC-SHA256):** ระบบสร้างดัชนีทางเดียวสำหรับจับคู่เลขบัตรประชาชนเดิมของผู้ใช้ ทำให้ค้นหาข้อมูลได้โดยไม่ต้องถอดรหัสข้อมูลออกมา

### 👁️ 1.2 การปิดบังข้อมูล (Data Masking)
- ในหน้าแดชบอร์ดแอดมิน เลขบัตรประชาชนจะถูกปิดบังเป็น `•••••••••1234` (แสดงเฉพาะ 4 หลักท้าย)
- เมื่อแอดมินมีความจำเป็นต้องดูเลขบัตรเต็ม ต้องกดปุ่ม **"👁 ดูเลขเดิม"** และกดยืนยัน โดยระบบจะบันทึก **Audit Log** (ชื่อแอดมิน, เวลา, IP address) ไว้เป็นหลักฐานเสมอ

### 🚫 1.3 การจำกัดข้อมูลส่งออกไปกล้อง Hikvision (Data Minimization)
- ไฟล์ Excel (`plate_whitelist.xlsx`) และ Google Sheet ที่ส่งต่อไปยังระบบกล้อง Hikvision LPR **จะเก็บเฉพาะข้อมูลป้ายทะเบียนและสถานะการอนุญาตเท่านั้น**:
  `License Plate Number` | `Belong to` | `Card No.` | `Start Time For Entry` | `End Time For Entry`
- **ชื่อ-นามสกุล, เลขบัตรประชาชน, เบอร์โทรศัพท์ และสังกัด จะไม่มีทางหลุดไปยังไฟล์ Excel หรือ Google Sheet เด็ดขาด**

---

## 2. ความปลอดภัยหน้าเว็บและการเชื่อมต่อ (Web & Application Security)

### 🧱 2.1 หน้าฟอร์มสาธารณะแบบ "เขียนได้อย่างเดียว" (Write-Only Frontend)
- ผู้ใช้ทั่วไปสามารถกรอกฟอร์มส่งข้อมูลเข้าระบบได้เท่านั้น **ไม่มี API ใดๆ ที่เปิดให้สาธารณะดึงหรือค้นหาข้อมูลย้อนหลังได้**
- ป้องกันการดักจับข้อมูลและการสแกนหาข้อมูลของประชาชนจากแฮกเกอร์ภายนอก

### 🤖 2.2 ระบบป้องกันบอทและสแปม (Honeypot & Rate Limiting)
- **Honeypot:** มีช่องกรอกซ่อนไว้ หากบอทหรือสคริปต์อัตโนมัติมาแอบกรอก ระบบจะปฏิเสธการบันทึกทันที
- **Rate Limiting:** จำกัดจำนวนการกดส่งฟอร์มจาก IP เดียวกัน (สูงสุด 20 ครั้งต่อ 15 นาที) เพื่อป้องกันโดนยิงสแปมมิ่ง (DDOS / Brute-Force)

### 🔑 2.3 การรักษาความปลอดภัยบัญชีแอดมิน (Admin Authentication & Session Security)
- **Password Hashing:** รหัสผ่านแอดมินใช้การเข้ารหัสอัลกอริทึม **scrypt** พร้อม Cryptographic Salt 16 บายต์
- **Account Lockout:** หากพิมพ์รหัสผ่านผิดติดต่อกัน 5 ครั้ง บัญชีจะถูกล็อกชั่วคราวเป็นเวลา 15 นาทีทันที
- **HttpOnly & SameSite Cookies:** คุกกี้เซสชันของแอดมินใช้แฟลก `HttpOnly` (ป้องกัน JavaScript แฮกคุกกี้) และ `SameSite=Strict` (ป้องกันภัย CSRF)

### 🛡️ 2.4 Security Headers & Injection Prevention
- **Helmet HTTP Security Headers:** เปิดใช้งาน Content Security Policy (CSP), X-Frame-Options SAMEORIGIN (กันโดนฝัง Clickjacking), X-Content-Type-Options nosniff
- **SQL Injection Prevention:** ทุกคำสั่ง SQL ใช้ **Parameterized Queries (Prepared Statements)** ผ่าน `better-sqlite3` 100%
- **CSV/Excel Formula Injection Prevention:** ข้อมูลข้อความทุกช่องก่อนส่งออก CSV/Excel จะถูกตรวจจับและใส่เครื่องหมาย `'` นำหน้าเพื่อป้องกันคำสั่งที่เป็นอันตราย (เช่น `=cmd|...`)

---

## 3. สรุปแผนผังความมั่นคงปลอดภัยข้อมูล (Data Flow Security Diagram)

```
[ ผู้ใช้ทั่วไป / มือถือ ]
       │
       ▼ (ส่งข้อมูลฟอร์มผ่าน HTTPS)
[ Public Route: /api/vehicles ] ──► ( validation + 13 หลัก checksum + Rate Limit )
       │
       ▼
[ SQLite Database (vehicles.db) ]
   ├── ข้อมูลรถ + เจ้าของ ──────► เข้ารหัส AES-256-GCM (เลขบัตรประชาชน)
   └── สถานะ = 'pending' (รออนุมัติ)
       │
       ▼ (แอดมินตรวจสอบ & กดอนุมัติผ่าน /admin)
[ Dual-Sync Orchestrator ]
       │
       ├──► สร้างไฟล์ Excel (plate_whitelist.xlsx) ──► (มีเฉพาะ: ทะเบียน + Allowlist) ──► [ กล้อง Hikvision LPR ]
       └──► ซิงก์ Google Sheets (เฉพาะข้อมูลที่ได้รับอนุมัติ)
```
