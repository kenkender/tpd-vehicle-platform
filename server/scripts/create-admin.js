/**
 * สร้าง/รีเซ็ตรหัสผ่านแอดมิน:  npm run create-admin -- <username> <password>
 */
const db = require('../db/database');
const sec = require('../services/security');

const [username, password] = process.argv.slice(2);
if (!username || !password) {
  console.error('วิธีใช้: npm run create-admin -- <username> <password>');
  process.exit(1);
}
if (password.length < 10) {
  console.error('รหัสผ่านต้องยาวอย่างน้อย 10 ตัวอักษร');
  process.exit(1);
}
const hash = sec.hashPassword(password);
const exists = db.prepare('SELECT id FROM admins WHERE username = ?').get(username);
if (exists) {
  db.prepare('UPDATE admins SET password_hash = ?, failed_count = 0, locked_until = 0 WHERE id = ?').run(hash, exists.id);
  console.log(`รีเซ็ตรหัสผ่านของ "${username}" แล้ว`);
} else {
  db.prepare('INSERT INTO admins (username, password_hash, display_name) VALUES (?,?,?)').run(username, hash, username);
  console.log(`สร้างแอดมิน "${username}" แล้ว`);
}
