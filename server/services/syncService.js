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
  const allowed = vs.filter((v) => v.status !== 'blocked');
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

function computeFullRow(plateNorm) {
  const SELECT_JOIN = `SELECT v.*, o.full_name AS owner_name, o.phone AS owner_phone, o.affiliation AS owner_affiliation,
    o.national_id_last4 AS nid_last4, (o.national_id_enc IS NOT NULL) AS has_nid
    FROM vehicles v JOIN owners o ON o.id = v.owner_id`;
  const v = db.prepare(`${SELECT_JOIN} WHERE v.plate_norm = ? ORDER BY v.id DESC LIMIT 1`).get(plateNorm);
  if (!v) return null;
  return {
    plate_number: v.plate_number,
    plate_norm: v.plate_norm,
    province: v.province,
    plate_type: v.plate_type,
    brand: v.brand,
    model: v.model,
    body_type: v.body_type,
    color: v.color,
    member_type: v.member_type,
    owner_name: v.owner_name,
    phone: v.owner_phone,
    affiliation: v.owner_affiliation,
    national_id: v.has_nid ? `•••••••••${v.nid_last4}` : '',
    status: v.status,
    telegram_chat_id: v.telegram_chat_id || '',
    visit_target: v.visit_target || '',
    note: v.note || '',
    created_at: v.created_at || '',
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
    const ops = unique.map((p) => ({ plate: p, row: computeRow(p), fullRow: computeFullRow(p) }));
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
    const ops = plates.map((p) => ({ plate: p, row: computeRow(p), fullRow: computeFullRow(p) }));
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

    const tx = db.transaction((list) => {
      for (const r of list) {
        const norm = normalizePlate(r.plate_norm || r.plate);
        if (!norm) continue;
        const exists = db.prepare('SELECT id FROM vehicles WHERE plate_norm = ?').get(norm);
        if (!exists) {
          const ownerName = r.owner_name || 'ซิงก์อัตโนมัติ (Google Sheet)';
          let owner = db.prepare('SELECT id FROM owners WHERE full_name = ?').get(ownerName);
          if (!owner) {
            const info = db.prepare(`INSERT INTO owners (full_name, phone, affiliation) VALUES (?,?,?)`)
              .run(ownerName, r.phone || '-', r.affiliation || 'Google Sheet');
            owner = { id: Number(info.lastInsertRowid) };
          }

          const status = r.status || (String(r.belongTo).toLowerCase() === 'blocklist' ? 'blocked' : 'allowed');
          const memberType = r.member_type || (status === 'blocked' ? 'blacklist' : 'official');
          
          db.prepare(`INSERT INTO vehicles 
            (plate_number, plate_norm, province, plate_prefix, plate_digits, plate_type, brand, model, body_type, color,
             owner_id, member_type, visit_target, status, valid_from, valid_to, note, telegram_chat_id, excel_status, sheet_status)
            VALUES (?, ?, ?, '', '', ?, ?, ?, ?, ?,
             ?, ?, ?, ?, ?, ?, ?, ?, 'ok', 'ok')`).run(
            r.plate || norm,
            norm,
            r.province || 'กรุงเทพมหานคร',
            r.plate_type || 'white_black',
            r.brand || 'ไม่ระบุ',
            r.model || 'ไม่ระบุ',
            r.body_type || 'sedan',
            r.color || 'ขาว',
            owner.id,
            memberType,
            r.visit_target || '',
            status,
            r.start || null,
            r.end || null,
            r.note || 'ซิงก์ดึงข้อมูลจาก Google Sheet',
            r.telegram_chat_id || null
          );
          added++;
        } else if (r.telegram_chat_id) {
          db.prepare('UPDATE vehicles SET telegram_chat_id = COALESCE(telegram_chat_id, ?) WHERE plate_norm = ?').run(r.telegram_chat_id, norm);
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

/** ดึงข้อมูลทั้งหมดจาก แท็บ 2 (Full Registrations) ของ Excel กลับเข้ามาในฐานข้อมูล SQLite */
async function pullFromExcel() {
  if (!config.excel.enabled) {
    return { count: 0, totalExcel: 0, message: 'ไม่ได้เปิดใช้งาน EXCEL_ENABLED=true' };
  }
  try {
    const rows = await excelTarget.readRows();
    if (!rows.length) return { count: 0, totalExcel: 0, message: 'ไม่พบข้อมูลในไฟล์ Excel แท็บ Full Registrations' };

    let added = 0;
    const { normalizePlate } = require('./plate');

    const tx = db.transaction((list) => {
      for (const r of list) {
        const norm = normalizePlate(r.plate_norm || r.plate);
        if (!norm) continue;
        const exists = db.prepare('SELECT id FROM vehicles WHERE plate_norm = ?').get(norm);
        if (!exists) {
          const ownerName = r.owner_name || 'ซิงก์อัตโนมัติ (Excel)';
          let owner = db.prepare('SELECT id FROM owners WHERE full_name = ?').get(ownerName);
          if (!owner) {
            const info = db.prepare(`INSERT INTO owners (full_name, phone, affiliation) VALUES (?,?,?)`)
              .run(ownerName, r.phone || '-', r.affiliation || 'Excel');
            owner = { id: Number(info.lastInsertRowid) };
          }

          const status = r.status || (String(r.belongTo).toLowerCase() === 'blocklist' ? 'blocked' : 'allowed');
          const memberType = r.member_type || (status === 'blocked' ? 'blacklist' : 'official');
          
          db.prepare(`INSERT INTO vehicles 
            (plate_number, plate_norm, province, plate_prefix, plate_digits, plate_type, brand, model, body_type, color,
             owner_id, member_type, visit_target, status, valid_from, valid_to, note, telegram_chat_id, excel_status, sheet_status)
            VALUES (?, ?, ?, '', '', ?, ?, ?, ?, ?,
             ?, ?, ?, ?, ?, ?, ?, ?, 'ok', 'ok')`).run(
            r.plate || norm,
            norm,
            r.province || 'กรุงเทพมหานคร',
            r.plate_type || 'white_black',
            r.brand || 'ไม่ระบุ',
            r.model || 'ไม่ระบุ',
            r.body_type || 'sedan',
            r.color || 'ขาว',
            owner.id,
            memberType,
            r.visit_target || '',
            status,
            r.start || null,
            r.end || null,
            r.note || 'ซิงก์ดึงข้อมูลจาก Excel',
            r.telegram_chat_id || null
          );
          added++;
        } else if (r.telegram_chat_id) {
          db.prepare('UPDATE vehicles SET telegram_chat_id = COALESCE(telegram_chat_id, ?) WHERE plate_norm = ?').run(r.telegram_chat_id, norm);
        }
      }
    });
    tx(rows);

    return { count: added, totalExcel: rows.length };
  } catch (e) {
    console.error('[pullFromExcel error]', e);
    return { count: 0, totalExcel: 0, message: e.message };
  }
}

module.exports = { syncPlates, resyncAll, removePlatesIfOrphaned, pullFromSheets, pullFromExcel, toHik, targetsEnabled, computeRow, computeFullRow };

