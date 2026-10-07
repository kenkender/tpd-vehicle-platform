(() => {
  const form = document.getElementById('loginForm');
  const err = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = 'กำลังตรวจสอบ…';
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: form.username.value, password: form.password.value }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) { window.location.href = '/admin'; return; }
      err.textContent = json.message || 'เข้าสู่ระบบไม่สำเร็จ';
      err.classList.remove('hidden');
      form.password.value = '';
      form.password.focus();
    } catch {
      err.textContent = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้';
      err.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.textContent = 'เข้าสู่ระบบ';
    }
  });
})();
