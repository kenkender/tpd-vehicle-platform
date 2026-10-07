/**
 * เขียน/อัปเดตไฟล์ Excel ในรูปแบบเทมเพลตนำเข้าของ Hikvision
 * คอลัมน์: License Plate Number | Belong to | Card No. | Start Time For Entry | End Time For Entry
 *
 * หลักการ: "upsert ตามเลขทะเบียน" ไม่ล้างแถวอื่นที่มีอยู่เดิม (ปลอดภัยต่อข้อมูลที่แอดมินใส่เอง)
 */
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const config = require('../config');

const HEADERS = ['License Plate Number', 'Belong to', 'Card No.', 'Start Time For Entry', 'End Time For Entry'];

function rowValues(r) {
  return [r.plate, r.belongTo, r.cardNo || '', r.start || '', r.end || ''];
}

async function openWorkbook(file) {
  const wb = new ExcelJS.Workbook();
  if (fs.existsSync(file)) {
    await wb.xlsx.readFile(file);
  }
  let ws = wb.worksheets[0];
  if (!ws) {
    ws = wb.addWorksheet('Sheet1');
  }
  if (ws.rowCount === 0 || !ws.getRow(1).getCell(1).value) {
    ws.getRow(1).values = HEADERS;
  }
  ws.getRow(1).font = { bold: true };
  [1, 2, 3, 4, 5].forEach((c, i) => {
    ws.getColumn(c).width = [24, 14, 14, 30, 30][i];
    ws.getColumn(c).numFmt = '@'; // บังคับเป็นข้อความ กันทะเบียนถูกแปลงเป็นตัวเลข/วันที่
  });
  return { wb, ws };
}

/**
 * @param {Array<{plate:string,row:null|{plate,belongTo,cardNo,start,end}}>} ops
 */
async function apply(ops, file = config.excel.path) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const { wb, ws } = await openWorkbook(file);

  const index = new Map();
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return;
    const v = row.getCell(1).value;
    if (v !== null && v !== undefined) index.set(String(v.text ?? v).trim().toUpperCase(), n);
  });

  const toDelete = [];
  for (const op of ops) {
    const key = op.plate.toUpperCase();
    const at = index.get(key);
    if (op.row) {
      if (at) {
        ws.getRow(at).values = rowValues(op.row);
      } else {
        const added = ws.addRow(rowValues(op.row));
        index.set(key, added.number);
      }
    } else if (at) {
      toDelete.push(at);
      index.delete(key);
    }
  }
  [...new Set(toDelete)].sort((a, b) => b - a).forEach((n) => ws.spliceRows(n, 1));

  // เขียนไฟล์ชั่วคราวก่อนแล้วค่อย rename กันไฟล์พังหากเขียนค้าง
  const tmp = `${file}.tmp`;
  await wb.xlsx.writeFile(tmp);
  try {
    fs.renameSync(tmp, file);
  } catch (e) {
    if (e.code === 'EBUSY' || e.code === 'EPERM') {
      fs.unlinkSync(tmp);
      throw new Error('ไฟล์ Excel กำลังถูกเปิดอยู่ กรุณาปิดไฟล์แล้วกด "ซิงก์ใหม่"');
    }
    throw e;
  }
}

module.exports = { apply, HEADERS };
