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
  return handleRequest(e);
}

function doGet(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheets = ss.getSheets();
    var hikSheet = sheets[0]; // แท็บที่ 1: สำหรับ Hikvision LPR (5 คอลัมน์)
    
    // สร้างแท็บที่ 2 (Full Registrations) สำหรับเก็บข้อมูลเต็ม 18 คอลัมน์ ถ้ายังไม่มี
    var fullSheet = ss.getSheetByName('Full Registrations');
    if (!fullSheet) {
      if (sheets.length > 1) {
        fullSheet = sheets[1];
      } else {
        fullSheet = ss.insertSheet('Full Registrations');
      }
    }

    // สร้างแถวหัวตารางแท็บ 1 (Hikvision Format) ถ้ายังไม่มี
    if (hikSheet.getLastRow() === 0) {
      hikSheet.appendRow(['License Plate Number', 'Belong to', 'Card No.', 'Start Time For Entry', 'End Time For Entry']);
    }

    // สร้างแถวหัวตารางแท็บ 2 (Full Data Format) ถ้ายังไม่มี
    if (fullSheet.getLastRow() === 0) {
      fullSheet.appendRow([
        'License Plate Number', 'Plate Norm', 'Province', 'Plate Type', 'Brand', 'Model',
        'Body Type', 'Color', 'Member Type', 'Owner Name', 'Phone', 'Affiliation',
        'National ID', 'Status', 'Telegram Chat ID', 'Visit Target', 'Note', 'Created At'
      ]);
    }

    var action = 'sync';
    var data = {};
    if (e && e.postData && e.postData.contents) {
      try { data = JSON.parse(e.postData.contents); } catch(err) {}
      action = data.action || 'sync';
    } else if (e && e.parameter && e.parameter.action) {
      action = e.parameter.action;
    }

    // ---------- กรณีอ่านข้อมูลทั้งหมดจากแท็บที่ 2 (get_rows) ----------
    if (action === 'get_rows') {
      var lastRow = fullSheet.getLastRow();
      if (lastRow <= 1) {
        return ContentService.createTextOutput(JSON.stringify({ ok: true, rows: [] }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      var rangeValues = fullSheet.getRange(2, 1, lastRow - 1, 18).getValues();
      var rows = [];
      for (var i = 0; i < rangeValues.length; i++) {
        var r = rangeValues[i];
        if (r[0] || r[1]) {
          rows.push({
            plate: String(r[0] || r[1]).trim(),
            plate_norm: String(r[1] || r[0]).trim(),
            province: String(r[2] || 'กรุงเทพมหานคร').trim(),
            plate_type: String(r[3] || 'white_black').trim(),
            brand: String(r[4] || 'ไม่ระบุ').trim(),
            model: String(r[5] || 'ไม่ระบุ').trim(),
            body_type: String(r[6] || 'sedan').trim(),
            color: String(r[7] || 'ขาว').trim(),
            member_type: String(r[8] || 'official').trim(),
            owner_name: String(r[9] || 'ไม่ระบุ').trim(),
            phone: String(r[10] || '-').trim(),
            affiliation: String(r[11] || '-').trim(),
            national_id: String(r[12] || '').trim(),
            status: String(r[13] || 'pending').trim(),
            belongTo: String(r[13]).toLowerCase() === 'blocked' ? 'Blocklist' : 'Allowlist',
            telegram_chat_id: String(r[14] || '').trim(),
            visit_target: String(r[15] || '').trim(),
            note: String(r[16] || '').trim(),
            created_at: r[17] ? String(r[17]) : ''
          });
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ ok: true, rows: rows }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ---------- กรณีเขียน/ซิงก์ข้อมูลลงทั้ง 2 แท็บ (sync) ----------
    var ops = data.ops || [];

    // 1. ซิงก์ลงแท็บที่ 1 (Hikvision 5 คอลัมน์)
    var hikValues = hikSheet.getDataRange().getValues();
    var hikIndex = {};
    for (var j = 1; j < hikValues.length; j++) {
      var p1 = String(hikValues[j][0] || '').trim().toUpperCase();
      if (p1) hikIndex[p1] = j + 1;
    }
    var hikDeletes = [];
    for (var k = 0; k < ops.length; k++) {
      var op = ops[k];
      var key1 = String(op.plate || '').trim().toUpperCase();
      var idx1 = hikIndex[key1];
      if (op.row) {
        var hikRowData = [op.row.plate, op.row.belongTo, op.row.cardNo || '', op.row.start || '', op.row.end || ''];
        if (idx1) {
          hikSheet.getRange(idx1, 1, 1, 5).setValues([hikRowData]);
        } else {
          hikSheet.appendRow(hikRowData);
          hikIndex[key1] = hikSheet.getLastRow();
        }
      } else if (idx1) {
        hikDeletes.push(idx1);
        delete hikIndex[key1];
      }
    }
    hikDeletes.sort(function(a, b) { return b - a; });
    for (var d1 = 0; d1 < hikDeletes.length; d1++) {
      hikSheet.deleteRow(hikDeletes[d1]);
    }

    // 2. ซิงก์ลงแท็บที่ 2 (Full Registrations 18 คอลัมน์)
    var fullValues = fullSheet.getDataRange().getValues();
    var fullIndex = {};
    for (var m = 1; m < fullValues.length; m++) {
      var p2 = String(fullValues[m][1] || fullValues[m][0] || '').trim().toUpperCase();
      if (p2) fullIndex[p2] = m + 1;
    }
    var fullDeletes = [];
    for (var n = 0; n < ops.length; n++) {
      var op2 = ops[n];
      var key2 = String(op2.plate || '').trim().toUpperCase();
      var idx2 = fullIndex[key2];
      if (op2.fullRow) {
        var fr = op2.fullRow;
        var fullRowData = [
          fr.plate_number, fr.plate_norm, fr.province, fr.plate_type, fr.brand, fr.model,
          fr.body_type, fr.color, fr.member_type, fr.owner_name, fr.phone, fr.affiliation,
          fr.national_id || '', fr.status, fr.telegram_chat_id || '', fr.visit_target || '', fr.note || '', fr.created_at || ''
        ];
        if (idx2) {
          fullSheet.getRange(idx2, 1, 1, 18).setValues([fullRowData]);
        } else {
          fullSheet.appendRow(fullRowData);
          fullIndex[key2] = fullSheet.getLastRow();
        }
      } else if (idx2) {
        fullDeletes.push(idx2);
        delete fullIndex[key2];
      }
    }
    fullDeletes.sort(function(a, b) { return b - a; });
    for (var d2 = 0; d2 < fullDeletes.length; d2++) {
      fullSheet.deleteRow(fullDeletes[d2]);
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
