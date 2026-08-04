// 通用工具函数：日期、金额、通知、ID、toast

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// 'YYYY-MM-DD'
export function dateStr(ts = Date.now()) {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
// 'YYYY-MM'
export function monthKey(ts = Date.now()) {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${m}`;
}
// 用于每周任务去重的周键 'YYYY-Www'
export function weekKey(ts = Date.now()) {
  const d = new Date(ts);
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}
// 某月的周键列表（用于周视图红点）
export function weeksOfMonth(year, month) {
  const keys = [];
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  let cur = new Date(first);
  // 回退到本周周一
  const dow = (cur.getDay() + 6) % 7; // 周一=0
  cur.setDate(cur.getDate() - dow);
  while (cur <= last) {
    keys.push(weekKey(cur.getTime()));
    cur.setDate(cur.getDate() + 7);
  }
  return [...new Set(keys)];
}

export function startOfDay(ts = Date.now()) { const d = new Date(ts); d.setHours(0,0,0,0); return d.getTime(); }
export function endOfDay(ts = Date.now()) { const d = new Date(ts); d.setHours(23,59,59,999); return d.getTime(); }

export function fmtMoney(n, sign = false) {
  const neg = n < 0;
  const abs = Math.abs(n).toFixed(2);
  const [int, dec] = abs.split('.');
  const withSep = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const s = (neg ? '-' : (sign && n > 0 ? '+' : '')) + '¥' + withSep + '.' + dec;
  return s;
}
export function fmtDate(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}
export function fmtDateTime(ts) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${fmtDate(ts)} ${hh}:${mm}`;
}
export function fmtMonthLabel(mk) {
  const [y, m] = mk.split('-');
  return `${y}年${parseInt(m, 10)}月`;
}

// 星期几中文
const WD = ['一','二','三','四','五','六','日'];
export function weekdayCN(wd) { return '周' + WD[(wd + 6) % 7]; } // wd: 0=周日
export function weekdayShort(wd) { return WD[(wd + 6) % 7]; }

// 通知
export function notify(title, body) {
  try {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: 'assets/icon-192.png' });
    }
  } catch (e) { /* ignore */ }
}
export async function ensureNotifyPermission() {
  try {
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'default') return await Notification.requestPermission();
    return Notification.permission;
  } catch (e) { return 'denied'; }
}

// toast
let toastEl = null;
export function toast(msg) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.remove('show'), 1800);
}

// 年轻活泼的删除图标（描边线条垃圾桶）
export function trashIcon() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6"/></svg>';
}

// 简单 HTML 转义
export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// 'YYYY-MM-DD' -> 本地零点时间戳
export function dateToTs(str) {
  if (!str) return Date.now();
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

// 弹窗：返回遮罩元素，调用方自行 query 绑定事件；点遮罩空白处关闭
export function openModal(html) {
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.innerHTML = html;
  mask.addEventListener('click', (e) => { if (e.target === mask) closeModal(mask); });
  document.body.appendChild(mask);
  requestAnimationFrame(() => mask.classList.add('show'));
  return mask;
}
export function closeModal(mask) {
  if (!mask || !mask.parentNode) return;
  mask.classList.remove('show');
  setTimeout(() => mask.remove(), 180);
}
export function closeAllModals() {
  document.querySelectorAll('.modal-mask').forEach((m) => m.remove());
}

// 自定义确认框（替代被 PWA 禁用的原生 confirm）
export function confirmModal(message, opts = {}) {
  return new Promise((resolve) => {
    const mask = openModal(`
      <div class="modal-card" style="max-width:320px">
        <div class="modal-card__body" style="padding:18px 18px 10px;font-size:15px;line-height:1.6">${esc(message)}</div>
        <div class="modal-actions">
          <button class="btn btn--ghost" id="cm-cancel">${esc(opts.cancelText || '取消')}</button>
          <button class="btn ${opts.danger ? 'btn--danger' : ''}" id="cm-ok">${esc(opts.okText || '确定')}</button>
        </div>
      </div>`);
    const done = (v) => { closeModal(mask); resolve(v); };
    mask.querySelector('#cm-cancel').onclick = () => done(false);
    mask.querySelector('#cm-ok').onclick = () => done(true);
  });
}

// 自定义输入框（替代被 PWA 禁用的原生 prompt）
export function promptModal(message, defaultVal = '') {
  return new Promise((resolve) => {
    const mask = openModal(`
      <div class="modal-card" style="max-width:320px">
        <div class="modal-card__body" style="padding:16px 18px 6px;font-size:14px;color:var(--muted)">${esc(message)}</div>
        <div class="field" style="padding:6px 18px 0"><input class="input" id="pm-input" value="${esc(defaultVal)}" /></div>
        <div class="modal-actions">
          <button class="btn btn--ghost" id="pm-cancel">取消</button>
          <button class="btn" id="pm-ok">确定</button>
        </div>
      </div>`);
    const inp = mask.querySelector('#pm-input');
    setTimeout(() => inp.focus(), 60);
    const done = (v) => { closeModal(mask); resolve(v); };
    mask.querySelector('#pm-cancel').onclick = () => done(null);
    mask.querySelector('#pm-ok').onclick = () => done(inp.value.trim());
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(inp.value.trim()); });
  });
}

// 把 datetime-local 字符串(本地)转时间戳
export function dtLocalToTs(str) {
  if (!str) return Date.now();
  // 形如 2026-08-01T14:30
  const [d, t] = str.split('T');
  const [y, m, day] = d.split('-').map(Number);
  const [hh, mm] = (t || '00:00').split(':').map(Number);
  return new Date(y, m - 1, day, hh, mm, 0, 0).getTime();
}
// 时间戳转 datetime-local 字符串
export function tsToDtLocal(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
