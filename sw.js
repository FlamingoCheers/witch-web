// Service Worker：全量预缓存，离线可用
const CACHE = 'witch-v1.0.5';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/app.js', './js/store.js', './js/md.js', './js/tools.js', './js/engines.js', './js/llm.js', './js/prompt.js',
  './js/data/constants.js', './js/data/tarot.js', './js/data/lenormand.js', './js/data/western.js', './js/data/liuyao64.js',
  './vendor/iztro.mjs', './vendor/lunar.js', './vendor/astronomy.js',
  './vendor/lunar-lite.mjs', './vendor/lunar-typescript.mjs', './vendor/i18next.mjs', './vendor/dayjs.mjs',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-512-maskable.png', './icons/apple-touch-icon.png',
  './assets/donate_qr.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // AI 服务商请求不拦截
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request))
  );
});
