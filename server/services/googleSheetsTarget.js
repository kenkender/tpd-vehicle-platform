/**
 * ซิงก์เข้า Google Sheet ผ่าน Sheets API ด้วย Service Account
 * ต้องแชร์ชีตให้อีเมลของ Service Account เป็น "Editor" (ดู docs/GOOGLE_SHEETS_SETUP.md)
 */
const fs = require('fs');
const { GoogleAuth } = require('google-auth-library');
const config = require('../config');

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
let authClient = null;
let cachedTitle = null;
let cachedSheetId = null;

async function client() {
  if (!authClient) {
    if (!fs.existsSync(config.google.keyFile)) {
      throw new Error(`ไม่พบไฟล์ Service Account: ${config.google.keyFile}`);
    }
    const auth = new GoogleAuth({
      keyFile: config.google.keyFile,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    authClient = await auth.getClient();
  }
  return authClient;
}

async function call(url, method = 'GET', data) {
  const c = await client();
  try {
    const res = await c.request({ url, method, data });
    return res.data;
  } catch (e) {
    const msg = e?.response?.data?.error?.message || e.message;
    if (/not supported for this document/i.test(msg)) {
      throw new Error('ไฟล์นี้เป็น .xlsx ใน Drive ไม่ใช่ Google Sheet — ให้เปิดไฟล์แล้วเลือก ไฟล์ > บันทึกเป็น Google ชีต แล้วใช้ ID ใหม่');
    }
    throw new Error(`Google Sheets: ${msg}`);
  }
}

async function resolveSheet() {
  if (cachedTitle) return { title: cachedTitle, sheetId: cachedSheetId };
  const meta = await call(`${BASE}/${config.google.sheetId}?fields=sheets.properties`);
  const sheets = meta.sheets || [];
  const found = config.google.gid
    ? sheets.find((s) => String(s.properties.sheetId) === String(config.google.gid))
    : sheets[0];
  if (!found) throw new Error(`ไม่พบแท็บ gid=${config.google.gid} ในชีต`);
  cachedTitle = found.properties.title;
  cachedSheetId = found.properties.sheetId;
  return { title: cachedTitle, sheetId: cachedSheetId };
}

const q = (title) => `'${title.replace(/'/g, "''")}'`;

async function applyViaWebhook(ops) {
  const url = config.google.scriptUrl;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'sync', ops }),
    redirect: 'follow',
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Apps Script HTTP ${res.status}: ${txt}`);
  }
  const json = await res.json().catch(() => ({}));
  if (json.ok === false) {
    throw new Error(`Apps Script: ${json.error || 'ซิงก์ไม่สำเร็จ'}`);
  }
}

async function apply(ops) {
  if (config.google.scriptUrl) {
    return applyViaWebhook(ops);
  }
  const { title, sheetId } = await resolveSheet();
  const id = config.google.sheetId;

  // อ่านคอลัมน์ A ทั้งหมดเพื่อหาแถวของแต่ละทะเบียน
  const colA = await call(`${BASE}/${id}/values/${encodeURIComponent(`${q(title)}!A:A`)}?majorDimension=COLUMNS`);
  const col = (colA.values && colA.values[0]) || [];
  const index = new Map();
  col.forEach((v, i) => { if (i > 0 && v) index.set(String(v).trim().toUpperCase(), i + 1); });
  const nextRowStart = Math.max(col.length, 1) + 1;

  const updates = [];
  const appends = [];
  const deletes = [];
  for (const op of ops) {
    const key = op.plate.toUpperCase();
    const at = index.get(key);
    const vals = op.row ? [op.row.plate, op.row.belongTo, op.row.cardNo || '', op.row.start || '', op.row.end || ''] : null;
    if (vals && at) updates.push({ range: `${q(title)}!A${at}:E${at}`, values: [vals] });
    else if (vals) appends.push(vals);
    else if (at) deletes.push(at);
  }

  // ใช้ RAW + ตั้งรูปแบบข้อความที่ฝั่งชีต (ป้องกัน Google แปลงข้อมูลเป็นวันที่/ตัวเลข)
  if (updates.length) {
    await call(`${BASE}/${id}/values:batchUpdate`, 'POST', { valueInputOption: 'RAW', data: updates });
  }
  if (appends.length) {
    const end = nextRowStart + appends.length - 1;
    await call(
      `${BASE}/${id}/values/${encodeURIComponent(`${q(title)}!A${nextRowStart}:E${end}`)}?valueInputOption=RAW`,
      'PUT',
      { range: `${q(title)}!A${nextRowStart}:E${end}`, majorDimension: 'ROWS', values: appends },
    );
  }
  if (deletes.length) {
    const requests = [...new Set(deletes)].sort((a, b) => b - a).map((row) => ({
      deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: row - 1, endIndex: row } },
    }));
    await call(`${BASE}/${id}:batchUpdate`, 'POST', { requests });
  }
}

async function readRows() {
  if (config.google.scriptUrl) {
    try {
      const res = await fetch(config.google.scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_rows' }),
        redirect: 'follow',
      });
      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        if (json.ok !== false && Array.isArray(json.rows)) {
          return json.rows;
        }
      }
    } catch (e) {
      console.warn('[google-sheets] scriptUrl get_rows failed:', e.message);
    }
  }

  if (!config.google.sheetId) return [];
  const { title } = await resolveSheet();
  const id = config.google.sheetId;
  const res = await call(`${BASE}/${id}/values/${encodeURIComponent(`${q(title)}!A:E`)}`);
  const values = res.values || [];
  if (values.length <= 1) return [];

  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (!r || !r[0]) continue;
    rows.push({
      plate: String(r[0]).trim(),
      belongTo: String(r[1] || 'Allowlist').trim(),
      cardNo: String(r[2] || '').trim(),
      start: String(r[3] || '').trim(),
      end: String(r[4] || '').trim(),
    });
  }
  return rows;
}

module.exports = { apply, readRows };
