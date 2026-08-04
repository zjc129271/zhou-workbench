import { seedIfNeeded, getSetting, setSetting } from './db.js';
import { toast, closeAllModals, openModal, closeModal, esc } from './util.js';
import { startNotifier } from './notify.js';
import * as Home from './views/home.js';
import * as Bill from './views/bill.js';
import * as Memo from './views/memo.js';
import * as Daily from './views/dailytask.js';
import * as Weekly from './views/weeklytask.js';
import * as Journal from './views/journal.js';

const ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.2 12 4l9 7.2"/><path d="M5.5 10v9.5h13V10"/><path d="M9.5 19.5v-5h5v5"/></svg>',
  bill: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M8.5 8.5 12 13l3.5-4.5M12 13v4.2M9.5 15.2h5"/></svg>',
  memo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M9 8.5h6M9 12.5h6M9 16.5h4"/></svg>',
  daily: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 7 7 9.5 11 5"/><path d="M4.5 17 7 19.5 11 15"/><path d="M14 7h6M14 17h6"/></svg>',
  weekly: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="15.5" rx="2.5"/><path d="M4 9.5h16M8 3.5v4M16 3.5v4"/></svg>',
  journal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5.5C10.5 4.3 8.3 4 6.5 4.3 5 4.5 4 5.2 4 6.8v12c0 1.3 1 2 2.3 1.8 1.7-.3 3.7 0 5.2 1.2"/><path d="M12 5.5C13.5 4.3 15.7 4 17.5 4.3c1.5.2 2.5.9 2.5 2.5v12c0 1.3-1 2-2.3 1.8-1.7-.3-3.7 0-5.2 1.2"/><path d="M12 5.5v14"/></svg>',
};

const TABS = [
  { key: 'home', label: '首页', ico: ICONS.home },
  { key: 'bill', label: '账单', ico: ICONS.bill },
  { key: 'memo', label: '备忘录', ico: ICONS.memo },
  { key: 'daily', label: '每日任务', ico: ICONS.daily },
  { key: 'weekly', label: '每周任务', ico: ICONS.weekly },
  { key: 'journal', label: '日常记录', ico: ICONS.journal },
];
const VIEWS = { home: Home, bill: Bill, memo: Memo, daily: Daily, weekly: Weekly, journal: Journal };

const state = { tab: 'home', billSub: 'month' };
const viewEl = document.getElementById('view');
const navEl = document.getElementById('bottomNav');
const themeBtn = document.getElementById('themeToggle');

function applyTheme() {
  const t = localStorage.getItem('theme') || 'auto';
  let eff = t;
  if (t === 'auto') eff = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', eff);
}
async function loadThemeSetting() {
  const s = await getSetting('theme', 'auto');
  localStorage.setItem('theme', s);
  applyTheme();
}
function toggleTheme() {
  const cur = localStorage.getItem('theme') || 'auto';
  const order = ['auto', 'light', 'dark'];
  const next = order[(order.indexOf(cur) + 1) % order.length];
  localStorage.setItem('theme', next);
  setSetting('theme', next);
  applyTheme();
  toast(next === 'auto' ? '跟随系统' : (next === 'light' ? '浅色模式' : '深色模式'));
}

function renderNav() {
  navEl.innerHTML = '';
  TABS.forEach((t) => {
    const b = document.createElement('button');
    b.className = 'nav-item' + (t.key === state.tab ? ' active' : '');
    b.innerHTML = `<span class="nav-ico">${t.ico}</span><span>${t.label}</span>`;
    b.onclick = () => navigate(t.key);
    navEl.appendChild(b);
  });
}

function navigate(tab, sub) {
  state.tab = tab;
  if (sub) state.billSub = sub;
  closeAllModals();
  renderNav();
  renderView();
}

function renderView() {
  const ctx = { rerender: renderView, goto: navigate };
  const view = VIEWS[state.tab];
  viewEl.innerHTML = '';
  viewEl.scrollTop = 0;
  view.render(viewEl, ctx, state).catch((e) => {
    console.error('render error', e);
    viewEl.innerHTML = `<div class="card"><div class="empty">页面渲染出错：${esc(e && e.message ? e.message : String(e))}<br><button class="btn btn--sm" style="margin-top:14px;width:auto" onclick="location.reload()">刷新重试</button></div></div>`;
  });
}

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
      .then((reg) => { if (reg && reg.update) reg.update(); }) // 立即检查新版本，避免外部浏览器停留在旧 SW
      .catch(() => {});
    // 新 SW 接管后强制刷新，避免外部浏览器仍显示旧缓存（仅刷新一次）
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      location.reload();
    });
  }
}

/* ============ PWA 安装引导（让「添加到主屏幕」成为真正的独立 App） ============ */
function isIOSDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
function setupInstall() {
  const banner = document.getElementById('installBanner');
  const btn = document.getElementById('installBtn');
  const closeBtn = document.getElementById('installClose');
  if (!banner) return;

  const isStandalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  let deferred = null;
  const hide = () => { banner.style.display = 'none'; };
  const show = () => { banner.style.display = 'flex'; };

  // 已经以独立 App 形态运行，无需再提示
  if (isStandalone) { hide(); return; }

  // 捕获浏览器原生安装事件（安卓 Chrome 等支持）；阻止其默认迷你提示，统一用我们的按钮
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
  });
  window.addEventListener('appinstalled', () => { hide(); toast('已安装到手机桌面 🎉'); });

  // 关键修复：只要尚未以 App 形态安装，就【始终】显示安装入口。
  // 旧逻辑只在 beforeinstallprompt 触发时才显示，但手机端该事件经常不触发
  //（iOS Safari 根本不触发；安卓若曾被忽略也可能不再触发），导致手机看不到横幅。
  show();

  if (btn) btn.onclick = async () => {
    if (deferred) {
      deferred.prompt();
      try { await deferred.userChoice; } catch (e) { /* 用户取消，忽略 */ }
      deferred = null;
      return;
    }
    // 没有可用的原生安装事件（iOS / 已被忽略过）：弹出手动添加指引
    showInstallHelp();
  };
  if (closeBtn) closeBtn.onclick = hide;
}

function showInstallHelp() {
  const body = isIOSDevice()
    ? '在 Safari 中，点击底部工具栏的「分享」图标，选择「添加到主屏幕」，即可像 App 一样放在桌面使用（无浏览器地址栏）。'
    : '在浏览器菜单中选择「安装应用 / 安装到主屏幕 / Add to Home screen」。若之前添加过旧的书签，请先删除它，再重新安装，才能以全屏 App 形态打开。';
  const mask = openModal(`
    <div class="modal-card" style="max-width:360px">
      <div class="modal-head">
        <div style="font-size:16px;font-weight:700">如何安装到桌面</div>
        <button class="icon-btn" id="ih-close" aria-label="关闭" style="font-size:19px">✕</button>
      </div>
      <div style="font-size:15px;line-height:1.7;color:var(--text);padding:4px 0 16px">${body}</div>
      <button class="btn" id="ih-ok">知道了</button>
    </div>`);
  if (mask) {
    mask.querySelector('#ih-close').onclick = () => closeModal(mask);
    mask.querySelector('#ih-ok').onclick = () => closeModal(mask);
  }
}

async function init() {
  try {
    await seedIfNeeded();
    await loadThemeSetting();
    themeBtn.onclick = toggleTheme;
    renderNav();
    setupInstall();
    navigate('home');
    startNotifier();
  } catch (e) {
    console.error('init failed', e);
    const v = document.getElementById('view');
    if (v) v.innerHTML = `<div class="card"><div class="empty">初始化失败：${e && e.message ? e.message : e}<br>请刷新页面重试。</div></div>`;
  }
  registerSW();
}

init();
