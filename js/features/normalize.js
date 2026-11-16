// نرمال‌سازی متن فارسی برای جست‌وجو (آفلاین، بدون کتابخانه)
// یکسان‌سازی: ي/ى→ی  ك→ک  ة/ۀ→ه  أ/إ/ٱ/آ→ا  ارقام فارسی/عربی→لاتین  حروف لاتین→کوچک
// حذف: اعراب، کشیده (ـ)، نیم‌فاصله و کاراکترهای جهت‌دهی
// هر کاراکتر اصلی «حداکثر یک» کاراکتر نرمال تولید می‌کند؛ پس نگاشت موقعیت (map) ساده و دقیق است.

const CHAR_MAP = new Map([
  ['ي', 'ی'], ['ى', 'ی'],             // ي ى → ی
  ['ك', 'ک'],                                    // ك → ک
  ['ة', 'ه'], ['ۀ', 'ه'],             // ة ۀ → ه
  ['أ', 'ا'], ['إ', 'ا'], ['ٱ', 'ا'], ['آ', 'ا'], // أ إ ٱ آ → ا
]);

const isDropped = (code) =>
  (code >= 0x064B && code <= 0x065F) || code === 0x0670 || code === 0x0640 || // اعراب، خنجری، کشیده
  code === 0x200C || code === 0x200D || code === 0x200E || code === 0x200F || code === 0x061C || // ZWNJ، ZWJ، علامت‌های جهت
  (code >= 0x202A && code <= 0x202E) || (code >= 0x2066 && code <= 0x2069);

function mapChar(ch) {
  const code = ch.charCodeAt(0);
  if (code >= 0x06F0 && code <= 0x06F9) return String.fromCharCode(48 + code - 0x06F0); // ۰-۹
  if (code >= 0x0660 && code <= 0x0669) return String.fromCharCode(48 + code - 0x0660); // ٠-٩
  const mapped = CHAR_MAP.get(ch);
  if (mapped) return mapped;
  return ch.toLowerCase().length === 1 ? ch.toLowerCase() : ch;
}

const isSpace = (ch) => /\s/.test(ch) || ch === ' ';

// خروجی: { norm, map } — map[i] = اندیس (UTF-16) کاراکتر اصلی متناظر با norm[i]
export function normalizeWithMap(input) {
  const text = typeof input === 'string' ? input : '';
  let norm = '';
  const map = [];
  let pendingSpace = -1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const code = ch.charCodeAt(0);
    if (isDropped(code)) continue;

    if (isSpace(ch)) {
      if (norm !== '' && pendingSpace === -1) pendingSpace = i; // فاصله‌های متوالی یکی می‌شوند؛ ابتدای متن حذف
      continue;
    }
    if (pendingSpace !== -1) { norm += ' '; map.push(pendingSpace); pendingSpace = -1; }
    norm += mapChar(ch);
    map.push(i);
  }
  return { norm, map };
}

export const normalizeFa = (input) => normalizeWithMap(input).norm;
