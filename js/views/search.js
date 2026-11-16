// صفحه جست‌وجو: آفلاین روی ایندکس ذخیره‌شده هر دوره
import { h } from '../core/dom.js';
import { t, toFaDigits } from '../core/i18n-fa.js';
import { icon } from '../core/icons.js';
import { searchIndexes, parseQuery, buildSnippet } from '../features/search.js';
import { dbErrorCallout } from './dashboard.js';
import { lessonHref } from './parts.js';

export const DEBOUNCE_MS = 200;

function snippetEl(hit, tokens) {
  const snip = buildSnippet(hit.text, tokens);
  return h('p', { class: 'result__snippet' },
    snip.startCut ? '… ' : null,
    ...snip.segments.map((s) => (s.mark ? h('mark', null, s.text) : s.text)),
    snip.endCut ? ' …' : null);
}

export async function render({ store, svc, router, query, announce }) {
  if (store.get().dbStatus !== 'ready' || !svc) {
    return { title: t('search.title'), el: h('section', { class: 'pg' }, dbErrorCallout()) };
  }
  const courses = await svc.listCourses();
  if (!courses.length) {
    return {
      title: t('search.title'),
      el: h('section', { class: 'pg' },
        h('header', { class: 'page-head' }, h('h1', { id: 'page-title' }, t('search.title'))),
        h('div', { class: 'card' }, h('div', { class: 'empty' },
          h('span', { class: 'empty__art' }, icon('search')),
          h('h2', { class: 'empty__title' }, t('search.empty.title')), h('p', null, t('search.empty.text')),
          h('a', { class: 'btn btn--primary', href: router.href('/library') }, t('nav.library'))))),
    };
  }

  const titles = new Map(courses.map((c) => [c.id, c.title]));
  const indexCache = new Map();
  const getIndex = async (id) => {
    if (!indexCache.has(id)) indexCache.set(id, await svc.getSearchIndex(id));
    return indexCache.get(id);
  };

  const initialQ = (query && query.get('q')) || '';
  const initialCourse = (query && query.get('course')) || '';

  const input = h('input', { id: 'search-input', class: 'input search__input', type: 'search', value: initialQ, placeholder: t('search.placeholder'), autocomplete: 'off', enterkeyhint: 'search' });
  const select = courses.length > 1
    ? h('select', { id: 'search-course', class: 'select search__select' },
      h('option', { value: '' }, t('search.allCourses')),
      ...courses.map((c) => h('option', { value: c.id, selected: c.id === initialCourse }, c.title)))
    : null;
  const status = h('p', { class: 'search__status', role: 'status' }, '');
  const list = h('div', { class: 'search__results' });

  let seq = 0;
  let timer = null;
  let destroyed = false;

  async function run() {
    const my = ++seq;
    const q = input.value;
    const courseId = select ? select.value : '';
    const { tokens, valid } = parseQuery(q);
    // آدرس را بدون رندر دوباره به‌روز کن تا بعد از برگشت از درس، جست‌وجو برگردد
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (courseId) params.set('course', courseId);
    const qs = params.toString();
    router.navigate(`/search${qs ? `?${qs}` : ''}`, { silent: true });

    if (!valid) {
      list.replaceChildren();
      status.textContent = '';
      return;
    }
    let results;
    try {
      const ids = courseId ? [courseId] : courses.map((c) => c.id);
      const indexes = (await Promise.all(ids.map(getIndex))).filter(Boolean);
      results = searchIndexes(indexes, q);
    } catch (err) {
      console.error('[search] failed', err);
      if (my === seq && !destroyed) { list.replaceChildren(); status.textContent = t('search.error'); }
      return;
    }
    if (my !== seq || destroyed) return; // نتیجه قدیمی

    if (!results.length) {
      list.replaceChildren();
      status.textContent = t('search.none');
      announce(t('search.none'));
      return;
    }
    status.textContent = t('search.count', { n: toFaDigits(results.length) });
    list.replaceChildren(...results.map((r) => h('article', { class: 'result card' },
      h('h2', { class: 'result__title' },
        h('a', { href: lessonHref(router, r.courseId, r.lessonId) }, r.title)),
      h('p', { class: 'result__crumb' },
        courses.length > 1 ? `${titles.get(r.courseId) || ''} · ` : '', r.chapterTitle),
      ...r.hits.map((hit) => h('a', {
        class: 'result__hit',
        href: lessonHref(router, r.courseId, r.lessonId) + (hit.id ? `?block=${encodeURIComponent(hit.id)}` : ''),
      }, snippetEl(hit, tokens))))));
  }

  const schedule = () => { clearTimeout(timer); timer = setTimeout(run, DEBOUNCE_MS); };
  input.addEventListener('input', schedule);
  if (select) select.addEventListener('change', run);

  const el = h('section', { class: 'pg pg--search', 'aria-labelledby': 'page-title' },
    h('header', { class: 'page-head' }, h('div', null, h('h1', { id: 'page-title' }, t('search.title')), h('p', { class: 'page-head__sub' }, t('search.hint')))),
    h('form', { class: 'search__form', role: 'search', onsubmit: (e) => { e.preventDefault(); clearTimeout(timer); run(); } },
      h('label', { for: 'search-input', class: 'sr-only' }, t('search.label')),
      h('div', { class: 'search search--lg' }, icon('search'), input),
      select ? h('label', { class: 'field search__course' }, h('span', { class: 'field__label' }, t('search.course')), select) : null),
    status, list);

  return {
    el, title: t('search.title'),
    mounted: () => { if (initialQ) run(); else input.focus({ preventScroll: true }); },
    destroy: () => { destroyed = true; clearTimeout(timer); },
  };
}
