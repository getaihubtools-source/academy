// پوسته برنامه (AIhub Design System): سایدبار/ریل/drawer، نوار بالا، ناوبری پایین موبایل، ناحیه محتوا، اعلان‌گر صفحه‌خوان
import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t } from '../core/i18n-fa.js';

export const NAV_ITEMS = [
  { name: 'dashboard', path: '/', icon: 'home', labelKey: 'nav.dashboard', group: 'learn' },
  { name: 'library', path: '/library', icon: 'library', labelKey: 'nav.library', group: 'learn' },
  { name: 'search', path: '/search', icon: 'search', labelKey: 'nav.search', group: 'learn' },
  { name: 'saved', path: '/saved', icon: 'note', labelKey: 'nav.saved', group: 'tools' },
  { name: 'settings', path: '/settings', icon: 'settings', labelKey: 'nav.settings', group: 'tools' },
];

// در فونت‌های sans «I» بزرگ و «l» کوچک یکسان‌اند و AIhub شبیه Alhub دیده می‌شود؛
// پس «AI» با فونت mono (دارای serif) و رنگ برند جدا می‌شود.
function brandName() {
  const name = t('app.name');
  return name.startsWith('AI')
    ? [h('span', { class: 'brand__ai' }, 'AI'), name.slice(2)]
    : [name];
}

function brand(extraClass = '') {
  return h('div', { class: `brand ${extraClass}`.trim() },
    h('span', { class: 'brand__mark' }, icon('spark')),
    h('span', { class: 'brand__name' },
      // متن لاتین ایزوله می‌شود تا در جهت RTL صفحه جابه‌جا نشود؛ اسم برند برای صفحه‌خوان سالم می‌ماند
      h('span', { dir: 'ltr', class: 'ltr' }, brandName()),
      h('span', { class: 'brand__tag' }, t('app.tagline'))));
}

export function buildShell(root, { href }) {
  const view = h('main', { id: 'view', class: 'page', tabindex: '-1' });
  const announcer = h('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });

  // سایدبار: گروه‌بندی با عنوان
  const sideLinks = [];
  const sideNav = h('nav', { class: 'sidebar__nav', 'aria-label': t('nav.main') });
  let lastGroup = null;
  for (const item of NAV_ITEMS) {
    if (item.group !== lastGroup) { sideNav.append(h('div', { class: 'nav__title' }, t(`nav.group.${item.group}`))); lastGroup = item.group; }
    const a = h('a', { class: 'nav__item', href: href(item.path), 'data-nav': item.name, 'data-tip': t(item.labelKey), 'data-tip-pos': 'side' },
      icon(item.icon), h('span', { class: 'nav__label' }, t(item.labelKey)));
    sideLinks.push(a); sideNav.append(a);
  }

  // ناوبری پایین (موبایل)
  const bottomLinks = NAV_ITEMS.map((item) =>
    h('a', { href: href(item.path), 'data-bnav': item.name },
      h('span', { class: 'ico-wrap' }, icon(item.icon)), h('span', null, t(item.labelKey))));

  const title = h('h2', { class: 'topbar__title' }, t('app.name'));
  const crumbTail = h('li', { 'aria-current': 'page' }, '');
  const updateBar = h('div', { class: 'update-bar', role: 'region', 'aria-label': t('pwa.update.text'), hidden: true });
  const skip = h('button', { class: 'skip', type: 'button', onclick: () => view.focus() }, t('skip'));

  const sidebar = h('aside', { class: 'sidebar', id: 'sidebar' },
    h('div', { class: 'sidebar__head' }, brand(),
      h('button', { class: 'btn btn--ghost btn--icon sidebar__close', type: 'button', 'data-drawer-close': '', 'aria-label': t('nav.closeMenu') }, icon('close'))),
    sideNav,
    h('div', { class: 'sidebar__foot' },
      h('button', { class: 'btn btn--ghost sidebar__toggle', type: 'button', 'data-sidebar-toggle': '', 'aria-label': t('nav.collapse'), 'aria-pressed': 'false' },
        icon('panel'), h('span', { class: 'sidebar__toggle-label' }, t('nav.collapse')))));

  const topbar = h('header', { class: 'topbar' },
    h('button', { class: 'btn btn--ghost btn--icon menu-btn', type: 'button', 'data-drawer-open': '', 'aria-expanded': 'false', 'aria-controls': 'sidebar', 'aria-label': t('nav.more') }, icon('menu')),
    title,
    h('ol', { class: 'crumbs crumbs--top' }, h('li', null, t('app.name')), crumbTail),
    h('div', { class: 'topbar__actions' },
      h('button', { class: 'search-trigger', type: 'button', 'data-cmdk-open': '', 'aria-label': t('cmdk.open') },
        icon('search'), h('span', { class: 'search-trigger__text' }, t('cmdk.open')), h('span', { class: 'kbd' }, 'Ctrl K')),
      h('button', { class: 'btn btn--ghost btn--icon theme-toggle', type: 'button', 'data-theme-toggle': '', 'aria-pressed': 'false', 'aria-label': t('theme.toggle') },
        icon('moon'), icon('sun'))));

  clear(root);
  root.append(
    skip,
    h('div', { class: 'app', 'data-sidebar': 'expanded' },
      sidebar,
      h('div', { class: 'scrim', 'data-drawer-close': '' }),
      h('div', { class: 'app__main' }, topbar, view)),
    h('nav', { class: 'bottomnav', 'aria-label': t('nav.quick') }, bottomLinks),
    updateBar,
    announcer,
  );

  return {
    view,
    setActive(name) {
      for (const a of sideLinks) {
        if (a.dataset.nav === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      }
      for (const a of bottomLinks) {
        if (a.dataset.bnav === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      }
    },
    setTitle(text) { title.textContent = text; crumbTail.textContent = text; },
    announce(message) {
      announcer.textContent = '';
      // تغییر محتوا در فریم بعد تا صفحه‌خوان حتی پیام تکراری را بخواند
      setTimeout(() => { announcer.textContent = message; }, 30);
    },
    // نوار «نسخه جدید آماده است»؛ فقط با اقدام کاربر اعمال می‌شود
    showUpdate({ onApply }) {
      const apply = h('button', { class: 'btn btn--primary btn--sm', type: 'button' }, t('pwa.update.apply'));
      const later = h('button', { class: 'btn btn--sm', type: 'button' }, t('pwa.update.later'));
      apply.addEventListener('click', () => { apply.disabled = true; onApply(); });
      later.addEventListener('click', () => { updateBar.hidden = true; });
      updateBar.replaceChildren(
        h('span', { class: 'update-bar__text' }, icon('spark'), t('pwa.update.text')),
        h('div', { class: 'update-bar__actions' }, apply, later));
      updateBar.hidden = false;
    },
    focusView() { view.focus({ preventScroll: true }); },
  };
}
