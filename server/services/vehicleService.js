const db = require('../db/database');
const ref = require('../reference');
const sec = require('./security');
const { splitPlate, formatPlate } = require('./plate');
const { toHik } = require('./syncService');

class DuplicateError extends Error {}

/** แปลง 'YYYY-MM-DD' (หรือ ISO) เป็นรูปแบบเวลา Hikvision (+07:00) */
function parseDate(input, endOfDay = false) {
  if (!input) return null;
  const s = String(input).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${endOfDay ? '23:59:59' : '00:00:00'}+07:00`;
}

function upsertOwner(v, updateExisting = true) {
  const idx = v.national_id ? sec.blindIndex(v.national_id) : null;
  const owner = idx ? db.prepare('SELECT * FROM owners WHERE national_id_idx = ?').get(idx) : null;
  if (owner) {
    // ฟอร์มสาธารณะห้ามเขียนทับข้อมูลเจ้าของเดิม (กันผู้อื่นแก้ข้อมูลติดต่อด้วยเลขบัตรที่รู้)
    if (updateExisting) {
      db.prepare(`UPDATE owners SET full_name = ?, phone = ?, affiliation = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(v.owner_name, v.phone, v.affiliation, owner.id);
    }
    return owner.id;
  }
  const info = db.prepare(`INSERT INTO owners (full_name, national_id_enc, national_id_idx, national_id_last4, phone, affiliation)
    VALUES (?, ?, ?, ?, ?, ?)`).run(
    v.owner_name,
    v.national_id ? sec.encrypt(v.national_id) : null,
    idx,
    v.national_id ? v.national_id.slice(-4) : null,
    v.phone,
    v.affiliation,
  );
  return Number(info.lastInsertRowid);
}

function resolveStatus(v, fallback) {
  if (v.member_type === 'blacklist') return 'blocked';
  return v.status || fallback;
}

function create(v, { ip = null, admin = false } = {}) {
  const { prefix, digits } = splitPlate(v.plate_norm);
  const status = resolveStatus(v, 'pending');
  const run = db.transaction(() => {
    const exists = db.prepare('SELECT id FROM vehicles WHERE plate_norm = ? AND province = ?').get(v.plate_norm, v.province);
    if (exists) throw new DuplicateError('duplicate');
    const ownerId = upsertOwner(v, admin);
    const validFrom = status === 'allowed' ? (parseDate(v.valid_from) || toHik()) : null;
    const validTo = status === 'allowed' ? parseDate(v.valid_to, true) : null;
    const info = db.prepare(`INSERT INTO vehicles
      (plate_number, plate_norm, province, plate_prefix, plate_digits, plate_type, brand, model, body_type, color,
       owner_id, member_type, visit_target, status, valid_from, valid_to, note, submitted_ip)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      v.plate_number, v.plate_norm, v.province, prefix, digits, v.plate_type, v.brand, v.model, v.body_type, v.color,
      ownerId, v.member_type, v.visit_target, status, validFrom, validTo, admin ? v.note : null, ip,
    );
    return Number(info.lastInsertRowid);
  });
  return run();
}

function update(id, v) {
  const cur = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id);
  if (!cur) return null;
  const { prefix, digits } = splitPlate(v.plate_norm);
  const status = resolveStatus(v, cur.status);
  const run = db.transaction(() => {
    const clash = db.prepare('SELECT id FROM vehicles WHERE plate_norm = ? AND province = ? AND id <> ?')
      .get(v.plate_norm, v.province, id);
    if (clash) throw new DuplicateError('duplicate');
    let finalOwner = cur.owner_id;
    if (v.national_id) {
      finalOwner = upsertOwner(v);
    } else {
      // ไม่ได้กรอกเลขบัตรใหม่ -> คงเจ้าของเดิม (และเลขบัตรเดิม) แล้วอัปเดตข้อมูลติดต่อ
      db.prepare(`UPDATE owners SET full_name=?, phone=?, affiliation=?, updated_at=datetime('now') WHERE id=?`)
        .run(v.owner_name, v.phone, v.affiliation, cur.owner_id);
    }
    let validFrom = cur.valid_from;
    let validTo = cur.valid_to;
    if ('valid_from' in v) validFrom = parseDate(v.valid_from) || (status === 'allowed' ? cur.valid_from || toHik() : null);
    if ('valid_to' in v) validTo = parseDate(v.valid_to, true);
    if (status !== 'allowed') { validFrom = null; validTo = null; }
    db.prepare(`UPDATE vehicles SET plate_number=?, plate_norm=?, province=?, plate_prefix=?, plate_digits=?, plate_type=?,
      brand=?, model=?, body_type=?, color=?, owner_id=?, member_type=?, visit_target=?, status=?, valid_from=?, valid_to=?,
      note=?, updated_at=datetime('now') WHERE id=?`).run(
      v.plate_number, v.plate_norm, v.province, prefix, digits, v.plate_type, v.brand, v.model, v.body_type, v.color,
      finalOwner, v.member_type, v.visit_target, status, validFrom, validTo, v.note ?? cur.note, id,
    );
    return { oldPlate: cur.plate_norm, newPlate: v.plate_norm };
  });
  return run();
}

function setStatus(id, status, { valid_from, valid_to, note } = {}) {
  const cur = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id);
  if (!cur) return null;
  let from = null;
  let to = null;
  if (status === 'allowed') {
    from = parseDate(valid_from) || cur.valid_from || toHik();
    to = parseDate(valid_to, true) || null;
  }
  db.prepare(`UPDATE vehicles SET status=?, valid_from=?, valid_to=?, note=COALESCE(?, note),
    member_type = CASE WHEN ? = 'allowed' AND member_type = 'blacklist' THEN 'visitor' ELSE member_type END,
    updated_at=datetime('now') WHERE id=?`).run(status, from, to, note ?? null, status, id);
  return cur.plate_norm;
}

function remove(id) {
  const cur = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id);
  if (!cur) return null;
  db.transaction(() => {
    db.prepare('DELETE FROM vehicles WHERE id = ?').run(id);
    const left = db.prepare('SELECT COUNT(*) c FROM vehicles WHERE owner_id = ?').get(cur.owner_id).c;
    if (!left) db.prepare('DELETE FROM owners WHERE id = ?').run(cur.owner_id);
  })();
  return cur.plate_norm;
}

const SELECT_JOIN = `SELECT v.*, o.full_name AS owner_name, o.phone AS owner_phone, o.affiliation AS owner_affiliation,
  o.national_id_last4 AS nid_last4, (o.national_id_enc IS NOT NULL) AS has_nid
  FROM vehicles v JOIN owners o ON o.id = v.owner_id`;

function serialize(r, { reveal = false } = {}) {
  const out = {
    id: r.id,
    plate_number: r.plate_number,
    plate_norm: r.plate_norm,
    plate_display: formatPlate(r.plate_norm),
    plate_prefix: r.plate_prefix,
    plate_digits: r.plate_digits,
    province: r.province,
    plate_type: r.plate_type,
    brand: r.brand,
    model: r.model,
    body_type: r.body_type,
    color: r.color,
    member_type: r.member_type,
    visit_target: r.visit_target,
    status: r.status,
    valid_from: r.valid_from,
    valid_to: r.valid_to,
    note: r.note,
    telegram_chat_id: r.telegram_chat_id,
    owner_name: r.owner_name,
    phone: r.owner_phone,
    affiliation: r.owner_affiliation,
    national_id_masked: r.has_nid ? `•••••••••${r.nid_last4}` : null,
    excel_status: r.excel_status,
    sheet_status: r.sheet_status,
    sync_message: r.sync_message,
    synced_at: r.synced_at,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
  if (reveal && r.owner_id) {
    const o = db.prepare('SELECT national_id_enc FROM owners WHERE id = ?').get(r.owner_id);
    out.national_id = sec.decrypt(o && o.national_id_enc);
  }
  return out;
}

function getById(id, opts) {
  const r = db.prepare(`${SELECT_JOIN} WHERE v.id = ?`).get(id);
  return r ? serialize(r, opts) : null;
}

function list({ q, status, member_type, plate_type, page = 1, pageSize = 20, sort = 'created_desc' } = {}) {
  const where = [];
  const args = [];
  if (q) {
    const like = `%${String(q).replace(/[%_]/g, '')}%`;
    const norm = like.replace(/[\s-]/g, '');
    where.push('(v.plate_norm LIKE ? OR v.plate_number LIKE ? OR o.full_name LIKE ? OR v.brand LIKE ? OR v.model LIKE ? OR v.province LIKE ? OR o.phone LIKE ? OR o.affiliation LIKE ?)');
    args.push(norm, like, like, like, like, like, like, like);
  }
  if (status && ref.STATUSES[status]) { where.push('v.status = ?'); args.push(status); }
  if (member_type && ref.MEMBER_TYPE_VALUES.includes(member_type)) { where.push('v.member_type = ?'); args.push(member_type); }
  if (plate_type && ref.PLATE_TYPE_VALUES.includes(plate_type)) { where.push('v.plate_type = ?'); args.push(plate_type); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const order = {
    created_desc: 'v.created_at DESC, v.id DESC',
    created_asc: 'v.created_at ASC, v.id ASC',
    plate_asc: 'v.plate_norm ASC',
  }[sort] || 'v.created_at DESC, v.id DESC';
  const total = db.prepare(`SELECT COUNT(*) c FROM vehicles v JOIN owners o ON o.id = v.owner_id ${w}`).get(...args).c;
  const size = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
  const pg = Math.max(Number(page) || 1, 1);
  const rows = db.prepare(`${SELECT_JOIN} ${w} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...args, size, (pg - 1) * size);
  return { total, page: pg, pageSize: size, items: rows.map((r) => serialize(r)) };
}

function stats() {
  const one = (sql, ...a) => db.prepare(sql).get(...a).c;
  return {
    total: one('SELECT COUNT(*) c FROM vehicles'),
    pending: one("SELECT COUNT(*) c FROM vehicles WHERE status='pending'"),
    allowed: one("SELECT COUNT(*) c FROM vehicles WHERE status='allowed'"),
    blocked: one("SELECT COUNT(*) c FROM vehicles WHERE status='blocked'"),
    syncErrors: one("SELECT COUNT(*) c FROM vehicles WHERE excel_status='error' OR sheet_status='error'"),
    today: one("SELECT COUNT(*) c FROM vehicles WHERE date(created_at,'+7 hours') = date('now','+7 hours')"),
    byMember: db.prepare('SELECT member_type k, COUNT(*) c FROM vehicles GROUP BY member_type').all(),
    byPlateType: db.prepare('SELECT plate_type k, COUNT(*) c FROM vehicles GROUP BY plate_type').all(),
  };
}

module.exports = { create, update, setStatus, remove, getById, list, stats, serialize, DuplicateError, parseDate };
