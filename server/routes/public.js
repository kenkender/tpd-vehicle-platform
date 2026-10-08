/**
 * API สำหรับทุกคน (ไม่ต้องล็อกอิน) — "เขียนอย่างเดียว" ไม่มี endpoint ใดอ่านข้อมูลรถ/เจ้าของได้
 */
const express = require('express');
const rateLimit = require('express-rate-limit');
const ref = require('../reference');
const { validateVehicleInput } = require('../services/validators');
const vehicles = require('../services/vehicleService');

const router = express.Router();

const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'ส่งข้อมูลถี่เกินไป กรุณาลองใหม่ภายหลัง' },
});

router.get('/reference', (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json({
    provinces: ref.PROVINCES,
    plateTypes: ref.PLATE_TYPES,
    bodyTypes: ref.BODY_TYPES,
    colors: ref.COLORS,
    memberTypes: ref.MEMBER_TYPES.filter((m) => m.publicSelectable),
    brands: ref.BRANDS,
    telegramGroupLink: require('../config').telegramGroupLink || process.env.TELEGRAM_GROUP_LINK || '',
  });
});

router.post('/vehicles', submitLimiter, (req, res) => {
  const body = req.body || {};
  // honeypot: บอทมักกรอกช่องที่ซ่อนไว้ -> ตอบสำเร็จหลอก ๆ โดยไม่บันทึก
  if (body.website) return res.status(201).json({ ok: true, reference: 'OK' });

  const { ok, errors, value } = validateVehicleInput(body, { admin: false });
  if (!ok) return res.status(422).json({ error: 'validation', errors });

  try {
    const id = vehicles.create(value, { ip: req.ip, admin: false });
    const createdVehicle = vehicles.getById(id);
    if (createdVehicle) {
      const telegram = require('../services/telegramService');
      telegram.notifyNewRegistration(createdVehicle);
    }
    return res.status(201).json({
      ok: true,
      reference: `TPD-${String(id).padStart(6, '0')}`,
      message: 'บันทึกข้อมูลเรียบร้อย รอผู้ดูแลระบบตรวจสอบและอนุมัติ',
    });
  } catch (e) {
    if (e instanceof vehicles.DuplicateError) {
      return res.status(409).json({
        error: 'duplicate',
        message: 'ทะเบียนรถนี้ (ในจังหวัดนี้) ถูกลงทะเบียนไว้แล้ว หากต้องการแก้ไขข้อมูลกรุณาติดต่อผู้ดูแลระบบ',
      });
    }
    console.error('[submit]', e);
    return res.status(500).json({ error: 'server', message: 'ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง' });
  }
});

module.exports = router;
