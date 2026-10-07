const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db/database');
const sec = require('../services/security');
const { setSession, clearSession, currentAdmin, audit } = require('../middleware/auth');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่' },
});

// hash หลอก เพื่อให้เวลาตอบใกล้เคียงกันแม้ไม่พบชื่อผู้ใช้
const DUMMY = sec.hashPassword('dummy-password');
const MAX_FAILS = 5;
const LOCK_MIN = 15;

router.post('/login', loginLimiter, (req, res) => {
  const username = String(req.body?.username ?? '').trim().slice(0, 60);
  const password = String(req.body?.password ?? '').slice(0, 200);
  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);

  if (admin && admin.locked_until > Date.now()) {
    return res.status(423).json({ error: 'locked', message: `บัญชีถูกล็อกชั่วคราว กรุณาลองใหม่ภายใน ${LOCK_MIN} นาที` });
  }
  const ok = sec.verifyPassword(password, admin ? admin.password_hash : DUMMY) && !!admin;
  if (!ok) {
    if (admin) {
      const fails = admin.failed_count + 1;
      const lock = fails >= MAX_FAILS ? Date.now() + LOCK_MIN * 60 * 1000 : 0;
      db.prepare('UPDATE admins SET failed_count = ?, locked_until = ? WHERE id = ?')
        .run(lock ? 0 : fails, lock, admin.id);
    }
    return res.status(401).json({ error: 'invalid', message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  }
  db.prepare('UPDATE admins SET failed_count = 0, locked_until = 0 WHERE id = ?').run(admin.id);
  setSession(res, admin.username);
  req.admin = admin.username;
  audit(req, 'login');
  return res.json({ ok: true, username: admin.username, displayName: admin.display_name });
});

router.post('/logout', (req, res) => {
  req.admin = currentAdmin(req);
  if (req.admin) audit(req, 'logout');
  clearSession(res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  const u = currentAdmin(req);
  if (!u) return res.status(401).json({ error: 'unauthorized' });
  const a = db.prepare('SELECT username, display_name FROM admins WHERE username = ?').get(u);
  return res.json({ username: u, displayName: a?.display_name || u });
});

module.exports = router;
