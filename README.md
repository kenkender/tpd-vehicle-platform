# ระบบลงทะเบียนและเก็บบันทึกข้อมูลรถ กองบัญชาการตำรวจท่องเที่ยว
> **Tourist Police Bureau - Vehicle Registration & LPR Platform**

แพลตฟอร์มเว็บแอปพลิเคชันสำหรับเก็บบันทึกข้อมูลยานพาหนะ เจ้าของรถ และประวัติการเข้า-ออกสถานที่ กองบัญชาการตำรวจท่องเที่ยว โดยบันทึกข้อมูลลงฐานข้อมูล **SQLite (datasql)** พร้อมระบบ **Dual-Sync** เขียนข้อมูลลงไฟล์ **Excel (Hikvision LPR Format)** และ **Google Sheets** โดยอัตโนมัติ

---

## 🌟 ฟีเจอร์หลัก (Key Features)

1. **หน้าลงทะเบียนสำหรับบุคคลทั่วไป (Frontend Only - Public Form)**
   - กรอกข้อมูลได้ง่ายทั้งบน **คอมพิวเตอร์และโทรศัพท์มือถือ (Mobile Responsive UI ไม่เพี้ยน)**
   - ระบบ **Live Preview ป้ายทะเบียนจำลอง** (แสดงสีและรูปแบบป้ายตามประเภท: ขาว-ดำ, ขาว-เขียว, ขาว-ฟ้า, ป้ายเหลือง, มอเตอร์ไซค์, ป้ายประมูล/แดง/ทูต)
   - ถอดช่องว่างและขีดออกให้อัตโนมัติ (เช่น `1กก 9999` -> `1กก9999`) เพื่อความถูกต้องในการ Query และค้นหาป้ายทะเบียน
   - ตรวจสอบรูปแบบ **ป้ายทะเบียน + จังหวัด** (ป้ายเลขเดียวกัน แต่อยู่คนละจังหวัดถือเป็นรถคนละคัน)
   - ป้องกันข้อมูลส่วนบุคคล (PDPA): ข้อมูลถูกส่งเข้าฐานข้อมูลโดยไม่มี Endpoint ฝั่งสาธารณะให้เปิดดูข้อมูลย้อนหลังได้

2. **ระบบผู้ดูแลระบบ (Admin Dashboard - Backend Protected)**
   - ป้องกันสิทธิ์การเข้าถึง หน้าแอดมินเข้าได้เฉพาะผู้มีรหัสผ่านเท่านั้น
   - **การอนุมัติ (Approval Workflow):** ข้อมูลที่ผู้ใช้ทั่วไปกรอกจะอยู่ในสถานะ **"รออนุมัติ" (Pending)** เมื่อแอดมินตรวจสอบและกด **"อนุญาต"** ข้อมูลจะถูกซิงก์ลงไฟล์ Excel ทันที
   - ค้นหาข้อมูลขั้นสูง: ค้นตามเลขทะเบียน (ถอดช่องว่างหรือไม่ก็ได้), ชื่อเจ้าของ, ยี่ห้อ, รุ่น, เบอร์โทร, สังกัด หรือสถานะ
   - **ความปลอดภัยข้อมูลส่วนบุคคล (PDPA):** เลขบัตรประชาชนถูกเข้ารหัสด้วย **AES-256-GCM** ในฐานข้อมูล พร้อมระบบบันทึก Audit Log เมื่อแอดมินกดเปิดดูเลขบัตรประชาชน
   - ส่งออกข้อมูลเป็น **CSV** หรือ **Excel (Hikvision Whitelist)** ได้ทุกเมื่อ

3. **ระบบ Dual-Sync (SQLite + Excel / Google Sheet)**
   - อัปเดตไฟล์ `data/plate_whitelist.xlsx` ในรูปแบบมาตรฐาน Hikvision (`License Plate Number`, `Belong to`, `Card No.`, `Start Time For Entry`, `End Time For Entry`) อัตโนมัติทุกครั้งที่มีการอนุมัติ/แก้ไข/ลบ
   - รองรับการซิงก์ตรงไปยัง **Google Sheets API** ผ่าน Service Account
   - ไม่ลบแถวเดิมที่แอดมินป้อนเองในไฟล์ Excel/Google Sheet (ใช้หลักการ Upsert ตามเลขทะเบียน)

4. **รองรับการเชื่อมต่อกล้อง Hikvision LPR ในอนาคต**
   - มี API Endpoint (`/api/lpr/check` และ `/api/lpr/events`) สำหรับให้กล้องหรือโปรแกรม Hikvision / iVMS / HikCentral ส่งอีเวนต์การตรวจจับเข้า-ออก หรือ query ตรวจสอบสิทธิ์ไม้กั้นได้แบบเรียลไทม์

---

## 📁 โครงสร้างไฟล์และโฟลเดอร์ (Directory Structure)

```
tpd-vehicle-platform/
├── admin/                         # หน้าเว็บและทรัพย์สินสำหรับแอดมิน (Backend Protected)
│   ├── index.html                 # แดชบอร์ดแอดมิน (จัดการรถ, บันทึกเข้า-ออก, ซิงก์, ตั้งค่า)
│   ├── login.html                 # หน้าเข้าสู่ระบบแอดมิน
│   └── assets/
│       ├── admin.css              # สไตล์แดชบอร์ด Responsive
│       ├── admin.js               # Logic ควบคุมแดชบอร์ด
│       └── login.js               # Logic หน้าเข้าสู่ระบบ
├── public/                        # หน้าเว็บสาธารณะ (Frontend สำหรับผู้ใช้ทุกคน)
│   ├── index.html                 # แบบฟอร์มลงทะเบียนยานพาหนะ
│   ├── 404.html                   # หน้า 404
│   ├── favicon.svg                # ไอคอนระบบ
│   ├── css/
│   │   ├── tokens.css             # Design System (สี, สเกล, ปุ่ม, การ์ด, ป้ายทะเบียนจำลอง)
│   │   └── form.css               # สไตล์ฟอร์มลงทะเบียน
│   └── js/
│       └── form.js                # Logic หน้าฟอร์ม (Validation, Live preview, Submit)
├── server/                        # โค้ดฝั่ง Backend (Node.js + Express)
│   ├── index.js                   # จุดเริ่มต้นเซิร์ฟเวอร์ Express
│   ├── config.js                  # โหลดการตั้งค่าจาก .env
│   ├── reference.js               # ข้อมูลอ้างอิง (77 จังหวัด, ยี่ห้อ, รุ่น, ประเภทป้าย, สี)
│   ├── db/
│   │   ├── database.js            # เชื่อมต่อ SQLite (better-sqlite3)
│   │   └── schema.sql             # ตารางฐานข้อมูล (vehicles, owners, access_logs, admins, audit_log)
│   ├── middleware/
│   │   └── auth.js                # ระบบตรวจสอบสิทธิ์คุกกี้แอดมิน & Audit Logging
│   ├── routes/
│   │   ├── public.js              # API สาธารณะ (POST /api/vehicles)
│   │   ├── auth.js                # API ล็อกอิน/ล็อกเอาต์แอดมิน
│   │   ├── admin.js               # API จัดการข้อมูล (CRUD, อนุมัติ, ส่งออก CSV/Excel)
│   │   └── lpr.js                 # API เชื่อมต่อกล้อง Hikvision LPR
│   ├── services/
│   │   ├── plate.js               # ยูทิลิตี้จัดการเลขทะเบียน (normalize, format, split)
│   │   ├── security.js            # เข้ารหัส AES-256, Blind Index, Password Hashing
│   │   ├── validators.js          # ตรวจสอบความถูกต้องของข้อมูล (รวม 13 หลักบัตรประชาชนไทย)
│   │   ├── vehicleService.js      # จัดการข้อมูลรถและเจ้าของในฐานข้อมูล
│   │   ├── excelTarget.js         # เขียนและอัปเดตไฟล์ Excel (.xlsx) Hikvision
│   │   ├── googleSheetsTarget.js  # ซิงก์ข้อมูลเข้า Google Sheets API
│   │   └── syncService.js         # ประสานงาน Dual-Sync
│   └── scripts/
│       ├── create-admin.js        # Script สร้าง/รีเซ็ตรหัสผ่านแอดมิน
│       └── resync.js              # Script รันซิงก์ข้อมูลทั้งหมดไป Excel/Google Sheet
├── data/                          # โฟลเดอร์เก็บฐานข้อมูลและไฟล์ Excel (จะถูกสร้างอัตโนมัติ)
│   ├── vehicles.db                # ไฟล์ฐานข้อมูล SQLite
│   └── plate_whitelist.xlsx       # ไฟล์ Excel รูปแบบ Hikvision
├── docs/                          # เอกสารประกอบโครงการ
│   ├── GOOGLE_SHEETS_SETUP.md     # คู่มือติดตั้ง Google Sheets API
│   └── HIKVISION_INTEGRATION.md   # คู่มือการเชื่อมต่อกล้อง/แพลตฟอร์ม Hikvision LPR
├── .env                           # ค่าคอนฟิกเซิร์ฟเวอร์ (สร้างจาก .env.example)
├── .env.example                   # แม่แบบคอนฟิกเซิร์ฟเวอร์
├── package.json
└── README.md
```

---

## 🚀 วิธีการติดตั้งและใช้งาน (Getting Started)

### 1. ติดตั้ง Dependencies
เปิด Terminal ในโฟลเดอร์โปรเจกต์ แล้วรัน:
```bash
npm install
```

### 2. ตั้งค่าไฟล์ `.env`
คัดลอกไฟล์ `.env.example` เป็น `.env` (หากยังไม่มี):
```bash
cp .env.example .env
```
ปรับเปลี่ยนรหัสผ่านและคีย์ความปลอดภัยตามต้องการ:
```ini
PORT=3080
ADMIN_USERNAME=admin
ADMIN_PASSWORD=Tpd#Admin2026!x
SESSION_SECRET=ใส่สตริงสุ่มยาวๆ
DATA_ENCRYPTION_KEY=ใส่สตริงสุ่มยาวๆ
```

### 3. รันระบบ (Start Server)
```bash
npm start
```

ระบบจะเปิดใช้งานที่:
- **ฟอร์มกรอกข้อมูลสำหรับบุคคลทั่วไป:** [http://localhost:3080/](http://localhost:3080/)
- **ระบบผู้ดูแลระบบ (Admin Dashboard):** [http://localhost:3080/admin](http://localhost:3080/admin)

---

## 🔑 ข้อมูลเข้าสู่ระบบแอดมินเริ่มต้น
- **ชื่อผู้ใช้:** `admin`
- **รหัสผ่าน:** `Tpd#Admin2026!x` *(สามารถเปลี่ยนรหัสผ่านได้ในหน้าแดชบอร์ด หรือรัน `npm run create-admin -- admin "รหัสใหม่"`)*

---

## 📖 คู่มืออื่น ๆ ในโครงการ
- [คู่มือการติดตั้ง Google Sheets API (docs/GOOGLE_SHEETS_SETUP.md)](docs/GOOGLE_SHEETS_SETUP.md)
- [คู่มือการเชื่อมต่อกล้อง Hikvision LPR (docs/HIKVISION_INTEGRATION.md)](docs/HIKVISION_INTEGRATION.md)
