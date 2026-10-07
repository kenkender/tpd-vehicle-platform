/** ซิงก์ข้อมูลทั้งหมดจาก SQL ไป Excel / Google Sheet:  npm run resync */
const sync = require('../services/syncService');

sync.resyncAll().then((r) => {
  console.log(`ซิงก์ ${r.count || 0} ทะเบียน | Excel: ${r.excel} | Sheet: ${r.sheet}`);
  if (r.errors.length) console.error(r.errors.join('\n'));
  process.exit(r.errors.length ? 1 : 0);
});
