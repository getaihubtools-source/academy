// ابزارهای داخل صفحه درس: نشان‌گذاری (درس و بلوک) و یادداشت‌ها
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t, toFaDigits } from '../core/i18n-fa.js';
import { NOTE_MAX, NoteError } from '../db/notes.js';

let uidCounter = 0;
const nextId = (prefix) => `${prefix}-${++uidCounter}`;

export function formatDate(ms) {
  try { return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium' }).format(new Date(ms)); }
  catch { return new Date(ms).toISOString().slice(0, 10); }
}

/* ───────── نشان‌گذاری ───────── */

// دکمه toggle. ctx: { courseId, lessonId, lessonTitle, courseTitle }
function bookmarkButton({ notes, ctx, blockId = null, label = '', pressed, labelOn, labelOff, text = false, announce, className }) {
  let on = pressed;
  const btn = h('button', { class: className, type: 'button' });
  const paint = () => {
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? labelOn : labelOff);
    btn.title = on ? labelOn : labelOff;
    btn.replaceChildren(...[icon('bookmark', { size: 18 }), text ? h('span', null, on ? t('bm.lesson.on') : t('bm.lesson.add')) : null].filter(Boolean));
  };
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      const res = await notes.toggleBookmark({ ...ctx, blockId, label });
      on = res.on;
      paint();
      announce(t(on ? 'bm.added' : 'bm.removed'));
    } catch (err) {
      console.error('[bookmark] failed', err);
      announce(t('bm.error'));
    } finally {
      btn.disabled = false;
    }
  });
  paint();
  return btn;
}

export function lessonBookmark({ notes, ctx, pressed, announce }) {
  return bookmarkButton({
    notes, ctx, pressed, announce, text: true, className: 'btn btn--sm bm-lesson',
    labelOn: t('bm.lesson.on'), labelOff: t('bm.lesson.add'),
  });
}

// روی هر بلوکِ دارای id یک دکمه نشان می‌گذارد. marked: Set<blockId>؛ labelFor(blockId) → برچسب برای صفحه ذخیره‌ها
export function attachBlockBookmarks(body, { notes, ctx, marked, labelFor, announce }) {
  for (const el of [...body.children]) {
    const blockId = el.dataset && el.dataset.blockId;
    if (!blockId) continue;
    const btn = bookmarkButton({
      notes, ctx, blockId, label: labelFor(blockId), pressed: marked.has(blockId), announce,
      labelOn: t('bm.block.on'), labelOff: t('bm.block.add'), className: 'bm-block',
    });
    const wrap = h('div', { class: 'blk-wrap' });
    el.replaceWith(wrap);
    wrap.append(btn, el);
  }
}

/* ───────── یادداشت‌ها ───────── */

const errorText = (err) => {
  if (err instanceof NoteError && err.code === 'empty') return t('note.error.empty');
  if (err instanceof NoteError && err.code === 'tooLong') return t('note.error.tooLong');
  return t('note.error');
};

// قالب مشترک یک یادداشت (صفحه درس و صفحه ذخیره‌ها)
export function noteMeta(note) {
  return h('span', { class: 'note__meta' },
    formatDate(note.updatedAt),
    note.updatedAt > note.createdAt ? ` · ${t('note.edited')}` : null);
}

// حذف دو مرحله‌ای: دکمه «حذف» → «بله، حذف شود / انصراف»
export function deleteControl(onConfirm) {
  const box = h('span', { class: 'note__actions' });
  const showStart = () => box.replaceChildren(h('button', { class: 'btn btn--sm btn--danger', type: 'button', onclick: showConfirm }, t('note.delete')));
  const showConfirm = () => {
    const yes = h('button', {
      class: 'btn btn--sm btn--danger', type: 'button',
      onclick: async () => { yes.disabled = true; try { await onConfirm(); } catch (err) { console.error('[note] delete failed', err); yes.disabled = false; showStart(); } },
    }, t('note.delete.confirm'));
    box.replaceChildren(yes, h('button', { class: 'btn btn--sm', type: 'button', onclick: showStart }, t('note.cancel')));
    yes.focus();
  };
  showStart();
  return box;
}

export function notesPanel({ notes, ctx, initial, announce }) {
  let list = [...initial];
  const titleId = nextId('notes-title');
  const inputId = nextId('note-input');

  const listEl = h('ul', { class: 'notes__list' });
  const errorEl = h('p', { class: 'save-error', role: 'alert', hidden: true });
  const counter = h('span', { class: 'notes__counter' });
  const area = h('textarea', { id: inputId, class: 'textarea notes__input', rows: 3, maxlength: NOTE_MAX, placeholder: t('note.placeholder') });
  const addBtn = h('button', { class: 'btn btn--primary', type: 'button' }, t('note.add'));

  const showError = (message) => { errorEl.textContent = message || ''; errorEl.hidden = !message; };
  const updateCounter = () => { counter.textContent = t('note.counter', { n: toFaDigits(area.value.length), max: toFaDigits(NOTE_MAX) }); };

  function noteItem(note) {
    const li = h('li', { class: 'note' });
    const view = () => {
      li.replaceChildren(
        h('p', { class: 'note__text' }, note.text),
        h('div', { class: 'note__foot' }, noteMeta(note),
          h('span', { class: 'note__actions' },
            h('button', { class: 'btn btn--sm', type: 'button', onclick: edit }, t('note.edit')),
            deleteControl(async () => {
              await notes.removeNote(note.id);
              list = list.filter((n) => n.id !== note.id);
              paint(); announce(t('note.deleted'));
            }))));
    };
    const edit = () => {
      const editId = nextId('note-edit');
      const field = h('textarea', { id: editId, class: 'textarea notes__input', rows: 4, maxlength: NOTE_MAX }, note.text);
      const msg = h('p', { class: 'save-error', role: 'alert', hidden: true });
      const save = h('button', {
        class: 'btn btn--sm btn--primary', type: 'button',
        onclick: async () => {
          save.disabled = true;
          try {
            const updated = await notes.updateNote(note.id, field.value);
            list = list.map((n) => (n.id === note.id ? updated : n));
            note = updated; paint(); announce(t('note.updated'));
          } catch (err) { msg.textContent = errorText(err); msg.hidden = false; save.disabled = false; }
        },
      }, t('note.save'));
      li.replaceChildren(
        h('label', { for: editId, class: 'sr-only' }, t('note.editLabel')), field, msg,
        h('div', { class: 'note__foot' }, h('span', { class: 'note__actions' }, save, h('button', { class: 'btn btn--sm', type: 'button', onclick: view }, t('note.cancel')))));
      field.focus();
    };
    view();
    return li;
  }

  function paint() {
    listEl.replaceChildren(...(list.length ? list.map(noteItem) : [h('li', { class: 'notes__empty' }, t('note.empty'))]));
  }

  addBtn.addEventListener('click', async () => {
    addBtn.disabled = true;
    showError('');
    try {
      const rec = await notes.addNote({ ...ctx, text: area.value });
      list = [rec, ...list];
      area.value = ''; updateCounter(); paint(); announce(t('note.added'));
    } catch (err) {
      showError(errorText(err));
    } finally {
      addBtn.disabled = false;
    }
  });
  area.addEventListener('input', updateCounter);

  updateCounter();
  paint();
  return h('section', { class: 'notes', 'aria-labelledby': titleId },
    h('h2', { id: titleId }, h('span', { class: 'notes__icon' }, icon('note')), t('note.title')),
    h('div', { class: 'notes__form' },
      h('label', { for: inputId, class: 'field__label notes__label' }, t('note.label')),
      area, counter, errorEl, addBtn),
    listEl);
}
