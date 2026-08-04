// v7：预缓存应用壳 + 缓存优先（stale-while-revalidate）。
// 安装时即把应用壳预缓存到本机（容忍个别资源缺失，安装永不失敗）；
// 之后每次打开优先用本地缓存，服务器休眠也能正常打开；后台静默更新。
// 支持独立 App 安装（manifest 已含 standalone / 图标 / 主题色）。
const CACHE = 'life-workbench-v7';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/db.js',
  './js/util.js',
  './js/notify.js',
  './js/charts.js',
  './js/export.js',
  './js/views/home.js',
  './js/views/bill.js',
  './js/views/memo.js',
  './js/views/dailytask.js',
  './js/views/weeklytask.js',
  './js/views/journal.js',
  './vendor/chart.umd.js',
  './vendor/xlsx.full.min.js',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/apple-touch-icon.png',
  './assets/icon-maskable-512.png'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u).catch(() => {}))))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 缓存优先：先返回本地缓存（应用壳已预缓存），同时后台拉取最新并静默更新
  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then(async (res) => {
        if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
          if (req.mode === 'navigate') {
            // 仅当确为本应用时才缓存导航响应，避免把平台错误页缓存进壳
            const txt = await res.clone().text();
            if (txt.indexOf('id="app"') !== -1) {
              caches.open(CACHE).then((c) => c.put(req, res.clone()));
            }
          } else {
            caches.open(CACHE).then((c) => c.put(req, res.clone()));
          }
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
