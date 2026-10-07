# 📊 คู่มือการติดตั้งและซิงก์ข้อมูลตรงลง Google Sheets

ระบบทะเบียนยานพาหนะ กองบัญชาการตำรวจท่องเที่ยว รองรับการยิงข้อมูลซิงก์ตรงเข้า **Google Sheets** ของคุณแบบเรียลไทม์ (เมื่อแอดมินกด "อนุญาต" ข้อมูลจะถูกเขียนลง Google Sheet ของคุณทันที)

---

## ⚡ วิธีที่ 1: ติดตั้งผ่าน Google Apps Script (แนะนำ! ง่ายที่สุดใน 1 นาที)
*วิธีนี้ใช้กับ Google Sheet ที่แชร์สิทธิ์เป็น "ทุกคนที่มีลิงก์แก้ไขได้" ได้ทันที ไม่ต้องสมัคร Google Cloud Console หรือใช้ไฟล์ Service Account*

### ขั้นตอนที่ 1: วางโค้ดใน Google Sheet ของคุณ
1. เปิดไฟล์ Google Sheet ของคุณ: [https://docs.google.com/spreadsheets/d/1jxqt9JoOUUUsi-BzoWDx3T4iQxoj4PY_/edit?gid=2039088570](https://docs.google.com/spreadsheets/d/1jxqt9JoOUUUsi-BzoWDx3T4iQxoj4PY_/edit?gid=2039088570)
2. ที่เมนูด้านบน คลิก **ส่วนขยาย (Extensions) > Apps Script**
3. ลบโค้ดเดิมออกทั้งหมด แล้วคัดลอกโค้ดด้านล่างนี้ไปวาง:

```javascript
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    
    // สร้างแถวหัวตารางถ้ายังไม่มี
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['License Plate Number', 'Belong to', 'Card No.', 'Start Time For Entry', 'End Time For Entry']);
    }
    
    var ops = data.ops || [];
    var values = sheet.getDataRange().getValues();
    var indexMap = {};
    for (var i = 1; i < values.length; i++) {
      var plate = String(values[i][0] || '').trim().toUpperCase();
      if (plate) indexMap[plate] = i + 1;
    }
    
    var rowsToDelete = [];
    for (var k = 0; k < ops.length; k++) {
      var op = ops[k];
      var key = String(op.plate || '').trim().toUpperCase();
      var rowIndex = indexMap[key];
      
      if (op.row) {
        var rowData = [op.row.plate, op.row.belongTo, op.row.cardNo || '', op.row.start || '', op.row.end || ''];
        if (rowIndex) {
          sheet.getRange(rowIndex, 1, 1, 5).setValues([rowData]);
        } else {
          sheet.appendRow(rowData);
          indexMap[key] = sheet.getLastRow();
        }
      } else if (rowIndex) {
        rowsToDelete.push(rowIndex);
        delete indexMap[key];
      }
    }
    
    rowsToDelete.sort(function(a, b) { return b - a; });
    for (var d = 0; d < rowsToDelete.length; d++) {
      sheet.deleteRow(rowsToDelete[d]);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ ok: true, synced: ops.length }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

### ขั้นตอนที่ 2: ทำให้เป็น Web App (Deploy)
1. ที่มุมขวาบนของหน้า Apps Script กดปุ่ม **ทำให้ใช้งานได้ (Deploy) > การทำให้ใช้งานได้ใหม่ (New deployment)**
2. คลิกรูปเฟือง ⚙️ เลือกประเภท **เว็บแอป (Web app)**
3. ตั้งค่าดังนี้:
   - **คำอธิบาย (Description):** `TPD Vehicle Sync`
   - **เรียกใช้งานเป็น (Execute as):** `ฉัน (Me)`
   - **ผู้มีสิทธิ์เข้าถึง (Who has access):** `ทุกคน (Anyone)`
4. กด **ทำให้ใช้งานได้ (Deploy)**
5. (ถ้ามีหน้าต่างขออนุมัติให้กด *Authorize access* -> เลือกอีเมลของคุณ -> กด *Advanced* -> กด *Go to Untitled project (unsafe)* -> กด *Allow*)
6. คัดลอก **URL ของเว็บแอป (Web app URL)** (รูปแบบ: `https://script.google.com/macros/s/AKfycbx.../exec`)

### ขั้นตอนที่ 3: นำ URL มาใส่ในไฟล์ `.env`
เปิดไฟล์ `.env` ในระบบ แล้วเปิดใช้งาน Google Sheet โดยตั้งค่า:

```ini
GOOGLE_SHEETS_ENABLED=true
GOOGLE_SCRIPT_URL=https://script.google.com/macros/s/วางURLของคุณตรงนี้/exec
```

---

## 🔑 วิธีที่ 2: ติดตั้งผ่าน Google Cloud Service Account
*(หากต้องการใช้ Official Google Sheets API v4)*

1. นำไฟล์ JSON จาก Google Cloud Console มาวางที่ `data/google-service-account.json`
2. แชร์ไฟล์ Google Sheet ให้อีเมล Service Account เป็น **Editor**
3. ตั้งค่าใน `.env`:
```ini
GOOGLE_SHEETS_ENABLED=true
GOOGLE_SHEET_ID=1jxqt9JoOUUUsi-BzoWDx3T4iQxoj4PY_
GOOGLE_SHEET_GID=2039088570
GOOGLE_SERVICE_ACCOUNT_FILE=./data/google-service-account.json
```

---

## 🔄 สรุปรูปแบบข้อมูลที่ถูกยิงไปบันทึกบน Google Sheet

| License Plate Number | Belong to | Card No. | Start Time For Entry | End Time For Entry |
|---|---|---|---|---|
| 1กก9999 | Allowlist | | 2026-10-07T14:30:00+07:00 | 2030-12-31T23:59:59+07:00 |
| 2ขข8888 | Blocklist | | | |
