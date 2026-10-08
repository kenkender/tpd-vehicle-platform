const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const config = require('./config');
const db = require('./db/database');
const sec = require('./services/security');
const { requireAdminPage } = require('./middleware/auth');

const app = express();
if (config.trustProxy) app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'style-src': ["'self'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com'],
      'img-src': ["'self'", 'data:', 'https:'],
      'connect-src': ["'self'"],
      'frame-ancestors': ["'none'"],
      'form-action': ["'self'"],
      'upgrade-insecure-requests': config.cookieSecure ? [] : null,
    },
  },
}));
app.use(compression());
app.use(express.json({ limit: '50kb' }));

// ---------- API ----------
app.use('/api', require('./routes/public'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/lpr', require('./routes/lpr'));
app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));

// ---------- หน้าเว็บ ----------
const publicDir = path.join(config.root, 'public');
const adminDir = path.join(config.root, 'admin');

// handle favicon.ico (ส่ง favicon.svg แทน)
app.get('/favicon.ico', (req, res) => res.sendFile('favicon.svg', { root: publicDir }));

// หน้า login ของแอดมินเปิดได้ แต่ที่เหลือของ /admin ต้องล็อกอินก่อน (backend เห็นได้เฉพาะแอดมิน)
app.get(['/admin', '/admin/'], requireAdminPage, (req, res) => res.sendFile('index.html', { root: adminDir }));
app.get('/admin/login.html', (req, res) => res.sendFile('login.html', { root: adminDir }));
app.use('/admin/assets', express.static(adminDir + '/assets', { maxAge: '1h' }));
app.use('/admin', requireAdminPage, express.static(adminDir, { index: false }));

app.use(express.static(publicDir, { maxAge: '1h' }));
app.use((req, res) => res.status(404).sendFile('404.html', { root: publicDir }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_json' });
  console.error('[error]', err);
  return res.status(500).json({ error: 'server', message: 'ระบบขัดข้อง' });
});

// ---------- สร้างแอดมินเริ่มต้นถ้ายังไม่มี ----------
function ensureAdmin() {
  const n = db.prepare('SELECT COUNT(*) c FROM admins').get().c;
  if (n > 0) return;
  if (!config.admin.password) {
    console.warn('[admin] ยังไม่มีแอดมิน: ตั้ง ADMIN_USERNAME / ADMIN_PASSWORD ใน .env หรือรัน `npm run create-admin`');
    return;
  }
  db.prepare('INSERT INTO admins (username, password_hash, display_name) VALUES (?,?,?)')
    .run(config.admin.username, sec.hashPassword(config.admin.password), 'ผู้ดูแลระบบ');
  console.log(`[admin] สร้างแอดมินเริ่มต้น "${config.admin.username}" แล้ว — กรุณาเปลี่ยนรหัสผ่านหลังเข้าสู่ระบบ`);
}
ensureAdmin();

// ---------- ซิงก์ดึงข้อมูลจาก Excel และ Google Sheet เมื่อเซิร์ฟเวอร์เริ่มต้น ----------
if (config.excel.enabled) {
  const sync = require('./services/syncService');
  sync.pullFromExcel()
    .then((r) => {
      if (r.count > 0) {
        console.log(`[excel] 📥 ดึงข้อมูลรถ ${r.count} คัน (จากแท็บ Full Registrations ใน Excel) เข้าฐานข้อมูลสำเร็จ`);
      }
    })
    .catch((e) => console.error('[excel auto-pull error]', e.message));
}

if (config.google.enabled) {
  const sync = require('./services/syncService');
  sync.pullFromSheets()
    .then((r) => {
      if (r.count > 0) {
        console.log(`[google-sheet] 📥 ดึงข้อมูลรถ ${r.count} คัน (จากทั้งหมด ${r.totalSheets} แถวใน Google Sheet) เข้าฐานข้อมูลสำเร็จ`);
      }
    })
    .catch((e) => console.error('[google-sheet auto-pull error]', e.message));
}

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`\n  ระบบทะเบียนยานพาหนะ ตท.`);
    console.log(`  ฟอร์มสาธารณะ : http://localhost:${config.port}/`);
    console.log(`  แอดมิน       : http://localhost:${config.port}/admin`);
    console.log(`  Excel        : ${config.excel.enabled ? config.excel.path : 'ปิด'}`);
    console.log(`  Google Sheet : ${config.google.enabled ? 'เปิด' : 'ปิด'}\n`);
  });
}

module.exports = app;
