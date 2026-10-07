# คู่มือการเชื่อมต่อกับระบบและกล้อง Hikvision (Official LPR Platform Integration)

แพลตฟอร์มนี้ถูกออกแบบมาเพื่อรองรับการทำงานร่วมกับระบบอ่านป้ายทะเบียน (LPR) และแพลตฟอร์ม Official ของ **Hikvision** ทั้งการ **นำเข้าป้ายทะเบียน (Import Whitelist)** และการ **รับส่งอีเวนต์เข้า-ออก (Event Webhook / API)**

---

## 1. การนำเข้าไฟล์ป้ายทะเบียนเข้าแพลตฟอร์ม Hikvision (File Import)

ระบบจะสร้างและอัปเดตไฟล์ Excel อัตโนมัติในเส้นทาง:
`data/plate_whitelist.xlsx`

### โครงสร้างคอลัมน์ ( Hikvision License Plate Template Standard)
| คอลัมน์ | ชื่อหัวข้อ (Header) | ตัวอย่างข้อมูล | อธิบาย |
|---|---|---|---|
| A | **License Plate Number** | `1กก9999` | เลขทะเบียนแบบถอดช่องว่างออกแล้ว (ตามมาตรฐาน Hikvision) |
| B | **Belong to** | `Allowlist` / `Blocklist` | สถานะใน Hikvision (`Allowlist` = อนุญาตให้เข้า, `Blocklist` = ห้ามเข้า) |
| C | **Card No.** | *(ว่าง)* | หมายเลขบัตร RFID (ถ้ามี) |
| D | **Start Time For Entry** | `2026-10-07T14:30:00+07:00` | เวลาเริ่มต้นสิทธิ์เข้า-ออก |
| E | **End Time For Entry** | `2030-12-31T23:59:59+07:00` | เวลาสิ้นสุดสิทธิ์เข้า-ออก |

### วิธีนำเข้า Hikvision iVMS-4200 / HikCentral / NVR / กล้อง LPR:
1. แอดมินล็อกอินเข้าหน้าแดชบอร์ด `/admin`
2. ไปที่เมนู **"🔄 Excel / ซิงก์"** แล้วกด **"⬇ ดาวน์โหลดไฟล์ Excel (Hikvision)"**
3. ในโปรแกรม HikCentral / iVMS-4200 หรือหน้าเว็บกล้อง Hikvision ไปที่เมนู **Vehicle Management > Vehicle List > Import**
4. อัปโหลดไฟล์ `plate_whitelist.xlsx` รายชื่อยานพาหนะพร้อมสถานะสิทธิ์จะถูกนำเข้าสู่ระบบกล้องทันที

---

## 2. การรับอีเวนต์และตรวจสอบสิทธิ์ผ่าน HTTP API (LPR Webhook & Query)

ระบบมี REST API สำหรับให้ซอฟต์แวร์ Hikvision หรือ Middleware ส่งอีเวนต์การตรวจจับป้ายทะเบียนเข้ามาบันทึกในระบบ

### การยืนยันตัวตน (Authentication)
ต้องส่ง Header ต่อไปนี้ในทุก Request:
```http
x-api-key: <รหัส LPR_API_KEY ที่ตั้งไว้ในไฟล์ .env>
```

---

### Endpoint A: ตรวจสอบสิทธิ์ป้ายทะเบียนก่อนเปิดไม้กั้น (`GET /api/lpr/check`)
ใช้ในกรณีต้องการให้กล้องหรือโปรแกรมสอบถามแพลตฟอร์มก่อนตัดสินใจยกไม้กั้น

**Request:**
```http
GET /api/lpr/check?plate=1กก9999&province=กรุงเทพมหานคร HTTP/1.1
Host: localhost:3080
x-api-key: your-secure-lpr-api-key
```

**Response (200 OK):**
```json
{
  "plate": "1กก9999",
  "result": "allow",
  "member_type": "official"
}
```
- `result` มีค่าได้เป็น: `allow` (อนุญาต), `block` (ไม่อนุญาต/Blacklist), `unknown` (ไม่อยู่ในระบบ)

---

### Endpoint B: บันทึกเวลาเข้า-ออกจากกล้อง Hikvision (`POST /api/lpr/events`)
เมื่อกล้องอ่านป้ายทะเบียนได้ สามารถส่งข้อมูลการเข้า-ออกเข้ามาเก็บในตาราง `access_logs` ของระบบได้ทันที

**Request Body (JSON):**
```json
{
  "plate": "1กก9999",
  "province": "กรุงเทพมหานคร",
  "direction": "in",
  "time": "2026-10-07T14:30:00+07:00",
  "gate": "GATE-1",
  "image_url": "http://192.168.1.100/snap/plate_1กก9999.jpg"
}
```

**Response (201 Created):**
```json
{
  "ok": true,
  "result": "allow"
}
```
ข้อมูลจะไปปรากฏในหน้าแดชบอร์ดแอดมิน เมนู **"🕑 บันทึกเข้า-ออก"** ทันที
