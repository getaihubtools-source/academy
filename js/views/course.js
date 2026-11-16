import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t, toFaDigits } from '../core/i18n-fa.js';
import { lessonIndex } from '../packs/loader.js';
import { courseStats, resumeTarget } from '../features/progress.js';
import { dbErrorCallout } from './dashboard.js';
import { courseMetaRow, progressBar, lessonHref } from './parts.js';
import { collectAssessments, summarize } from '../features/assessments.js';

export function notFoundView({ titleKey, textKey, router }) {
  return {
    title: t(titleKey),
    el: h('section', { class: 'pg', 'aria-labelledby': 'page-title' },
      h('div', { class: 'card' }, h('div', { class: 'empty' },
        h('span', { class: 'empty__art' }, icon('alert')),
        h('h1', { id: 'page-title', class: 'empty__title' }, t(titleKey)),
        h('p', null, t(textKey)),
        h('a', { class: 'btn', href: router.href('/library') }, t('course.back'))))),
  };
}

export function assessPanel(sum) {
  const rows = [];
  if (sum.quizzes.total) {
    rows.push(['trophy', t('assess.quizzes', { passed: toFaDigits(sum.quizzes.passed), total: toFaDigits(sum.quizzes.total) })]);
    if (sum.quizzes.attempted) rows.push(['chart', t('assess.avg', { avg: toFaDigits(sum.quizzes.avgBest) })]);
  }
  if (sum.exercises.total) rows.push(['check', t('assess.exercises', { done: toFaDigits(sum.exercises.done), total: toFaDigits(sum.exercises.total) })]);
  if (sum.projects.total) rows.push(['target', t('assess.projects', { done: toFaDigits(sum.projects.done), total: toFaDigits(sum.projects.total) })]);
  return h('section', { class: 'card assess-panel', 'aria-labelledby': 'assess-title' },
    h('h2', { id: 'assess-title' }, t('assess.title')),
    h('ul', null, ...rows.map(([ico, r]) => h('li', null, icon(ico), h('span', null, r)))));
}

function resumeLabel(target) {
  switch (target.kind) {
    case 'start': return t('course.start');
    case 'resume': return t('course.resume', { title: target.lesson.title });
    case 'next': return t('course.next', { title: target.lesson.title });
    default: return t('course.review');
  }
}

function lessonRow(router, courseId, lesson, number, rec) {
  const status = rec ? rec.status : null;
  return h('li', null,
    h('a', { class: `lesson-link${status === 'done' ? ' is-done' : ''}`, href: lessonHref(router, courseId, lesson.lessonId) },
      h('span', { class: 'lesson-link__num', 'aria-hidden': 'true' }, status === 'done' ? '✓' : toFaDigits(number)),
      h('span', { class: 'lesson-link__body' },
        h('strong', null, lesson.title),
        lesson.minutes ? h('span', { class: 'lesson-link__meta' }, t('course.minutes', { n: toFaDigits(lesson.minutes) })) : null),
      // وضعیت همیشه به‌صورت متن هم گفته می‌شود (نه فقط رنگ)
      status ? h('span', { class: `lesson-link__status${status === 'started' ? ' is-started' : ''}` },
        t(status === 'done' ? 'course.status.done' : 'course.status.started')) : null));
}

export async function render({ store, svc, results, router, params }) {
  if (store.get().dbStatus !== 'ready' || !svc) {
    return { title: t('nav.library'), el: h('section', { class: 'pg' }, dbErrorCallout()) };
  }

  const courseId = params.id;
  const meta = await svc.getMeta(courseId);
  const pack = meta ? await svc.getPack(courseId) : null;
  if (!meta || !pack) return notFoundView({ titleKey: 'course.notfound.title', textKey: 'course.notfound.text', router });

  const index = lessonIndex(pack);
  const progress = await svc.progressOf(courseId);
  const stats = courseStats(meta.lessonIds, progress);
  const target = resumeTarget(index, progress);

  // خلاصه ارزیابی‌ها (خطا در خواندن نتایج نباید صفحه دوره را خراب کند)
  let panel = null;
  const assessments = collectAssessments(pack);
  if (assessments.length && results) {
    try { panel = assessPanel(summarize(assessments, await results.ofCourse(courseId))); } catch (err) { console.error('[results] summary failed', err); }
  }

  // فصل‌ها (آکاردئون) با شماره‌گذاری پیوسته درس‌ها در کل دوره؛ فصل درس بعدی باز می‌شود
  const openChapterId = target ? (index.find((x) => x.lessonId === target.lesson.lessonId) || {}).chapterId : null;
  let counter = 0;
  const chapters = pack.manifest.chapters.map((ch, ci) => {
    const doneHere = ch.lessons.filter((ls) => progress.get(ls.id) && progress.get(ls.id).status === 'done').length;
    return h('details', { class: 'chapter', open: openChapterId ? ch.id === openChapterId : ci === 0 },
      h('summary', null,
        h('h2', { class: 'chapter__title' }, ch.title),
        h('span', { class: `badge badge--plain${doneHere === ch.lessons.length && ch.lessons.length ? ' badge--success' : ''}` },
          t('course.chapterProgress', { done: toFaDigits(doneHere), total: toFaDigits(ch.lessons.length) }))),
      h('div', { class: 'acc__body' },
        h('ol', { class: 'lesson-list' }, ch.lessons.map((ls) => {
          counter++;
          const entry = index.find((x) => x.lessonId === ls.id);
          return lessonRow(router, courseId, entry, counter, progress.get(ls.id));
        }))));
  });

  // حذف دوره: دو مرحله‌ای تا اشتباهی پاک نشود
  const removeBox = h('div', { class: 'danger-zone' });
  const showRemoveStart = () => {
    removeBox.replaceChildren(h('button', { class: 'btn btn--danger btn--sm', type: 'button', onclick: showRemoveConfirm }, icon('trash'), t('course.remove')));
  };
  const showRemoveConfirm = () => {
    const confirmBtn = h('button', {
      class: 'btn btn--danger btn--sm', type: 'button',
      onclick: async () => { confirmBtn.disabled = true; await svc.remove(courseId); router.navigate('/library'); },
    }, t('course.remove.confirm'));
    removeBox.replaceChildren(
      h('p', { role: 'alert' }, t('course.remove.warn')),
      h('div', { class: 'danger-zone__actions' }, confirmBtn,
        h('button', { class: 'btn btn--sm', type: 'button', onclick: showRemoveStart }, t('course.remove.cancel'))));
    confirmBtn.focus();
  };
  showRemoveStart();

  const el = h('section', { class: 'pg', 'aria-labelledby': 'page-title' },
    h('nav', { 'aria-label': t('lesson.crumbs') },
      h('ol', { class: 'crumbs' },
        h('li', null, h('a', { href: router.href('/library') }, t('nav.library'))),
        h('li', { 'aria-current': 'page' }, meta.title))),

    h('header', { class: 'card card--brand card--hero pattern-girih course-head' },
      h('h1', { id: 'page-title' }, meta.title),
      meta.subtitle ? h('p', { class: 'course-head__sub' }, meta.subtitle) : null,
      meta.author ? h('p', { class: 'course-head__by' }, t('course.by', { a: meta.author })) : null,
      courseMetaRow(meta),
      progressBar(stats),
      target ? h('a', { class: 'btn btn--accent btn--lg', href: lessonHref(router, courseId, target.lesson.lessonId) }, resumeLabel(target), h('span', { class: 'rtl-flip' }, icon('next'))) : null),

    h('div', { class: 'grid grid--main-side' },
      h('div', { class: 'stack' },
        pack.manifest.description ? h('p', { class: 'course-desc' }, pack.manifest.description) : null,
        h('section', { class: 'stack', 'aria-labelledby': 'chapters-title' },
          h('h2', { id: 'chapters-title' }, t('course.chaptersTitle')),
          h('div', { class: 'acc' }, chapters))),
      h('div', { class: 'stack' }, panel, removeBox)));

  return { el, title: meta.title };
}
