import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t, toFaDigits } from '../core/i18n-fa.js';
import { courseStats } from '../features/progress.js';
import { courseCard, courseHref, progressBar } from './parts.js';
import { summarize } from '../features/assessments.js';

function stat(value, labelKey, iconName) {
  return h('div', { class: 'card kpi' },
    h('span', { class: 'kpi__ico' }, icon(iconName)),
    h('div', { class: 'stat' },
      h('span', { class: 'stat__value' }, toFaDigits(value)),
      h('span', { class: 'stat__label' }, t(labelKey))));
}

export function dbErrorCallout() {
  return h('div', { class: 'alert alert--danger', role: 'alert' },
    icon('alert'),
    h('div', null, h('h3', null, t('err.db.title')), h('p', null, t('err.db.text'))));
}

const RECENT_COURSES = 3;

function quickLink(href, iconName, text) {
  return h('a', { class: 'list__row is-tappable', href },
    h('span', { class: 'list__icon' }, icon(iconName)),
    h('span', { class: 'list__title grow' }, text),
    h('span', { class: 'rtl-flip' }, icon('next')));
}

export async function render({ store, repos, svc, results, router }) {
  const ready = store.get().dbStatus === 'ready' && repos && svc;
  const counts = ready ? (await repos.info()).counts : { courses: 0, progress: 0, notes: 0, bookmarks: 0 };
  const courses = ready ? await svc.listCourses() : [];
  const progress = ready ? await svc.progressAll() : new Map();

  // آخرین درس لمس‌شده در همه دوره‌ها
  let last = null;
  for (const meta of courses) {
    for (const rec of (progress.get(meta.id) || new Map()).values()) {
      if (!last || rec.updatedAt > last.rec.updatedAt) last = { meta, rec };
    }
  }

  // جمع وضعیت درس‌ها در همه دوره‌ها (برای نمودار)
  const totals = { done: 0, started: 0, todo: 0 };
  for (const meta of courses) {
    const s = courseStats(meta.lessonIds, progress.get(meta.id) || new Map());
    totals.done += s.done; totals.started += s.started; totals.todo += s.total - s.done - s.started;
  }
  const totalLessons = totals.done + totals.started + totals.todo;

  // خلاصه آزمون‌ها روی کارت (خطا در خواندن نتایج نباید داشبورد را خراب کند)
  const shown = courses.slice(0, RECENT_COURSES);
  const resultRows = new Map();
  if (ready && results) {
    for (const meta of shown) {
      if (!(meta.assessments || []).some((a) => a.type === 'quiz')) continue;
      try { resultRows.set(meta.id, await results.ofCourse(meta.id)); } catch (err) { console.error('[dash] results failed', err); }
    }
  }
  const quizLine = (meta, rows) => {
    if (!rows) return null;
    const q = summarize(meta.assessments || [], rows).quizzes;
    return q.total ? h('p', { class: 'meta-row' }, h('span', { class: 'meta-chip' }, icon('trophy'), t('assess.dash', { passed: toFaDigits(q.passed), total: toFaDigits(q.total) }))) : null;
  };

  const hero = last
    ? h('div', { class: 'card card--brand card--hero pattern-girih hero' },
      h('p', { class: 'hero__eyebrow' }, icon('play'), t('dash.continue')),
      h('h2', { class: 'hero__title' }, last.meta.title),
      last.rec.lessonTitle ? h('p', { class: 'muted hero__sub' }, t('dash.continue.last', { title: last.rec.lessonTitle })) : null,
      h('div', { class: 'hero__prog' }, progressBar(courseStats(last.meta.lessonIds, progress.get(last.meta.id) || new Map()))),
      h('a', { class: 'btn btn--accent btn--lg', href: courseHref(router, last.meta.id) }, t('dash.continue.go'), h('span', { class: 'rtl-flip' }, icon('next'))))
    : h('div', { class: 'card card--brand card--hero pattern-girih hero' },
      h('p', { class: 'hero__eyebrow' }, icon('spark'), t('dash.hello')),
      h('h2', { class: 'hero__title' }, 'به ', h('span', { dir: 'ltr', class: 'ltr' }, h('span', { class: 'hero__ai' }, 'AI'), 'hub Academy'), ' خوش آمدید'),
      h('p', { class: 'muted hero__sub' }, t('dash.lead')));

  const donutBox = h('div', { class: 'status-donut' });
  const donutCard = h('div', { class: 'card' },
    h('div', { class: 'card__head' }, h('h2', null, t('dash.status'))),
    totalLessons
      ? donutBox
      : h('p', { class: 'muted' }, t('dash.status.empty')));

  const el = h('section', { class: 'pg', 'aria-labelledby': 'page-title' },
    h('header', { class: 'page-head' },
      h('div', null, h('h1', { id: 'page-title' }, t('dash.title')), h('p', { class: 'page-head__sub' }, t('dash.hello.sub')))),

    ready ? null : dbErrorCallout(),

    hero,

    h('section', { class: 'kpis', 'aria-label': t('dash.stats') },
      stat(counts.courses, 'dash.stat.courses', 'library'),
      stat(counts.progress, 'dash.stat.lessons', 'target'),
      stat(counts.notes, 'dash.stat.notes', 'note'),
      stat(counts.bookmarks, 'dash.stat.bookmarks', 'bookmark')),

    courses.length === 0
      ? h('div', { class: 'card' }, h('div', { class: 'empty' },
        h('span', { class: 'empty__art' }, icon('library')),
        h('h2', { class: 'empty__title' }, t('dash.empty.title')),
        h('p', null, t('dash.empty.text')),
        ready ? h('a', { class: 'btn btn--primary', href: router.href('/library') }, t('dash.empty.cta')) : null))
      : h('div', { class: 'grid grid--main-side' },
        h('section', { class: 'stack', 'aria-labelledby': 'dash-courses' },
          h('div', { class: 'section__title' },
            h('h2', { id: 'dash-courses' }, t('dash.courses')),
            h('a', { href: router.href('/library') }, t('dash.viewAll'))),
          h('div', { class: 'course-grid' }, shown.map((meta) =>
            courseCard(meta, courseStats(meta.lessonIds, progress.get(meta.id) || new Map()), courseHref(router, meta.id), quizLine(meta, resultRows.get(meta.id)))))),
        h('div', { class: 'stack' },
          donutCard,
          h('div', { class: 'card' },
            h('div', { class: 'card__head' }, h('h2', null, t('dash.quick'))),
            h('div', { class: 'list list--flush' },
              quickLink(router.href('/search'), 'search', t('dash.quick.search')),
              quickLink(router.href('/saved'), 'bookmark', t('dash.quick.saved')),
              quickLink(router.href('/settings'), 'database', t('dash.quick.backup')))))));

  const mounted = () => {
    const DS = typeof window !== 'undefined' ? window.AIhub : null;
    if (!DS || !DS.charts || !totalLessons) return;
    DS.charts.donut(donutBox, {
      items: [
        { label: t('dash.status.done'), value: totals.done },
        { label: t('dash.status.started'), value: totals.started },
        { label: t('dash.status.todo'), value: totals.todo },
      ],
      centerLabel: t('dash.status.center'), label: t('dash.status'), size: 148, thickness: 20,
    });
  };

  return { el, mounted };
}
