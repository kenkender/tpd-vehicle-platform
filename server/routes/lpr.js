/**
 * จุดเชื่อมต่อสำหรับกล้อง / แพลตฟอร์ม Hikvision LPR ในอนาคต
 *
 * ทุก request ต้องส่ง header:  x-api-key: <LPR_API_KEY ใน .env>
 *
 *  POST /api/lpr/events   บันทึกอีเวนต์เข้า-ออกจากกล้อง/ตัว middleware ที่แปลงข้อมูลจาก Hikvision มาแล้ว
 *     { "plate": "1กก9999", "province": "กรุงเทพมหานคร", "direction": "in",
 *       "time": "2026-10-07T14:30:00+07:00", "gate": "GATE-1", "image_url": "https://..." }
 *
 *  GET  /api/lpr/check?plate=1กก9999   ตอบ { result: "allow" | "block" | "unknown" } ใช้ตัดสินใจเปิด/ไม่เปิดไม้กั้น
 */
const express = require('express');
const db = require('../db/database');
const config = require('../config');
const sec = require('../services/security');
const { normalizePlate } = require('../services/plate');
const { clean } = require('../services/validators');

const router = express.Router();

router.use((req, res, next) => {
  if (!config.lprApiKey) return res.status(503).json({ error: 'disabled', message: 'ยังไม่ได้ตั้งค่า LPR_API_KEY' });
  const key = req.get('x-api-key') || '';
  if (!sec.safeEqual(key, config.lprApiKey)) return res.status(401).json({ error: 'unauthorized' });
  return next();
});

function lookup(plate, province) {
  const rows = db.prepare('SELECT * FROM vehicles WHERE plate_norm = ?').all(plate);
  const exact = province ? rows.find((r) => r.province === province) : null;
  const pool = exact ? [exact] : rows;
  if (!pool.length) return { result: 'unknown', vehicle: null };
  if (pool.some((r) => r.status === 'blocked' || r.member_type === 'blacklist')) return { result: 'block', vehicle: pool[0] };
  if (pool.some((r) => r.status === 'allowed')) return { result: 'allow', vehicle: pool.find((r) => r.status === 'allowed') };
  return { result: 'unknown', vehicle: pool[0] };
}

router.get('/check', (req, res) => {
  const plate = normalizePlate(req.query.plate);
  if (!plate) return res.status(422).json({ error: 'validation' });
  const { result, vehicle } = lookup(plate, clean(req.query.province, 60) || null);
  res.json({ plate, result, member_type: vehicle ? vehicle.member_type : null });
});

router.post('/events', (req, res) => {
  const b = req.body || {};
  const plate = normalizePlate(b.plate);
  if (!plate) return res.status(422).json({ error: 'validation', message: 'plate required' });
  const time = b.time ? new Date(b.time) : new Date();
  if (Number.isNaN(time.getTime())) return res.status(422).json({ error: 'validation', message: 'invalid time' });
  const province = clean(b.province, 60) || null;
  const { result, vehicle } = lookup(plate, province);
  db.prepare(`INSERT INTO access_logs (vehicle_id, plate_norm, province, direction, event_time, gate_id, image_url, visit_target, member_type, source, matched)
    VALUES (?,?,?,?,?,?,?,?,?, 'hikvision', ?)`).run(
    vehicle ? vehicle.id : null, plate, province || (vehicle && vehicle.province) || null,
    b.direction === 'out' ? 'out' : 'in', time.toISOString(), clean(b.gate, 60) || null,
    clean(b.image_url, 500) || null, vehicle ? vehicle.visit_target : null, vehicle ? vehicle.member_type : null,
    vehicle ? 1 : 0,
  );
  res.status(201).json({ ok: true, result });
});

module.exports = router;
