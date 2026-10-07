(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* ---------- helpers ---------- */
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) {
      Object.entries(attrs).forEach(([k, v]) => {
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') e.className = v;
        else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
        else if (k === 'text') e.textContent = v;
        else e.setAttribute(k, v === true ? '' : v);
      });
    }
    kids.flat().forEach((c) => {
      if (c === null || c === undefined || c === false) return;
      e.append(c.nodeType ? c : document.createTextNode(String(c)));
    });
    return e;
  }
  const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); };

  function toast(msg, type = '') {
    const t = h('div', { class: `toast ${type}`, text: msg });
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), 5000);
  }

  async function api(path, opts = {}) {
    const init = { method: opts.method || 'GET', headers: {}, credentials: 'same-origin' };
    if (opts.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    const res = await fetch(`/api/admin${path}`, init);
    if (res.status === 401) { window.location.href = '/admin/login.html'; throw new Error('unauthorized'); }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(json.message || 'เกิดข้อผิดพลาด');
      err.status = res.status; err.data = json;
      throw err;
    }
    return json;
  }

  const fmtDT = (s) => {
    if (!s) return '—';
    const d = new Date(s.includes('T') || s.includes('Z') ? s : `${s.replace(' ', 'T')}Z`);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Bangkok' });
  };
  const dateOnly = (iso) => (iso ? iso.slice(0, 10) : '');

  let REF = null;
  const state = { page: 1, q: '', status: '', member: '', logPage: 1, logQ: '', logDir: '' };
  const lbl = (list, v) => (list.find((x) => x.value === v) || {}).label || v;

  /* ---------- tabs ---------- */
  function showTab(name) {
    $$('.tab').forEach((t) => { const on = t.dataset.tab === name; t.classList.toggle('active', on); t.setAttribute('aria-selected', on); });
    $$('.tabpane').forEach((p) => p.classList.toggle('hidden', p.id !== `tab-${name}`));
    if (name === 'vehicles') { loadStats(); loadVehicles(); }
    if (name === 'logs') loadLogs();
    if (name === 'sync') loadSync();
    if (name === 'settings') loadAudit();
    history.replaceState(null, '', `#${name}`);
  }

  /* ---------- modal ---------- */
  function syncScrollLock() {
    const anyOpen = $$('.modal').some((m) => !m.classList.contains('hidden'));
    if (anyOpen) document.body.style.setProperty('overflow', 'hidden');
    else document.body.style.removeProperty('overflow');
  }
  function openModal(id) { $(`#${id}`).classList.remove('hidden'); syncScrollLock(); }
  function closeModal(m) { m.classList.add('hidden'); syncScrollLock(); }
  function closeTopModal() {
    const open = $$('.modal').filter((m) => !m.classList.contains('hidden'));
    if (open.length) closeModal(open[open.length - 1]);
  }
  function closeModals() { $$('.modal').forEach((m) => m.classList.add('hidden')); syncScrollLock(); }

  function confirmBox(title, text, okLabel = 'ยืนยัน') {
    return new Promise((resolve) => {
      const modal = $('#confirmModal');
      const ok = $('#cfOk');
      $('#cfTitle').textContent = title;
      $('#cfText').textContent = text;
      ok.textContent = okLabel;
      let settled = false;
      const finish = (v) => {
        if (settled) return;
        settled = true;
        mo.disconnect();
        ok.onclick = null;
        resolve(v);
      };
      // ปิดด้วยปุ่มยกเลิก / Esc / คลิกพื้นหลัง => ตีความเป็น "ไม่ยืนยัน"
      const mo = new MutationObserver(() => { if (modal.classList.contains('hidden')) finish(false); });
      mo.observe(modal, { attributes: true, attributeFilter: ['class'] });
      ok.onclick = () => { finish(true); closeModal(modal); };
      openModal('confirmModal');
    });
  }


  /* ---------- stats ---------- */
  async function loadStats() {
    const s = await api('/stats');
    const box = $('#stats');
    clear(box);
    const mk = (cls, label, val, click) => h('div', { class: `card stat ${cls} ${click ? 'click' : ''}`, onclick: click, role: click ? 'button' : null, tabindex: click ? '0' : null }, h('small', { text: label }), h('b', { text: val }));
    box.append(
      mk('s-total', 'ยานพาหนะทั้งหมด', s.total, () => { setFilter(''); }),
      mk('s-pending', 'รออนุมัติ', s.pending, () => { setFilter('pending'); }),
      mk('s-allowed', 'อนุญาต (Allowlist)', s.allowed, () => { setFilter('allowed'); }),
      mk('s-blocked', 'ไม่อนุญาต (Blocklist)', s.blocked, () => { setFilter('blocked'); }),
      mk('s-sync', 'ซิงก์ผิดพลาด', s.syncErrors, s.syncErrors ? () => showTab('sync') : null),
    );
  }
  function setFilter(st) { state.status = st; $('#fStatus').value = st; state.page = 1; loadVehicles(); }

  /* ---------- vehicles ---------- */
  function statusBadge(st) {
    const map = { pending: ['badge-pending', 'รออนุมัติ'], allowed: ['badge-allowed', 'อนุญาต'], blocked: ['badge-blocked', 'ไม่อนุญาต'] };
    const [c, t] = map[st] || ['badge-muted', st];
    return h('span', { class: `badge ${c}`, text: t });
  }
  function syncDots(v) {
    const mk = (name, st) => h('span', { class: `sdot ${st === 'ok' ? 'ok' : st === 'error' ? 'error' : ''}`, title: v.sync_message || '', text: name });
    return h('div', { class: 'sync-dots' }, mk('XLS', v.excel_status), mk('GS', v.sheet_status));
  }

  async function loadVehicles() {
    const params = new URLSearchParams({ page: state.page, pageSize: 15 });
    if (state.q) params.set('q', state.q);
    if (state.status) params.set('status', state.status);
    if (state.member) params.set('member_type', state.member);
    const data = await api(`/vehicles?${params}`);
    const body = $('#vehBody');
    clear(body);
    $('#vehEmpty').classList.toggle('hidden', data.items.length > 0);
    data.items.forEach((v) => body.appendChild(vehicleRow(v)));
    renderPager($('#vehPager'), data, (p) => { state.page = p; loadVehicles(); });
    const csv = new URLSearchParams();
    if (state.q) csv.set('q', state.q);
    if (state.status) csv.set('status', state.status);
    if (state.member) csv.set('member_type', state.member);
    $('#csvBtn').href = `/api/admin/export/vehicles.csv?${csv}`;
  }

  function vehicleRow(v) {
    const acts = h('div', { class: 'acts' });
    if (v.status !== 'allowed') acts.append(h('button', { class: 'btn btn-sm btn-success', type: 'button', onclick: () => openApprove(v), text: '✔ อนุญาต' }));
    if (v.status !== 'blocked') acts.append(h('button', { class: 'btn btn-sm btn-danger', type: 'button', onclick: () => doBlock(v), text: '✖ ไม่อนุญาต' }));
    acts.append(
      h('button', { class: 'btn btn-sm', type: 'button', onclick: () => openEdit(v.id), text: 'แก้ไข' }),
    );
    if (v.excel_status === 'error' || v.sheet_status === 'error') {
      acts.append(h('button', { class: 'btn btn-sm', type: 'button', onclick: () => resyncOne(v), text: '🔄' }));
    }
    acts.append(h('button', { class: 'btn btn-sm btn-ghost btn-icon', type: 'button', 'aria-label': 'ลบ', onclick: () => doDelete(v), text: '🗑' }));

    return h('tr', null,
      h('td', { 'data-label': 'ทะเบียน' }, h('span', { class: `plate-chip t-${v.plate_type}` }, v.plate_display, h('small', { text: v.province }))),
      h('td', { 'data-label': 'รถ' }, h('div', null, h('div', { class: 'cell-main', text: `${v.brand} ${v.model}` }), h('div', { class: 'cell-sub', text: `${lbl(REF.bodyTypes, v.body_type)} · ${v.color}` }))),
      h('td', { 'data-label': 'เจ้าของ' }, h('div', null, h('div', { class: 'cell-main', text: v.owner_name }), h('div', { class: 'cell-sub', text: `${v.phone} · ${v.affiliation}` }))),
      h('td', { 'data-label': 'สมาชิก' }, h('span', { class: `badge ${v.member_type === 'blacklist' ? 'badge-blocked' : 'badge-info'}`, text: lbl(REF.memberTypes, v.member_type) })),
      h('td', { 'data-label': 'สถานะ' }, statusBadge(v.status)),
      h('td', { 'data-label': 'Excel/Sheet' }, syncDots(v)),
      h('td', { class: 'col-act' }, acts),
    );
  }

  function renderPager(box, data, go) {
    clear(box);
    const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
    box.append(
      h('button', { class: 'btn btn-sm', type: 'button', disabled: data.page <= 1, onclick: () => go(data.page - 1), text: '← ก่อนหน้า' }),
      h('span', { text: `หน้า ${data.page} / ${pages} · ทั้งหมด ${data.total} รายการ` }),
      h('button', { class: 'btn btn-sm', type: 'button', disabled: data.page >= pages, onclick: () => go(data.page + 1), text: 'ถัดไป →' }),
    );
  }

  /* ---------- approve / block / delete ---------- */
  let approveTarget = null;
  function openApprove(v) {
    approveTarget = v;
    $('#apPlate').textContent = `${v.plate_display} · ${v.province} — ${v.owner_name}`;
    $('#ap_from').value = dateOnly(new Date(Date.now() + 7 * 3600e3).toISOString());
    $('#ap_to').value = '';
    openModal('approveModal');
  }
  function reportSync(r) {
    if (!r || !r.sync) return;
    if (!r.sync.ok) toast(`บันทึกลง SQL แล้ว แต่ซิงก์ไม่สำเร็จ: ${r.sync.errors.join(' | ')}`, 'warn');
  }
  async function doApprove() {
    try {
      const r = await api(`/vehicles/${approveTarget.id}/status`, { method: 'POST', body: { status: 'allowed', valid_from: $('#ap_from').value, valid_to: $('#ap_to').value } });
      closeModals();
      toast('อนุญาตแล้ว และบันทึกลง SQL + Excel เรียบร้อย', 'ok');
      reportSync(r);
      refreshAll();
    } catch (e) { toast(e.message, 'err'); }
  }
  async function doBlock(v) {
    const ok = await confirmBox('ไม่อนุญาตรถคันนี้?', `${v.plate_display} (${v.province}) จะถูกใส่ใน Blocklist`, 'ไม่อนุญาต');
    if (!ok) return;
    try {
      const r = await api(`/vehicles/${v.id}/status`, { method: 'POST', body: { status: 'blocked' } });
      toast('ตั้งเป็นไม่อนุญาต (Blocklist) แล้ว', 'ok');
      reportSync(r);
      refreshAll();
    } catch (e) { toast(e.message, 'err'); }
  }
  async function doDelete(v) {
    const ok = await confirmBox('ลบรายการนี้?', `ลบ ${v.plate_display} (${v.province}) ของ ${v.owner_name} ออกจาก SQL และ Excel — ย้อนกลับไม่ได้`, 'ลบถาวร');
    if (!ok) return;
    try {
      const r = await api(`/vehicles/${v.id}`, { method: 'DELETE' });
      toast('ลบแล้ว', 'ok');
      reportSync(r);
      refreshAll();
    } catch (e) { toast(e.message, 'err'); }
  }
  async function resyncOne(v) {
    try {
      const r = await api(`/vehicles/${v.id}/sync`, { method: 'POST' });
      toast(r.ok ? 'ซิงก์สำเร็จ' : `ซิงก์ไม่สำเร็จ: ${r.sync.errors.join(' | ')}`, r.ok ? 'ok' : 'err');
      refreshAll();
    } catch (e) { toast(e.message, 'err'); }
  }
  function refreshAll() { loadStats(); loadVehicles(); }

  /* ---------- edit / create ---------- */
  let editingId = null;
  const F = {
    plate: '#e_plate', prov: '#e_prov', ptype: '#e_ptype', body: '#e_body', brand: '#e_brand', model: '#e_model', color: '#e_color',
    member: '#e_member', owner: '#e_owner', phone: '#e_phone', nid: '#e_nid', aff: '#e_aff', visit: '#e_visit',
    status: '#e_status', from: '#e_from', to: '#e_to', note: '#e_note',
  };
  const fv = (k) => $(F[k]).value;

  function fillSelect(sel, items, placeholder) {
    clear(sel);
    if (placeholder) sel.append(new Option(placeholder, ''));
    items.forEach((i) => sel.append(typeof i === 'string' ? new Option(i, i) : new Option(i.label, i.value)));
  }
  function setupEditOptions() {
    fillSelect($(F.prov), REF.provinces, '— เลือก —');
    fillSelect($(F.ptype), REF.plateTypes, '— เลือก —');
    fillSelect($(F.body), REF.bodyTypes, '— เลือก —');
    fillSelect($(F.member), REF.memberTypes, '— เลือก —');
    const bl = $('#e_brandList'); clear(bl);
    Object.keys(REF.brands).forEach((b) => bl.append(new Option(b)));
    const cl = $('#e_colorList'); clear(cl);
    REF.colors.forEach((c) => cl.append(new Option(c)));
  }
  function updateEditModels() {
    const key = Object.keys(REF.brands).find((b) => b.toLowerCase() === fv('brand').trim().toLowerCase());
    const ml = $('#e_modelList'); clear(ml);
    if (key) REF.brands[key].forEach((m) => ml.append(new Option(m)));
  }
  function toggleDates() {
    const on = fv('status') === 'allowed';
    $('#e_datesWrap').classList.toggle('hidden', !on);
    $('#e_datesWrap2').classList.toggle('hidden', !on);
  }
  function resetEditErrors() {
    $$('#editForm .has-error').forEach((f) => f.classList.remove('has-error'));
    $$('#editForm .error-text').forEach((t) => { t.textContent = ''; });
    $('#editAlert').classList.add('hidden');
  }

  async function openEdit(id) {
    resetEditErrors();
    editingId = id;
    $('#revealBtn').classList.toggle('hidden', !id);
    if (id) {
      const v = await api(`/vehicles/${id}`);
      $('#editTitle').textContent = `แก้ไข ${v.plate_display} · ${v.province}`;
      $(F.plate).value = v.plate_number; $(F.prov).value = v.province; $(F.ptype).value = v.plate_type; $(F.body).value = v.body_type;
      $(F.brand).value = v.brand; $(F.model).value = v.model; $(F.color).value = v.color; $(F.member).value = v.member_type;
      $(F.owner).value = v.owner_name; $(F.phone).value = v.phone; $(F.nid).value = ''; $(F.aff).value = v.affiliation;
      $(F.visit).value = v.visit_target || ''; $(F.status).value = v.status; $(F.from).value = dateOnly(v.valid_from);
      $(F.to).value = dateOnly(v.valid_to); $(F.note).value = v.note || '';
      $('#nidState').textContent = v.national_id_masked ? `(เดิม: ${v.national_id_masked})` : '(ยังไม่มี)';
    } else {
      $('#editTitle').textContent = 'เพิ่มรถใหม่';
      $('#editForm').reset();
      $(F.status).value = 'allowed';
      $(F.from).value = dateOnly(new Date(Date.now() + 7 * 3600e3).toISOString());
      $('#nidState').textContent = '';
    }
    updateEditModels(); toggleDates();
    openModal('editModal');
  }

  async function saveEdit(ev) {
    ev.preventDefault();
    resetEditErrors();
    const body = {
      plate_number: fv('plate'), province: fv('prov'), plate_type: fv('ptype'), body_type: fv('body'), brand: fv('brand'), model: fv('model'),
      color: fv('color'), member_type: fv('member'), owner_name: fv('owner'), phone: fv('phone'), national_id: fv('nid'),
      affiliation: fv('aff'), visit_target: fv('visit'), status: fv('status'), valid_from: fv('from'), valid_to: fv('to'), note: fv('note'),
    };
    const btn = $('#saveBtn'); btn.disabled = true;
    try {
      const r = editingId
        ? await api(`/vehicles/${editingId}`, { method: 'PUT', body })
        : await api('/vehicles', { method: 'POST', body });
      closeModals();
      toast('บันทึกเรียบร้อย', 'ok');
      reportSync(r);
      refreshAll();
    } catch (e) {
      if (e.status === 422 && e.data.errors) {
        Object.entries(e.data.errors).forEach(([k, m]) => {
          const f = $(`#editForm [data-field="${k}"]`);
          if (f) { f.classList.add('has-error'); f.querySelector('.error-text').textContent = m; }
        });
        const a = $('#editAlert'); a.textContent = 'กรุณาตรวจสอบช่องที่ไฮไลต์สีแดง'; a.classList.remove('hidden');
      } else {
        const a = $('#editAlert'); a.textContent = e.message; a.classList.remove('hidden');
      }
    } finally { btn.disabled = false; }
  }

  async function revealNid() {
    if (!editingId) return;
    const ok = await confirmBox('ดูเลขบัตรประชาชน?', 'การดูข้อมูลส่วนบุคคลจะถูกบันทึกในประวัติการใช้งาน', 'ดูเลขบัตร');
    if (!ok) return;
    try {
      const v = await api(`/vehicles/${editingId}?reveal=1`);
      $(F.nid).value = v.national_id || '';
      toast(v.national_id ? 'แสดงเลขบัตรแล้ว (บันทึกประวัติเรียบร้อย)' : 'ไม่มีเลขบัตรในระบบ', v.national_id ? 'ok' : 'warn');
    } catch (e) { toast(e.message, 'err'); }
  }

  /* ---------- logs ---------- */
  async function loadLogs() {
    const p = new URLSearchParams({ page: state.logPage, pageSize: 20 });
    if (state.logQ) p.set('q', state.logQ);
    if (state.logDir) p.set('direction', state.logDir);
    const data = await api(`/logs?${p}`);
    const body = $('#logBody'); clear(body);
    $('#logEmpty').classList.toggle('hidden', data.items.length > 0);
    data.items.forEach((l) => {
      body.append(h('tr', null,
        h('td', { 'data-label': 'เวลา' }, fmtDT(l.event_time)),
        h('td', { 'data-label': 'ทะเบียน' }, h('div', null, h('div', { class: 'cell-main', text: l.plate_norm }), h('div', { class: 'cell-sub', text: l.province || (l.matched ? '' : 'ไม่พบในระบบ') }))),
        h('td', { 'data-label': 'ทิศทาง' }, h('span', { class: `badge ${l.direction === 'in' ? 'badge-allowed' : 'badge-info'}`, text: l.direction === 'in' ? 'เข้า' : 'ออก' })),
        h('td', { 'data-label': 'ประตู' }, l.gate_id || '—'),
        h('td', { 'data-label': 'สมาชิก' }, l.member_type ? lbl(REF.memberTypes, l.member_type) : '—'),
        h('td', { 'data-label': 'ที่มาติดต่อ' }, l.visit_target || '—'),
        h('td', { 'data-label': 'รูป' }, l.image_url ? h('a', { href: l.image_url, target: '_blank', rel: 'noopener noreferrer', text: 'เปิดรูป' }) : '—'),
        h('td', { 'data-label': 'แหล่งที่มา' }, h('span', { class: 'badge badge-muted', text: l.source })),
      ));
    });
    renderPager($('#logPager'), data, (pg) => { state.logPage = pg; loadLogs(); });
  }

  async function saveLog(ev) {
    ev.preventDefault();
    try {
      await api('/logs', { method: 'POST', body: {
        plate_number: $('#lgPlate').value, province: $('#lgProv').value, direction: $('#lgDir').value,
        event_time: $('#lgTime').value ? new Date($('#lgTime').value).toISOString() : null,
        gate_id: $('#lgGate').value, image_url: $('#lgImg').value, visit_target: $('#lgTarget').value,
      } });
      toast('บันทึกเวลาเข้า-ออกแล้ว', 'ok');
      $('#logForm').reset();
      loadLogs();
    } catch (e) { toast(e.message, 'err'); }
  }

  /* ---------- sync ---------- */
  async function loadSync() {
    const s = await api('/stats');
    const t = $('#targets'); clear(t);
    const card = (name, on, desc) => h('div', { class: 'target' },
      h('b', { text: name }),
      h('span', { class: `badge ${on ? 'badge-allowed' : 'badge-muted'}`, text: on ? 'เปิดใช้งาน' : 'ปิดอยู่' }),
      h('span', { class: 'muted', text: desc }));
    t.append(
      card('ไฟล์ Excel (.xlsx)', s.targets.excel, 'data/plate_whitelist.xlsx — คอลัมน์ตามเทมเพลต Hikvision'),
      card('Google Sheet', s.targets.google, s.targets.google ? 'ซิงก์ผ่าน Service Account' : 'เปิดใน .env: GOOGLE_SHEETS_ENABLED=true (ดู docs/GOOGLE_SHEETS_SETUP.md)'),
    );
    const data = await api('/vehicles?pageSize=100&sort=created_desc');
    const bad = data.items.filter((v) => v.excel_status === 'error' || v.sheet_status === 'error');
    const box = $('#syncErrors'); clear(box);
    if (!bad.length) { box.textContent = '✅ ไม่มีรายการค้าง'; return; }
    bad.forEach((v) => box.append(h('div', { class: 'err-item' }, `${v.plate_display} · ${v.province}`, h('small', { text: v.sync_message || 'ไม่ทราบสาเหตุ' }))));
  }
  async function resyncAll() {
    const btn = $('#resyncBtn'); btn.disabled = true;
    try {
      const r = await api('/sync', { method: 'POST' });
      toast(r.ok ? `ซิงก์ ${r.count} ทะเบียนสำเร็จ` : `ซิงก์ไม่สำเร็จ: ${r.sync.errors.join(' | ')}`, r.ok ? 'ok' : 'err');
      loadSync();
    } catch (e) { toast(e.message, 'err'); } finally { btn.disabled = false; }
  }

  /* ---------- settings ---------- */
  async function loadAudit() {
    const rows = await api('/audit');
    const b = $('#auditBody'); clear(b);
    rows.forEach((r) => b.append(h('tr', null,
      h('td', { text: r.created_at }), h('td', { text: r.admin || '—' }), h('td', null, h('span', { class: 'badge badge-muted', text: r.action })),
      h('td', { text: r.detail || '' }), h('td', { text: r.ip || '' }))));
  }
  async function changePw(ev) {
    ev.preventDefault();
    try {
      await api('/password', { method: 'POST', body: { current: $('#pwCur').value, next: $('#pwNew').value } });
      toast('เปลี่ยนรหัสผ่านแล้ว', 'ok');
      $('#pwForm').reset();
    } catch (e) { toast(e.message, 'err'); }
  }

  /* ---------- init ---------- */
  function debounce(fn, ms = 300) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  async function init() {
    const me = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (!me.ok) { window.location.href = '/admin/login.html'; return; }
    $('#adminName').textContent = (await me.json()).displayName;
    REF = await api('/reference');

    fillSelect($('#fMember'), REF.memberTypes, 'ทุกประเภทสมาชิก');
    fillSelect($('#lgProv'), REF.provinces, '—');
    setupEditOptions();

    $$('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));
    $('#logoutBtn').addEventListener('click', async () => {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/admin/login.html';
    });

    $('#q').addEventListener('input', debounce((e) => { state.q = e.target.value.trim(); state.page = 1; loadVehicles(); }));
    $('#fStatus').addEventListener('change', (e) => { state.status = e.target.value; state.page = 1; loadVehicles(); });
    $('#fMember').addEventListener('change', (e) => { state.member = e.target.value; state.page = 1; loadVehicles(); });
    $('#addBtn').addEventListener('click', () => openEdit(null));

    $('#editForm').addEventListener('submit', saveEdit);
    $('#e_brand').addEventListener('input', updateEditModels);
    $('#e_status').addEventListener('change', toggleDates);
    $('#revealBtn').addEventListener('click', revealNid);
    $('#e_nid').addEventListener('input', (e) => {
      const d = e.target.value.replace(/\D/g, '').slice(0, 13);
      e.target.value = [d.slice(0, 1), d.slice(1, 5), d.slice(5, 10), d.slice(10, 12), d.slice(12, 13)].filter(Boolean).join('-');
    });
    $('#apConfirm').addEventListener('click', doApprove);

    $$('[data-close]').forEach((b) => b.addEventListener('click', () => closeModal(b.closest('.modal'))));
    $$('.modal').forEach((m) => m.addEventListener('mousedown', (e) => { if (e.target === m) closeModal(m); }));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeTopModal(); });

    $('#logForm').addEventListener('submit', saveLog);
    $('#lq').addEventListener('input', debounce((e) => { state.logQ = e.target.value.trim(); state.logPage = 1; loadLogs(); }));
    $('#ldir').addEventListener('change', (e) => { state.logDir = e.target.value; state.logPage = 1; loadLogs(); });
    $('#resyncBtn').addEventListener('click', resyncAll);
    $('#pwForm').addEventListener('submit', changePw);

    const start = (location.hash || '#vehicles').slice(1);
    showTab(['vehicles', 'logs', 'sync', 'settings'].includes(start) ? start : 'vehicles');
  }
  init().catch((e) => { if (e.message !== 'unauthorized') toast(e.message, 'err'); });
})();
