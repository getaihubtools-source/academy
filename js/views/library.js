import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t, toFaDigits } from '../core/i18n-fa.js';
import { parsePack } from '../packs/loader.js';
import { DowngradeError } from '../db/courses.js';
import { courseStats } from '../features/progress.js';
import { dbErrorCallout } from './dashboard.js';
import { courseCard, courseHref } from './parts.js';

const FILTERS = ['all', 'active', 'done', 'new'];

const MAX_FILE_BYTES = 40 * 1024 * 1024;
const MAX_SHOWN_ISSUES = 8;

function issueList(errors) {
  const shown = errors.slice(0, MAX_SHOWN_ISSUES);
  return h('div', { class: 'issue-list' },
    shown.map((e) => h('div', { class: 'issue' }, e.message, e.path ? h('span', { class: 'issue__path' }, e.path) : null)),
    errors.length > shown.length ? h('p', null, t('lib.import.moreErrors', { n: toFaDigits(errors.length - shown.length) })) : null);
}

const infoBox = (text, variant = '') =>
  h('div', { class: `alert ${variant}`.trim(), role: variant ? 'alert' : 'status' },
    icon(variant ? 'alert' : 'info'), h('div', null, text));

export async function render(ctx) {
  const { store, svc, router } = ctx;
  const ready = store.get().dbStatus === 'ready' && svc;

  const countText = h('p', { class: 'page-head__sub' });
  const listBox = h('div');
  const statusBox = h('div', { class: 'import-status', 'aria-live': 'polite' });
  let allCourses = [];
  let allProgress = new Map();
  let filter = 'all';

  const kindOf = (meta) => {
    const s = courseStats(meta.lessonIds, allProgress.get(meta.id) || new Map());
    if (s.total > 0 && s.done >= s.total) return 'done';
    return s.done > 0 || s.started > 0 ? 'active' : 'new';
  };

  const chips = FILTERS.map((key) => h('button', {
    class: 'chip', type: 'button', 'aria-pressed': String(key === filter),
    onclick: () => { filter = key; chips.forEach((c, i) => c.setAttribute('aria-pressed', String(FILTERS[i] === filter))); paint(); },
  }, t(`lib.filter.${key}`)));
  const filterBar = h('div', { class: 'chips', role: 'group', 'aria-label': t('lib.filter.label'), hidden: true }, chips);

  function paint() {
    clear(listBox);
    filterBar.hidden = allCourses.length < 2;
    if (allCourses.length === 0) {
      listBox.append(h('div', { class: 'card' }, h('div', { class: 'empty' },
        h('span', { class: 'empty__art' }, icon('library')),
        h('h2', { class: 'empty__title' }, t('lib.empty.title')),
        h('p', null, t('lib.empty.text')))));
      return;
    }
    const visible = filter === 'all' ? allCourses : allCourses.filter((m) => kindOf(m) === filter);
    if (!visible.length) { listBox.append(h('p', { class: 'muted', role: 'status' }, t('lib.filter.none'))); return; }
    listBox.append(h('div', { class: 'course-grid course-grid--lib' }, visible.map((meta) =>
      courseCard(meta, courseStats(meta.lessonIds, allProgress.get(meta.id) || new Map()), courseHref(router, meta.id)))));
  }

  async function refresh() {
    allCourses = await svc.listCourses();
    allProgress = await svc.progressAll();
    countText.textContent = t('lib.count', { n: toFaDigits(allCourses.length) });
    paint();
    if (ctx.refreshCommands) ctx.refreshCommands();
  }

  // null/false نباید به DOM برسد: Element.append(null) متن «null» می‌سازد
  function show(...nodes) { clear(statusBox); statusBox.append(...nodes.filter(Boolean)); }

  async function importFile(file) {
    show(infoBox(t('lib.import.busy')));

    if (file.size > MAX_FILE_BYTES) { show(infoBox(t('lib.import.tooBig'), 'alert--danger')); return; }

    let text;
    try { text = await file.text(); } catch { show(infoBox(t('lib.import.readError'), 'alert--danger')); return; }

    const result = parsePack(text);
    if (!result.ok) {
      show(h('div', { class: 'alert alert--danger', role: 'alert' }, icon('alert'),
        h('div', null, h('strong', null, t('lib.import.fail')), issueList(result.errors))));
      return;
    }

    let outcome;
    try {
      outcome = await svc.install(result.pack, { sizeChars: text.length });
    } catch (err) {
      if (err instanceof DowngradeError) {
        show(infoBox(t('lib.import.downgrade', { installed: toFaDigits(err.installed), incoming: toFaDigits(err.incoming) }), 'alert--danger'));
      } else {
        console.error('[import] save failed', err);
        show(infoBox(t('lib.import.saveError'), 'alert--danger'));
      }
      return;
    }

    const { meta, status } = outcome;
    const messageKey = status === 'updated' ? 'lib.import.updated' : 'lib.import.ok';
    show(infoBox(t(messageKey, { title: meta.title, version: toFaDigits(meta.version) })),
      result.warnings.length ? h('p', null, t('lib.import.warnings', { n: toFaDigits(result.warnings.length) })) : null);
    await refresh();
  }

  let importCard = null;
  if (ready) {
    const input = h('input', {
      type: 'file', accept: '.json,application/json',
      onchange: async () => {
        const file = input.files && input.files[0];
        if (file) await importFile(file);
        input.value = ''; // انتخاب دوباره همان فایل هم کار کند
      },
    });
    importCard = h('div', { class: 'card import-card dropzone' },
      h('span', { class: 'dropzone__art' }, icon('upload')),
      h('div', { class: 'dropzone__text' },
        h('strong', null, t('lib.drop')),
        h('p', { class: 'muted' }, t('lib.import.hint'))),
      h('label', { class: 'btn btn--primary' }, icon('plus'), t('lib.import'), input),
      statusBox);
    // کشیدن و رها کردن فایل روی کارت
    const over = (on) => importCard.classList.toggle('is-over', on);
    importCard.addEventListener('dragover', (e) => { e.preventDefault(); over(true); });
    importCard.addEventListener('dragleave', () => over(false));
    importCard.addEventListener('drop', async (e) => {
      e.preventDefault(); over(false);
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) await importFile(file);
    });
    await refresh();
  }

  const el = h('section', { class: 'pg', 'aria-labelledby': 'page-title' },
    h('header', { class: 'page-head' },
      h('div', null, h('h1', { id: 'page-title' }, t('lib.title')), countText)),
    ready ? null : dbErrorCallout(),
    importCard,
    filterBar,
    listBox);

  return { el };
}
