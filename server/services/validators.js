const ref = require('../reference');
const { normalizePlate, isValidPlate } = require('./plate');

const clean = (v, max = 200) =>
  String(v ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

/** ตรวจเลขบัตรประชาชนไทย 13 หลักด้วย checksum */
function isValidThaiNationalId(id) {
  if (!/^\d{13}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(id[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(id[12]);
}

function normalizePhone(raw) {
  let p = String(raw ?? '').replace(/[^\d+]/g, '');
  if (p.startsWith('+66')) p = `0${p.slice(3)}`;
  else if (p.startsWith('66') && p.length >= 11) p = `0${p.slice(2)}`;
  return p.replace(/\D/g, '');
}

/**
 * @param {object} body
 * @param {{admin?: boolean}} opts  admin = true อนุญาตให้ตั้งสถานะ/blacklist/หมายเหตุ/ช่วงเวลา
 */
function validateVehicleInput(body, { admin = false } = {}) {
  const errors = {};
  const v = {};

  v.plate_number = clean(body.plate_number, 20);
  v.plate_norm = normalizePlate(body.plate_number);
  if (!v.plate_norm) errors.plate_number = 'กรุณากรอกเลขทะเบียน';
  else if (!isValidPlate(v.plate_norm)) errors.plate_number = 'รูปแบบเลขทะเบียนไม่ถูกต้อง เช่น 1กก 9999';

  v.province = clean(body.province, 60);
  if (!ref.PROVINCES.includes(v.province)) errors.province = 'กรุณาเลือกจังหวัด';

  v.plate_type = clean(body.plate_type, 30);
  if (!ref.PLATE_TYPE_VALUES.includes(v.plate_type)) errors.plate_type = 'กรุณาเลือกประเภทป้ายทะเบียน';

  v.brand = clean(body.brand, 60);
  if (!v.brand) errors.brand = 'กรุณากรอกยี่ห้อรถ';
  v.model = clean(body.model, 60);
  if (!v.model) errors.model = 'กรุณากรอกรุ่นรถ';

  v.body_type = clean(body.body_type, 30);
  if (!ref.BODY_TYPE_VALUES.includes(v.body_type)) errors.body_type = 'กรุณาเลือกประเภทตัวถัง';

  v.color = clean(body.color, 40);
  if (!v.color) errors.color = 'กรุณาเลือกหรือกรอกสีรถ';

  v.member_type = clean(body.member_type, 20);
  const allowedMembers = admin ? ref.MEMBER_TYPE_VALUES : ref.PUBLIC_MEMBER_TYPE_VALUES;
  if (!allowedMembers.includes(v.member_type)) errors.member_type = 'กรุณาเลือกสถานะผู้ครอบครอง';

  v.owner_name = clean(body.owner_name, 120);
  if (v.owner_name.length < 2) errors.owner_name = 'กรุณากรอกชื่อ-นามสกุล';

  const nid = String(body.national_id ?? '').replace(/\D/g, '');
  const needNid = v.member_type === 'official' || v.member_type === 'staff';
  if (nid) {
    if (!isValidThaiNationalId(nid)) errors.national_id = 'เลขบัตรประชาชนไม่ถูกต้อง (13 หลัก)';
  } else if (needNid && !admin) {
    errors.national_id = 'กรุณากรอกเลขบัตรประชาชน';
  }
  v.national_id = nid || null;

  v.phone = normalizePhone(body.phone);
  if (!/^\d{8,15}$/.test(v.phone)) errors.phone = 'กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง';

  v.affiliation = clean(body.affiliation, 200);
  if (!v.affiliation) errors.affiliation = 'กรุณากรอกที่อยู่ / แผนก / สังกัด';

  v.visit_target = clean(body.visit_target, 200) || null;
  if (v.member_type === 'visitor' && !v.visit_target) {
    errors.visit_target = 'กรุณาระบุบ้านเลขที่ / ห้อง / หน่วยงานที่มาติดต่อ';
  }

  if (admin) {
    v.note = clean(body.note, 500) || null;
    if (body.status !== undefined) {
      v.status = clean(body.status, 20);
      if (!Object.keys(ref.STATUSES).includes(v.status)) errors.status = 'สถานะไม่ถูกต้อง';
    }
    v.valid_from = body.valid_from ? clean(body.valid_from, 40) : null;
    v.valid_to = body.valid_to ? clean(body.valid_to, 40) : null;
  }

  return { errors, value: v, ok: Object.keys(errors).length === 0 };
}

module.exports = { validateVehicleInput, isValidThaiNationalId, normalizePhone, clean };
