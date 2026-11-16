// ثبت Service Worker و مدیریت وضعیت: آفلاین‌آماده / نسخه جدید در انتظار.
// وابستگی‌ها تزریق‌پذیرند تا بدون مرورگر واقعی قابل تست باشد.
export const SW_URL = './sw.js';
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // حداکثر ساعتی یک بار هنگام بازگشت به برنامه

export function createPwa({ nav = globalThis.navigator, win = globalThis.window, swUrl = SW_URL, now = () => Date.now() } = {}) {
  let state = { status: 'idle', offlineReady: false, updateAvailable: false };
  const listeners = new Set();
  let registration = null;
  let waiting = null;
  let lastCheck = 0;
  let reloading = false;

  const set = (patch) => { state = { ...state, ...patch }; for (const fn of listeners) fn(state); };

  function watch(reg) {
    registration = reg;
    const hasController = Boolean(nav.serviceWorker.controller);
    if (reg.waiting && hasController) { waiting = reg.waiting; set({ updateAvailable: true }); }
    if (reg.active && hasController) set({ offlineReady: true });

    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state !== 'installed') return;
        if (nav.serviceWorker.controller) { waiting = worker; set({ updateAvailable: true }); } // نسخه جدید، نسخه قبلی هنوز کنترل می‌کند
        else set({ offlineReady: true }); // اولین نصب
      });
    });
    // بعد از اولین نصب، worker صفحه را claim می‌کند
    nav.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      if (waiting === null) set({ offlineReady: true });
    });
  }

  return {
    get state() { return state; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    async register() {
      if (!nav || !nav.serviceWorker) { set({ status: 'unsupported' }); return state; }
      if (win && win.isSecureContext === false) { set({ status: 'insecure' }); return state; }
      try {
        set({ status: 'registering' });
        watch(await nav.serviceWorker.register(swUrl));
        set({ status: 'registered' });
      } catch (err) {
        console.error('[pwa] register failed', err);
        set({ status: 'error' });
      }
      return state;
    },

    // نسخه جدید را فعال می‌کند و صفحه را یک‌بار دوباره بارگذاری می‌کند
    applyUpdate() {
      if (!waiting) return false;
      nav.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) return;
        reloading = true;
        win.location.reload();
      });
      waiting.postMessage({ type: 'SKIP_WAITING' });
      return true;
    },

    async checkForUpdate({ force = false } = {}) {
      if (!registration) return false;
      if (!force && now() - lastCheck < CHECK_INTERVAL_MS) return false;
      lastCheck = now();
      try { await registration.update(); return true; } catch { return false; } // آفلاین بودن خطا نیست
    },
  };
}
