// تست‌های M3 — نصب pack، پیشرفت، resume، کتابخانه/import، صفحه دوره و درس
import { createStore } from '../js/core/store.js';
import { matchRoute } from '../js/core/router.js';
import { DEFAULT_SETTINGS } from '../js/core/prefs.js';
import { openDb } from '../js/db/idb.js';
import { migrations, STORE_NAMES, DB_VERSION } from '../js/db/schema.js';
import { createRepos } from '../js/db/repos.js';
import { createCourseService, compareVersions, DowngradeError } from '../js/db/courses.js';
import { courseStats, resumeTarget, neighbors } from '../js/features/progress.js';
import { parsePack, lessonIndex } from '../js/packs/loader.js';
import { render as renderLibrary } from '../js/views/library.js';
import { render as renderCourse } from '../js/views/course.js';
import { render as renderLesson } from '../js/views/lesson.js';
import { render as renderDashboard } from '../js/views/dashboard.js';
import { ROUTES, NOT_FOUND } from '../js/app.js';
import { hasKey } from '../js/core/i18n-fa.js';
import { buildShell } from '../js/views/shell.js';

const eq = (a, b, msg = '') => { if (!Object.is(a, b)) throw new Error(`${msg} expected ${JSON.stringify(b)} but got ${JSON.stringify(a)}`); };
const ok = (v, msg = 'expected truthy') => { if (!v) throw new Error(msg); };
const rejectsWith = async (fn, Type) => {
  try { await fn(); } catch (err) { if (!Type || err instanceof Type) return err; throw err; }
  throw new Error('expected rejection');
};
async function waitFor(fn, ms = 3000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (fn()) return; } catch { /* هنوز آماده نیست */ }
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('waitFor timeout');
}

let SAMPLE_TEXT = '';
const samplePack = () => parsePack(SAMPLE_TEXT).pack;
const variant = (id, version, mutate) => {
  const p = JSON.parse(SAMPLE_TEXT);
  p.manifest.id = id; p.manifest.version = version;
  if (mutate) mutate(p);
  return p;
};
const SID = 'sample-motion-lab';

let counter = 0;
async function env() {
  const name = `m3-db-${Date.now()}-${counter++}`;
  const db = await openDb({ name, migrations });
  const repos = createRepos(db, 'test');
  const svc = createCourseService(db);
  const store = createStore({ dbStatus: 'ready', settings: { ...DEFAULT_SETTINGS } });
  const calls = [];
  const announced = [];
  const router = { href: (p) => '#' + p, navigate: (p) => { calls.push(p); }, calls };
  return { db, repos, svc, store, router, announced, announce: (m) => announced.push(m), ctx: null };
}
const view = (e, extra = {}) => ({ store: e.store, repos: e.repos, svc: e.svc, router: e.router, announce: e.announce, ...extra });

const fileLike = (text, size = text.length) => ({ name: 'pack.json', size, text: async () => text });
async function pickFile(el, file) {
  const input = el.querySelector('input[type=file]');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change'));
}
const statusText = (el) => el.querySelector('.import-status').textContent;

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

/* ───────── منطق خالص پیشرفت ───────── */
const IDX = ['a', 'b', 'c', 'd'].map((id) => ({ lessonId: id, title: id.toUpperCase() }));
const P = (obj) => new Map(Object.entries(obj).map(([id, [status, updatedAt]]) => [id, { status, updatedAt }]));

test('progress/courseStats: شمارش، درصد گرد، یتیم‌ها و دوره خالی', () => {
  const s = courseStats(['a', 'b', 'c'], P({ a: ['done', 1], b: ['started', 2], zzz: ['done', 3] }));
  eq(s.total, 3); eq(s.done, 1); eq(s.started, 1); eq(s.percent, 33);
  eq(courseStats([], new Map()).percent, 0);
  eq(courseStats(['a', 'b'], P({ a: ['done', 1], b: ['done', 2] })).percent, 100);
});
test('progress/resumeTarget: start / resume / next / review / خالی', () => {
  eq(resumeTarget([], new Map()), null);
  let r = resumeTarget(IDX, new Map()); eq(r.kind, 'start'); eq(r.lesson.lessonId, 'a');
  r = resumeTarget(IDX, P({ b: ['started', 5] })); eq(r.kind, 'resume'); eq(r.lesson.lessonId, 'b');
  r = resumeTarget(IDX, P({ a: ['done', 1], b: ['done', 2] })); eq(r.kind, 'next'); eq(r.lesson.lessonId, 'c');
  r = resumeTarget(IDX, P({ a: ['done', 1], b: ['done', 2], c: ['done', 3], d: ['done', 4] })); eq(r.kind, 'review'); eq(r.lesson.lessonId, 'a');
});
test('progress/resumeTarget: آخرین درس تمام‌شده → اولین درس باز بعد از آن؛ در غیر این صورت اولین باز کل دوره', () => {
  // آخرین لمس: c (done)، d باز است → d
  eq(resumeTarget(IDX, P({ a: ['done', 1], c: ['done', 9] })).lesson.lessonId, 'd');
  // آخرین لمس: d (done)، بعد از آن چیزی نیست → به ابتدا برمی‌گردد (b باز است)
  eq(resumeTarget(IDX, P({ a: ['done', 1], c: ['done', 2], d: ['done', 9] })).lesson.lessonId, 'b');
  // درس قدیمی‌تر started و جدیدتر done → هنوز «next» از جدیدترین
  const r = resumeTarget(IDX, P({ a: ['started', 1], b: ['done', 5] })); eq(r.kind, 'next'); eq(r.lesson.lessonId, 'c');
});
test('progress/neighbors', () => {
  let n = neighbors(IDX, 'b'); eq(n.prev.lessonId, 'a'); eq(n.next.lessonId, 'c'); eq(n.position, 2); eq(n.total, 4);
  n = neighbors(IDX, 'a'); eq(n.prev, null); n = neighbors(IDX, 'd'); eq(n.next, null);
  n = neighbors(IDX, 'zzz'); eq(n.position, 0); eq(n.prev, null);
});
test('compareVersions', () => {
  eq(compareVersions('1.0.0', '1.0.1'), -1); eq(compareVersions('1.10.0', '1.9.0'), 1); eq(compareVersions('2.0.0', '2.0.0'), 0);
  eq(compareVersions('0.9.9', '1.0.0'), -1);
});

/* ───────── schema v2 ───────── */
test('db: migration v1→v2 داده‌های قبلی را حفظ می‌کند و store جدید را می‌سازد', async () => {
  const name = `m3-mig-${Date.now()}`;
  let db = await openDb({ name, migrations: migrations.slice(0, 1) });
  eq(db.version, 1); ok(!db.objectStoreNames.contains('packs'));
  const tx = db.transaction(['courses', 'progress', 'settings'], 'readwrite');
  tx.objectStore('courses').put({ id: 'old', title: 'قدیمی', lessonIds: [] });
  tx.objectStore('progress').put({ id: 'old:l1', courseId: 'old', lessonId: 'l1', status: 'done' });
  tx.objectStore('settings').put({ key: 'fontScale', value: 'lg' });
  await new Promise((r) => { tx.oncomplete = r; }); db.close();

  db = await openDb({ name, migrations });
  eq(db.version, DB_VERSION); eq(DB_VERSION, 2); ok(db.objectStoreNames.contains('packs'));
  const repos = createRepos(db);
  eq((await repos.courses.get('old')).title, 'قدیمی');
  eq((await repos.progress.byIndex('courseId', 'old')).length, 1, 'ایندکس progress سالم است');
  eq((await repos.settings.all()).fontScale, 'lg');
  for (const s of STORE_NAMES) ok(db.objectStoreNames.contains(s), s);
  db.close();
});
test('shell: اسم برند کامل و قابل‌خواندن برای صفحه‌خوان (AI جدا استایل می‌شود)', () => {
  const root = document.createElement('div');
  buildShell(root, { href: (p) => '#' + p });
  const names = [...root.querySelectorAll('.brand__name')];
  eq(names.length, 1, 'سایدبار (در موبایل drawer)');
  for (const n of names) {
    ok(n.textContent.startsWith('AIhub Academy'), n.textContent);
    eq(n.querySelector('.brand__ai').textContent, 'AI');
    eq(n.querySelector('[aria-hidden]'), null, 'نام برند نباید از صفحه‌خوان پنهان شود');
  }
});
test('i18n: کلیدهای store و صفحه‌های M3 تعریف شده‌اند', () => {
  for (const s of STORE_NAMES) ok(hasKey(`store.${s}`), s);
  for (const k of ['lib.import', 'lib.import.ok', 'lib.import.updated', 'lib.import.downgrade', 'lib.import.fail', 'lib.import.tooBig', 'lib.import.readError',
    'lib.import.saveError', 'course.start', 'course.resume', 'course.next', 'course.review', 'course.remove.confirm', 'lesson.done', 'lesson.done.on',
    'lesson.prev', 'lesson.next', 'lesson.finish', 'dash.continue', 'dash.empty.cta', 'course.notfound.title', 'lesson.notfound.title']) ok(hasKey(k), k);
});
test('routes: مسیرهای دوره/درس، پارامترها و آیتم فعال ناوبری', () => {
  const m = matchRoute(ROUTES, '/course/sample-motion-lab/lesson/wrap-up');
  eq(m.route.name, 'lesson'); eq(m.params.id, 'sample-motion-lab'); eq(m.params.lid, 'wrap-up'); eq(m.route.nav, 'library');
  eq(matchRoute(ROUTES, '/course/x').route.name, 'course');
  eq(matchRoute(ROUTES, '/course'), null); eq(matchRoute(ROUTES, '/course/a/lesson'), null);
  eq(NOT_FOUND.name, 'notfound');
  for (const r of ROUTES) ok(hasKey(r.titleKey), r.name);
});

/* ───────── سرویس دوره ───────── */
test('svc/install: متادیتا، فهرست، getPack، ترتیب فهرست', async () => {
  const e = await env();
  const res = await e.svc.install(samplePack(), { sizeChars: SAMPLE_TEXT.length });
  eq(res.status, 'installed');
  const m = res.meta;
  eq(m.id, SID); eq(m.lessonCount, 3); eq(m.chapterCount, 2); eq(m.totalMinutes, 25); eq(m.lessonIds.join(','), 'intro,prompts,wrap-up');
  eq(m.version, '0.1.0'); eq(m.sizeChars, SAMPLE_TEXT.length); ok(!('pack' in m), 'متادیتا نباید pack را حمل کند');
  eq((await e.svc.getPack(SID)).manifest.title, samplePack().manifest.title);
  eq(await e.svc.getMeta('nope'), null); eq(await e.svc.getPack('nope'), null);
  await new Promise((r) => setTimeout(r, 5));
  await e.svc.install(variant('second-course', '1.0.0'));
  eq((await e.svc.listCourses()).map((c) => c.id).join(','), 'second-course,' + SID, 'جدیدتر اول');
  eq(await e.repos.packs.count(), 2); eq(await e.repos.courses.count(), 2);
  e.db.close();
});
test('svc/install: نصب مجدد/ارتقا، حفظ importedAt و پیشرفت', async () => {
  const e = await env();
  const first = (await e.svc.install(samplePack())).meta;
  await e.svc.setDone(SID, 'intro', true, 'x');
  await new Promise((r) => setTimeout(r, 5));
  const up = await e.svc.install(variant(SID, '0.2.0', (p) => { p.manifest.title = 'عنوان جدید'; }));
  eq(up.status, 'updated'); eq(up.meta.version, '0.2.0'); eq(up.meta.importedAt, first.importedAt); ok(up.meta.updatedAt > first.updatedAt);
  eq((await e.svc.getPack(SID)).manifest.title, 'عنوان جدید', 'cache باید بعد از نصب معتبر شود');
  eq((await e.svc.progressOf(SID)).get('intro').status, 'done', 'پیشرفت حفظ می‌شود');
  eq((await e.svc.install(variant(SID, '0.2.0'))).status, 'updated', 'همان نسخه دوباره مجاز است');
  eq(await e.repos.courses.count(), 1);
  e.db.close();
});
test('svc/install: نسخه قدیمی‌تر رد می‌شود و هیچ چیز تغییر نمی‌کند (اتمیک)', async () => {
  const e = await env();
  await e.svc.install(variant(SID, '0.2.0', (p) => { p.manifest.title = 'نسخه ۲'; }));
  const err = await rejectsWith(() => e.svc.install(variant(SID, '0.1.0', (p) => { p.manifest.title = 'نسخه ۱'; })), DowngradeError);
  eq(err.installed, '0.2.0'); eq(err.incoming, '0.1.0');
  eq((await e.svc.getMeta(SID)).version, '0.2.0'); eq((await e.svc.getMeta(SID)).title, 'نسخه ۲');
  eq((await e.svc.getPack(SID)).manifest.title, 'نسخه ۲');
  eq(await e.repos.packs.count(), 1);
  e.db.close();
});
test('svc/remove: فقط رکوردهای همان دوره پاک می‌شوند؛ لایسنس می‌ماند', async () => {
  const e = await env();
  await e.svc.install(samplePack()); await e.svc.install(variant('other-course', '1.0.0'));
  for (const id of [SID, 'other-course']) {
    await e.svc.setDone(id, 'intro', true);
    await e.repos.notes.put({ id: `${id}:n1`, courseId: id, lessonId: 'intro' });
    await e.repos.bookmarks.put({ id: `${id}:b1`, courseId: id });
    await e.repos.quizResults.put({ id: `${id}:q1`, courseId: id });
    await e.repos.searchIndex.put({ courseId: id, data: 'x' });
  }
  await e.repos.licenses.put({ courseId: SID, code: 'abc' });
  await e.svc.getPack(SID); // cache را گرم کن
  await e.svc.remove(SID);

  eq(await e.svc.getMeta(SID), null); eq(await e.svc.getPack(SID), null, 'cache باید خالی شود');
  for (const s of ['progress', 'notes', 'bookmarks', 'quizResults']) eq((await e.repos[s].byIndex('courseId', SID)).length, 0, s);
  eq(await e.repos.searchIndex.get(SID), undefined);
  eq((await e.repos.licenses.get(SID)).code, 'abc', 'لایسنس حفظ می‌شود');
  // دوره دیگر دست‌نخورده
  eq((await e.svc.getMeta('other-course')).id, 'other-course'); ok(await e.svc.getPack('other-course'));
  for (const s of ['progress', 'notes', 'bookmarks', 'quizResults']) eq((await e.repos[s].byIndex('courseId', 'other-course')).length, 1, s);
  await e.svc.remove('never-existed'); // خطا نمی‌دهد
  e.db.close();
});
test('svc/progress: touch، عدم تنزل done، toggle، progressAll', async () => {
  const e = await env();
  const a = await e.svc.touchLesson(SID, 'intro', 'عنوان');
  eq(a.status, 'started'); eq(a.lessonTitle, 'عنوان'); eq(a.id, `${SID}:intro`);
  const done = await e.svc.setDone(SID, 'intro', true);
  eq(done.status, 'done'); ok(done.completedAt > 0); eq(done.lessonTitle, 'عنوان', 'عنوان قبلی حفظ می‌شود');
  await new Promise((r) => setTimeout(r, 3));
  const again = await e.svc.touchLesson(SID, 'intro', 'عنوان');
  eq(again.status, 'done', 'باز کردن دوباره، done را پایین نمی‌آورد'); ok(again.updatedAt > done.updatedAt);
  const undone = await e.svc.setDone(SID, 'intro', false);
  eq(undone.status, 'started'); eq(undone.completedAt, null);
  await e.svc.touchLesson('c2-course', 'x');
  const all = await e.svc.progressAll();
  eq(all.size, 2); eq(all.get(SID).size, 1); eq((await e.svc.progressOf('nobody')).size, 0);
  e.db.close();
});
test('svc/getPack: دوبار پشت‌سرهم یک شیء (cache) برمی‌گرداند', async () => {
  const e = await env(); await e.svc.install(samplePack());
  eq(await e.svc.getPack(SID), await e.svc.getPack(SID));
  e.db.close();
});

/* ───────── کتابخانه و import ───────── */
test('library: حالت خالی با دکمه افزودن (input فایل json)', async () => {
  const e = await env();
  const { el } = await renderLibrary(view(e));
  ok(el.querySelector('.empty')); eq(el.querySelector('.course-card'), null);
  const input = el.querySelector('label.btn input[type=file]');
  ok(input); ok(input.getAttribute('accept').includes('.json'));
  ok(el.textContent.includes('۰'));
  e.db.close();
});
test('library: import موفق → کارت دوره، پیام، لینک صحیح، ریست input', async () => {
  const e = await env();
  const { el } = await renderLibrary(view(e));
  await pickFile(el, fileLike(SAMPLE_TEXT));
  await waitFor(() => el.querySelector('.course-card'));
  ok(statusText(el).includes('اضافه شد')); ok(statusText(el).includes(samplePack().manifest.title));
  ok(!/null|undefined/.test(statusText(el)), 'append(null) نباید متن «null» بسازد');
  eq(el.querySelector('.empty'), null);
  eq(el.querySelector('.course-card__title a').getAttribute('href'), `#/course/${SID}`);
  ok(el.querySelector('[role=progressbar]')); eq(el.querySelector('[role=progressbar]').getAttribute('aria-valuenow'), '0');
  eq((await e.svc.listCourses()).length, 1);
  ok(el.querySelector('header').textContent.includes('۱'));
  e.db.close();
});
test('library: import فایل خراب → خطای فارسی با مسیر، چیزی ذخیره نمی‌شود', async () => {
  const e = await env();
  const { el } = await renderLibrary(view(e));
  await pickFile(el, fileLike('{bad json'));
  await waitFor(() => statusText(el).includes('فایل پذیرفته نشد'));
  ok(el.querySelector('.import-status [role=alert]'));
  eq((await e.svc.listCourses()).length, 0);

  const broken = JSON.parse(SAMPLE_TEXT); broken.lessons.prompts.blocks[3].items[1].title = '';
  await pickFile(el, fileLike(JSON.stringify(broken)));
  await waitFor(() => el.querySelector('.issue__path'));
  ok(el.querySelector('.issue__path').textContent.includes('lessons.prompts.blocks[3].items[1].title'));
  eq((await e.svc.listCourses()).length, 0, 'pack نامعتبر ذخیره نمی‌شود');
  e.db.close();
});
test('library: خطاهای زیاد خلاصه می‌شود (حداکثر ۸ مورد + «و N خطای دیگر»)', async () => {
  const e = await env();
  const { el } = await renderLibrary(view(e));
  const many = variant(SID, '0.1.0', (p) => { p.lessons.intro.blocks = Array.from({ length: 20 }, () => ({ type: 'text' })); });
  await pickFile(el, fileLike(JSON.stringify(many)));
  await waitFor(() => el.querySelector('.issue'));
  eq(el.querySelectorAll('.issue').length, 8); ok(statusText(el).includes('خطای دیگر'));
  e.db.close();
});
test('library: فایل خیلی بزرگ بدون خواندن رد می‌شود', async () => {
  const e = await env();
  const { el } = await renderLibrary(view(e));
  let read = false;
  await pickFile(el, { name: 'x.json', size: 41 * 1024 * 1024, text: async () => { read = true; return ''; } });
  await waitFor(() => statusText(el).includes('حجم فایل'));
  eq(read, false, 'نباید فایل بزرگ را در حافظه بخواند');
  e.db.close();
});
test('library: خطای خواندن فایل', async () => {
  const e = await env();
  const { el } = await renderLibrary(view(e));
  await pickFile(el, { name: 'x.json', size: 10, text: async () => { throw new Error('io'); } });
  await waitFor(() => statusText(el).includes('خواندن فایل ممکن نشد'));
  e.db.close();
});
test('library: نسخه قدیمی‌تر → پیام downgrade و دوره قبلی سالم', async () => {
  const e = await env();
  await e.svc.install(variant(SID, '0.2.0', (p) => { p.manifest.title = 'جدید'; }));
  const { el } = await renderLibrary(view(e));
  await pickFile(el, fileLike(SAMPLE_TEXT)); // 0.1.0
  await waitFor(() => statusText(el).includes('جدیدتر'));
  ok(statusText(el).includes('۰.۲.۰') && statusText(el).includes('۰.۱.۰'));
  eq((await e.svc.getMeta(SID)).title, 'جدید');
  e.db.close();
});
test('library: به‌روزرسانی → پیام، پیشرفت حفظ و روی کارت دیده می‌شود', async () => {
  const e = await env();
  await e.svc.install(samplePack()); await e.svc.setDone(SID, 'intro', true);
  const { el } = await renderLibrary(view(e));
  eq(el.querySelector('[role=progressbar]').getAttribute('aria-valuenow'), '33');
  await pickFile(el, fileLike(JSON.stringify(variant(SID, '0.1.1'))));
  await waitFor(() => statusText(el).includes('به‌روزرسانی شد'));
  ok(statusText(el).includes('۰.۱.۱'));
  eq(el.querySelector('[role=progressbar]').getAttribute('aria-valuenow'), '33');
  eq(el.querySelectorAll('.course-card').length, 1);
  e.db.close();
});
test('library: هشدارهای pack نمایش داده می‌شود ولی مانع نصب نیست', async () => {
  const e = await env();
  const { el } = await renderLibrary(view(e));
  await pickFile(el, fileLike(JSON.stringify(variant(SID, '0.1.0', (p) => { p.extraKey = 1; }))));
  await waitFor(() => el.querySelector('.course-card'));
  ok(statusText(el).includes('هشدار'));
  e.db.close();
});

/* ───────── صفحه دوره ───────── */
async function withCourse(mutate) {
  const e = await env();
  await e.svc.install(samplePack());
  if (mutate) await mutate(e);
  return e;
}
test('course: هدر، فصل‌ها، لینک درس‌ها، دکمه «شروع دوره»', async () => {
  const e = await withCourse();
  const { el, title } = await renderCourse(view(e, { params: { id: SID } }));
  eq(title, samplePack().manifest.title);
  eq(el.querySelector('h1').textContent, title);
  eq(el.querySelectorAll('.chapter').length, 2);
  const links = [...el.querySelectorAll('.lesson-link')];
  eq(links.map((a) => a.getAttribute('href')).join(','), ['intro', 'prompts', 'wrap-up'].map((l) => `#/course/${SID}/lesson/${l}`).join(','));
  eq(links[1].querySelector('.lesson-link__num').textContent, '۲', 'شماره‌گذاری پیوسته در کل دوره');
  ok(links[1].textContent.includes('۱۲ دقیقه'));
  const cta = el.querySelector('.course-head .btn--accent');
  eq(cta.textContent, 'شروع دوره'); eq(cta.getAttribute('href'), `#/course/${SID}/lesson/intro`);
  eq(el.querySelector('[role=progressbar]').getAttribute('aria-valuenow'), '0');
  ok(el.querySelector('.crumbs [aria-current=page]'));
  e.db.close();
});
test('course: برچسب دکمه و وضعیت درس‌ها با پیشرفت تغییر می‌کند', async () => {
  const e = await withCourse();
  await e.svc.touchLesson(SID, 'prompts', 'پرامپت و ابزارها');
  let { el } = await renderCourse(view(e, { params: { id: SID } }));
  let cta = el.querySelector('.course-head .btn--accent');
  ok(cta.textContent.startsWith('ادامه از')); eq(cta.getAttribute('href'), `#/course/${SID}/lesson/prompts`);
  ok(el.querySelector('.lesson-link__status.is-started').textContent.includes('در حال مطالعه'));

  await e.svc.setDone(SID, 'prompts', true);
  ({ el } = await renderCourse(view(e, { params: { id: SID } })));
  cta = el.querySelector('.course-head .btn--accent');
  ok(cta.textContent.startsWith('درس بعدی')); eq(cta.getAttribute('href'), `#/course/${SID}/lesson/wrap-up`);
  eq(el.querySelector('.lesson-link.is-done .lesson-link__status').textContent, 'انجام‌شده', 'وضعیت متنی هم دارد، نه فقط رنگ');
  eq(el.querySelector('[role=progressbar]').getAttribute('aria-valuenow'), '33');

  await e.svc.setDone(SID, 'intro', true); await e.svc.setDone(SID, 'wrap-up', true);
  ({ el } = await renderCourse(view(e, { params: { id: SID } })));
  eq(el.querySelector('.course-head .btn--accent').textContent, 'مرور دوباره از ابتدا');
  eq(el.querySelector('[role=progressbar]').getAttribute('aria-valuenow'), '100');
  e.db.close();
});
test('course: حذف دو مرحله‌ای (انصراف، تأیید، هدایت به کتابخانه)', async () => {
  const e = await withCourse(async (en) => { await en.svc.setDone(SID, 'intro', true); });
  const { el } = await renderCourse(view(e, { params: { id: SID } }));
  const zone = el.querySelector('.danger-zone');
  zone.querySelector('button').click();
  ok(zone.querySelector('[role=alert]'), 'هشدار قبل از حذف'); eq(await e.svc.getMeta(SID) !== null, true, 'هنوز حذف نشده');
  const [confirmBtn, cancelBtn] = zone.querySelectorAll('.danger-zone__actions button');
  cancelBtn.click(); eq(zone.querySelector('[role=alert]'), null); ok(await e.svc.getMeta(SID));
  zone.querySelector('button').click();
  zone.querySelectorAll('.danger-zone__actions button')[0].click();
  await waitFor(() => e.router.calls.length === 1);
  eq(e.router.calls[0], '/library'); eq(await e.svc.getMeta(SID), null);
  eq((await e.svc.progressOf(SID)).size, 0);
  ok(confirmBtn, 'ok');
  e.db.close();
});
test('course: دوره ناموجود و خطای DB', async () => {
  const e = await env();
  const { el } = await renderCourse(view(e, { params: { id: 'nope' } }));
  ok(el.querySelector('.empty')); eq(el.querySelector('.empty a').getAttribute('href'), '#/library');
  const err = createStore({ dbStatus: 'error', settings: { ...DEFAULT_SETTINGS } });
  const r = await renderCourse({ store: err, svc: null, router: e.router, params: { id: SID } });
  ok(r.el.querySelector('[role=alert]'));
  e.db.close();
});
test('course: id عجیب (XSS/proto) فقط «پیدا نشد» می‌دهد', async () => {
  const e = await env();
  for (const id of ['<img src=x onerror=alert(1)>', '__proto__', 'constructor', '']) {
    const { el } = await renderCourse(view(e, { params: { id } }));
    ok(el.querySelector('.empty'), id); eq(el.querySelector('img'), null);
  }
  e.db.close();
});

/* ───────── صفحه درس ───────── */
const lessonView = (e, lid, extra) => renderLesson(view(e, { params: { id: SID, lid }, ...extra }));

test('lesson: بلوک‌ها، عنوان، مسیر صفحه، موقعیت و ثبت «started»', async () => {
  const e = await withCourse();
  const { el, title, destroy } = await lessonView(e, 'intro');
  eq(title, 'موشن‌گرافیک چیست؟'); eq(el.querySelector('h1').textContent, title);
  ok(el.querySelectorAll('.lesson-body .blk').length >= 5); eq(el.querySelectorAll('.blk-unsupported').length, 0);
  const crumbs = [...el.querySelectorAll('.crumbs li')].map((li) => li.textContent);
  eq(crumbs.length, 3); eq(crumbs[2], 'فصل ۱: آشنایی'); eq(el.querySelector('.crumbs [aria-current=page]').textContent, 'فصل ۱: آشنایی');
  ok(el.querySelector('.lesson-head').textContent.includes('درس ۱ از ۳'));
  eq((await e.svc.progressOf(SID)).get('intro').status, 'started');
  ok(typeof destroy === 'function'); destroy();
  e.db.close();
});
test('lesson: تصویر pack با Blob URL نمایش داده می‌شود', async () => {
  const e = await withCourse();
  const { el, destroy } = await lessonView(e, 'intro');
  const img = el.querySelector('img');
  ok(img, 'img'); ok(img.getAttribute('src').startsWith('blob:'), img.getAttribute('src'));
  destroy(); e.db.close();
});
test('lesson: قبلی/بعدی در ابتدا، وسط و انتها', async () => {
  const e = await withCourse();
  let { el } = await lessonView(e, 'intro');
  eq(el.querySelector('a[rel=prev]'), null); eq(el.querySelector('a[rel=next]').getAttribute('href'), `#/course/${SID}/lesson/prompts`);
  ok(el.querySelector('.lesson-nav__spacer'));
  ({ el } = await lessonView(e, 'prompts'));
  eq(el.querySelector('a[rel=prev]').getAttribute('href'), `#/course/${SID}/lesson/intro`);
  eq(el.querySelector('a[rel=next]').getAttribute('href'), `#/course/${SID}/lesson/wrap-up`);
  ok(el.querySelector('a[rel=next] .sr-only').textContent.includes('مسیر بعدی'), 'نام درس برای صفحه‌خوان');
  ({ el } = await lessonView(e, 'wrap-up'));
  eq(el.querySelector('a[rel=next]'), null);
  const finish = el.querySelector('.lesson-nav .btn--primary');
  eq(finish.textContent, 'بازگشت به صفحه دوره'); eq(finish.getAttribute('href'), `#/course/${SID}`);
  e.db.close();
});
test('lesson: دکمه انجام‌شد (toggle) در DB ذخیره و اعلام می‌شود', async () => {
  const e = await withCourse();
  const { el } = await lessonView(e, 'prompts');
  const btn = el.querySelector('.done-btn');
  eq(btn.getAttribute('aria-pressed'), 'false'); eq(btn.textContent, 'علامت‌گذاری به‌عنوان انجام‌شده');
  btn.click(); await waitFor(() => btn.getAttribute('aria-pressed') === 'true');
  eq((await e.svc.progressOf(SID)).get('prompts').status, 'done'); ok(btn.textContent.includes('انجام‌شده ✓'));
  eq(e.announced[0], 'درس انجام‌شده علامت خورد');
  btn.click(); await waitFor(() => btn.getAttribute('aria-pressed') === 'false');
  eq((await e.svc.progressOf(SID)).get('prompts').status, 'started'); eq(e.announced[1], 'علامت انجام‌شدن برداشته شد');
  eq(btn.disabled, false);
  e.db.close();
});
test('lesson: درس قبلاً انجام‌شده با حالت فشرده باز می‌شود و باز کردن آن done را خراب نمی‌کند', async () => {
  const e = await withCourse(async (en) => { await en.svc.setDone(SID, 'prompts', true); });
  const { el } = await lessonView(e, 'prompts');
  eq(el.querySelector('.done-btn').getAttribute('aria-pressed'), 'true');
  eq((await e.svc.progressOf(SID)).get('prompts').status, 'done');
  e.db.close();
});
test('lesson: خطای ذخیره پیشرفت پیام می‌دهد و صفحه سالم می‌ماند', async () => {
  const e = await withCourse();
  const failing = { ...e.svc, setDone: async () => { throw new Error('quota'); } };
  const orig = console.error; console.error = () => {};
  const { el } = await renderLesson({ ...view(e, { params: { id: SID, lid: 'intro' } }), svc: failing });
  const btn = el.querySelector('.done-btn'); const msg = el.querySelector('.save-error');
  eq(msg.hidden, true);
  btn.click(); await waitFor(() => msg.hidden === false);
  eq(btn.getAttribute('aria-pressed'), 'false'); eq(btn.disabled, false);
  console.error = orig;
  e.db.close();
});
test('lesson: خطای ثبت «started» مانع خواندن درس نمی‌شود', async () => {
  const e = await withCourse();
  const failing = { ...e.svc, touchLesson: async () => { throw new Error('x'); } };
  const orig = console.error; console.error = () => {};
  const { el } = await renderLesson({ ...view(e, { params: { id: SID, lid: 'intro' } }), svc: failing });
  console.error = orig;
  ok(el.querySelectorAll('.blk').length > 0);
  e.db.close();
});
test('lesson: درس/دوره ناموجود → «پیدا نشد»', async () => {
  const e = await withCourse();
  let { el } = await lessonView(e, 'nope');
  ok(el.querySelector('.empty')); ok(el.textContent.includes('درس پیدا نشد'));
  ({ el } = await renderLesson(view(e, { params: { id: 'zzz', lid: 'intro' } })));
  ok(el.textContent.includes('دوره پیدا نشد'));
  eq((await e.svc.progressAll()).size, 0, 'برای درس ناموجود پیشرفت ثبت نمی‌شود');
  e.db.close();
});
test('lesson: محتوای مخرب pack ذخیره‌شده در DB هم اجرا نمی‌شود', async () => {
  const e = await env();
  const X = '<img src=x onerror="window.__m3xss=1"><script>window.__m3xss=1</script>';
  await e.svc.install(variant(SID, '0.1.0', (p) => { p.lessons.intro.blocks = [{ type: 'text', text: X }, { type: 'heading', text: X }]; }));
  globalThis.window.__m3xss = 0;
  const { el } = await lessonView(e, 'intro');
  eq(el.querySelectorAll('script, img').length, 0); eq(globalThis.window.__m3xss, 0); ok(el.textContent.includes('<script>'));
  e.db.close();
});

/* ───────── داشبورد ───────── */
test('dashboard: «ادامه یادگیری» و کارت دوره پس از فعالیت', async () => {
  const e = await withCourse(async (en) => { await en.svc.touchLesson(SID, 'prompts', 'پرامپت و ابزارها'); });
  const { el } = await renderDashboard(view(e));
  eq(el.querySelector('.empty'), null);
  const hero = el.querySelector('.card--hero');
  ok(hero.textContent.includes('ادامه یادگیری')); ok(hero.textContent.includes('پرامپت و ابزارها'));
  eq(hero.querySelector('a').getAttribute('href'), `#/course/${SID}`);
  eq(el.querySelectorAll('.course-card').length, 1);
  eq(el.querySelectorAll('.stat__value')[0].textContent, '۱'); eq(el.querySelectorAll('.stat__value')[1].textContent, '۱');
  e.db.close();
});
test('dashboard: بدون فعالیت پیام خوش‌آمد؛ حداکثر ۳ دوره اخیر', async () => {
  const e = await env();
  for (let i = 1; i <= 4; i++) { await e.svc.install(variant(`course-${i}`, '1.0.0')); await new Promise((r) => setTimeout(r, 3)); }
  const { el } = await renderDashboard(view(e));
  ok(el.querySelector('.card--hero').textContent.includes('خوش آمدید'));
  eq(el.querySelectorAll('.course-card').length, 3);
  eq(el.querySelector('.course-card__title a').getAttribute('href'), '#/course/course-4', 'جدیدترین اول');
  e.db.close();
});
test('dashboard: پیشرفت یک دوره حذف‌شده روی «ادامه» اثر نمی‌گذارد', async () => {
  const e = await withCourse(async (en) => { await en.svc.touchLesson(SID, 'intro', 'x'); await en.svc.remove(SID); });
  const { el } = await renderDashboard(view(e));
  ok(el.querySelector('.card--hero').textContent.includes('خوش آمدید')); ok(el.querySelector('.empty'));
  e.db.close();
});

/* ───────── ظرفیت ───────── */
test('perf: pack بزرگ (۳۰۰ درس) نصب، فهرست و حذف در زمان معقول', async () => {
  const e = await env();
  const lessons = {}; const chLessons = [];
  for (let i = 0; i < 300; i++) {
    const id = `l${i}`; chLessons.push({ id, title: `درس ${i}`, minutes: 5 });
    lessons[id] = { blocks: Array.from({ length: 10 }, (_, j) => ({ type: 'text', text: `متن ${i}-${j}` })) };
  }
  const pack = { schemaVersion: 1, manifest: { id: 'big-course', title: 'T', language: 'fa', version: '1.0.0', chapters: [{ id: 'c', title: 'C', lessons: chLessons }] }, lessons };
  const t0 = Date.now();
  const { meta } = await e.svc.install(pack);
  eq(meta.lessonCount, 300); eq(meta.totalMinutes, 1500);
  for (let i = 0; i < 50; i++) await e.svc.setDone('big-course', `l${i}`, true);
  const { el } = await renderCourse(view(e, { params: { id: 'big-course' } }));
  eq(el.querySelectorAll('.lesson-link').length, 300);
  eq(el.querySelector('[role=progressbar]').getAttribute('aria-valuenow'), '17');
  await e.svc.remove('big-course');
  ok(Date.now() - t0 < 8000, `زمان ${Date.now() - t0}ms`);
  e.db.close();
});

export async function runTests({ sampleText } = {}) {
  SAMPLE_TEXT = sampleText;
  const results = [];
  for (const { name, fn } of tests) {
    try { await fn(); results.push({ name, ok: true }); } catch (err) { results.push({ name, ok: false, error: err.message }); }
  }
  return results;
}
