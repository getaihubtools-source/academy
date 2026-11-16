/* AIhub Academy — Service Worker (تولیدشده از tools/sw.template.js با  npm run build:sw ؛ دستی ویرایش نکنید)
   راهبرد: پوسته برنامه (HTML/CSS/JS/فونت/آیکون) پیش‌کش می‌شود و آفلاین کامل کار می‌کند.
   دوره‌ها و داده‌های کاربر در IndexedDB هستند و به این کش ربطی ندارند.
   نسخه جدید نصب می‌شود اما تا تأیید کاربر (پیام SKIP_WAITING) فعال نمی‌شود تا وسط درس صفحه عوض نشود. */
const VERSION = '__VERSION__';
const CACHE = 'aihub-shell-' + VERSION;
const PRECACHE = __PRECACHE__;
const SCOPE_PATH = new URL('./', self.location).pathname;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache: 'reload' تا نسخه قدیمیِ کش HTTP مرورگر وارد پیش‌کش نشود
    await cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('aihub-shell-') && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // فقط خود برنامه به index.html می‌رسد (نه tests/ یا preview.html روی سرور توسعه)
  if (req.mode === 'navigate') {
    if (url.pathname === SCOPE_PATH || url.pathname === SCOPE_PATH + 'index.html') {
      event.respondWith(caches.match('./index.html', { cacheName: CACHE }).then((hit) => hit || fetch(req)));
    }
    return;
  }
  event.respondWith(caches.match(req, { cacheName: CACHE, ignoreSearch: true }).then((hit) => hit || fetch(req)));
});
