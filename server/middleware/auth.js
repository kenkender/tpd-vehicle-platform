const db = require('../db/database');
const sec = require('../services/security');
const config = require('../config');

const COOKIE = 'tpd_admin';

function parseCookies(header = '') {
  const out = {};
  header.split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function currentAdmin(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  const payload = sec.verify(token);
  return payload ? payload.u : null;
}

function setSession(res, username) {
  const exp = Date.now() + config.sessionHours * 3600 * 1000;
  const token = sec.sign({ u: username, exp });
  const flags = ['HttpOnly', 'SameSite=Lax', 'Path=/', `Max-Age=${config.sessionHours * 3600}`];
  if (config.cookieSecure) flags.push('Secure');
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; ${flags.join('; ')}`);
}

function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

/** ป้องกันเฉพาะ API ของแอดมิน -> ตอบ 401 */
function requireAdminApi(req, res, next) {
  const u = currentAdmin(req);
  if (!u) return res.status(401).json({ error: 'unauthorized', message: 'กรุณาเข้าสู่ระบบแอดมิน' });
  req.admin = u;
  return next();
}

/** ป้องกันหน้าเว็บแอดมิน -> redirect ไปหน้า login */
function requireAdminPage(req, res, next) {
  const u = currentAdmin(req);
  if (!u) return res.redirect('/admin/login.html');
  req.admin = u;
  return next();
}

function audit(req, action, detail) {
  try {
    db.prepare('INSERT INTO audit_log (admin, action, detail, ip) VALUES (?,?,?,?)')
      .run(req.admin || null, action, detail ? String(detail).slice(0, 500) : null, req.ip);
  } catch { /* ไม่ให้ audit ทำให้งานหลักล้ม */ }
}

module.exports = { requireAdminApi, requireAdminPage, setSession, clearSession, currentAdmin, audit };
