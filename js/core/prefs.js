// تنظیمات کاربر: مشخصات مجاز، اعتبارسنجی و اعمال روی <html>
export const SETTINGS_SPEC = {
  fontScale: { values: ['sm', 'md', 'lg'], default: 'md' },
  motion: { values: ['auto', 'reduce'], default: 'auto' },
};

export const DEFAULT_SETTINGS = Object.freeze(
  Object.fromEntries(Object.entries(SETTINGS_SPEC).map(([k, s]) => [k, s.default])),
);

export function isValidSetting(key, value) {
  const spec = SETTINGS_SPEC[key];
  return Boolean(spec) && spec.values.includes(value);
}

// ورودی ناقص یا خراب (مثلاً داده قدیمی DB) به مقدار پیش‌فرض برمی‌گردد
export function normalizeSettings(raw = {}) {
  const out = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(SETTINGS_SPEC)) {
    if (isValidSetting(key, raw[key])) out[key] = raw[key];
  }
  return out;
}

export function applyPrefs(root, settings) {
  root.dataset.fontScale = settings.fontScale;
  root.dataset.motion = settings.motion;
}
