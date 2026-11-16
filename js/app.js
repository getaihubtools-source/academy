// نقطه ورود: DB → تنظیمات → پوسته → Router → رندر صفحه‌ها
import { createStore } from './core/store.js';
import { createRouter } from './core/router.js';
import { clear } from './core/dom.js';
import { t } from './core/i18n-fa.js';
import { APP_VERSION } from './core/config.js';
import { DEFAULT_SETTINGS, applyPrefs, isValidSetting, normalizeSettings } from './core/prefs.js';
import { openDb } from './db/idb.js';
import { DB_NAME, migrations } from './db/schema.js';
import { createRepos } from './db/repos.js';
import { createCourseService } from './db/courses.js';
import { createNotesService } from './db/notes.js';
import { createResultsService } from './db/results.js';
import { buildShell, NAV_ITEMS } from './views/shell.js';
import { render as renderDashboard } from './views/dashboard.js';
import { render as renderLibrary } from './views/library.js';
import { render as renderSettings } from './views/settings.js';
import { render as renderCourse } from './views/course.js';
import { render as renderLesson } from './views/lesson.js';
import { render as renderSearch } from './views/search.js';
import { render as renderSaved } from './views/saved.js';
import { render as renderNotFound } from './views/notfound.js';
import { h } from './core/dom.js';
import { createPwa } from './pwa/register.js';
import { createInstaller } from './pwa/install.js';
import { downloadText } from './views/backup-panel.js';

// جدول صفحه‌ها: افزودن صفحه جدید = افزودن یک خط (مراحل بعد: /course/:id و ...)
export const ROUTES = [
  { name: 'dashboard', path: '/', titleKey: 'nav.dashboard', view: renderDashboard },
  { name: 'library', path: '/library', titleKey: 'nav.library', view: renderLibrary },
  // صفحه‌های دوره/درس زیرمجموعه «کتابخانه» هستند (برای مشخص‌شدن آیتم فعال ناوبری)
  { name: 'course', path: '/course/:id', nav: 'library', titleKey: 'nav.library', view: renderCourse },
  { name: 'lesson', path: '/course/:id/lesson/:lid', nav: 'library', titleKey: 'nav.library', view: renderLesson },
  { name: 'search', path: '/search', titleKey: 'search.title', view: renderSearch },
  { name: 'saved', path: '/saved', titleKey: 'saved.title', view: renderSaved },
  { name: 'settings', path: '/settings', titleKey: 'nav.settings', view: renderSettings },
];
export const NOT_FOUND = { name: 'notfound', path: '*', titleKey: 'nf.title', view: renderNotFound };

async function initData(store) {
  try {
    const db = await openDb({
      name: DB_NAME,
      migrations,
      onBlocked: () => console.warn('[db] upgrade blocked by another open tab'),
    });
    const repos = createRepos(db, APP_VERSION);
    await repos.ensureMeta();
    const settings = await repos.settings.all();
    store.set({ dbStatus: 'ready', settings });
    return repos;
  } catch (err) {
    console.error('[db] unavailable', err);
    store.set({ dbStatus: 'error', dbError: String(err && err.message || err) });
    return null;
  }
}

export async function boot() {
  const root = document.getElementById('app');
  const store = createStore({ dbStatus: 'opening', dbError: null, settings: { ...DEFAULT_SETTINGS } });

  applyPrefs(document.documentElement, store.get().settings);
  store.subscribe((s) => applyPrefs(document.documentElement, s.settings), ['settings']);

  const repos = await initData(store);
  const router = createRouter({ routes: ROUTES, notFound: NOT_FOUND });
  const shell = buildShell(root, { href: router.href });

  async function saveSetting(key, value) {
    if (!isValidSetting(key, value)) throw new Error(`Invalid setting: ${key}`);
    let persisted = false;
    if (repos) {
      try { await repos.settings.set(key, value); persisted = true; } catch (err) { console.error('[settings] save failed', err); }
    }
    store.set((s) => ({ settings: normalizeSettings({ ...s.settings, [key]: value }) }));
    return { persisted };
  }

  const svc = repos ? createCourseService(repos.db) : null;
  const notes = repos ? createNotesService(repos.db) : null;
  const results = repos ? createResultsService(repos.db) : null;
  const pwa = createPwa();
  const installer = createInstaller();
  const ctx = {
    store, repos, svc, notes, results, router, saveSetting, announce: shell.announce,
    pwa, installer, download: downloadText, reload: () => location.reload(),
  };
  pwa.subscribe((s) => { if (s.updateAvailable) shell.showUpdate({ onApply: () => pwa.applyUpdate() }); });
  // Service Worker فقط روی http(s)؛ روی file:// کار نمی‌کند و برنامه همچنان معمولی اجرا می‌شود
  if (typeof location !== 'undefined' && /^https?:$/.test(location.protocol)) {
    pwa.register();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pwa.checkForUpdate(); });
  }

  // Command palette (Ctrl+K): صفحه‌ها، دوره‌ها و دستورها؛ فقط وقتی AIhub Design System لود شده باشد
  const DS = typeof window !== 'undefined' ? window.AIhub : null;
  const ICON_ID = { home: 'i-home', library: 'i-book', search: 'i-search', note: 'i-note', settings: 'i-gear' };
  let cmdSeq = 0;
  async function refreshCommands() {
    if (!DS || !DS.cmdk) return;
    const my = ++cmdSeq;
    let courses = [];
    try { courses = svc ? await svc.listCourses() : []; } catch (err) { console.error('[cmdk] courses failed', err); }
    if (my !== cmdSeq) return;
    DS.cmdk.clear();
    DS.cmdk.register(NAV_ITEMS.map((item) => ({
      title: t(item.labelKey), group: t('cmdk.pages'), icon: ICON_ID[item.icon], hint: t('cmdk.go'),
      run: () => router.navigate(item.path),
    })));
    DS.cmdk.register(courses.map((c) => ({
      title: c.title, group: t('cmdk.courses'), icon: 'i-book', hint: t('cmdk.openCourse'),
      keywords: [c.subtitle || '', c.author || ''],
      run: () => router.navigate(`/course/${encodeURIComponent(c.id)}`),
    })));
    DS.cmdk.register([
      { title: t('cmdk.fulltext'), group: t('cmdk.actions'), icon: 'i-search', keywords: ['جست‌وجو', 'پیدا کردن', 'متن'], run: () => router.navigate('/search') },
      { title: t('cmdk.theme'), group: t('cmdk.actions'), icon: 'i-moon', keywords: ['تیره', 'روشن', 'دارک', 'تم'], run: () => DS.theme.toggle() },
    ]);
  }
  ctx.refreshCommands = refreshCommands;
  if (DS && DS.cmdk) {
    refreshCommands();
  }

  let token = 0;
  let current = null;
  let firstRender = true;

  async function show(match) {
    const myToken = ++token;
    shell.setActive(match.route.nav || match.name);

    let result;
    try {
      result = await match.route.view({ ...ctx, params: match.params, query: match.query });
    } catch (err) {
      console.error('[view] render failed', err);
      result = { el: h('section', { class: 'pg' }, h('h1', null, t('err.view.title')), h('p', null, t('err.view.text'))) };
    }
    if (myToken !== token) { if (result.destroy) result.destroy(); return; } // ناوبری جدیدتر رسیده

    if (current && current.destroy) current.destroy();
    current = result;
    clear(shell.view);
    shell.view.append(result.el);

    const title = result.title || t(match.route.titleKey);
    shell.setTitle(title);
    if (match.name === 'library' || match.name === 'course') refreshCommands();
    document.title = `${title} | ${t('app.name')}`;
    if (!firstRender) { window.scrollTo(0, 0); shell.focusView(); shell.announce(title); }
    firstRender = false;
    if (typeof result.mounted === 'function') {
      try { result.mounted(); } catch (err) { console.error('[view] mounted failed', err); }
    }
  }

  router.onChange(show);
  router.start();
  return { store, router, repos };
}

// فقط در مرورگر خودکار اجرا شود (نه در تست‌های Node)
if (typeof document !== 'undefined' && document.getElementById('app')) {
  boot().catch((err) => {
    console.error('[boot] fatal', err);
    const root = document.getElementById('app');
    if (root) root.textContent = t('err.view.title');
  });
}
