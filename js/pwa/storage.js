// ذخیره‌سازی پایدار: بدون آن، مرورگر در کمبود فضا ممکن است IndexedDB (پیشرفت و دوره‌ها) را پاک کند.
export async function storageStatus(nav = globalThis.navigator) {
  const s = nav && nav.storage;
  if (!s) return { supported: false, persisted: false, usage: null, quota: null };
  let persisted = false; let usage = null; let quota = null;
  try { if (s.persisted) persisted = Boolean(await s.persisted()); } catch { /* نادیده */ }
  try { if (s.estimate) { const e = await s.estimate(); usage = Number.isFinite(e.usage) ? e.usage : null; quota = Number.isFinite(e.quota) ? e.quota : null; } } catch { /* نادیده */ }
  return { supported: Boolean(s.persist), persisted, usage, quota };
}

export async function requestPersistence(nav = globalThis.navigator) {
  try { return Boolean(nav && nav.storage && nav.storage.persist && await nav.storage.persist()); } catch { return false; }
}

export function formatBytes(n) {
  if (!Number.isFinite(n)) return '';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
