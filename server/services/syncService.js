/**
 * ประสานการซิงก์ SQL -> Excel / Google Sheet
 * SQL คือ "ต้นฉบับ" เสมอ ถ้าเขียน Excel/Sheet ไม่สำเร็จข้อมูลยังอยู่ครบและกด "ซิงก์ใหม่" ได้
 *
 * กติกาของ 1 เลขทะเบียน (Hikvision ไม่มีช่องจังหวัด จึงรวมทุกจังหวัดที่ทะเบียนเดียวกันเป็นแถวเดียว):
 *   - มีคันใดคันหนึ่ง blocked/blacklist  -> Blocklist  (ปลอดภัยไว้ก่อน)
 *   - มี allowed อย่างน้อย 1 คัน         -> Allowlist  (+ ช่วงเวลา)
 *   - มีแต่ pending                      -> ไม่มีแถว
 */
const db = require('../db/database');
const config = require('../config');
const excelTarget = require('./excelTarget');
const sheetsTarget = require('./googleSheetsTarget');

function computeRow(plateNorm) {
  const vs = db.prepare('SELECT * FROM vehicles WHERE plate_norm = ?').all(plateNorm);
  if (!vs.length) return null;
  if (vs.some((v) => v.status === 'blocked' || v.member_type === 'blacklist')) {
    return { plate: plateNorm, belongTo: 'Blocklist', cardNo: '', start: '', end: '' };
  }
  const allowed = vs.filter((v) => v.status === 'allowed');
  if (!allowed.length) return null;
  const starts = allowed.map((v) => v.valid_from).filter(Boolean).sort();
  const ends = allowed.map((v) => v.valid_to || config.excel.defaultAllowEnd).sort();
  return {
    plate: plateNorm,
    belongTo: 'Allowlist',
    cardNo: '',
    start: starts[0] || nowHik(),
    end: ends[ends.length - 1],
  };
}

// รูปแบบเวลาเดียวกับเทมเพลต Hikvision เช่น 2026-10-07T14:30:00+07:00 (เวลาไทย)
function toHik(date = new Date()) {
  const th = new Date(date.getTime() + 7 * 3600 * 1000);
  return `${th.toISOString().slice(0, 19)}+07:00`;
}
const nowHik = () => toHik(new Date());

// คิวเรียงลำดับ ป้องกันเขียนไฟล์ชนกันเมื่อมีหลายคนกดบันทึกพร้อมกัน
let chain = Promise.resolve();
function enqueue(task) {
  const run = chain.then(task, task);
  chain = run.catch(() => {});
  return run;
}

function targetsEnabled() {
  return { excel: config.excel.enabled, sheet: config.google.enabled };
}

async function runOps(ops) {
  const en = targetsEnabled();
  const result = {
    excel: en.excel ? 'ok' : 'off',
    sheet: en.sheet ? 'ok' : 'off',
    errors: [],
  };
  if (en.excel) {
    try { await excelTarget.apply(ops); } catch (e) { result.excel = 'error'; result.errors.push(`Excel: ${e.message}`); }
  }
  if (en.sheet) {
    try { await sheetsTarget.apply(ops); } catch (e) { result.sheet = 'error'; result.errors.push(`Sheet: ${e.message}`); }
  }
  return result;
}

function recordResult(plateNorms, result) {
  const stmt = db.prepare(`UPDATE vehicles SET excel_status = ?, sheet_status = ?, sync_message = ?,
    synced_at = datetime('now') WHERE plate_norm = ?`);
  const tx = db.transaction((list) => {
    for (const p of list) {
      stmt.run(
        result.excel === 'off' ? 'none' : result.excel,
        result.sheet === 'off' ? 'off' : result.sheet,
        result.errors.join(' | ') || null,
        p,
      );
    }
  });
  tx(plateNorms);
}

/** ซิงก์เลขทะเบียนที่ระบุ (เรียกหลังบันทึก/อนุมัติ/แก้ไข/ลบ) */
function syncPlates(plateNorms) {
  const unique = [...new Set(plateNorms.filter(Boolean))];
  if (!unique.length) return Promise.resolve({ excel: 'off', sheet: 'off', errors: [] });
  return enqueue(async () => {
    const ops = unique.map((p) => ({ plate: p, row: computeRow(p) }));
    const result = await runOps(ops);
    recordResult(unique, result);
    return result;
  });
}

/** ซิงก์ใหม่ทั้งหมด (upsert ทุกทะเบียนในฐานข้อมูล) */
function resyncAll() {
  return enqueue(async () => {
    const plates = db.prepare('SELECT DISTINCT plate_norm FROM vehicles').all().map((r) => r.plate_norm);
    if (!plates.length) return { excel: 'off', sheet: 'off', errors: [], count: 0 };
    const ops = plates.map((p) => ({ plate: p, row: computeRow(p) }));
    const result = await runOps(ops);
    recordResult(plates, result);
    return { ...result, count: plates.length };
  });
}

/** ลบแถวของทะเบียนที่ถูกลบจาก SQL ออกจาก Excel/Sheet (ถ้าไม่เหลือคันอื่นที่ใช้ทะเบียนเดียวกัน) */
function removePlatesIfOrphaned(plateNorms) {
  return syncPlates(plateNorms.filter(Boolean));
}

/** ดึงข้อมูลทั้งหมดจาก Google Sheet กลับเข้ามาในฐานข้อมูล SQLite */
async function pullFromSheets() {
  if (!config.google.enabled) {
    return { count: 0, totalSheets: 0, message: 'ไม่ได้เปิดใช้งาน GOOGLE_SHEETS_ENABLED=true' };
  }
  try {
    const rows = await sheetsTarget.readRows();
    if (!rows.length) return { count: 0, totalSheets: 0, message: 'ไม่พบข้อมูลใน Google Sheet หรือไม่สามารถอ่านชีตได้' };

    let added = 0;
    const { normalizePlate } = require('./plate');

    // ค้นหาหรือสร้างเจ้าของรถเริ่มต้นสำหรับรายการที่นำเข้าจาก Google Sheet
    let owner = db.prepare('SELECT id FROM owners WHERE full_name = ?').get('ซิงก์อัตโนมัติ (Google Sheet)');
    if (!owner) {
      const info = db.prepare(`INSERT INTO owners (full_name, phone, affiliation) VALUES (?,?,?)`)
        .run('ซิงก์อัตโนมัติ (Google Sheet)', '-', 'Google Sheet');
      owner = { id: Number(info.lastInsertRowid) };
    }

    const tx = db.transaction((list) => {
      for (const r of list) {
        const norm = normalizePlate(r.plate);
        if (!norm) continue;
        const exists = db.prepare('SELECT id FROM vehicles WHERE plate_norm = ?').get(norm);
        if (!exists) {
          const status = String(r.belongTo).toLowerCase() === 'blocklist' ? 'blocked' : 'allowed';
          const memberType = status === 'blocked' ? 'blacklist' : 'official';
          db.prepare(`INSERT INTO vehicles 
            (plate_number, plate_norm, province, plate_prefix, plate_digits, plate_type, brand, model, body_type, color,
             owner_id, member_type, visit_target, status, valid_from, valid_to, note, excel_status, sheet_status)
            VALUES (?, ?, 'กรุงเทพมหานคร', '', '', 'normal', 'ไม่ระบุ', 'ไม่ระบุ', 'sedan', 'white',
             ?, ?, 'ปฏิบัติหน้าที่', ?, ?, ?, 'ซิงก์ดึงข้อมูลจาก Google Sheet', 'ok', 'ok')`).run(
            r.plate, norm, owner.id, memberType, status, r.start || null, r.end || null
          );
          added++;
        }
      }
    });
    tx(rows);

    return { count: added, totalSheets: rows.length };
  } catch (e) {
    console.error('[pullFromSheets error]', e);
    return { count: 0, totalSheets: 0, message: e.message };
  }
}

module.exports = { syncPlates, resyncAll, removePlatesIfOrphaned, pullFromSheets, toHik, targetsEnabled, computeRow };
