/**
 * จัดการเลขทะเบียน: ถอดช่องว่าง/ขีด, แปลงเลขไทย, แยกหมวดอักษร-ตัวเลข
 * เก็บเป็น "1กก9999" เพื่อให้ค้นหา / จับคู่กับ LPR ได้ง่าย
 */
const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';

function normalizePlate(input) {
  if (input === undefined || input === null) return '';
  return String(input)
    .normalize('NFC')
    .replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d)))
    .replace(/[\s\-_.\u200b\u00a0]/g, '')
    .toUpperCase();
}

// ต้องมีทั้งตัวอักษรและตัวเลข ความยาว 3-12 ตัว (ผ่อนปรนเพื่อรองรับป้ายพิเศษ)
function isValidPlate(norm) {
  return /^[\u0e01-\u0e2eA-Z0-9]{3,12}$/.test(norm) && /[0-9]/.test(norm) && /[\u0e01-\u0e2eA-Z]/.test(norm);
}

// แยก "1กก9999" -> { prefix: '1กก', digits: '9999' }
function splitPlate(norm) {
  const m = /^([0-9]{0,2}[\u0e01-\u0e2eA-Z]{1,3})([0-9]{1,4})$/.exec(norm);
  return m ? { prefix: m[1], digits: m[2] } : { prefix: null, digits: null };
}

// ใช้แสดงผลสวย ๆ: 1กก9999 -> 1กก 9999
function formatPlate(norm) {
  const { prefix, digits } = splitPlate(norm);
  return prefix ? `${prefix} ${digits}` : norm;
}

module.exports = { normalizePlate, isValidPlate, splitPlate, formatPlate };
