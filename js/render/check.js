// ابزار اعتبارسنجی: جمع‌آوری مشکلات با مسیر دقیق (مثلاً lessons.intro.blocks[3].text)
export const LIMITS = Object.freeze({
  title: 200,
  shortText: 300,
  text: 8000,
  promptText: 12000,
  blocksPerLesson: 500,
  listItems: 100,
  listDepth: 3,
  steps: 30,
  tableRows: 30,
  tableCols: 4,
  proItems: 8,
  quizQuestions: 30,
  quizOptions: 6,
  checkItems: 20,
  chapters: 50,
  lessons: 300,
  assets: 200,
  assetBytes: 2 * 1024 * 1024,
  totalAssetBytes: 20 * 1024 * 1024,
  packChars: 40 * 1024 * 1024,
});

export function createValidator({ assetIds = new Set() } = {}) {
  const issues = [];
  const add = (level, code, path, message) => issues.push({ level, code, path, message });

  const v = {
    issues,
    assetIds,
    error: (code, path, message) => add('error', code, path, message),
    warn: (code, path, message) => add('warn', code, path, message),

    // متن: true فقط اگر معتبر باشد
    str(value, path, { required = true, max = LIMITS.shortText } = {}) {
      if (value === undefined || value === null) {
        if (required) v.error('field.required', path, 'فیلد الزامی است');
        return false;
      }
      if (typeof value !== 'string') { v.error('field.type', path, 'باید متن باشد'); return false; }
      if (required && value.trim() === '') { v.error('field.empty', path, 'نباید خالی باشد'); return false; }
      if (value.length > max) { v.error('field.tooLong', path, `طول متن بیش از ${max} کاراکتر است`); return false; }
      return true;
    },

    oneOf(value, path, list, { required = false } = {}) {
      if (value === undefined || value === null) {
        if (required) v.error('field.required', path, 'فیلد الزامی است');
        return !required;
      }
      if (!list.includes(value)) { v.error('field.enum', path, `مقدار باید یکی از این‌ها باشد: ${list.join(' | ')}`); return false; }
      return true;
    },

    bool(value, path) {
      if (value === undefined) return true;
      if (typeof value !== 'boolean') { v.error('field.type', path, 'باید true یا false باشد'); return false; }
      return true;
    },

    arr(value, path, { min = 0, max = 100, required = true } = {}) {
      if (value === undefined || value === null) {
        if (required) v.error('field.required', path, 'فیلد الزامی است');
        return false;
      }
      if (!Array.isArray(value)) { v.error('field.type', path, 'باید آرایه باشد'); return false; }
      if (value.length < min) { v.error('array.tooShort', path, `حداقل ${min} مورد لازم است`); return false; }
      if (value.length > max) { v.error('array.tooLong', path, `حداکثر ${max} مورد مجاز است`); return false; }
      return true;
    },

    obj(value, path) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) { v.error('field.type', path, 'باید object باشد'); return false; }
      return true;
    },

    hasErrors: () => issues.some((i) => i.level === 'error'),
  };
  return v;
}
