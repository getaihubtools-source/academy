// تست‌های M7 — پشتیبان‌گیری/بازیابی، PWA (ثبت، نصب، ذخیره‌سازی)، پنل‌های تنظیمات، نوار به‌روزرسانی
import { createStore } from '../js/core/store.js';
import { DEFAULT_SETTINGS } from '../js/core/prefs.js';
import { openDb } from '../js/db/idb.js';
import { migrations } from '../js/db/schema.js';
import { createRepos } from '../js/db/repos.js';
import { createCourseService } from '../js/db/courses.js';
import { createNotesService } from '../js/db/notes.js';
import { createResultsService } from '../js/db/results.js';
import {
  BACKUP_FORMAT, BACKUP_VERSION, BACKUP_STORES, BackupError, exportBackup, serializeBackup, backupFilename,
  parseBackup, restoreBackup, backupDue, REMINDER_DAYS,
} from '../js/db/backup.js';
import { parsePack } from '../js/packs/loader.js';
import { createPwa } from '../js/pwa/register.js';
import { createInstaller } from '../js/pwa/install.js';
import { storageStatus, requestPersistence, formatBytes } from '../js/pwa/storage.js';
import { render as renderSettings } from '../js/views/settings.js';
import { buildShell } from '../js/views/shell.js';

const eq = (a, b, msg = '') => { if (!Object.is(a, b)) throw new Error(`${msg} expected ${JSON.stringify(b)} but got ${JSON.stringify(a)}`); };
const ok = (v, msg = 'expected truthy') => { if (!v) throw new Error(msg); };
const codeOf = (fn) => { try { fn(); } catch (e) { return e.code || e.message; } return 'no-throw'; };
const rejCode = async (fn) => { try { await fn(); } catch (e) { return e.code || e.message; } return 'no-throw'; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 3000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { if (fn()) return; } catch { /* هنوز */ } await sleep(10); }
  throw new Error('waitFor timeout');
}

let SAMPLE_TEXT = '';
const SID = 'sample-motion-lab';
let counter = 0;
async function env() {
  const db = await openDb({ name: `m7-db-${Date.now()}-${counter++}`, migrations });
  const e = {
    db, repos: createRepos(db, 'test'), svc: createCourseService(db), notes: createNotesService(db), results: createResultsService(db),
    store: createStore({ dbStatus: 'ready', settings: { ...DEFAULT_SETTINGS } }), announced: [],
  };
  e.announce = (m) => e.announced.push(m);
  return e;
}
async function seed(e) {
  await e.svc.install(parsePack(SAMPLE_TEXT).pack);
  await e.repos.progress.put({ id: `${SID}:intro`, courseId: SID, lessonId: 'intro', lessonTitle: 'مقدمه', status: 'done', updatedAt: 2000, completedAt: 2000 });
  await e.notes.addNote({ courseId: SID, lessonId: 'intro', text: 'یادداشت من <img src=x onerror=alert(1)>', lessonTitle: 'مقدمه', courseTitle: 'دوره' });
  await e.notes.toggleBookmark({ courseId: SID, lessonId: 'intro', lessonTitle: 'مقدمه', courseTitle: 'دوره' });
  await e.results.saveQuiz({ courseId: SID, lessonId: 'wrap-up', blockId: 'quiz-basics', score: 80 });
  await e.results.saveChecklist({ courseId: SID, lessonId: 'prompts', blockId: 'ex-prompt', kind: 'exercise', checked: [0, 1], text: '' });
  await e.repos.settings.set('fontScale', 'lg');
}
const total = (b) => BACKUP_STORES.reduce((n, k) => n + b.data[k].length, 0);
const fresh = (b) => JSON.parse(JSON.stringify(b));

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

/* ───────── backup: خروجی ───────── */
test('export: فقط storeهای کاربر؛ بدون packs/courses/licenses و با قالب درست', async () => {
  const e = await env(); await seed(e);
  const b = await exportBackup(e.db, { appVersion: 'x', now: 123 });
  eq(b.format, BACKUP_FORMAT); eq(b.schemaVersion, BACKUP_VERSION); eq(b.createdAt, 123); eq(b.skipped, 0);
  eq(JSON.stringify(Object.keys(b.data)), JSON.stringify(BACKUP_STORES));
  ok(b.data.progress.length === 1 && b.data.notes.length === 1 && b.data.bookmarks.length === 1);
  ok(b.data.quizResults.length === 2 && b.data.settings.length >= 1);
  ok(!serializeBackup(b).includes('sample-pack'), 'no course content');
});
test('export: رکورد ناسازگار حذف و در skipped شمرده می‌شود', async () => {
  const e = await env(); await seed(e);
  await e.repos.progress.put({ id: 'bad', courseId: 'x', lessonId: 'y', status: 'weird', updatedAt: 1 });
  const b = await exportBackup(e.db);
  eq(b.skipped, 1); eq(b.data.progress.length, 1);
});
test('backupFilename: الگوی ثابت', () => {
  eq(backupFilename(new Date(2026, 0, 5, 9, 7)), 'aihub-backup-20260105-0907.json');
});

/* ───────── backup: خواندن ───────── */
test('round-trip: export → serialize → parse یکسان است', async () => {
  const e = await env(); await seed(e);
  const b = await exportBackup(e.db, { now: 5 });
  const { backup, summary } = parseBackup(serializeBackup(b));
  eq(JSON.stringify(backup.data), JSON.stringify(b.data));
  eq(summary.notes, 1); eq(summary.quizResults, 2);
});
test('parse: خطاهای ورودی (خالی، غیرJSON، فرمت دیگر، نسخه جدیدتر، حجم)', () => {
  eq(codeOf(() => parseBackup('')), 'notJson');
  eq(codeOf(() => parseBackup(null)), 'notJson');
  eq(codeOf(() => parseBackup('{oops')), 'notJson');
  eq(codeOf(() => parseBackup('[]')), 'notBackup');
  eq(codeOf(() => parseBackup('{"format":"other","data":{}}')), 'notBackup');
  eq(codeOf(() => parseBackup(JSON.stringify({ format: BACKUP_FORMAT, schemaVersion: 99, data: {} }))), 'newerVersion');
  eq(codeOf(() => parseBackup(JSON.stringify({ format: BACKUP_FORMAT, schemaVersion: 0, data: {} }))), 'notBackup');
  eq(codeOf(() => parseBackup('x'.repeat(21 * 1024 * 1024))), 'tooLarge');
});
const mk = (data) => JSON.stringify({ format: BACKUP_FORMAT, schemaVersion: 1, data });
const GOOD_PROGRESS = { id: 'abc:l1', courseId: 'abc', lessonId: 'l1', status: 'done', updatedAt: 5, completedAt: 5 };
test('parse: یک رکورد خراب کل فایل را رد می‌کند (badData)', () => {
  eq(codeOf(() => parseBackup(mk({ progress: [GOOD_PROGRESS, { ...GOOD_PROGRESS, id: 'abc:zzz' }] }))), 'badData'); // id ناسازگار
  eq(codeOf(() => parseBackup(mk({ progress: [{ ...GOOD_PROGRESS, status: 'x' }] }))), 'badData');
  eq(codeOf(() => parseBackup(mk({ progress: [GOOD_PROGRESS, GOOD_PROGRESS] }))), 'badData'); // تکراری
  eq(codeOf(() => parseBackup(mk({ progress: 'nope' }))), 'badData');
  eq(codeOf(() => parseBackup(mk({ notes: [{ id: 'abc:l1:n', courseId: 'abc', lessonId: 'l1', text: '   ', createdAt: 1, updatedAt: 1 }] }))), 'badData');
  eq(codeOf(() => parseBackup(mk({ settings: [{ key: 'fontScale', value: 'huge' }] }))), 'badData');
  eq(codeOf(() => parseBackup(mk({ quizResults: [{ id: 'a\0b\0c', courseId: 'a', lessonId: 'b', blockId: 'c', kind: 'quiz', last: 150, best: 1, attempts: 1, updatedAt: 1 }] }))), 'badData');
  eq(codeOf(() => parseBackup(mk({ bookmarks: [{ id: 'abc:l1#x y', courseId: 'abc', lessonId: 'l1', blockId: 'x y', createdAt: 1 }] }))), 'badData');
});
test('parse: فیلد ناشناخته و storeهای ناشناخته نادیده؛ __proto__ آلوده نمی‌کند', () => {
  const evil = `{"format":"${BACKUP_FORMAT}","schemaVersion":1,"__proto__":{"polluted":1},"data":{"__proto__":{"x":1},"constructor":{"prototype":{"y":1}},"progress":[{"id":"abc:l1","courseId":"abc","lessonId":"l1","status":"done","updatedAt":5,"completedAt":5,"__proto__":{"z":1},"extra":"drop"}],"packs":[{"id":"evil"}]}}`;
  const { backup } = parseBackup(evil);
  eq(backup.data.progress.length, 1); eq(backup.data.progress[0].extra, undefined);
  eq(backup.data.packs, undefined); eq({}.polluted, undefined); eq({}.x, undefined); eq({}.y, undefined); eq({}.z, undefined);
});
test('parse: HTML در یادداشت فقط متن می‌ماند و در UI متن خام نمایش داده می‌شود', async () => {
  const e = await env(); await seed(e);
  const b = await exportBackup(e.db);
  ok(b.data.notes[0].text.includes('<img'));
  eq(parseBackup(serializeBackup(b)).backup.data.notes[0].text, b.data.notes[0].text);
});

/* ───────── backup: بازیابی ───────── */
test('restore merge: روی DB خالی همه چیز اضافه می‌شود', async () => {
  const a = await env(); await seed(a);
  const b = parseBackup(serializeBackup(await exportBackup(a.db))).backup;
  const e = await env();
  const rep = await restoreBackup(e.db, b, { mode: 'merge' });
  eq(rep.progress.added, 1); eq(rep.notes.added, 1); eq(rep.quizResults.added, 2);
  eq((await e.repos.progress.all()).length, 1);
  eq((await e.repos.settings.all()).fontScale, 'lg');
});
test('restore merge: رکورد تازه‌تر برنده؛ آزمون بهترین نمره و بیشترین تلاش', async () => {
  const e = await env(); await seed(e);
  const b = fresh(await exportBackup(e.db));
  b.data.progress[0].status = 'started'; b.data.progress[0].updatedAt = 1000; // قدیمی‌تر از DB (2000)
  b.data.progress[0].completedAt = null;
  const q = b.data.quizResults.find((r) => r.kind === 'quiz');
  q.best = 95; q.attempts = 7; q.last = 40; q.updatedAt = 1; // قدیمی ولی best/attempts بیشتر
  const rep = await restoreBackup(e.db, parseBackup(serializeBackup(b)).backup, { mode: 'merge' });
  eq(rep.progress.kept, 1);
  eq((await e.repos.progress.all())[0].status, 'done');
  const after = (await e.repos.quizResults.all()).find((r) => r.kind === 'quiz');
  eq(after.best, 95); eq(after.attempts, 7); eq(after.last, 80);
});
test('restore merge: فایل تازه‌تر ولی با best/attempts کمتر، رکورد بهتر DB را پایین نمی‌آورد', async () => {
  const e = await env(); await seed(e);
  await e.results.saveQuiz({ courseId: SID, lessonId: 'wrap-up', blockId: 'quiz-basics', score: 100 });
  const b = fresh(await exportBackup(e.db));
  const q = b.data.quizResults.find((r) => r.kind === 'quiz');
  q.best = 50; q.attempts = 1; q.last = 50; q.updatedAt += 9999; // تازه‌تر، ولی ضعیف‌تر
  await restoreBackup(e.db, parseBackup(serializeBackup(b)).backup, { mode: 'merge' });
  const after = (await e.repos.quizResults.all()).find((r) => r.kind === 'quiz');
  eq(after.best, 100); eq(after.attempts, 2); eq(after.last, 50);
});
test('restore merge: رکورد تازه‌تر فایل جایگزین می‌شود', async () => {
  const e = await env(); await seed(e);
  const b = fresh(await exportBackup(e.db));
  b.data.notes[0].text = 'ویرایش جدیدتر'; b.data.notes[0].updatedAt += 5000;
  const rep = await restoreBackup(e.db, parseBackup(serializeBackup(b)).backup);
  eq(rep.notes.updated, 1);
  eq((await e.repos.notes.all())[0].text, 'ویرایش جدیدتر');
});
test('restore replace: داده‌های فعلی که در فایل نیستند پاک می‌شوند', async () => {
  const e = await env(); await seed(e);
  const b = fresh(await exportBackup(e.db));
  b.data.notes = []; b.data.bookmarks = [];
  await restoreBackup(e.db, parseBackup(serializeBackup(b)).backup, { mode: 'replace' });
  eq((await e.repos.notes.all()).length, 0); eq((await e.repos.bookmarks.all()).length, 0);
  eq((await e.repos.progress.all()).length, 1);
});
test('restore: دوره‌های نصب‌شده (packs/courses) هرگز دست نمی‌خورند', async () => {
  const e = await env(); await seed(e);
  const b = parseBackup(serializeBackup(await exportBackup(e.db))).backup;
  await restoreBackup(e.db, b, { mode: 'replace' });
  eq((await e.repos.courses.all()).length, 1);
});
test('restore: mode نامعتبر رد می‌شود', async () => {
  const e = await env();
  eq(await rejCode(() => restoreBackup(e.db, { data: {} }, { mode: 'drop' })), 'badMode');
});
test('restore: اتمیک — خطا وسط کار هیچ تغییری باقی نمی‌گذارد', async () => {
  const e = await env(); await seed(e);
  const before = JSON.stringify([await e.repos.progress.all(), await e.repos.notes.all()]);
  const b = parseBackup(serializeBackup(await exportBackup(e.db))).backup;
  b.data.progress = [{ ...b.data.progress[0], id: 'new:x', courseId: 'new', lessonId: 'x' }];
  b.data.notes = [null]; // وسط حلقه می‌ترکد (پس از پاک‌شدن در replace)
  await rejCode(() => restoreBackup(e.db, b, { mode: 'replace' }));
  eq(JSON.stringify([await e.repos.progress.all(), await e.repos.notes.all()]), before);
});
test('backupDue: بدون داده هشدار نیست؛ بدون پشتیبان یا قدیمی هست', () => {
  const now = 100 * 86400000;
  eq(backupDue({ lastBackupAt: null, recordCount: 0, now }), false);
  eq(backupDue({ lastBackupAt: null, recordCount: 3, now }), true);
  eq(backupDue({ lastBackupAt: now - 86400000, recordCount: 3, now }), false);
  eq(backupDue({ lastBackupAt: now - (REMINDER_DAYS + 1) * 86400000, recordCount: 3, now }), true);
  eq(backupDue({ lastBackupAt: now - REMINDER_DAYS * 86400000, recordCount: 3, now }), false);
});

/* ───────── UI تنظیمات ───────── */
const fileOf = (text, size) => ({ size: size ?? text.length, text: async () => text });
function setFile(input, file) { Object.defineProperty(input, 'files', { value: [file], configurable: true }); input.dispatchEvent(new window.Event('change')); }
const settingsView = (e, extra = {}) => renderSettings({
  store: e.store, repos: e.repos, announce: e.announce, saveSetting: async () => ({ persisted: true }),
  pwa: createPwa({ nav: {}, win: {} }), installer: createInstaller({ win: window, nav: { userAgent: 'x' } }), ...extra,
});

test('UI: دانلود پشتیبان فایل معتبر می‌سازد و lastBackupAt ذخیره می‌شود', async () => {
  const e = await env(); await seed(e);
  const calls = [];
  const r = await settingsView(e, { download: (name, text) => calls.push({ name, text }) });
  const btn = [...r.el.querySelectorAll('button')].find((b) => b.textContent.includes('دانلود پشتیبان'));
  btn.click();
  await waitFor(() => calls.length === 1);
  ok(/^aihub-backup-\d{8}-\d{4}\.json$/.test(calls[0].name));
  eq(parseBackup(calls[0].text).summary.notes, 1);
  await waitFor(async () => true);
  await waitFor(() => r.el.querySelector('.bk__last').textContent.includes('آخرین پشتیبان'));
  ok((await e.repos.meta.get('lastBackupAt')).value > 0);
});
test('UI: هشدار یادآوری فقط با داده و بدون پشتیبان دیده می‌شود', async () => {
  const empty = await env();
  ok((await settingsView(empty)).el.querySelector('.bk .alert').hidden);
  const e = await env(); await seed(e);
  ok(!(await settingsView(e)).el.querySelector('.bk .alert').hidden);
});
async function openImport(e, text, extra = {}) {
  const reloads = [];
  const r = await settingsView(e, { reload: () => reloads.push(1), readText: async (f) => f.text(), ...extra });
  const input = r.el.querySelector('input[type=file]');
  setFile(input, fileOf(text));
  return { r, reloads };
}
test('UI: فایل خراب پیام خطا نشان می‌دهد و چیزی بازیابی نمی‌شود', async () => {
  const e = await env();
  const { r } = await openImport(e, '{bad');
  await waitFor(() => !r.el.querySelector('.bk .save-error').hidden);
  ok(r.el.querySelector('.bk .save-error').textContent.includes('JSON'));
  ok(r.el.querySelector('.bk__preview').hidden);
  eq((await e.repos.progress.all()).length, 0);
});
test('UI: فایل خیلی بزرگ پیش از خواندن رد می‌شود', async () => {
  const e = await env(); let read = false;
  const r = await settingsView(e, { readText: async () => { read = true; return ''; } });
  setFile(r.el.querySelector('input[type=file]'), fileOf('x', 999 * 1024 * 1024));
  await waitFor(() => !r.el.querySelector('.bk .save-error').hidden);
  eq(read, false);
});
test('UI: ادغام — پیش‌نمایش، بازیابی، گزارش و reload', async () => {
  const a = await env(); await seed(a);
  const text = serializeBackup(await exportBackup(a.db));
  const e = await env();
  const { r, reloads } = await openImport(e, text);
  await waitFor(() => !r.el.querySelector('.bk__preview').hidden);
  ok(r.el.querySelector('.bk__preview').textContent.includes('یادداشت‌ها'));
  eq(r.el.querySelector('input[name=bk-mode]:checked').value, 'merge'); // پیش‌فرض امن
  [...r.el.querySelectorAll('.bk__preview button')].find((b) => b.textContent === 'بازیابی').click();
  await waitFor(() => reloads.length === 1, 4000);
  eq((await e.repos.notes.all()).length, 1);
  ok(e.announced.some((m) => m.includes('بازیابی انجام شد')));
});
test('UI: جایگزینی کامل نیازمند تأیید دوم است؛ انصراف چیزی را عوض نمی‌کند', async () => {
  const a = await env(); await seed(a);
  const text = serializeBackup(await exportBackup(a.db));
  const e = await env();
  await e.repos.progress.put({ id: 'keep:me', courseId: 'keep', lessonId: 'me', status: 'done', updatedAt: 1, completedAt: 1 });
  const { r, reloads } = await openImport(e, text);
  await waitFor(() => !r.el.querySelector('.bk__preview').hidden);
  const radio = r.el.querySelector('input[name=bk-mode][value=replace]');
  radio.checked = true; radio.dispatchEvent(new window.Event('change'));
  const go = [...r.el.querySelectorAll('.bk__preview button')].find((b) => b.textContent === 'بازیابی');
  go.click();
  await sleep(50);
  ok(!r.el.querySelector('.bk__confirm').hidden, 'confirm shown'); eq((await e.repos.progress.all()).length, 1); eq(reloads.length, 0);
  [...r.el.querySelectorAll('.bk__confirm button')].find((b) => b.textContent === 'انصراف').click();
  ok(r.el.querySelector('.bk__confirm').hidden);
  go.click();
  [...r.el.querySelectorAll('.bk__confirm button')].find((b) => b.textContent.includes('بله')).click();
  await waitFor(() => reloads.length === 1, 4000);
  const ids = (await e.repos.progress.all()).map((p) => p.id);
  eq(ids.includes('keep:me'), false); eq(ids.includes(`${SID}:intro`), true);
});
test('UI: HTML داخل یادداشت پشتیبان هرگز به عنصر تبدیل نمی‌شود', async () => {
  const a = await env(); await seed(a);
  const { r } = await openImport(await env(), serializeBackup(await exportBackup(a.db)));
  await sleep(100);
  eq(r.el.querySelectorAll('img').length, 0);
});
test('UI: بدون DB، پنل پشتیبان نمایش داده نمی‌شود و صفحه خراب نمی‌شود', async () => {
  const store = createStore({ dbStatus: 'error', settings: { ...DEFAULT_SETTINGS } });
  const r = await renderSettings({ store, repos: null, saveSetting: async () => ({}) });
  ok(!r.el.querySelector('.bk'));
});

/* ───────── PWA: register ───────── */
function fakeNav({ controller = null, reg = {} } = {}) {
  const listeners = {};
  const sw = {
    controller,
    addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); },
    emit: (t) => (listeners[t] || []).forEach((f) => f()),
    register: async () => registration,
  };
  const regL = {};
  const registration = {
    active: null, waiting: null, installing: null,
    addEventListener: (t, fn) => { (regL[t] ||= []).push(fn); },
    update: async () => {}, ...reg,
  };
  return { nav: { serviceWorker: sw }, sw, registration, regEmit: (t) => (regL[t] || []).forEach((f) => f()) };
}
const fakeWorker = (state = 'installing') => { const l = []; return { state, postMessage(m) { this.msg = m; }, addEventListener: (_, f) => l.push(f), fire(s) { this.state = s; l.forEach((f) => f()); } }; };

test('pwa: بدون پشتیبانی/غیرامن وضعیت درست', async () => {
  const p1 = createPwa({ nav: {}, win: {} }); eq((await p1.register()).status, 'unsupported');
  const f = fakeNav(); const p2 = createPwa({ nav: f.nav, win: { isSecureContext: false } }); eq((await p2.register()).status, 'insecure');
});
test('pwa: ثبت موفق؛ اولین نصب → offlineReady بدون نوار به‌روزرسانی', async () => {
  const f = fakeNav(); const p = createPwa({ nav: f.nav, win: {} });
  await p.register(); eq(p.state.status, 'registered'); eq(p.state.offlineReady, false);
  const w = fakeWorker(); f.registration.installing = w; f.regEmit('updatefound'); w.fire('installed');
  eq(p.state.offlineReady, true); eq(p.state.updateAvailable, false);
});
test('pwa: نسخه جدید با وجود controller → updateAvailable؛ applyUpdate پیام SKIP_WAITING و یک reload', async () => {
  const f = fakeNav({ controller: {} }); let reloads = 0;
  const p = createPwa({ nav: f.nav, win: { location: { reload: () => reloads++ } } });
  await p.register();
  const w = fakeWorker(); f.registration.installing = w; f.regEmit('updatefound'); w.fire('installed');
  eq(p.state.updateAvailable, true);
  eq(p.applyUpdate(), true); eq(w.msg.type, 'SKIP_WAITING'); eq(reloads, 0, 'تا فعال‌شدن reload نمی‌شود');
  f.sw.emit('controllerchange'); f.sw.emit('controllerchange');
  eq(reloads, 1);
});
test('pwa: worker در حال انتظار از قبل (waiting) هم شناسایی می‌شود؛ بدون waiting applyUpdate=false', async () => {
  const w = fakeWorker('installed');
  const f = fakeNav({ controller: {}, reg: { waiting: w, active: {} } }); const p = createPwa({ nav: f.nav, win: {} });
  eq(p.applyUpdate(), false);
  await p.register(); eq(p.state.updateAvailable, true); eq(p.state.offlineReady, true);
});
test('pwa: خطای ثبت → status=error و پرتاب نمی‌شود', async () => {
  const f = fakeNav(); f.sw.register = async () => { throw new Error('boom'); };
  const orig = console.error; console.error = () => {};
  try { eq((await createPwa({ nav: f.nav, win: {} }).register()).status, 'error'); } finally { console.error = orig; }
});
test('pwa: checkForUpdate ساعتی محدود است؛ force دور می‌زند؛ آفلاین خطا نیست', async () => {
  let t = 1e9, n = 0; const f = fakeNav({ reg: { update: async () => { n++; } } });
  const p = createPwa({ nav: f.nav, win: {}, now: () => t });
  eq(await p.checkForUpdate(), false); // هنوز ثبت نشده
  await p.register();
  eq(await p.checkForUpdate(), true); eq(await p.checkForUpdate(), false); eq(n, 1);
  eq(await p.checkForUpdate({ force: true }), true); eq(n, 2);
  t += 3600001; eq(await p.checkForUpdate(), true);
  f.registration.update = async () => { throw new Error('offline'); };
  eq(await p.checkForUpdate({ force: true }), false);
});

/* ───────── PWA: install / storage ───────── */
const fakeWin = (standalone = false) => { const l = {}; return { addEventListener: (t, f) => { l[t] = f; }, matchMedia: () => ({ matches: standalone }), fire: (t, e) => l[t](e) }; };
test('install: حالت‌ها unavailable → prompt → installed، و ios', async () => {
  const w = fakeWin(); const i = createInstaller({ win: w, nav: { userAgent: 'Linux' } });
  eq(i.mode(), 'unavailable'); eq(await i.prompt(), 'unavailable');
  let prevented = false; const ev = { preventDefault() { prevented = true; }, prompt: async () => {}, userChoice: Promise.resolve({ outcome: 'accepted' }) };
  w.fire('beforeinstallprompt', ev); ok(prevented); eq(i.mode(), 'prompt');
  eq(await i.prompt(), 'accepted'); eq(i.mode(), 'unavailable'); // رویداد فقط یک بار قابل استفاده است
  w.fire('appinstalled'); eq(i.mode(), 'installed');
  eq(createInstaller({ win: fakeWin(), nav: { userAgent: 'iPhone OS' } }).mode(), 'ios');
  eq(createInstaller({ win: fakeWin(true), nav: { userAgent: 'iPhone' } }).mode(), 'installed');
  w.fire; const d = createInstaller({ win: fakeWin(), nav: {} }); const w2 = fakeWin(); const i2 = createInstaller({ win: w2, nav: {} });
  w2.fire('beforeinstallprompt', { preventDefault() {}, prompt: async () => {}, userChoice: Promise.resolve({ outcome: 'dismissed' }) });
  eq(await i2.prompt(), 'dismissed'); ok(d);
});
test('storage: وضعیت، درخواست، فرمت حجم، و نبودن API', async () => {
  eq((await storageStatus({})).supported, false);
  const nav = { storage: { persisted: async () => false, persist: async () => true, estimate: async () => ({ usage: 2048, quota: 1e9 }) } };
  const s = await storageStatus(nav); eq(s.supported, true); eq(s.persisted, false); eq(s.usage, 2048);
  eq(await requestPersistence(nav), true); eq(await requestPersistence({}), false);
  eq(await requestPersistence({ storage: { persist: async () => { throw new Error('x'); } } }), false);
  eq(formatBytes(500), '1 KB'); eq(formatBytes(5 * 1024 * 1024), '5.0 MB'); eq(formatBytes(NaN), '');
});
test('UI: پنل PWA وضعیت آفلاین و نصب و ذخیره‌سازی را نشان می‌دهد؛ دکمه‌ها واقعاً کار می‌کنند', async () => {
  const e = await env();
  const f = fakeNav({ controller: {}, reg: { active: {} } }); let checks = 0; f.registration.update = async () => { checks++; };
  const pwa = createPwa({ nav: f.nav, win: {} }); await pwa.register();
  const w = fakeWin(); const installer = createInstaller({ win: w, nav: { userAgent: 'x' } });
  const prompted = []; w.fire('beforeinstallprompt', { preventDefault() {}, prompt: async () => prompted.push(1), userChoice: Promise.resolve({ outcome: 'accepted' }) });
  const nav = { onLine: true, storage: { persisted: async () => false, persist: async () => true, estimate: async () => ({ usage: 1024 * 1024, quota: 1024 ** 3 }) } };
  const { pwaPanel } = await import('../js/views/pwa-panel.js');
  const panel = pwaPanel({ pwa, installer, announce: e.announce, nav });
  const text = () => panel.el.textContent;
  ok(text().includes('آماده؛ بدون اینترنت'));
  await waitFor(() => text().includes('غیرفعال'));
  const btn = (label) => [...panel.el.querySelectorAll('button')].find((b) => b.textContent.includes(label));
  ok(!btn('نصب روی این دستگاه').hidden);
  btn('نصب روی این دستگاه').click(); await waitFor(() => prompted.length === 1);
  await waitFor(() => btn('نصب روی این دستگاه').hidden);
  nav.storage.persisted = async () => true;
  btn('درخواست ذخیره‌سازی پایدار').click(); await waitFor(() => text().includes('فعال') && btn('درخواست ذخیره‌سازی پایدار').hidden);
  btn('بررسی نسخه جدید').click(); await waitFor(() => checks === 1);
  await waitFor(() => e.announced.some((m) => m.includes('به‌روز است')));
  panel.destroy();
});

/* ───────── نوار به‌روزرسانی ───────── */
test('shell: نوار به‌روزرسانی فقط با اقدام کاربر اعمال می‌شود و «بعداً» آن را می‌بندد', () => {
  const root = document.createElement('div'); document.body.append(root);
  const shell = buildShell(root, { href: (p) => '#' + p });
  const bar = root.querySelector('.update-bar'); ok(bar.hidden);
  let applied = 0; shell.showUpdate({ onApply: () => applied++ });
  ok(!bar.hidden); eq(applied, 0);
  [...bar.querySelectorAll('button')].find((b) => b.textContent === 'بعداً').click(); ok(bar.hidden); eq(applied, 0);
  shell.showUpdate({ onApply: () => applied++ });
  [...bar.querySelectorAll('button')].find((b) => b.textContent === 'به‌روزرسانی').click(); eq(applied, 1);
  root.remove();
});
test('محافظ: صفحه تنظیمات متن null/undefined/NaN ندارد', async () => {
  const e = await env(); await seed(e);
  const r = await settingsView(e);
  ok(!/\bnull\b|\bundefined\b|NaN/.test(r.el.textContent), r.el.textContent.match(/.{0,20}(null|undefined|NaN).{0,20}/));
});

export async function runTests({ sampleText } = {}) {
  SAMPLE_TEXT = sampleText;
  const results = [];
  for (const { name, fn } of tests) {
    try { await fn(); results.push({ name, ok: true }); } catch (err) { results.push({ name, ok: false, error: err.message }); }
  }
  return results;
}
