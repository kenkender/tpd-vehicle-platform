require('dotenv').config();
const path = require('path');

const root = path.resolve(__dirname, '..');
const bool = (v, d = false) => (v === undefined || v === '' ? d : ['1', 'true', 'yes'].includes(String(v).toLowerCase()));
const abs = (p) => (path.isAbsolute(p) ? p : path.resolve(root, p));

const config = {
  root,
  port: Number(process.env.PORT) || 3000,
  isProd: process.env.NODE_ENV === 'production',
  cookieSecure: bool(process.env.COOKIE_SECURE, false),
  trustProxy: bool(process.env.TRUST_PROXY, false),
  sessionSecret: process.env.SESSION_SECRET || 'dev-only-session-secret-change-me',
  encryptionKey: process.env.DATA_ENCRYPTION_KEY || 'dev-only-encryption-key-change-me',
  sessionHours: Number(process.env.SESSION_HOURS) || 8,
  dbPath: abs(process.env.DB_PATH || './data/vehicles.db'),
  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || '',
  },
  excel: {
    enabled: bool(process.env.EXCEL_ENABLED, true),
    path: abs(process.env.EXCEL_PATH || './data/plate_whitelist.xlsx'),
    defaultAllowEnd: process.env.DEFAULT_ALLOW_END || '2030-12-31T23:59:59+07:00',
  },
  google: {
    enabled: bool(process.env.GOOGLE_SHEETS_ENABLED, false),
    sheetId: (process.env.GOOGLE_SHEET_ID || '').startsWith('https://') ? '' : (process.env.GOOGLE_SHEET_ID || ''),
    gid: process.env.GOOGLE_SHEET_GID || '',
    keyFile: abs(process.env.GOOGLE_SERVICE_ACCOUNT_FILE || './data/google-service-account.json'),
    scriptUrl: process.env.GOOGLE_SCRIPT_URL || ((process.env.GOOGLE_SHEET_ID || '').startsWith('https://') ? process.env.GOOGLE_SHEET_ID : ''),
  },
  lprApiKey: process.env.LPR_API_KEY || '',
};

if (config.isProd) {
  const weak = [];
  if (config.sessionSecret.startsWith('dev-only') || config.sessionSecret.startsWith('change-me')) weak.push('SESSION_SECRET');
  if (config.encryptionKey.startsWith('dev-only') || config.encryptionKey.startsWith('change-me')) weak.push('DATA_ENCRYPTION_KEY');
  if (weak.length) {
    console.warn(`[security] ⚠️  โปรดตั้งค่า ${weak.join(', ')} ในไฟล์ .env ก่อนใช้งานจริง`);
  }
}

module.exports = config;
