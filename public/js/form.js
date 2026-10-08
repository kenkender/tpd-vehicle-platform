(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const form = $('#vehicleForm');
  const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';

  const COLOR_DOT = {
    'ขาว': '#f5f5f5', 'ดำ': '#111', 'เทา': '#8a8f98', 'เงิน': '#c8ccd2', 'แดง': '#d6232f',
    'น้ำเงิน': '#1f4fd8', 'ฟ้า': '#4aa8ff', 'เขียว': '#1f9d55', 'เหลือง': '#ffd21f', 'ส้ม': '#ff7a1a',
    'น้ำตาล': '#7a4b2a', 'บรอนซ์ทอง': '#b08d57', 'ทอง': '#d4af37', 'ชมพู': '#ff7eb6', 'ม่วง': '#7b4bd6', 'ครีม': '#f1e4c3',
    'หลายสี': 'conic-gradient(#ff5d73, #ffd21f, #2fd9aa, #5b8cff, #ff5d73)',
  };
  const MEMBER_ICON = { official: '🛡️', staff: '🪪', visitor: '🤝' };
  const SWATCH_TEXT = { white_black: 'กก', white_green: 'กก', white_blue: 'กก', yellow: 'กก', motorcycle: 'กก', special: 'กก' };

  let REF = null;

  /* ---------- helpers ---------- */
  function normalizePlate(v) {
    return String(v || '')
      .normalize('NFC')
      .replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d)))
      .replace(/[\s\-_.\u200b\u00a0]/g, '')
      .toUpperCase();
  }
  function formatPlate(norm) {
    const m = /^([0-9]{0,2}[\u0e01-\u0e2eA-Z]{1,3})([0-9]{1,4})$/.exec(norm);
    return m ? `${m[1]} ${m[2]}` : norm;
  }
  function validNationalId(id) {
    if (!/^\d{13}$/.test(id)) return false;
    let s = 0;
    for (let i = 0; i < 12; i += 1) s += Number(id[i]) * (13 - i);
    return (11 - (s % 11)) % 10 === Number(id[12]);
  }
  function toast(msg, type = '') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), 4500);
  }
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.textContent = html;
    return e;
  }
  function checked(name) {
    const i = form.querySelector(`input[name="${name}"]:checked`);
    return i ? i.value : '';
  }

  /* ---------- สร้างตัวเลือกจากข้อมูลอ้างอิง ---------- */
  function build() {
    const prov = $('#province');
    REF.provinces.forEach((p) => prov.appendChild(new Option(p, p)));

    const pt = $('#plateTypeGroup');
    REF.plateTypes.forEach((t) => {
      const lab = el('label', 'choice');
      const inp = el('input');
      inp.type = 'radio'; inp.name = 'plate_type'; inp.value = t.value;
      const body = el('span', 'choice-body');
      const sw = el('span', `swatch t-${t.value}`, SWATCH_TEXT[t.value]);
      const tx = el('span', 'choice-text');
      tx.append(el('b', '', t.label), el('small', '', t.hint));
      body.append(sw, tx);
      lab.append(inp, body);
      pt.appendChild(lab);
    });

    const bt = $('#bodyTypeGroup');
    REF.bodyTypes.forEach((b) => {
      const lab = el('label', 'chip');
      const inp = el('input');
      inp.type = 'radio'; inp.name = 'body_type'; inp.value = b.value;
      lab.append(inp, el('span', '', b.label));
      bt.appendChild(lab);
    });

    const cg = $('#colorGroup');
    [...REF.colors, 'อื่น ๆ'].forEach((c) => {
      const lab = el('label', 'chip');
      const inp = el('input');
      inp.type = 'radio'; inp.name = 'color'; inp.value = c;
      const span = el('span');
      const dot = el('i', 'cdot');
      if (COLOR_DOT[c]) dot.style.setProperty('background', COLOR_DOT[c]);
      span.append(dot, document.createTextNode(c));
      lab.append(inp, span);
      cg.appendChild(lab);
    });

    const mg = $('#memberGroup');
    REF.memberTypes.forEach((m) => {
      const lab = el('label', 'choice');
      const inp = el('input');
      inp.type = 'radio'; inp.name = 'member_type'; inp.value = m.value;
      const body = el('span', 'choice-body');
      body.append(el('span', 'm-ico', MEMBER_ICON[m.value] || '👤'));
      const tx = el('span', 'choice-text');
      tx.append(el('b', '', m.label));
      body.appendChild(tx);
      lab.append(inp, body);
      mg.appendChild(lab);
    });

    const bl = $('#brandList');
    Object.keys(REF.brands).forEach((b) => bl.appendChild(new Option(b)));
  }

  /* ---------- พรีวิวป้ายทะเบียน ---------- */
  function updatePreview() {
    const norm = normalizePlate($('#plate_number').value);
    const prov = $('#province').value;
    const type = checked('plate_type') || 'white_black';
    const plate = $('#platePreview');
    plate.className = `plate t-${type}`;
    $('#platePreviewNum').textContent = norm ? formatPlate(norm) : '1กก 9999';
    $('#platePreviewProv').textContent = prov || 'จังหวัด';
    $('#normValue').textContent = norm || '1กก9999';
    plate.setAttribute('aria-label', `ป้ายทะเบียน ${norm ? formatPlate(norm) : ''} ${prov}`);
    plate.classList.add('bump');
    setTimeout(() => plate.classList.remove('bump'), 120);
  }

  function updateModels() {
    const brand = $('#brand').value.trim().toLowerCase();
    const key = Object.keys(REF.brands).find((b) => b.toLowerCase() === brand);
    const ml = $('#modelList');
    ml.textContent = '';
    if (key) REF.brands[key].forEach((m) => ml.appendChild(new Option(m)));
  }

  function updateMemberUI() {
    const m = checked('member_type');
    const visitor = m === 'visitor';
    $('#visitTargetField').classList.toggle('hidden', !visitor);
    $('#nidReq').classList.toggle('hidden', visitor);
    $('#nidOpt').classList.toggle('hidden', !visitor);
  }

  /* ---------- validation ---------- */
  function setError(name, msg) {
    const f = form.querySelector(`[data-field="${name}"]`);
    if (!f) return;
    f.classList.toggle('has-error', !!msg);
    const t = f.querySelector('.error-text');
    if (t) t.textContent = msg || '';
  }
  function clearErrors() {
    form.querySelectorAll('.has-error').forEach((f) => f.classList.remove('has-error'));
    $('#formAlert').classList.add('hidden');
  }

  function collect() {
    let color = checked('color');
    if (color === 'อื่น ๆ') color = $('#colorOther').value.trim();
    return {
      plate_number: $('#plate_number').value.trim(),
      province: $('#province').value,
      plate_type: checked('plate_type'),
      brand: $('#brand').value.trim(),
      model: $('#model').value.trim(),
      body_type: checked('body_type'),
      color,
      member_type: checked('member_type'),
      owner_name: $('#owner_name').value.trim(),
      national_id: $('#national_id').value.replace(/\D/g, ''),
      phone: $('#phone').value.trim(),
      affiliation: $('#affiliation').value.trim(),
      visit_target: $('#visit_target').value.trim(),
      website: $('#website').value,
    };
  }

  function validate(d) {
    const e = {};
    const norm = normalizePlate(d.plate_number);
    if (!norm) e.plate_number = 'กรุณากรอกเลขทะเบียน';
    else if (!/^[\u0e01-\u0e2eA-Z0-9]{3,12}$/.test(norm) || !/[0-9]/.test(norm) || !/[\u0e01-\u0e2eA-Z]/.test(norm)) e.plate_number = 'รูปแบบเลขทะเบียนไม่ถูกต้อง เช่น 1กก 9999';
    if (!d.province) e.province = 'กรุณาเลือกจังหวัด';
    if (!d.plate_type) e.plate_type = 'กรุณาเลือกประเภทป้ายทะเบียน';
    if (!d.brand) e.brand = 'กรุณากรอกยี่ห้อรถ';
    if (!d.model) e.model = 'กรุณากรอกรุ่นรถ';
    if (!d.body_type) e.body_type = 'กรุณาเลือกประเภทตัวถัง';
    if (!d.color) e.color = 'กรุณาเลือกหรือระบุสีรถ';
    if (!d.member_type) e.member_type = 'กรุณาเลือกสถานะของท่าน';
    if (d.owner_name.length < 2) e.owner_name = 'กรุณากรอกชื่อ-นามสกุล';
    const needNid = d.member_type === 'official' || d.member_type === 'staff' || !d.member_type;
    if (d.national_id) {
      if (!validNationalId(d.national_id)) e.national_id = 'เลขบัตรประชาชนไม่ถูกต้อง (13 หลัก)';
    } else if (needNid) e.national_id = 'กรุณากรอกเลขบัตรประชาชน';
    const ph = d.phone.replace(/\D/g, '');
    if (!/^\d{8,15}$/.test(ph)) e.phone = 'กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง';
    if (!d.affiliation) e.affiliation = 'กรุณากรอกที่อยู่ / แผนก / สังกัด';
    if (d.member_type === 'visitor' && !d.visit_target) e.visit_target = 'กรุณาระบุสถานที่/หน่วยงานที่มาติดต่อ';
    return e;
  }

  const ORDER = ['plate_number', 'province', 'plate_type', 'brand', 'model', 'body_type', 'color', 'member_type', 'owner_name', 'phone', 'national_id', 'affiliation', 'visit_target'];
  function showErrors(errs) {
    clearErrors();
    Object.entries(errs).forEach(([k, v]) => setError(k, v));
    const first = ORDER.find((k) => errs[k]);
    if (first) {
      const f = form.querySelector(`[data-field="${first}"]`);
      f.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const focusable = f.querySelector('input:not([type=radio]), select');
      if (focusable) setTimeout(() => focusable.focus({ preventScroll: true }), 350);
    }
  }

  function showAlert(msg) {
    const a = $('#formAlert');
    a.textContent = msg;
    a.className = 'alert err';
    a.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* ---------- submit ---------- */
  async function submit(ev) {
    ev.preventDefault();
    clearErrors();
    const data = collect();
    const errs = validate(data);
    if (Object.keys(errs).length) { showErrors(errs); toast('กรุณาตรวจสอบข้อมูลที่ไฮไลต์สีแดง', 'err'); return; }

    const btn = $('#submitBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span><span>กำลังบันทึก…</span>';
    try {
      const res = await fetch('/api/vehicles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 201) { showSuccess(json.reference, data); return; }
      if (res.status === 422 && json.errors) { showErrors(json.errors); toast('ข้อมูลบางส่วนไม่ถูกต้อง', 'err'); }
      else showAlert(json.message || 'ไม่สามารถบันทึกได้ กรุณาลองใหม่อีกครั้ง');
    } catch {
      showAlert('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span class="btn-label">บันทึกข้อมูล</span>';
    }
  }

  function showSuccess(ref, d) {
    $('#refNo').textContent = ref || 'OK';
    $('#modalRefNo').textContent = ref || 'OK';
    $('#successModal').classList.remove('hidden');
    setTimeout(() => $('#modalOkBtn').focus(), 100);
    const p = $('#successPlate');
    p.className = `plate t-${d.plate_type}`;
    p.querySelector('.plate-num').textContent = formatPlate(normalizePlate(d.plate_number));
    p.querySelector('.plate-prov').textContent = d.province;
    form.classList.add('hidden');
    document.querySelector('.hero').classList.add('hidden');
    const s = $('#success');
    s.classList.remove('hidden');
    s.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function reset() {
    form.reset();
    $('#colorOther').classList.add('hidden');
    clearErrors();
    updatePreview(); updateModels(); updateMemberUI();
    $('#success').classList.add('hidden');
    form.classList.remove('hidden');
    document.querySelector('.hero').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- events ---------- */
  function bind() {
    form.addEventListener('submit', submit);
    $('#againBtn').addEventListener('click', reset);
    $('#modalOkBtn').addEventListener('click', () => $('#successModal').classList.add('hidden'));

    $('#plate_number').addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase();
      updatePreview();
    });
    $('#province').addEventListener('change', updatePreview);
    $('#brand').addEventListener('input', updateModels);
    $('#brand').addEventListener('change', updateModels);

    form.addEventListener('change', (e) => {
      if (e.target.name === 'plate_type') updatePreview();
      if (e.target.name === 'member_type') updateMemberUI();
      if (e.target.name === 'color') {
        const other = e.target.value === 'อื่น ๆ';
        $('#colorOther').classList.toggle('hidden', !other);
        if (other) $('#colorOther').focus();
      }
    });

    // เคลียร์ error ของช่องที่กำลังแก้
    form.addEventListener('input', (e) => {
      const f = e.target.closest('[data-field]');
      if (f) f.classList.remove('has-error');
    });
    form.addEventListener('change', (e) => {
      const f = e.target.closest('[data-field]');
      if (f) f.classList.remove('has-error');
    });

    $('#national_id').addEventListener('input', (e) => {
      const d = e.target.value.replace(/\D/g, '').slice(0, 13);
      const parts = [d.slice(0, 1), d.slice(1, 5), d.slice(5, 10), d.slice(10, 12), d.slice(12, 13)].filter(Boolean);
      e.target.value = parts.join('-');
    });
    $('#phone').addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/[^\d+\-\s]/g, '');
    });
  }

  async function init() {
    try {
      const res = await fetch('/api/reference');
      REF = await res.json();
    } catch {
      showAlert('โหลดข้อมูลไม่สำเร็จ กรุณารีเฟรชหน้า');
      return;
    }
    build();
    bind();
    updatePreview();
    updateMemberUI();
  }
  init();
})();
