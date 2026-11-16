/* AIhub Academy — Service Worker (تولیدشده از tools/sw.template.js با  npm run build:sw ؛ دستی ویرایش نکنید)
   راهبرد: پوسته برنامه (HTML/CSS/JS/فونت/آیکون) پیش‌کش می‌شود و آفلاین کامل کار می‌کند.
   دوره‌ها و داده‌های کاربر در IndexedDB هستند و به این کش ربطی ندارند.
   نسخه جدید نصب می‌شود اما تا تأیید کاربر (پیام SKIP_WAITING) فعال نمی‌شود تا وسط درس صفحه عوض نشود. */
const VERSION = '91564cff2882';
const CACHE = 'aihub-shell-' + VERSION;
const PRECACHE = [
  "./",
  "./css/aihub.bundle.css",
  "./css/assess.css",
  "./css/backup.css",
  "./css/base.css",
  "./css/blocks.css",
  "./css/components.css",
  "./css/courses.css",
  "./css/preview.css",
  "./css/tokens.css",
  "./css/tools.css",
  "./css/views.css",
  "./fonts/Vazirmatn-Variable.woff2",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./index.html",
  "./js/aihub.bundle.js",
  "./js/app.js",
  "./js/boot-check.js",
  "./js/core/config.js",
  "./js/core/dom.js",
  "./js/core/events.js",
  "./js/core/i18n-fa.js",
  "./js/core/icons.js",
  "./js/core/prefs.js",
  "./js/core/router.js",
  "./js/core/store.js",
  "./js/db/backup.js",
  "./js/db/courses.js",
  "./js/db/idb.js",
  "./js/db/notes.js",
  "./js/db/repos.js",
  "./js/db/results.js",
  "./js/db/schema.js",
  "./js/features/assessments.js",
  "./js/features/clipboard.js",
  "./js/features/normalize.js",
  "./js/features/progress.js",
  "./js/features/search.js",
  "./js/packs/loader.js",
  "./js/packs/schema.js",
  "./js/pwa/install.js",
  "./js/pwa/register.js",
  "./js/pwa/storage.js",
  "./js/render/blocks/assess.js",
  "./js/render/blocks/callout.js",
  "./js/render/blocks/comparison.js",
  "./js/render/blocks/heading.js",
  "./js/render/blocks/image.js",
  "./js/render/blocks/index.js",
  "./js/render/blocks/list.js",
  "./js/render/blocks/prompt.js",
  "./js/render/blocks/steps.js",
  "./js/render/blocks/text.js",
  "./js/render/blocks/tool.js",
  "./js/render/blocks/video.js",
  "./js/render/check.js",
  "./js/render/inline.js",
  "./js/render/lesson.js",
  "./js/render/registry.js",
  "./js/render/sanitize.js",
  "./js/views/backup-panel.js",
  "./js/views/course.js",
  "./js/views/dashboard.js",
  "./js/views/lesson-tools.js",
  "./js/views/lesson.js",
  "./js/views/library.js",
  "./js/views/notfound.js",
  "./js/views/parts.js",
  "./js/views/pwa-panel.js",
  "./js/views/saved.js",
  "./js/views/search.js",
  "./js/views/settings.js",
  "./js/views/shell.js",
  "./manifest.webmanifest"
];
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
