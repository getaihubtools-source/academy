// تست‌های M1 — هم در Node (jsdom + fake-indexeddb) و هم در مرورگر (tests/index.html) اجرا می‌شوند.
import { createEmitter } from '../js/core/events.js';
import { createStore } from '../js/core/store.js';
import { parseHash, matchRoute, createRouter } from '../js/core/router.js';
import { h, isSafeUrl, clear } from '../js/core/dom.js';
import { icon, ICON_NAMES } from '../js/core/icons.js';
import { t, toFaDigits, hasKey } from '../js/core/i18n-fa.js';
import { SETTINGS_SPEC, DEFAULT_SETTINGS, isValidSetting, normalizeSettings, applyPrefs } from '../js/core/prefs.js';
import { openDb } from '../js/db/idb.js';
import { migrations, STORE_NAMES, DB_VERSION } from '../js/db/schema.js';
import { createRepos } from '../js/db/repos.js';
import { createCourseService } from '../js/db/courses.js';
import { buildShell, NAV_ITEMS } from '../js/views/shell.js';
import { render as renderDashboard } from '../js/views/dashboard.js';
import { render as renderLibrary } from '../js/views/library.js';
import { render as renderSettings } from '../js/views/settings.js';
import { render as renderNotFound } from '../js/views/notfound.js';

const eq = (a, b, msg = '') => {
  if (!Object.is(a, b)) throw new Error(`${msg} expected ${JSON.stringify(b)} but got ${JSON.stringify(a)}`);
};
const ok = (v, msg = 'expected truthy') => { if (!v) throw new Error(msg); };
const rejects = async (fn, msg = 'expected rejection') => {
  try { await fn(); } catch { return; }
  throw new Error(msg);
};

let dbCounter = 0;
const freshName = () => `test-db-${Date.now()}-${dbCounter++}`;
async function freshRepos() {
  const name = freshName();
  const db = await openDb({ name, migrations });
  return { db, name, repos: createRepos(db, 'test') };
}

function mockAdapter(initial = '') {
  let hash = initial;
  const listeners = new Set();
  return {
    getHash: () => hash,
    setHash(next) { hash = next; listeners.forEach((fn) => fn()); },
    listen(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

/* ───────── events ───────── */
test('events: on/emit/off/once', () => {
  const e = createEmitter();
  let n = 0;
  const off = e.on('x', () => { n++; });
  e.once('x', () => { n += 10; });
  eq(e.emit('x'), 2); eq(n, 11);
  e.emit('x'); eq(n, 12);
  off(); eq(e.emit('x'), 0);
});
test('events: خطای یک handler بقیه را متوقف نمی‌کند', () => {
  const e = createEmitter();
  const origError = console.error; console.error = () => {};
  let reached = false;
  e.on('x', () => { throw new Error('boom'); });
  e.on('x', () => { reached = true; });
  e.emit('x');
  console.error = origError;
  ok(reached);
});

/* ───────── store ───────── */
test('store: set/get و merge', () => {
  const s = createStore({ a: 1, b: 2 });
  ok(s.set({ a: 5 })); eq(s.get().a, 5); eq(s.get().b, 2);
});
test('store: بدون تغییر → false و بدون اعلان', () => {
  const s = createStore({ a: 1 });
  let calls = 0; s.subscribe(() => { calls++; });
  eq(s.set({ a: 1 }), false); eq(calls, 0);
});
test('store: subscribe با فیلتر کلید', () => {
  const s = createStore({ a: 1, b: 1 });
  let a = 0, any = 0;
  s.subscribe(() => { a++; }, ['a']);
  s.subscribe(() => { any++; });
  s.set({ b: 2 }); eq(a, 0); eq(any, 1);
  s.set({ a: 2 }); eq(a, 1); eq(any, 2);
});
test('store: patch تابعی، unsubscribe و تغییرناپذیری state', () => {
  const s = createStore({ n: 1 });
  let calls = 0; const un = s.subscribe(() => { calls++; });
  s.set((st) => ({ n: st.n + 1 })); eq(s.get().n, 2); eq(calls, 1);
  un(); s.set({ n: 9 }); eq(calls, 1);
  ok(Object.isFrozen(s.get()));
});

/* ───────── router ───────── */
test('router: parseHash', () => {
  eq(parseHash('').path, '/');
  eq(parseHash('#').path, '/');
  eq(parseHash('#/library/').path, '/library');
  eq(parseHash('#//a//b').path, '/a/b');
  eq(parseHash('#/library?x=1&y=2').query.get('y'), '2');
});
test('router: matchRoute پارامتر، decode و عدم تطابق', () => {
  const routes = [{ name: 'home', path: '/' }, { name: 'course', path: '/course/:id' }, { name: 'lesson', path: '/course/:id/lesson/:lid' }];
  eq(matchRoute(routes, '/').route.name, 'home');
  const m = matchRoute(routes, '/course/motion%20lab/lesson/3');
  eq(m.route.name, 'lesson'); eq(m.params.id, 'motion lab'); eq(m.params.lid, '3');
  eq(matchRoute(routes, '/nope'), null);
  eq(matchRoute(routes, '/course'), null);
  eq(matchRoute(routes, '/course/%E0%A4%A').params.id, '%E0%A4%A', 'decode خراب نباید throw کند');
});
test('router: createRouter با adapter ساختگی', () => {
  const adapter = mockAdapter('');
  const routes = [{ name: 'home', path: '/' }, { name: 'library', path: '/library' }];
  const router = createRouter({ routes, notFound: { name: 'nf' }, adapter });
  const seen = [];
  router.onChange((m) => seen.push(m.name + ':' + m.found));
  eq(router.start().name, 'home');
  router.navigate('/library'); router.navigate('/zzz'); router.navigate('library');
  eq(seen.join(','), 'home:true,library:true,nf:false,library:true');
  eq(router.href('/x'), '#/x');
  router.destroy(); adapter.setHash('#/'); eq(seen.length, 4, 'بعد از destroy اعلان نمی‌رسد');
});

/* ───────── dom (امنیت) ───────── */
test('dom: متن به‌صورت Text Node است نه HTML', () => {
  const el = h('div', null, '<img src=x onerror=alert(1)>');
  eq(el.children.length, 0); eq(el.textContent, '<img src=x onerror=alert(1)>');
});
test('dom: URL ناامن و on* رشته‌ای و innerHTML اعمال نمی‌شوند', () => {
  const a = h('a', { href: 'javascript:alert(1)', onclick: 'alert(1)', innerHTML: '<b>x</b>' }, 'x');
  eq(a.getAttribute('href'), null); eq(a.getAttribute('onclick'), null); eq(a.children.length, 0);
  eq(h('a', { href: 'data:text/html,hi' }).getAttribute('href'), null);
  eq(h('a', { href: '//evil.com' }).getAttribute('href'), null);
  eq(h('a', { href: 'https://a.com' }).getAttribute('href'), 'https://a.com');
  eq(h('a', { href: '#/library' }).getAttribute('href'), '#/library');
  ok(isSafeUrl('mailto:a@b.com')); ok(!isSafeUrl('vbscript:x')); ok(!isSafeUrl(undefined));
  // blob: فقط برای src تصویر مجاز است، نه لینک و نه عناصر دیگر
  ok(!isSafeUrl('blob:http://localhost/abc')); ok(isSafeUrl('blob:http://localhost/abc', { allowBlob: true }));
  eq(h('img', { src: 'blob:http://localhost/abc' }).getAttribute('src'), 'blob:http://localhost/abc');
  eq(h('a', { href: 'blob:http://localhost/abc' }).getAttribute('href'), null);
  eq(h('iframe', { src: 'blob:http://localhost/abc' }).getAttribute('src'), null);
  eq(h('img', { src: 'javascript:alert(1)' }).getAttribute('src'), null);
});
test('dom: رویداد تابعی، class، dataset، style، boolean و آرایه فرزند', () => {
  let clicked = 0;
  const b = h('button', { class: 'x y', dataset: { k: 'v' }, style: { color: 'red' }, hidden: false, onclick: () => { clicked++; } }, ['a', null, 'b']);
  b.click(); eq(clicked, 1);
  eq(b.className, 'x y'); eq(b.dataset.k, 'v'); eq(b.style.color, 'red');
  ok(!b.hasAttribute('hidden')); eq(b.textContent, 'ab');
  ok(h('button', { disabled: true }).hasAttribute('disabled'));
  clear(b); eq(b.childNodes.length, 0);
});
test('icons: همه آیکن‌ها ساخته می‌شوند و aria-hidden دارند', () => {
  for (const n of ICON_NAMES) { const s = icon(n); eq(s.getAttribute('aria-hidden'), 'true'); ok(s.childNodes.length > 0, n); }
  let threw = false; try { icon('nope'); } catch { threw = true; } ok(threw);
});

/* ───────── i18n + prefs ───────── */
test('i18n: t، متغیر، کلید گمشده و ارقام فارسی', () => {
  eq(t('nav.library'), 'کتابخانه');
  eq(t('lib.count', { n: '۳' }), 'تعداد دوره‌های نصب‌شده: ۳');
  eq(t('no.such.key'), 'no.such.key');
  eq(toFaDigits('v12.0'), 'v۱۲.۰');
});
test('i18n: همه کلیدهای مورد نیاز UI تعریف شده‌اند', () => {
  for (const n of NAV_ITEMS) ok(hasKey(n.labelKey), n.labelKey);
  for (const s of STORE_NAMES) ok(hasKey(`store.${s}`), `store.${s}`);
  for (const [key, spec] of Object.entries(SETTINGS_SPEC)) {
    ok(hasKey(`set.${key}`), `set.${key}`);
    for (const v of spec.values) ok(hasKey(`set.${key}.${v}`), `set.${key}.${v}`);
  }
});
test('prefs: اعتبارسنجی، normalize و applyPrefs', () => {
  ok(isValidSetting('fontScale', 'lg')); ok(!isValidSetting('fontScale', 'xl')); ok(!isValidSetting('zzz', 'md'));
  eq(normalizeSettings({ fontScale: 'bad', motion: 'reduce' }).fontScale, DEFAULT_SETTINGS.fontScale);
  eq(normalizeSettings({ fontScale: 'bad', motion: 'reduce' }).motion, 'reduce');
  eq(normalizeSettings().motion, 'auto');
  const root = document.createElement('html');
  applyPrefs(root, { fontScale: 'lg', motion: 'reduce' });
  eq(root.dataset.fontScale, 'lg'); eq(root.dataset.motion, 'reduce');
});

/* ───────── IndexedDB ───────── */
test('db: همه storeها و ایندکس‌ها ساخته می‌شوند', async () => {
  const { db } = await freshRepos();
  eq(db.version, DB_VERSION);
  for (const s of STORE_NAMES) ok(db.objectStoreNames.contains(s), s);
  const tx = db.transaction(['progress', 'notes'], 'readonly');
  ok(tx.objectStore('progress').indexNames.contains('courseId'));
  ok(tx.objectStore('notes').indexNames.contains('lesson'));
  db.close();
});
test('db: CRUD، شمارش، ایندکس و پاک‌سازی', async () => {
  const { db, repos } = await freshRepos();
  await repos.progress.put({ id: 'c1:l1', courseId: 'c1', done: true });
  await repos.progress.put({ id: 'c1:l2', courseId: 'c1', done: false });
  await repos.progress.put({ id: 'c2:l1', courseId: 'c2', done: true });
  eq((await repos.progress.get('c1:l2')).done, false);
  eq(await repos.progress.count(), 3);
  eq((await repos.progress.byIndex('courseId', 'c1')).length, 2);
  await repos.progress.put({ id: 'c1:l2', courseId: 'c1', done: true }); // به‌روزرسانی، نه رکورد جدید
  eq(await repos.progress.count(), 3);
  await repos.progress.delete('c2:l1'); eq(await repos.progress.get('c2:l1'), undefined);
  await repos.progress.clear(); eq(await repos.progress.count(), 0);
  db.close();
});
test('db: settings — پیش‌فرض، ذخیره، رد مقدار نامعتبر', async () => {
  const { db, repos } = await freshRepos();
  eq((await repos.settings.all()).fontScale, 'md');
  await repos.settings.set('fontScale', 'lg');
  eq((await repos.settings.all()).fontScale, 'lg');
  await rejects(() => repos.settings.set('fontScale', 'huge'));
  await rejects(() => repos.settings.set('nope', 'x'));
  eq((await repos.settings.all()).fontScale, 'lg', 'مقدار نامعتبر نباید چیزی را خراب کند');
  db.close();
});
test('db: داده خراب در settings به پیش‌فرض برمی‌گردد', async () => {
  const { db, repos } = await freshRepos();
  await repos.meta.put({ key: 'x', value: 1 });
  const raw = createRepos(db).settings; // همان repo؛ رکورد خراب مستقیم می‌نویسیم
  const tx = db.transaction('settings', 'readwrite');
  tx.objectStore('settings').put({ key: 'fontScale', value: 'garbage' });
  await new Promise((r) => { tx.oncomplete = r; });
  eq((await raw.all()).fontScale, 'md');
  db.close();
});
test('db: ensureMeta ایدمپوتنت است (createdAt عوض نمی‌شود)', async () => {
  const { db, repos } = await freshRepos();
  await repos.ensureMeta();
  const first = (await repos.meta.get('createdAt')).value;
  await new Promise((r) => setTimeout(r, 5));
  await repos.ensureMeta();
  eq((await repos.meta.get('createdAt')).value, first);
  eq((await repos.meta.get('lastOpenedVersion')).value, 'test');
  db.close();
});
test('db: info شمارش رکوردها را درست برمی‌گرداند', async () => {
  const { db, repos } = await freshRepos();
  await repos.courses.put({ id: 'a' }); await repos.notes.put({ id: 'n', courseId: 'a', lessonId: 'l' });
  const info = await repos.info();
  eq(info.version, DB_VERSION); eq(info.counts.courses, 1); eq(info.counts.notes, 1); eq(info.counts.bookmarks, 0);
  db.close();
});
test('db: migration از v1 به v2 داده‌های قبلی را حفظ می‌کند', async () => {
  const name = freshName();
  const v1 = (db) => { db.createObjectStore('items', { keyPath: 'id' }); };
  const v2 = (db, tx) => { tx.objectStore('items').createIndex('tag', 'tag'); db.createObjectStore('extra', { keyPath: 'id' }); };
  let db = await openDb({ name, migrations: [v1] });
  eq(db.version, 1);
  const tx = db.transaction('items', 'readwrite'); tx.objectStore('items').put({ id: 1, tag: 'a' });
  await new Promise((r) => { tx.oncomplete = r; }); db.close();

  db = await openDb({ name, migrations: [v1, v2] });
  eq(db.version, 2);
  ok(db.objectStoreNames.contains('extra'));
  const rt = db.transaction('items', 'readonly');
  ok(rt.objectStore('items').indexNames.contains('tag'));
  const row = await new Promise((res) => { const r = rt.objectStore('items').get(1); r.onsuccess = () => res(r.result); });
  eq(row.tag, 'a', 'داده v1 باید باقی بماند');
  db.close();
});
test('db: نبود IndexedDB به‌صورت خطای قابل مدیریت reject می‌شود', async () => {
  await rejects(() => openDb({ name: 'x', migrations, factory: null }));
});

/* ───────── Views / Shell ───────── */
test('shell: ناوبری، aria-current و اعلان‌گر', () => {
  const root = document.createElement('div');
  const shell = buildShell(root, { href: (p) => '#' + p });
  const links = root.querySelectorAll('[data-nav]');
  eq(links.length, NAV_ITEMS.length);
  eq(root.querySelector('nav').getAttribute('aria-label'), 'ناوبری اصلی');
  shell.setActive('library');
  eq(root.querySelectorAll('[data-nav][aria-current="page"]').length, 1);
  eq(root.querySelector('[aria-current="page"]').dataset.nav, 'library');
  shell.setActive('settings');
  eq(root.querySelector('[aria-current="page"]').dataset.nav, 'settings');
  ok(root.querySelector('main#view')); ok(root.querySelector('[aria-live="polite"]'));
  eq(links[0].getAttribute('href'), '#/');
});
test('view/dashboard: آمار واقعی و حالت خالی', async () => {
  const { db, repos } = await freshRepos();
  const svc = createCourseService(db);
  const router = { href: (p) => '#' + p };
  const store = createStore({ dbStatus: 'ready', settings: { ...DEFAULT_SETTINGS } });
  let { el } = await renderDashboard({ store, repos, svc, router });
  ok(el.querySelector('.empty'), 'بدون دوره باید حالت خالی دیده شود');
  eq(el.querySelectorAll('.stat').length, 4);
  eq(el.querySelector('.stat__value').textContent, '۰');
  eq(el.querySelector('.empty a').getAttribute('href'), '#/library');
  await repos.notes.put({ id: 'n1', courseId: 'c1', lessonId: 'l' });
  ({ el } = await renderDashboard({ store, repos, svc, router }));
  eq(el.querySelectorAll('.stat__value')[2].textContent, '۱');
  db.close();
});
test('view/dashboard و library: خطای DB پیام alert نشان می‌دهد و crash نمی‌کند', async () => {
  const store = createStore({ dbStatus: 'error', settings: { ...DEFAULT_SETTINGS } });
  for (const render of [renderDashboard, renderLibrary, renderSettings]) {
    const { el } = await render({ store, repos: null, svc: null, router: { href: (p) => '#' + p }, saveSetting: async () => ({ persisted: false }) });
    ok(el.querySelector('[role="alert"]'), 'alert');
  }
});
test('view/settings: تغییر گزینه saveSetting را صدا می‌زند و وضعیت DB نمایش داده می‌شود', async () => {
  const { db, repos, name } = await freshRepos();
  const store = createStore({ dbStatus: 'ready', settings: { ...DEFAULT_SETTINGS } });
  const calls = [];
  const saveSetting = async (k, v) => { calls.push([k, v]); return { persisted: true }; };
  const { el } = await renderSettings({ store, repos, saveSetting });
  eq(el.querySelectorAll('input[type=radio]').length, 5);
  eq(el.querySelector('input[name="setting-fontScale"]:checked').value, 'md');
  const lg = el.querySelector('input[name="setting-fontScale"][value="lg"]');
  lg.checked = true;
  lg.dispatchEvent(new (lg.ownerDocument.defaultView.Event)('change'));
  await new Promise((r) => setTimeout(r, 10));
  eq(JSON.stringify(calls), '[["fontScale","lg"]]');
  eq(el.querySelector('[role=status]').textContent, 'تنظیمات ذخیره شد');
  ok(el.textContent.includes(name), 'نام DB');
  eq(el.querySelectorAll('.kv__row').length >= STORE_NAMES.length + 3, true);
  db.close();
});
test('view/notfound: لینک بازگشت', async () => {
  const { el } = await renderNotFound({ router: { href: (p) => '#' + p } });
  eq(el.querySelector('a').getAttribute('href'), '#/');
});

export async function runTests() {
  const results = [];
  for (const { name, fn } of tests) {
    try { await fn(); results.push({ name, ok: true }); } catch (err) { results.push({ name, ok: false, error: err.message }); }
  }
  return results;
}
