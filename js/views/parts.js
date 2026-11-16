// اجزای مشترک صفحه‌های دوره
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t, toFaDigits } from '../core/i18n-fa.js';

export const MAX_MARKS = 24; // بیش از این، تایم‌لاین کلیدفریم به نوار ساده برمی‌گردد

// هر درس یک کلیدفریم: توخالی (شروع‌نشده)، کهربایی (در حال مطالعه)، فیروزه‌ای پر (انجام‌شده)
export function progressBar(stats) {
  const marks = Array.isArray(stats.marks) && stats.marks.length > 0 && stats.marks.length <= MAX_MARKS ? stats.marks : null;
  const track = h('div', {
    class: `progress prog__track${marks ? ' has-marks' : ''}`, role: 'progressbar',
    'aria-label': t('course.progress'), 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': stats.percent,
    style: { '--value': `${stats.percent}%` },
  }, h('i'),
  marks ? h('ul', { class: 'prog__marks', 'aria-hidden': 'true' }, marks.map((m) => h('li', { class: `mark${m ? ` mark--${m}` : ''}` }))) : null);
  return h('div', { class: 'prog' },
    track,
    h('div', { class: 'prog__label' },
      h('span', null, t('course.progress.label', { done: toFaDigits(stats.done), total: toFaDigits(stats.total) })),
      h('span', { class: 'prog__pct' }, `${toFaDigits(stats.percent)}٪`)));
}

export function courseMetaRow(meta) {
  const chip = (ico, text) => h('span', { class: 'meta-chip' }, icon(ico), text);
  return h('div', { class: 'meta-row' },
    chip('layers', t('course.chapters', { n: toFaDigits(meta.chapterCount) })),
    chip('library', t('course.lessons', { n: toFaDigits(meta.lessonCount) })),
    meta.totalMinutes ? chip('clock', t('course.minutes', { n: toFaDigits(meta.totalMinutes) })) : null,
    h('span', { class: 'meta-chip meta-chip--plain' }, t('course.version', { v: toFaDigits(meta.version) })));
}

// کاور هر دوره: یکی از سه گرادیان برند (از روی شناسه دوره، پایدار بین بارگذاری‌ها)
export function coverVariant(id) {
  let n = 0;
  for (const ch of String(id)) n = (n + ch.charCodeAt(0)) % 3;
  return n;
}

export function statusBadge(stats) {
  if (stats.total > 0 && stats.done >= stats.total) return h('span', { class: 'badge badge--success' }, t('lib.filter.done'));
  if (stats.done > 0 || (stats.marks && stats.marks.some(Boolean))) return h('span', { class: 'badge badge--brand' }, t('lib.filter.active'));
  return h('span', { class: 'badge badge--accent' }, t('lib.filter.new'));
}

export function courseCard(meta, stats, href, extra = null) {
  return h('article', { class: 'course-card card card--interactive' },
    h('div', { class: `course-card__cover pattern-girih cover--${coverVariant(meta.id)}`, 'aria-hidden': 'true' },
      h('span', { class: 'course-card__ico' }, icon('library')),
      h('span', { class: 'course-card__pct' }, `${toFaDigits(stats.percent)}٪`)),
    h('div', { class: 'course-card__body' },
      h('div', { class: 'course-card__status' }, statusBadge(stats)),
      h('h2', { class: 'course-card__title' }, h('a', { href }, meta.title)),
      meta.subtitle ? h('p', { class: 'course-card__sub' }, meta.subtitle) : null,
      courseMetaRow(meta),
      progressBar(stats),
      extra));
}

export function lessonHref(router, courseId, lessonId) {
  return router.href(`/course/${encodeURIComponent(courseId)}/lesson/${encodeURIComponent(lessonId)}`);
}
export const courseHref = (router, courseId) => router.href(`/course/${encodeURIComponent(courseId)}`);
