import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t, toFaDigits } from '../core/i18n-fa.js';
import { lessonIndex, createAssetStore } from '../packs/loader.js';
import { renderLessonBlocks } from '../render/lesson.js';
import { neighbors } from '../features/progress.js';
import { dbErrorCallout } from './dashboard.js';
import { notFoundView } from './course.js';
import { lessonHref, courseHref } from './parts.js';
import { lessonBookmark, attachBlockBookmarks, notesPanel } from './lesson-tools.js';
import { cleanText } from '../render/sanitize.js';

export async function render({ store, svc, notes, results, router, params, query, announce }) {
  if (store.get().dbStatus !== 'ready' || !svc) {
    return { title: t('nav.library'), el: h('section', { class: 'pg' }, dbErrorCallout()) };
  }

  const { id: courseId, lid: lessonId } = params;
  const meta = await svc.getMeta(courseId);
  const pack = meta ? await svc.getPack(courseId) : null;
  if (!meta || !pack) return notFoundView({ titleKey: 'course.notfound.title', textKey: 'course.notfound.text', router });

  const index = lessonIndex(pack);
  const lesson = index.find((l) => l.lessonId === lessonId);
  if (!lesson) return notFoundView({ titleKey: 'lesson.notfound.title', textKey: 'lesson.notfound.text', router });

  // ثبت «ادامه از اینجا» (خطای ذخیره نباید خواندن درس را مختل کند)
  let record = null;
  try { record = await svc.touchLesson(courseId, lessonId, lesson.title); } catch (err) { console.error('[progress] touch failed', err); }

  const assets = createAssetStore(pack);

  // نتایج قبلی آزمون/تمرین این درس؛ اگر خواندن شکست خورد، بلوک‌ها بدون ذخیره‌سازی کار می‌کنند
  let resultsCtx;
  if (results) {
    try {
      const saved = await results.ofLesson(courseId, lessonId);
      const ids = { courseId, lessonId };
      resultsCtx = {
        get: (blockId) => saved.get(blockId) || null,
        async saveQuiz(blockId, score) { const r = await results.saveQuiz({ ...ids, blockId, score }); saved.set(blockId, r); return r; },
        async saveChecklist(blockId, data) { const r = await results.saveChecklist({ ...ids, blockId, ...data }); saved.set(blockId, r); return r; },
      };
    } catch (err) { console.error('[results] load failed', err); }
  }
  const body = renderLessonBlocks(pack, lessonId, { assetUrl: (id) => assets.url(id), results: resultsCtx });
  const { prev, next, position, total } = neighbors(index, lessonId);

  // ابزارهای یادگیری (اگر سرویس نشان/یادداشت در دسترس نباشد، درس بدون آن‌ها نمایش داده می‌شود)
  const toolCtx = { courseId, lessonId, lessonTitle: lesson.title, courseTitle: meta.title };
  let lessonMarked = false;
  let blockMarks = new Set();
  let lessonNotes = [];
  if (notes) {
    try {
      const marks = await notes.bookmarksOfLesson(courseId, lessonId);
      lessonMarked = marks.some((m) => !m.blockId);
      blockMarks = new Set(marks.filter((m) => m.blockId).map((m) => m.blockId));
      lessonNotes = await notes.notesOfLesson(courseId, lessonId);
    } catch (err) { console.error('[tools] load failed', err); }
  }
  const blocks = (pack.lessons[lessonId] && pack.lessons[lessonId].blocks) || [];
  const labelFor = (blockId) => {
    const b = blocks.find((x) => x && x.id === blockId) || {};
    return cleanText(String(b.title || b.name || b.text || b.type || '')).replace(/\s+/g, ' ').slice(0, 80);
  };

  // دکمه انجام‌شد (toggle)
  let isDone = Boolean(record && record.status === 'done');
  const errorText = h('p', { class: 'save-error', role: 'alert', hidden: true }, t('lesson.saveError'));
  const doneBtn = h('button', {
    class: 'btn done-btn', type: 'button',
    onclick: async () => {
      doneBtn.disabled = true;
      try {
        const rec = await svc.setDone(courseId, lessonId, !isDone, lesson.title);
        isDone = rec.status === 'done';
        errorText.hidden = true;
        paintDone();
        announce(t(isDone ? 'lesson.done.announce' : 'lesson.undone.announce'));
      } catch (err) {
        console.error('[progress] save failed', err);
        errorText.hidden = false;
      } finally {
        doneBtn.disabled = false;
      }
    },
  });
  function paintDone() {
    doneBtn.setAttribute('aria-pressed', String(isDone));
    doneBtn.replaceChildren(icon('check'), t(isDone ? 'lesson.done.on' : 'lesson.done'));
  }
  paintDone();

  const isPrev = (labelKey) => labelKey === 'lesson.prev';
  const navItem = (target, labelKey, cls) => (target
    ? h('a', { class: `btn ${cls}`.trim(), href: lessonHref(router, courseId, target.lessonId), rel: isPrev(labelKey) ? 'prev' : 'next' },
      isPrev(labelKey) ? h('span', { class: 'rtl-flip' }, icon('back')) : null,
      t(labelKey), h('span', { class: 'sr-only' }, `: ${target.title}`),
      isPrev(labelKey) ? null : h('span', { class: 'rtl-flip' }, icon('next')))
    : h('span', { class: 'lesson-nav__spacer' }));

  const bodyEl = h('div', { class: 'lesson-body' }, body);
  if (notes) attachBlockBookmarks(bodyEl, { notes, ctx: toolCtx, marked: blockMarks, labelFor, announce });

  // فهرست «در این درس» از عنوان‌های بخش (فقط وقتی حداقل دو عنوان باشد)
  const headings = [...bodyEl.querySelectorAll('h2.blk-heading')];
  const scrollTo = (node) => {
    if (typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'start', behavior: 'smooth' });
    node.setAttribute('tabindex', '-1'); node.focus({ preventScroll: true });
  };
  const toc = headings.length >= 2
    ? h('aside', { class: 'lesson-toc', 'aria-label': t('lesson.toc') },
      h('p', { class: 'lesson-toc__title' }, icon('list'), t('lesson.toc')),
      h('ol', null, headings.map((hd) => h('li', null,
        h('button', { class: 'lesson-toc__link', type: 'button', onclick: () => scrollTo(hd) }, hd.textContent)))))
    : null;

  const readFill = h('i');
  const readBar = h('div', { class: 'progress read-progress', role: 'progressbar', 'aria-label': t('lesson.readProgress'), 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': 0, style: { '--value': '0%' } }, readFill);
  let raf = 0;
  const paintRead = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const pct = max > 0 ? Math.min(100, Math.max(0, Math.round((window.scrollY / max) * 100))) : 0;
      readBar.style.setProperty('--value', `${pct}%`);
      readBar.setAttribute('aria-valuenow', String(pct));
  };
  const onScroll = () => {
    if (typeof requestAnimationFrame !== 'function') { paintRead(); return; }
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; paintRead(); });
  };

  const el = h('article', { class: `pg pg--lesson${toc ? ' pg--toc' : ''}`, 'aria-labelledby': 'page-title' },
    readBar,
    h('nav', { 'aria-label': t('lesson.crumbs') },
      h('ol', { class: 'crumbs' },
        h('li', null, h('a', { href: router.href('/library') }, t('nav.library'))),
        h('li', null, h('a', { href: courseHref(router, courseId) }, meta.title)),
        h('li', { 'aria-current': 'page' }, lesson.chapterTitle))),

    h('header', { class: 'lesson-head' },
      h('p', { class: 'meta-row' },
        h('span', { class: 'meta-chip' }, icon('list'), t('lesson.position', { n: toFaDigits(position), total: toFaDigits(total) })),
        lesson.minutes ? h('span', { class: 'meta-chip' }, icon('clock'), t('course.minutes', { n: toFaDigits(lesson.minutes) })) : null),
      h('h1', { id: 'page-title' }, lesson.title),
      notes ? lessonBookmark({ notes, ctx: toolCtx, pressed: lessonMarked, announce }) : null),

    h('div', { class: `lesson-layout${toc ? ' has-toc' : ''}` },
      h('div', { class: 'lesson-main' },
        bodyEl,
        notes ? notesPanel({ notes, ctx: toolCtx, initial: lessonNotes, announce }) : null,
        h('footer', { class: 'card lesson-foot' },
          doneBtn,
          errorText,
          h('nav', { class: 'lesson-nav', 'aria-label': t('lesson.nav') },
            // در RTL، «قبلی» سمت راست و «بعدی» سمت چپ قرار می‌گیرد
            navItem(prev, 'lesson.prev', ''),
            next
              ? navItem(next, 'lesson.next', 'btn--primary')
              : h('a', { class: 'btn btn--primary', href: courseHref(router, courseId) }, t('lesson.finish'), h('span', { class: 'rtl-flip' }, icon('next')))))),
      toc));

  // بعد از قرار گرفتن در صفحه صدا زده می‌شود: اسکرول و فوکوس روی بلوک هدف (?block=id)
  const targetId = query && typeof query.get === 'function' ? query.get('block') : null;
  const mounted = () => {
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    if (!targetId) return;
    const target = [...el.querySelectorAll('[data-block-id]')].find((n) => n.dataset.blockId === targetId);
    if (!target) return;
    target.setAttribute('tabindex', '-1');
    target.classList.add('is-target');
    if (typeof target.scrollIntoView === 'function') target.scrollIntoView({ block: 'center' });
    target.focus({ preventScroll: true });
    setTimeout(() => target.classList.remove('is-target'), 2500);
  };

  return { el, title: lesson.title, mounted, destroy: () => { window.removeEventListener('scroll', onScroll); if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf); assets.revokeAll(); } };
}
