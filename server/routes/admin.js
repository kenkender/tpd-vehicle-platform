const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db/database');
const config = require('../config');
const ref = require('../reference');
const sec = require('../services/security');
const vehicles = require('../services/vehicleService');
const sync = require('../services/syncService');
const { validateVehicleInput, clean } = require('../services/validators');
const { requireAdminApi, audit } = require('../middleware/auth');
const { normalizePlate } = require('../services/plate');

const router = express.Router();
router.use(requireAdminApi);

const syncSummary = (r) => ({
  excel: r.excel, sheet: r.sheet, errors: r.errors,
  ok: !r.errors.length,
});

router.get('/stats', (req, res) => {
  res.json({
    ...vehicles.stats(),
    targets: {
      excel: config.excel.enabled,
      google: config.google.enabled,
    },
  });
});

router.get('/reference', (req, res) => {
  res.json({
    provinces: ref.PROVINCES,
    plateTypes: ref.PLATE_TYPES,
    bodyTypes: ref.BODY_TYPES,
    colors: ref.COLORS,
    memberTypes: ref.MEMBER_TYPES,
    statuses: ref.STATUSES,
    brands: ref.BRANDS,
  });
});

// ---------- ยานพาหนะ ----------
router.get('/vehicles', (req, res) => {
  res.json(vehicles.list(req.query));
});

router.get('/vehicles/:id', (req, res) => {
  const reveal = req.query.reveal === '1';
  const v = vehicles.getById(Number(req.params.id), { reveal });
  if (!v) return res.status(404).json({ error: 'not_found' });
  if (reveal) audit(req, 'reveal_national_id', `vehicle#${v.id} ${v.plate_norm}`);
  return res.json(v);
});

router.post('/vehicles', (req, res) => {
  const { ok, errors, value } = validateVehicleInput(req.body || {}, { admin: true });
  if (!ok) return res.status(422).json({ error: 'validation', errors });
  try {
    const id = vehicles.create(value, { ip: req.ip, admin: true });
    audit(req, 'create_vehicle', `#${id} ${value.plate_norm} ${value.province}`);
    sync.syncPlates([value.plate_norm]).catch((err) => console.error('[bg sync error]', err));
    return res.status(201).json({ ok: true, id });
  } catch (e) {
    if (e instanceof vehicles.DuplicateError) {
      return res.status(409).json({ error: 'duplicate', message: 'ทะเบียนนี้ (ในจังหวัดนี้) มีอยู่ในระบบแล้ว' });
    }
    console.error(e);
    return res.status(500).json({ error: 'server', message: e.message });
  }
});

router.put('/vehicles/:id', (req, res) => {
  const id = Number(req.params.id);
  const { ok, errors, value } = validateVehicleInput(req.body || {}, { admin: true });
  if (!ok) return res.status(422).json({ error: 'validation', errors });
  try {
    const r = vehicles.update(id, value);
    if (!r) return res.status(404).json({ error: 'not_found' });
    audit(req, 'update_vehicle', `#${id} ${value.plate_norm}`);
    sync.syncPlates([r.oldPlate, r.newPlate]).catch((err) => console.error('[bg sync error]', err));
    return res.json({ ok: true });
  } catch (e) {
    if (e instanceof vehicles.DuplicateError) {
      return res.status(409).json({ error: 'duplicate', message: 'ทะเบียนนี้ (ในจังหวัดนี้) มีอยู่ในระบบแล้ว' });
    }
    console.error(e);
    return res.status(500).json({ error: 'server', message: e.message });
  }
});

router.post('/vehicles/:id/status', (req, res) => {
  const id = Number(req.params.id);
  const status = clean(req.body?.status, 20);
  if (!['pending', 'allowed', 'blocked'].includes(status)) {
    return res.status(422).json({ error: 'validation', message: 'สถานะไม่ถูกต้อง' });
  }
  const plate = vehicles.setStatus(id, status, {
    valid_from: req.body?.valid_from,
    valid_to: req.body?.valid_to,
    note: req.body?.note ? clean(req.body.note, 500) : undefined,
  });
  if (!plate) return res.status(404).json({ error: 'not_found' });
  audit(req, 'set_status', `#${id} ${plate} -> ${status}`);
  sync.syncPlates([plate]).catch((err) => console.error('[bg sync error]', err));
  return res.json({ ok: true });
});

router.post('/vehicles/:id/sync', async (req, res) => {
  const v = db.prepare('SELECT plate_norm FROM vehicles WHERE id = ?').get(Number(req.params.id));
  if (!v) return res.status(404).json({ error: 'not_found' });
  const result = await sync.syncPlates([v.plate_norm]);
  return res.json({ ok: !result.errors.length, sync: syncSummary(result) });
});

router.delete('/vehicles/:id', (req, res) => {
  const plate = vehicles.remove(Number(req.params.id));
  if (!plate) return res.status(404).json({ error: 'not_found' });
  audit(req, 'delete_vehicle', `#${req.params.id} ${plate}`);
  sync.removePlatesIfOrphaned([plate]).catch((err) => console.error('[bg sync error]', err));
  return res.json({ ok: true });
});

// ---------- ซิงก์ / ส่งออก ----------
router.post('/sync', async (req, res) => {
  audit(req, 'resync_all');
  const result = await sync.resyncAll();
  res.json({ ok: !result.errors.length, count: result.count || 0, sync: syncSummary(result) });
});

router.post('/sync/pull', async (req, res) => {
  audit(req, 'pull_from_google_sheets');
  const result = await sync.pullFromSheets();
  res.json({ ok: !result.message, ...result });
});

const handleExcelExport = async (req, res) => {
  try {
    await sync.resyncAll();
    audit(req, 'download_excel');
    const fullPath = path.resolve(config.excel.path);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'not_found', message: 'ไม่พบไฟล์ Excel' });
    }
    const stat = fs.statSync(fullPath);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="plate_whitelist.xlsx"');
    res.setHeader('Content-Length', stat.size);
    const stream = fs.createReadStream(fullPath);
    return stream.pipe(res);
  } catch (e) {
    console.error('[export excel error]', e);
    return res.status(500).json({ error: 'server', message: 'ไม่สามารถสร้างไฟล์ Excel ได้' });
  }
};

router.get('/export/excel', handleExcelExport);
router.get('/export/plate_whitelist.xlsx', handleExcelExport);

router.get('/export/vehicles.csv', (req, res) => {
  const rows = vehicles.list({ ...req.query, page: 1, pageSize: 100 });
  const all = [];
  for (let p = 1; p <= Math.ceil(rows.total / 100); p += 1) {
    all.push(...vehicles.list({ ...req.query, page: p, pageSize: 100 }).items);
  }
  const esc = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // กัน CSV/Excel formula injection
    return `"${s.replace(/"/g, '""')}"`;
  };
  const head = ['ทะเบียน', 'จังหวัด', 'ประเภทป้าย', 'ยี่ห้อ', 'รุ่น', 'ตัวถัง', 'สี', 'เจ้าของ', 'เบอร์โทร', 'สังกัด', 'สถานะสมาชิก', 'ที่มาติดต่อ', 'สถานะ', 'บันทึกเมื่อ'];
  const lines = [head.map(esc).join(',')];
  const label = (list, v) => (list.find((x) => x.value === v) || {}).label || v;
  for (const v of all) {
    lines.push([
      v.plate_display, v.province, label(ref.PLATE_TYPES, v.plate_type), v.brand, v.model, label(ref.BODY_TYPES, v.body_type),
      v.color, v.owner_name, v.phone, v.affiliation, label(ref.MEMBER_TYPES, v.member_type), v.visit_target,
      ref.STATUSES[v.status].label, v.created_at,
    ].map(esc).join(','));
  }
  audit(req, 'export_csv', `${all.length} rows`);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="vehicles.csv"');
  res.send(`\uFEFF${lines.join('\r\n')}`);
});

// ---------- บันทึกการเข้า-ออก ----------
router.get('/logs', (req, res) => {
  const where = [];
  const args = [];
  if (req.query.q) { where.push('plate_norm LIKE ?'); args.push(`%${normalizePlate(req.query.q)}%`); }
  if (req.query.direction === 'in' || req.query.direction === 'out') { where.push('direction = ?'); args.push(req.query.direction); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const size = Math.min(Number(req.query.pageSize) || 30, 100);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const total = db.prepare(`SELECT COUNT(*) c FROM access_logs ${w}`).get(...args).c;
  const items = db.prepare(`SELECT * FROM access_logs ${w} ORDER BY event_time DESC, id DESC LIMIT ? OFFSET ?`)
    .all(...args, size, (page - 1) * size);
  res.json({ total, page, pageSize: size, items });
});

router.post('/logs', (req, res) => {
  const b = req.body || {};
  const plate = normalizePlate(b.plate_number);
  const direction = b.direction === 'out' ? 'out' : 'in';
  if (!plate) return res.status(422).json({ error: 'validation', message: 'กรุณากรอกเลขทะเบียน' });
  const time = b.event_time ? new Date(b.event_time) : new Date();
  if (Number.isNaN(time.getTime())) return res.status(422).json({ error: 'validation', message: 'เวลาไม่ถูกต้อง' });
  const image = clean(b.image_url, 500) || null;
  if (image && !/^(https?:\/\/|\/)/i.test(image)) return res.status(422).json({ error: 'validation', message: 'URL รูปภาพไม่ถูกต้อง' });
  const province = clean(b.province, 60) || null;
  const v = province
    ? db.prepare('SELECT * FROM vehicles WHERE plate_norm = ? AND province = ?').get(plate, province)
    : db.prepare('SELECT * FROM vehicles WHERE plate_norm = ? ORDER BY id LIMIT 1').get(plate);
  db.prepare(`INSERT INTO access_logs (vehicle_id, plate_norm, province, direction, event_time, gate_id, image_url, visit_target, member_type, source, matched)
    VALUES (?,?,?,?,?,?,?,?,?, 'manual', ?)`).run(
    v ? v.id : null, plate, province || (v && v.province) || null, direction, time.toISOString(),
    clean(b.gate_id, 60) || null, image, clean(b.visit_target, 200) || (v && v.visit_target) || null,
    v ? v.member_type : null, v ? 1 : 0,
  );
  audit(req, 'add_log', `${plate} ${direction}`);
  res.status(201).json({ ok: true, matched: !!v });
});

// ---------- ประวัติแอดมิน / เปลี่ยนรหัสผ่าน ----------
router.get('/audit', (req, res) => {
  res.json(db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 100').all());
});

router.post('/password', (req, res) => {
  const { current, next } = req.body || {};
  if (typeof next !== 'string' || next.length < 10) {
    return res.status(422).json({ error: 'validation', message: 'รหัสผ่านใหม่ต้องยาวอย่างน้อย 10 ตัวอักษร' });
  }
  const a = db.prepare('SELECT * FROM admins WHERE username = ?').get(req.admin);
  if (!a || !sec.verifyPassword(String(current ?? ''), a.password_hash)) {
    return res.status(401).json({ error: 'invalid', message: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
  }
  db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(sec.hashPassword(next), a.id);
  audit(req, 'change_password');
  return res.json({ ok: true });
});

module.exports = router;
