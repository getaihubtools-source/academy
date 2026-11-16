// صفحه نشان‌ها و یادداشت‌ها (همه دوره‌ها)
import { h } from '../core/dom.js';
import { t, toFaDigits } from '../core/i18n-fa.js';
import { icon } from '../core/icons.js';
import { dbErrorCallout } from './dashboard.js';
import { lessonHref } from './parts.js';
import { formatDate, noteMeta, deleteControl } from './lesson-tools.js';

export async function render({ store, notes, router, announce }) {
  if (store.get().dbStatus !== 'ready' || !notes) {
    return { title: t('saved.title'), el: h('section', { class: 'pg' }, dbErrorCallout()) };
  }
  let bookmarks = await notes.listBookmarks();
  let noteList = await notes.listNotes();

  const bmWrap = h('ul', { class: 'saved__list' });
  const noteWrap = h('ul', { class: 'saved__list' });
  const bmCount = h('span', { class: 'badge badge--plain saved__count' });
  const noteCount = h('span', { class: 'badge badge--plain saved__count' });

  const where = (r) => h('p', { class: 'saved__where' }, [r.courseTitle, r.lessonTitle].filter(Boolean).join(' · '));

  function paint() {
    bmCount.textContent = toFaDigits(bookmarks.length);
    noteCount.textContent = toFaDigits(noteList.length);

    bmWrap.replaceChildren(...(bookmarks.length ? bookmarks.map((b) => h('li', { class: 'saved__item' },
      h('a', { class: 'saved__link', href: lessonHref(router, b.courseId, b.lessonId) + (b.blockId ? `?block=${encodeURIComponent(b.blockId)}` : '') },
        h('span', { class: 'saved__ico' }, icon('bookmark')),
        h('strong', null, b.blockId ? (b.label || b.lessonTitle) : b.lessonTitle || b.lessonId),
        h('span', { class: 'sr-only' }, ` — ${t('saved.open')}`)),
      where(b),
      h('div', { class: 'note__foot' },
        h('span', { class: 'note__meta' }, b.blockId ? formatDate(b.createdAt) : `${t('saved.lessonBookmark')} · ${formatDate(b.createdAt)}`),
        h('button', {
          class: 'btn btn--sm', type: 'button',
          onclick: async () => {
            try { await notes.removeBookmark(b.id); bookmarks = bookmarks.filter((x) => x.id !== b.id); paint(); announce(t('bm.removed')); }
            catch (err) { console.error('[saved] remove failed', err); announce(t('bm.error')); }
          },
        }, t('saved.removeBookmark'))))) : [h('li', { class: 'notes__empty' }, t('saved.bookmarks.empty'))]));

    noteWrap.replaceChildren(...(noteList.length ? noteList.map((n) => h('li', { class: 'saved__item' },
      where(n),
      h('p', { class: 'note__text' }, n.text),
      h('div', { class: 'note__foot' }, noteMeta(n),
        h('span', { class: 'note__actions' },
          h('a', { class: 'btn btn--sm', href: lessonHref(router, n.courseId, n.lessonId) }, t('saved.open')),
          deleteControl(async () => {
            await notes.removeNote(n.id);
            noteList = noteList.filter((x) => x.id !== n.id);
            paint(); announce(t('note.deleted'));
          }))))) : [h('li', { class: 'notes__empty' }, t('saved.notes.empty'))]));
  }
  paint();

  const tab = (id, panelId, label, count, selected) => h('button', {
    class: '', type: 'button', role: 'tab', id, 'aria-controls': panelId, 'aria-selected': String(selected), tabindex: selected ? '0' : '-1',
  }, label, ' ', count);
  const tabBm = tab('saved-tab-bm', 'saved-panel-bm', t('saved.bookmarks'), bmCount, true);
  const tabNotes = tab('saved-tab-notes', 'saved-panel-notes', t('saved.notes'), noteCount, false);

  return {
    title: t('saved.title'),
    el: h('section', { class: 'pg', 'aria-labelledby': 'page-title' },
      h('header', { class: 'page-head' }, h('h1', { id: 'page-title' }, t('saved.title'))),
      h('div', { class: 'tabs', role: 'tablist', 'aria-label': t('saved.tabs') }, tabBm, tabNotes),
      h('section', { id: 'saved-panel-bm', role: 'tabpanel', 'aria-labelledby': 'saved-tab-bm' }, bmWrap),
      h('section', { id: 'saved-panel-notes', role: 'tabpanel', 'aria-labelledby': 'saved-tab-notes', hidden: true }, noteWrap)),
  };
}
