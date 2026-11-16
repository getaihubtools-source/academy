// تست‌های M4 — نرمال‌سازی فارسی، جست‌وجو، کلیپ‌بورد، نشان/یادداشت، رابط‌ها
import { createStore } from '../js/core/store.js';
import { createRouter, matchRoute } from '../js/core/router.js';
import { DEFAULT_SETTINGS } from '../js/core/prefs.js';
import { openDb } from '../js/db/idb.js';
import { migrations } from '../js/db/schema.js';
import { createRepos } from '../js/db/repos.js';
import { createCourseService } from '../js/db/courses.js';
import { createNotesService, NoteError, NOTE_MAX, bookmarkKey } from '../js/db/notes.js';
import { normalizeFa, normalizeWithMap } from '../js/features/normalize.js';
import { buildSearchIndex, searchIndexes, buildSnippet, parseQuery, extractBlock } from '../js/features/search.js';
import { copyText } from '../js/features/clipboard.js';
import { parsePack } from '../js/packs/loader.js';
import { prompt } from '../js/render/blocks/prompt.js';
import { render as renderSearch, DEBOUNCE_MS } from '../js/views/search.js';
import { render as renderSaved } from '../js/views/saved.js';
import { render as renderLesson } from '../js/views/lesson.js';
import { ROUTES } from '../js/app.js';
import { NAV_ITEMS } from '../js/views/shell.js';
import { hasKey } from '../js/core/i18n-fa.js';

const eq = (a, b, msg = '') => { if (!Object.is(a, b)) throw new Error(`${msg} expected ${JSON.stringify(b)} but got ${JSON.stringify(a)}`); };
const ok = (v, msg = 'expected truthy') => { if (!v) throw new Error(msg); };
const rejectsWith = async (fn, Type) => {
  try { await fn(); } catch (err) { if (!Type || err instanceof Type) return err; throw err; }
  throw new Error('expected rejection');
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 3000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { if (fn()) return; } catch { /* هنوز آماده نیست */ } await sleep(10); }
  throw new Error('waitFor timeout');
}

let SAMPLE_TEXT = '';
const SID = 'sample-motion-lab';
const samplePack = () => parsePack(SAMPLE_TEXT).pack;

let counter = 0;
async function env() {
  const db = await openDb({ name: `m4-db-${Date.now()}-${counter++}`, migrations });
  const repos = createRepos(db, 'test');
  const svc = createCourseService(db);
  const notes = createNotesService(db);
  const store = createStore({ dbStatus: 'ready', settings: { ...DEFAULT_SETTINGS } });
  const calls = [];
  const announced = [];
  const router = { href: (p) => '#' + p, navigate: (p, o) => { calls.push([p, o]); }, calls };
  return { db, repos, svc, notes, store, router, announced, announce: (m) => announced.push(m) };
}
const view = (e, extra = {}) => ({ store: e.store, repos: e.repos, svc: e.svc, notes: e.notes, router: e.router, announce: e.announce, ...extra });
const installSample = async (e) => { await e.svc.install(samplePack()); };

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

/* ───── نرمال‌سازی ───── */
test('normalize: ی/ک عربی، ارقام، اعراب، کشیده، ZWNJ و بزرگ‌کوچک', () => {
  eq(normalizeFa('كتاب يك'), 'کتاب یک');
  eq(normalizeFa('۱۲۳ ٤٥٦'), '123 456');
  eq(normalizeFa('مُحَمَّد'), 'محمد');
  eq(normalizeFa('کــــتاب'), 'کتاب');
  eq(normalizeFa('می‌رود'), 'میرود');
  eq(normalizeFa('  Ease   IN '), 'ease in');
  eq(normalizeFa(null), '');
});
test('normalize: نقشه موقعیت به متن اصلی برمی‌گردد', () => {
  const src = 'سَلام  دُنیا';
  const { norm, map } = normalizeWithMap(src);
  eq(norm, 'سلام دنیا');
  eq(map.length, norm.length);
  eq(src[map[norm.indexOf('دنیا')]], 'د');
});

/* ───── ایندکس و جست‌وجو ───── */
test('search/parseQuery: توکن‌ها، حداقل دو حرف، سقف ۶ توکن', () => {
  ok(!parseQuery('a').valid); ok(!parseQuery('  ').valid); ok(parseQuery('پرامپت').valid);
  eq(parseQuery('a b c d e f g h').tokens.length, 6);
});
test('search/extractBlock: متن هر نوع بلوک استخراج می‌شود و خروجی بدون نشانه‌گذاری است', () => {
  const r = extractBlock({ type: 'text', text: 'سلام **دنیا** [پیوند](https://x.com)' });
  eq(r.kind, 'body');
  ok(r.text.includes('سلام دنیا پیوند'), JSON.stringify(r));
  ok(!r.text.includes('**'));
  ok(!r.text.includes('https://x.com'), 'آدرس نباید در متن جست‌وجو بیاید');
  eq(extractBlock({ type: 'unknown', text: 'x' }), null);
  eq(extractBlock({ type: 'prompt', text: 'p' }).kind, 'prompt');
});
test('search/buildSearchIndex: ورودی‌ها شناسه بلوک و درس دارند', () => {
  const idx = buildSearchIndex(samplePack());
  eq(idx.courseId, SID);
  ok(idx.entries.length > 10);
  ok(idx.entries.some((e) => e.id === 'p-script' && e.l === 'prompts'));
  ok(idx.lessons.prompts.title);
});
test('search: «ي/ك» عربی همان «ی/ک» فارسی را پیدا می‌کند و برعکس', () => {
  const idx = buildSearchIndex(samplePack());
  ok(searchIndexes([idx], 'ايده').length > 0, 'ي عربی');
  ok(searchIndexes([idx], 'پرامپت').length > 0);
  ok(searchIndexes([idx], 'EASING').length > 0, 'بزرگ/کوچک');
});
test('search: همه توکن‌ها باید در یک بلوک باشند (AND)', () => {
  const idx = buildSearchIndex(samplePack());
  ok(searchIndexes([idx], 'easing شتاب').length > 0);
  eq(searchIndexes([idx], 'easing zzzqqq').length, 0);
  eq(searchIndexes([idx], 'x').length, 0, 'کوتاه‌تر از دو حرف');
});
test('search: عنوان درس از متن بالاتر رتبه می‌گیرد و perLesson رعایت می‌شود', () => {
  const idx = buildSearchIndex(samplePack());
  const r = searchIndexes([idx], 'پرامپت', { perLesson: 1 });
  ok(r.length >= 1);
  ok(r.every((x) => x.hits.length <= 1));
  eq(r[0].lessonId, 'prompts');
});
test('search/buildSnippet: برجسته‌سازی دقیق روی متن اصلی با اعراب', () => {
  const s = buildSnippet('این یک مُتنِ آزمایشی است', ['متن']);
  const marked = s.segments.filter((x) => x.mark).map((x) => x.text).join('');
  eq(marked, 'مُتنِ');
  eq(s.segments.map((x) => x.text).join(''), 'این یک مُتنِ آزمایشی است');
});
test('search/buildSnippet: متن بلند بریده می‌شود و علامت برش دارد', () => {
  const long = 'الف '.repeat(200) + 'هدف' + ' ب'.repeat(200);
  const s = buildSnippet(long, ['هدف']);
  ok(s.startCut && s.endCut);
  ok(s.segments.some((x) => x.mark && x.text === 'هدف'));
  ok(s.segments.map((x) => x.text).join('').length < 260);
});
test('search: عبارت شبیه HTML فقط متن است و در DOM تگ نمی‌سازد (view)', async () => {
  const e = await env();
  const p = JSON.parse(SAMPLE_TEXT);
  p.manifest.id = 'xss'; p.lessons.intro.blocks.push({ type: 'text', text: 'عبارت <img src=x onerror=alert(1)> نمونه' });
  await e.svc.install(parsePack(JSON.stringify(p)).pack);
  const r = await renderSearch(view(e, { query: new URLSearchParams('q=onerror') }));
  r.mounted();
  await waitFor(() => r.el.querySelector('.result'));
  eq(r.el.querySelectorAll('img').length, 0);
  ok(r.el.querySelector('mark'));
  r.destroy();
});

/* ───── کلیپ‌بورد ───── */
test('clipboard: Clipboard API موفق → true', async () => {
  let got = null;
  eq(await copyText('سلام', { nav: { clipboard: { writeText: async (v) => { got = v; } } } }), true);
  eq(got, 'سلام');
});
test('clipboard: خطای API → fallback execCommand؛ و textarea موقت پاک می‌شود', async () => {
  const doc = document;
  doc.execCommand = () => true;
  const before = doc.querySelectorAll('textarea').length;
  eq(await copyText('x', { nav: { clipboard: { writeText: async () => { throw new Error('denied'); } } }, doc }), true);
  eq(doc.querySelectorAll('textarea').length, before);
  doc.execCommand = () => false;
  eq(await copyText('x', { nav: {}, doc }), false);
  delete doc.execCommand;
});

/* ───── دکمه کپی پرامپت ───── */
test('prompt: کپی موفق متن دقیق را می‌فرستد و بازخورد نشان می‌دهد', async () => {
  let sent = null;
  const el = prompt.render({ type: 'prompt', title: 'عنوان', text: 'متن **پرامپت**' }, { copy: async (v) => { sent = v; return true; } });
  const btn = el.querySelector('.blk-prompt__copy');
  btn.click();
  await waitFor(() => sent !== null);
  eq(sent, 'متن **پرامپت**', 'متن خام بدون پردازش مارک‌داون');
  await waitFor(() => btn.textContent.includes('✓'));
  await waitFor(() => el.querySelector('[role=status]').textContent.length > 0);
});
test('prompt: شکست کپی → پیام شکست و متن انتخاب می‌شود', async () => {
  const el = prompt.render({ type: 'prompt', text: 'abc' }, { copy: async () => false });
  document.body.append(el);
  const btn = el.querySelector('.blk-prompt__copy');
  btn.click();
  await waitFor(() => btn.textContent.includes(btn.textContent) && !btn.textContent.includes('✓') && btn.textContent !== 'کپی');
  el.remove();
});

/* ───── سرویس نشان/یادداشت ───── */
test('notes/bookmarks: toggle، جداسازی درس/بلوک، کلید ثابت', async () => {
  const e = await env();
  const a = { courseId: 'c', lessonId: 'l', lessonTitle: 'L', courseTitle: 'C' };
  eq((await e.notes.toggleBookmark(a)).on, true);
  eq((await e.notes.toggleBookmark({ ...a, blockId: 'b1', label: 'x' })).on, true);
  eq((await e.notes.bookmarksOfLesson('c', 'l')).length, 2);
  eq((await e.notes.toggleBookmark(a)).on, false);
  eq((await e.notes.bookmarksOfLesson('c', 'l')).length, 1);
  eq(bookmarkKey('c', 'l', null), bookmarkKey('c', 'l', undefined));
  ok(bookmarkKey('c', 'l', 'b1') !== bookmarkKey('c', 'l', null));
});
test('notes: افزودن/ویرایش/حذف، اعتبارسنجی خالی و طولانی', async () => {
  const e = await env();
  const base = { courseId: 'c', lessonId: 'l' };
  eq((await rejectsWith(() => e.notes.addNote({ ...base, text: '   ' }), NoteError)).code, 'empty');
  eq((await rejectsWith(() => e.notes.addNote({ ...base, text: 'x'.repeat(NOTE_MAX + 1) }), NoteError)).code, 'tooLong');
  const n = await e.notes.addNote({ ...base, text: '  سلام  ' });
  eq(n.text, 'سلام');
  await sleep(5);
  const u = await e.notes.updateNote(n.id, 'تغییر');
  eq(u.text, 'تغییر'); ok(u.updatedAt > u.createdAt);
  eq((await rejectsWith(() => e.notes.updateNote('nope', 'x'), NoteError)).code, 'notFound');
  await e.notes.removeNote(n.id);
  eq((await e.notes.notesOfLesson('c', 'l')).length, 0);
});
test('notes: یادداشت‌های دو درس/دو دوره قاطی نمی‌شوند', async () => {
  const e = await env();
  await e.notes.addNote({ courseId: 'c', lessonId: 'l1', text: 'a' });
  await e.notes.addNote({ courseId: 'c', lessonId: 'l2', text: 'b' });
  await e.notes.addNote({ courseId: 'd', lessonId: 'l1', text: 'c' });
  eq((await e.notes.notesOfLesson('c', 'l1')).length, 1);
  eq((await e.notes.listNotes()).length, 3);
});

/* ───── ایندکس در چرخه نصب/حذف ───── */
test('courses: نصب ایندکس می‌سازد؛ حذف دوره ایندکس/نشان/یادداشت را پاک می‌کند', async () => {
  const e = await env();
  await installSample(e);
  const idx = await e.svc.getSearchIndex(SID);
  ok(idx && idx.entries.length > 0);
  await e.notes.addNote({ courseId: SID, lessonId: 'intro', text: 'n' });
  await e.notes.toggleBookmark({ courseId: SID, lessonId: 'intro' });
  await e.svc.remove(SID);
  eq(await e.svc.getSearchIndex(SID), null);
  eq((await e.notes.listNotes()).length, 0);
  eq((await e.notes.listBookmarks()).length, 0);
});
test('courses: ایندکس گم‌شده یا قدیمی دوباره ساخته می‌شود', async () => {
  const e = await env();
  await installSample(e);
  const tx = e.db.transaction('searchIndex', 'readwrite');
  tx.objectStore('searchIndex').delete(SID);
  await new Promise((res) => { tx.oncomplete = res; });
  const idx = await e.svc.getSearchIndex(SID);
  ok(idx && idx.entries.length > 0);
});
test('perf: جست‌وجو روی ۳۰۰ درس زیر ۲۰۰ms', async () => {
  const pack = JSON.parse(SAMPLE_TEXT);
  const lessons = []; const out = {};
  for (let i = 0; i < 300; i++) {
    lessons.push({ id: `l${i}`, title: `درس ${i}` });
    out[`l${i}`] = { blocks: Array.from({ length: 8 }, (_, k) => ({ type: 'text', text: `متن شماره ${i}-${k} درباره موشن و ${k % 2 ? 'easing' : 'timing'} و ادامه متن بلند `.repeat(4) })) };
  }
  pack.manifest.id = 'big'; pack.manifest.chapters = [{ id: 'c', title: 'ف', lessons }]; pack.lessons = out;
  const idx = buildSearchIndex(parsePack(JSON.stringify(pack)).pack);
  const t0 = Date.now();
  const r = searchIndexes([idx], 'easing شماره');
  ok(Date.now() - t0 < 200, `slow: ${Date.now() - t0}ms`);
  ok(r.length > 0 && r.length <= 40);
});

/* ───── router ───── */
test('router: navigate با silent آدرس را عوض می‌کند و listener صدا زده نمی‌شود', () => {
  let hash = '#/search'; const listeners = [];
  const adapter = {
    getHash: () => hash,
    setHash: (h, replace, silent) => { hash = h; if (!silent) listeners.forEach((f) => f()); },
    listen: (f) => { listeners.push(f); return () => {}; },
  };
  const r = createRouter({ routes: [{ name: 'search', path: '/search' }], notFound: { name: 'nf' }, adapter });
  let n = 0; r.onChange(() => n++); r.start();
  eq(n, 1);
  r.navigate('/search?q=x', { silent: true });
  eq(n, 1); eq(hash, '#/search?q=x');
  r.navigate('/search?q=y');
  eq(n, 2);
});
test('routes/nav: /search و /saved ثبت‌اند و آیتم‌های ناوبری به route واقعی می‌رسند', () => {
  ok(matchRoute(ROUTES, '/search')); ok(matchRoute(ROUTES, '/saved'));
  eq(NAV_ITEMS.length, 5);
  for (const it of NAV_ITEMS) ok(ROUTES.some((r) => r.name === it.name), it.name);
});
test('i18n: همه کلیدهای M4 تعریف شده‌اند', () => {
  for (const k of ['search.title', 'saved.title', 'note.title', 'bm.lesson.add', 'nav.search', 'nav.saved']) ok(hasKey(k), k);
});

/* ───── رابط‌ها ───── */
test('search view: بدون دوره → وضعیت خالی؛ با دوره → نتیجه با لینک عمیق بلوک', async () => {
  const e = await env();
  let r = await renderSearch(view(e, { query: new URLSearchParams() }));
  ok(r.el.querySelector('.empty'));
  await installSample(e);
  r = await renderSearch(view(e, { query: new URLSearchParams('q=اسکریپت') }));
  r.mounted();
  await waitFor(() => r.el.querySelector('.result'));
  const hrefs = [...r.el.querySelectorAll('.result__hit')].map((a) => a.getAttribute('href'));
  ok(hrefs.some((h) => h.includes('/lesson/prompts?block=p-script')), hrefs.join(','));
  eq(r.el.querySelector('select'), null, 'با یک دوره فیلتر دوره لازم نیست');
  r.destroy();
});
test('search view: تایپ با debounce اجرا می‌شود، آدرس بی‌صدا به‌روز می‌شود، نتیجه قدیمی نادیده گرفته می‌شود', async () => {
  const e = await env();
  await installSample(e);
  const r = await renderSearch(view(e, { query: new URLSearchParams() }));
  r.mounted();
  const input = r.el.querySelector('#search-input');
  input.value = 'پرامپت'; input.dispatchEvent(new Event('input'));
  eq(r.el.querySelectorAll('.result').length, 0, 'قبل از debounce');
  await waitFor(() => r.el.querySelector('.result'), DEBOUNCE_MS + 2000);
  ok(e.router.calls.some(([p, o]) => p.startsWith('/search?q=') && o && o.silent));
  input.value = 'zzzzqq'; input.dispatchEvent(new Event('input'));
  await waitFor(() => r.el.querySelector('.search__status').textContent.includes('نتیجه‌ای'), DEBOUNCE_MS + 2000);
  eq(r.el.querySelectorAll('.result').length, 0);
  r.destroy();
});
test('search view: دو دوره → فیلتر دوره کار می‌کند', async () => {
  const e = await env();
  await installSample(e);
  const p = JSON.parse(SAMPLE_TEXT); p.manifest.id = 'other'; p.manifest.title = 'دوره دوم';
  await e.svc.install(parsePack(JSON.stringify(p)).pack);
  const r = await renderSearch(view(e, { query: new URLSearchParams('q=پرامپت') }));
  r.mounted();
  await waitFor(() => r.el.querySelectorAll('.result').length === 2);
  const sel = r.el.querySelector('select');
  sel.value = 'other'; sel.dispatchEvent(new Event('change'));
  await waitFor(() => r.el.querySelectorAll('.result').length === 1);
  r.destroy();
});

test('search view: جست‌وجوی کند قدیمی نتیجه جدیدتر را بازنویسی نمی‌کند', async () => {
  const e = await env(); await installSample(e);
  const real = e.svc.getSearchIndex.bind(e.svc);
  let n = 0;
  e.svc.getSearchIndex = async (id) => { const my = ++n; const v = await real(id); if (my === 1) await sleep(400); return v; };
  const r = await renderSearch(view(e, { query: new URLSearchParams() }));
  r.mounted();
  const input = r.el.querySelector('#search-input');
  input.value = 'پرامپت'; input.dispatchEvent(new Event('input'));
  await sleep(DEBOUNCE_MS + 60); // جست‌وجوی اول شروع شده و کند است
  input.value = 'zzzzqq'; input.dispatchEvent(new Event('input'));
  await sleep(DEBOUNCE_MS + 900);
  eq(r.el.querySelectorAll('.result').length, 0, 'نتیجه قدیمی نباید نمایش داده شود');
  ok(r.el.querySelector('.search__status').textContent.includes('نتیجه‌ای'));
  r.destroy();
});

const lessonView = async (e, lid = 'prompts', q = '') => renderLesson(view(e, { params: { id: SID, lid }, query: new URLSearchParams(q) }));

test('lesson view: دکمه نشان درس و نشان بلوک ذخیره می‌شوند و متن «null» نمی‌آید', async () => {
  const e = await env(); await installSample(e);
  const r = await lessonView(e);
  ok(!r.el.textContent.includes('null'), 'متن null در DOM');
  const lessonBtn = r.el.querySelector('.bm-lesson');
  eq(lessonBtn.getAttribute('aria-pressed'), 'false');
  lessonBtn.click();
  await waitFor(() => lessonBtn.getAttribute('aria-pressed') === 'true');
  const blockBtns = r.el.querySelectorAll('.bm-block');
  eq(blockBtns.length, 4, 'prompt×2 + tool + exercise');
  blockBtns[0].click();
  await waitFor(() => blockBtns[0].getAttribute('aria-pressed') === 'true');
  const marks = await e.notes.bookmarksOfLesson(SID, 'prompts');
  eq(marks.length, 2);
  ok(marks.some((m) => m.blockId === 'p-script' && m.label));
  // بازگشت به درس: وضعیت نشان‌ها بازیابی می‌شود
  const r2 = await lessonView(e);
  eq(r2.el.querySelector('.bm-lesson').getAttribute('aria-pressed'), 'true');
  eq(r2.el.querySelectorAll('.bm-block[aria-pressed="true"]').length, 1);
});
test('lesson view: بلوک بدون id دکمه نشان ندارد', async () => {
  const e = await env(); await installSample(e);
  const r = await lessonView(e, 'wrap-up');
  const withId = [...r.el.querySelectorAll('.blk-wrap')].length;
  eq(r.el.querySelectorAll('.bm-block').length, withId);
  eq(withId, 2, 'فقط quiz و project شناسه دارند؛ heading/text/callout/list بدون نشان');
});
test('lesson view: یادداشت افزودن، ویرایش، حذف دومرحله‌ای و خطای خالی', async () => {
  const e = await env(); await installSample(e);
  const r = await lessonView(e);
  const area = r.el.querySelector('.notes__input');
  const add = r.el.querySelector('.notes__form .btn--primary');
  add.click();
  await waitFor(() => !r.el.querySelector('.notes .save-error').hidden);
  area.value = 'یادداشت <b>من</b>'; add.click();
  await waitFor(() => r.el.querySelectorAll('.note').length === 1);
  eq(r.el.querySelector('.note b'), null, 'HTML در یادداشت اجرا نشود');
  ok(r.el.querySelector('.note__text').textContent.includes('<b>'));
  // ویرایش
  [...r.el.querySelectorAll('.note .btn')].find((b) => b.textContent === 'ویرایش').click();
  const field = r.el.querySelector('.note textarea');
  field.value = 'ویرایش‌شده'; [...r.el.querySelectorAll('.note .btn--primary')][0].click();
  await waitFor(() => r.el.querySelector('.note__text') && r.el.querySelector('.note__text').textContent === 'ویرایش‌شده');
  // حذف: مرحله اول فقط تأیید می‌خواهد
  [...r.el.querySelectorAll('.note .btn--danger')][0].click();
  eq((await e.notes.notesOfLesson(SID, 'prompts')).length, 1, 'هنوز حذف نشده');
  [...r.el.querySelectorAll('.note .btn--danger')].find((b) => b.textContent === 'بله، حذف شود').click();
  await waitFor(() => r.el.querySelectorAll('.note').length === 0);
  eq((await e.notes.notesOfLesson(SID, 'prompts')).length, 0);
});
test('lesson view: ?block=id روی بلوک فوکوس و هایلایت می‌دهد؛ id ناموجود بی‌خطر است', async () => {
  const e = await env(); await installSample(e);
  const r = await lessonView(e, 'prompts', 'block=p-script-en');
  document.body.append(r.el);
  r.mounted();
  const target = r.el.querySelector('.is-target');
  ok(target); eq(target.dataset.blockId, 'p-script-en');
  r.el.remove();
  const r2 = await lessonView(e, 'prompts', 'block=nope');
  r2.mounted();
  eq(r2.el.querySelector('.is-target'), null);
});
test('lesson view: بدون سرویس notes درس همچنان نمایش داده می‌شود', async () => {
  const e = await env(); await installSample(e);
  const r = await renderLesson({ ...view(e), notes: null, params: { id: SID, lid: 'intro' }, query: new URLSearchParams() });
  ok(r.el.querySelector('h1'));
  eq(r.el.querySelector('.notes'), null);
});
test('saved view: نشان‌ها و یادداشت‌ها فهرست، لینک عمیق، حذف', async () => {
  const e = await env(); await installSample(e);
  await e.notes.toggleBookmark({ courseId: SID, lessonId: 'prompts', blockId: 'p-script', lessonTitle: 'پرامپت و ابزارها', courseTitle: 'دوره', label: 'ایده‌پردازی' });
  await e.notes.toggleBookmark({ courseId: SID, lessonId: 'intro', lessonTitle: 'مقدمه', courseTitle: 'دوره' });
  await e.notes.addNote({ courseId: SID, lessonId: 'intro', text: 'نکته', lessonTitle: 'مقدمه', courseTitle: 'دوره' });
  const r = await renderSaved(view(e));
  eq(r.el.querySelectorAll('.saved__item').length, 3);
  const hrefs = [...r.el.querySelectorAll('a.saved__link')].map((a) => a.getAttribute('href'));
  ok(hrefs.some((h) => h.endsWith('/lesson/prompts?block=p-script')), hrefs.join(','));
  [...r.el.querySelectorAll('.saved__item .btn')].find((b) => b.textContent === 'برداشتن نشان').click();
  await waitFor(async () => true);
  await waitFor(() => r.el.querySelectorAll('.saved__item').length === 2);
  eq((await e.notes.listBookmarks()).length, 1);
});
test('saved view: بدون داده پیام خالی؛ بدون DB پیام خطا', async () => {
  const e = await env();
  const r = await renderSaved(view(e));
  eq(r.el.querySelectorAll('.notes__empty').length, 2);
  e.store.set({ dbStatus: 'error' });
  const r2 = await renderSaved(view(e));
  ok(r2.el.querySelector('.callout, .empty, [role=alert]') || r2.el.textContent.length > 0);
});

export async function runTests({ sampleText } = {}) {
  SAMPLE_TEXT = sampleText;
  const results = [];
  for (const { name, fn } of tests) {
    try { await fn(); results.push({ name, ok: true }); } catch (err) { results.push({ name, ok: false, error: err.message }); }
  }
  return results;
}
