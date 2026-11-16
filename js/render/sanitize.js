// پاکسازی متن ورودی pack (محتوا همیشه «داده نامطمئن» فرض می‌شود)
// حذف: کاراکترهای کنترلی و کاراکترهای bidi که برای فریب متن استفاده می‌شوند (Trojan Source).
// حفظ: \n و \t و نیم‌فاصله (ZWNJ, U+200C) که برای فارسی ضروری است.
const UNSAFE_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g;

export function cleanText(value) {
  return typeof value === 'string' ? value.replace(UNSAFE_CHARS, '') : '';
}

export const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;           // شناسه دوره/فصل/درس/asset
export const BLOCK_ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;         // شناسه اختیاری بلوک (برای نشان/یادداشت در M4)

// فقط https (برای لینک‌های خروجی). مسیرهای داخلی با isSafeUrl در dom.js مدیریت می‌شوند.
export function isHttpsUrl(value) {
  if (typeof value !== 'string') return false;
  try { return new URL(value.trim()).protocol === 'https:'; } catch { return false; }
}

export function hostnameOf(value) {
  try { return new URL(value).hostname; } catch { return ''; }
}
