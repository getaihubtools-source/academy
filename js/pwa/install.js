// نصب برنامه روی دستگاه: beforeinstallprompt (Chrome/Edge/اندروید) + راهنمای iOS
export function createInstaller({ win = globalThis.window, nav = globalThis.navigator } = {}) {
  let deferred = null;
  let installed = false;
  const listeners = new Set();
  const emit = () => { for (const fn of listeners) fn(); };

  if (win && win.addEventListener) {
    win.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; emit(); });
    win.addEventListener('appinstalled', () => { installed = true; deferred = null; emit(); });
  }

  const standalone = () => {
    try { if (win.matchMedia && win.matchMedia('(display-mode: standalone)').matches) return true; } catch { /* matchMedia ناموجود */ }
    return Boolean(nav && nav.standalone);
  };
  const ios = () => /iphone|ipad|ipod/i.test((nav && nav.userAgent) || '');

  return {
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    // 'installed' | 'prompt' | 'ios' | 'unavailable'
    mode() {
      if (installed || standalone()) return 'installed';
      if (deferred) return 'prompt';
      if (ios()) return 'ios';
      return 'unavailable';
    },
    async prompt() {
      if (!deferred) return 'unavailable';
      const ev = deferred; deferred = null; emit();
      await ev.prompt();
      const choice = await ev.userChoice;
      return choice && choice.outcome === 'accepted' ? 'accepted' : 'dismissed';
    },
  };
}
