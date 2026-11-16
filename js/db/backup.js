// پشتیبان‌گیری و بازیابی «داده‌های کاربر»: پیشرفت، یادداشت، نشان، نتیجه آزمون/تمرین و تنظیمات.
// خود pack های دوره در پشتیبان نیستند (حجمشان زیاد است و از فایل اصلی دوباره Import می‌شوند).
// قاعده امنیتی: فایل پشتیبان ورودی غیرقابل‌اعتماد است؛ فقط فیلدهای مجاز و معتبر پذیرفته می‌شود،
// یک رکورد خراب = رد کل فایل (بازیابی نیمه‌کاره نداریم) و نوشتن در یک تراکنش اتمی انجام می‌شود.
import { reqP, txDone } from './idb.js';
import { NOTE_MAX } from './notes.js';
import { PROJECT_TEXT_MAX } from './results.js';
import { SETTINGS_SPEC, isValidSetting } from '../core/prefs.js';

export const BACKUP_FORMAT = 'aihub-academy-backup';
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_CHARS = 20 * 1024 * 1024;
export const MAX_RECORDS = { progress: 20000, notes: 20000, bookmarks: 20000, quizResults: 20000, settings: 50 };
export const BACKUP_STORES = ['settings', 'progress', 'notes', 'bookmarks', 'quizResults'];

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isTime = (v) => Number.isFinite(v) && v >= 0 && v < 8.64e15;
const isStr = (v, max) => typeof v === 'string' && v.length <= max;
const optStr = (v, max) => (v === undefined || v === null ? '' : (isStr(v, max) ? v : null));

export class BackupError extends Error {
  constructor(code, detail = '') { super(code); this.name = 'BackupError'; this.code = code; this.detail = detail; }
}

/* ───── اعتبارسنجی هر رکورد (خروجی: رکورد پاک‌سازی‌شده یا null) ───── */
const sanitizers = {
  settings(r) {
    if (!isObj(r) || !isValidSetting(r.key, r.value)) return null;
    return { key: r.key, value: r.value, updatedAt: isTime(r.updatedAt) ? r.updatedAt : Date.now() };
  },

  progress(r) {
    if (!isObj(r) || !ID.test(r.courseId) || !ID.test(r.lessonId)) return null;
    if (r.id !== `${r.courseId}:${r.lessonId}` || !['started', 'done'].includes(r.status) || !isTime(r.updatedAt)) return null;
    const title = optStr(r.lessonTitle, 300);
    if (title === null || (r.completedAt != null && !isTime(r.completedAt))) return null;
    return { id: r.id, courseId: r.courseId, lessonId: r.lessonId, lessonTitle: title, status: r.status, updatedAt: r.updatedAt, completedAt: r.completedAt == null ? null : r.completedAt };
  },

  notes(r) {
    if (!isObj(r) || !ID.test(r.courseId) || !ID.test(r.lessonId) || !isStr(r.id, 200)) return null;
    if (!r.id.startsWith(`${r.courseId}:${r.lessonId}:`) || r.id.length <= `${r.courseId}:${r.lessonId}:`.length) return null;
    if (!isStr(r.text, NOTE_MAX) || r.text.trim() === '' || !isTime(r.createdAt) || !isTime(r.updatedAt)) return null;
    const lt = optStr(r.lessonTitle, 300); const ct = optStr(r.courseTitle, 300);
    if (lt === null || ct === null) return null;
    return { id: r.id, courseId: r.courseId, lessonId: r.lessonId, lessonTitle: lt, courseTitle: ct, text: r.text, createdAt: r.createdAt, updatedAt: r.updatedAt };
  },

  bookmarks(r) {
    if (!isObj(r) || !ID.test(r.courseId) || !ID.test(r.lessonId) || !isTime(r.createdAt)) return null;
    const blockId = r.blockId == null ? null : r.blockId;
    if (blockId !== null && !ID.test(blockId)) return null;
    if (r.id !== (blockId ? `${r.courseId}:${r.lessonId}#${blockId}` : `${r.courseId}:${r.lessonId}`)) return null;
    const lt = optStr(r.lessonTitle, 300); const ct = optStr(r.courseTitle, 300); const label = optStr(r.label, 300);
    if (lt === null || ct === null || label === null) return null;
    return { id: r.id, courseId: r.courseId, lessonId: r.lessonId, blockId, lessonTitle: lt, courseTitle: ct, label, createdAt: r.createdAt };
  },

  quizResults(r) {
    if (!isObj(r) || !ID.test(r.courseId) || !ID.test(r.lessonId) || !ID.test(r.blockId) || !isTime(r.updatedAt)) return null;
    if (r.id !== [r.courseId, r.lessonId, r.blockId].join('\u0000')) return null;
    const base = { id: r.id, courseId: r.courseId, lessonId: r.lessonId, blockId: r.blockId, kind: r.kind, updatedAt: r.updatedAt };
    if (r.kind === 'quiz') {
      const pct = (v) => Number.isFinite(v) && v >= 0 && v <= 100;
      if (!pct(r.last) || !pct(r.best) || !Number.isInteger(r.attempts) || r.attempts < 1 || r.attempts > 1e6) return null;
      return { ...base, last: r.last, best: r.best, attempts: r.attempts };
    }
    if (r.kind === 'exercise' || r.kind === 'project') {
      if (!Array.isArray(r.checked) || r.checked.length > 100 || !r.checked.every((i) => Number.isInteger(i) && i >= 0 && i < 100)) return null;
      const text = optStr(r.text, PROJECT_TEXT_MAX);
      if (text === null) return null;
      return { ...base, checked: [...new Set(r.checked)].sort((a, b) => a - b), text };
    }
    return null;
  },
};

/* ───── ساخت پشتیبان ───── */
export async function exportBackup(db, { appVersion = '', now = Date.now() } = {}) {
  const data = {};
  const tx = db.transaction(BACKUP_STORES, 'readonly');
  for (const name of BACKUP_STORES) data[name] = await reqP(tx.objectStore(name).getAll());
  // فقط فیلدهای مجاز (رکورد ناسازگار قدیمی بی‌صدا حذف می‌شود و در شمارش skipped می‌آید)
  let skipped = 0;
  for (const name of BACKUP_STORES) {
    const clean = [];
    for (const r of data[name]) { const c = sanitizers[name](r); if (c) clean.push(c); else skipped++; }
    data[name] = clean;
  }
  return { format: BACKUP_FORMAT, schemaVersion: BACKUP_VERSION, appVersion, createdAt: now, skipped, data };
}

export const serializeBackup = (backup) => JSON.stringify(backup);

export function backupFilename(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `aihub-backup-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.json`;
}

export function summarize(data) {
  return Object.fromEntries(BACKUP_STORES.map((n) => [n, (data[n] || []).length]));
}

/* ───── خواندن و اعتبارسنجی فایل ───── */
// خروجی: { backup, summary } یا BackupError با code: tooLarge | notJson | notBackup | newerVersion | badData
export function parseBackup(text) {
  if (typeof text !== 'string' || text.length === 0) throw new BackupError('notJson');
  if (text.length > MAX_BACKUP_CHARS) throw new BackupError('tooLarge');
  let raw;
  try { raw = JSON.parse(text); } catch { throw new BackupError('notJson'); }
  if (!isObj(raw) || raw.format !== BACKUP_FORMAT || !isObj(raw.data)) throw new BackupError('notBackup');
  if (!Number.isInteger(raw.schemaVersion) || raw.schemaVersion < 1) throw new BackupError('notBackup');
  if (raw.schemaVersion > BACKUP_VERSION) throw new BackupError('newerVersion');

  const data = {};
  const problems = [];
  for (const name of BACKUP_STORES) {
    const list = Object.prototype.hasOwnProperty.call(raw.data, name) ? raw.data[name] : [];
    if (!Array.isArray(list)) throw new BackupError('badData', `${name}: not an array`);
    if (list.length > MAX_RECORDS[name]) throw new BackupError('badData', `${name}: too many records`);
    const seen = new Set();
    data[name] = [];
    list.forEach((rec, i) => {
      const clean = sanitizers[name](rec);
      const key = clean && (clean.key || clean.id);
      if (!clean || seen.has(key)) { if (problems.length < 10) problems.push(`${name}[${i}]`); return; }
      seen.add(key);
      data[name].push(clean);
    });
  }
  if (problems.length) throw new BackupError('badData', problems.join(', '));
  return {
    backup: { format: BACKUP_FORMAT, schemaVersion: raw.schemaVersion, appVersion: typeof raw.appVersion === 'string' ? raw.appVersion.slice(0, 40) : '', createdAt: isTime(raw.createdAt) ? raw.createdAt : null, data },
    summary: summarize(data),
  };
}

/* ───── بازیابی ───── */
const stamp = (name, r) => (name === 'bookmarks' ? r.createdAt : r.updatedAt);

// merge: رکورد تازه‌تر برنده است؛ نتیجه آزمون: بهترین نمره و بیشترین تلاش حفظ می‌شود.
// replace: داده‌های فعلی این storeها پاک و با پشتیبان جایگزین می‌شوند.
// همه چیز در یک تراکنش؛ اگر چیزی شکست بخورد، هیچ تغییری اعمال نمی‌شود.
export async function restoreBackup(db, backup, { mode = 'merge' } = {}) {
  if (mode !== 'merge' && mode !== 'replace') throw new BackupError('badMode');
  const tx = db.transaction(BACKUP_STORES, 'readwrite');
  const report = Object.fromEntries(BACKUP_STORES.map((n) => [n, { added: 0, updated: 0, kept: 0 }]));
  try {
    for (const name of BACKUP_STORES) {
      const store = tx.objectStore(name);
      if (mode === 'replace') store.clear();
      for (const rec of backup.data[name]) {
        const key = name === 'settings' ? rec.key : rec.id;
        const prev = mode === 'replace' ? null : await reqP(store.get(key));
        if (!prev) { store.put(rec); report[name].added++; continue; }
        if (name === 'quizResults' && rec.kind === 'quiz' && prev.kind === 'quiz') {
          const newer = rec.updatedAt >= prev.updatedAt ? rec : prev;
          store.put({ ...newer, best: Math.max(rec.best, prev.best), attempts: Math.max(rec.attempts, prev.attempts) });
          report[name][newer === rec ? 'updated' : 'kept']++;
        } else if (stamp(name, rec) > stamp(name, prev)) { store.put(rec); report[name].updated++; }
        else report[name].kept++;
      }
    }
    await txDone(tx);
  } catch (err) {
    try { tx.abort(); } catch { /* تراکنش قبلاً تمام شده */ }
    throw err;
  }
  return report;
}

/* ───── یادآوری پشتیبان ───── */
export const REMINDER_DAYS = 14;
// مقدار بازگشتی: true اگر کاربر داده‌ای دارد و مدت زیادی پشتیبان نگرفته است
export function backupDue({ lastBackupAt, recordCount, now = Date.now() }) {
  if (!recordCount) return false;
  if (!isTime(lastBackupAt)) return true;
  return now - lastBackupAt > REMINDER_DAYS * 86400000;
}
export const SETTINGS_KEYS = Object.keys(SETTINGS_SPEC);
