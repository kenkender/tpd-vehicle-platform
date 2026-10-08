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
const FULL_HEADERS = [
  'License Plate Number', 'Plate Norm', 'Province', 'Plate Type', 'Brand', 'Model',
  'Body Type', 'Color', 'Member Type', 'Owner Name', 'Phone', 'Affiliation',
  'National ID', 'Status', 'Telegram Chat ID', 'Visit Target', 'Note', 'Created At'
];

function rowValues(r) {
  return [r.plate, r.belongTo, r.cardNo || '', r.start || '', r.end || ''];
}

function fullRowValues(fr) {
  return [
    fr.plate_number || fr.plate_norm,
    fr.plate_norm,
    fr.province || 'กรุงเทพมหานคร',
    fr.plate_type || 'white_black',
    fr.brand || 'ไม่ระบุ',
    fr.model || 'ไม่ระบุ',
    fr.body_type || 'sedan',
    fr.color || 'ขาว',
    fr.member_type || 'official',
    fr.owner_name || 'ไม่ระบุ',
    fr.phone || '-',
    fr.affiliation || '-',
    fr.national_id || '',
    fr.status || 'pending',
    fr.telegram_chat_id || '',
    fr.visit_target || '',
    fr.note || '',
    fr.created_at || '',
  ];
}

async function openWorkbook(file) {
  const wb = new ExcelJS.Workbook();
  if (fs.existsSync(file)) {
    await wb.xlsx.readFile(file);
  }

  // --- แท็บที่ 1: Hikvision Format (5 คอลัมน์) ---
  let ws1 = wb.worksheets[0];
  if (!ws1) {
    ws1 = wb.addWorksheet('Hikvision Format');
  }
  if (ws1.rowCount === 0 || !ws1.getRow(1).getCell(1).value) {
    ws1.getRow(1).values = HEADERS;
  }
  ws1.getRow(1).font = { bold: true };
  [1, 2, 3, 4, 5].forEach((c, i) => {
    ws1.getColumn(c).width = [24, 14, 14, 30, 30][i];
    ws1.getColumn(c).numFmt = '@'; // บังคับเป็นข้อความ
  });

  // --- แท็บที่ 2: Full Registrations (18 คอลัมน์ รวม Telegram Chat ID) ---
  let ws2 = wb.getWorksheet('Full Registrations') || wb.worksheets[1];
  if (!ws2) {
    ws2 = wb.addWorksheet('Full Registrations');
  }
  if (ws2.rowCount === 0 || !ws2.getRow(1).getCell(1).value) {
    ws2.getRow(1).values = FULL_HEADERS;
  }
  ws2.getRow(1).font = { bold: true };
  for (let c = 1; c <= FULL_HEADERS.length; c++) {
    ws2.getColumn(c).width = 20;
    ws2.getColumn(c).numFmt = '@';
  }

  return { wb, ws1, ws2 };
}

/**
 * @param {Array<{plate:string, row:null|Object, fullRow:null|Object}>} ops
 */
async function apply(ops, file = config.excel.path) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const { wb, ws1, ws2 } = await openWorkbook(file);

  // 1. อัปเดต แท็บที่ 1 (Hikvision Format)
  const index1 = new Map();
  ws1.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return;
    const v = row.getCell(1).value;
    if (v !== null && v !== undefined) index1.set(String(v.text ?? v).trim().toUpperCase(), n);
  });

  const toDelete1 = [];
  for (const op of ops) {
    const key = op.plate.toUpperCase();
    const at = index1.get(key);
    if (op.row) {
      if (at) {
        ws1.getRow(at).values = rowValues(op.row);
      } else {
        const added = ws1.addRow(rowValues(op.row));
        index1.set(key, added.number);
      }
    } else if (at) {
      toDelete1.push(at);
      index1.delete(key);
    }
  }
  [...new Set(toDelete1)].sort((a, b) => b - a).forEach((n) => ws1.spliceRows(n, 1));

  // 2. อัปเดต แท็บที่ 2 (Full Registrations)
  const index2 = new Map();
  ws2.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return;
    const pNorm = row.getCell(2).value ?? row.getCell(1).value;
    if (pNorm !== null && pNorm !== undefined) index2.set(String(pNorm.text ?? pNorm).trim().toUpperCase(), n);
  });

  const toDelete2 = [];
  for (const op of ops) {
    const key = op.plate.toUpperCase();
    const at = index2.get(key);
    if (op.fullRow) {
      const vals = fullRowValues(op.fullRow);
      if (at) {
        ws2.getRow(at).values = vals;
      } else {
        const added = ws2.addRow(vals);
        index2.set(key, added.number);
      }
    } else if (at) {
      toDelete2.push(at);
      index2.delete(key);
    }
  }
  [...new Set(toDelete2)].sort((a, b) => b - a).forEach((n) => ws2.spliceRows(n, 1));

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

function cellVal(row, col) {
  const v = row.getCell(col).value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && v.text !== undefined) return String(v.text).trim();
  return String(v).trim();
}

/**
 * อ่านข้อมูลทั้งหมดจากแท็บที่ 2 (Full Registrations) ของไฟล์ Excel
 */
async function readRows(file = config.excel.path) {
  if (!fs.existsSync(file)) return [];
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws2 = wb.getWorksheet('Full Registrations') || wb.worksheets[1];
  if (!ws2) return [];

  const rows = [];
  ws2.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return; // ข้าม Header
    const plate = cellVal(row, 1);
    const plateNorm = cellVal(row, 2) || plate;
    if (!plate && !plateNorm) return;

    rows.push({
      plate: plate || plateNorm,
      plate_norm: plateNorm,
      province: cellVal(row, 3) || 'กรุงเทพมหานคร',
      plate_type: cellVal(row, 4) || 'white_black',
      brand: cellVal(row, 5) || 'ไม่ระบุ',
      model: cellVal(row, 6) || 'ไม่ระบุ',
      body_type: cellVal(row, 7) || 'sedan',
      color: cellVal(row, 8) || 'ขาว',
      member_type: cellVal(row, 9) || 'official',
      owner_name: cellVal(row, 10) || 'ไม่ระบุ',
      phone: cellVal(row, 11) || '-',
      affiliation: cellVal(row, 12) || '-',
      national_id: cellVal(row, 13) || '',
      status: cellVal(row, 14) || 'pending',
      telegram_chat_id: cellVal(row, 15) || '',
      visit_target: cellVal(row, 16) || '',
      note: cellVal(row, 17) || '',
      created_at: cellVal(row, 18) || '',
    });
  });
  return rows;
}

module.exports = { apply, readRows, HEADERS, FULL_HEADERS };

