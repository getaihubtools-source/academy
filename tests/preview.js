// صفحه ابزار توسعه: اعتبارسنجی + نمایش درس‌های یک pack
import { h, clear } from '../js/core/dom.js';
import { parsePack, createAssetStore, lessonIndex } from '../js/packs/loader.js';
import { renderLessonBlocks } from '../js/render/lesson.js';

const $ = (id) => document.getElementById(id);
const fileInput = $('file');
const lessonSelect = $('lesson');
const report = $('report');
const view = $('lesson-view');

let pack = null;
let assets = null;

function showReport(result) {
  clear(report);
  const items = [...result.errors, ...result.warnings];
  const title = result.ok
    ? `✓ pack معتبر است${result.warnings.length ? ` (${result.warnings.length} هشدار)` : ''}`
    : `✗ pack نامعتبر است (${result.errors.length} خطا)`;
  report.append(h('div', { class: result.ok ? 'alert' : 'alert alert--danger', role: result.ok ? 'status' : 'alert' }, h('strong', null, title)));
  if (items.length) {
    report.append(h('div', { class: 'pv__issues' }, items.slice(0, 50).map((i) =>
      h('div', { class: `pv__issue pv__issue--${i.level}` },
        h('span', null, i.message),
        i.path ? h('span', { class: 'pv__path' }, i.path) : null))));
  }
}

function showLesson(id) {
  clear(view);
  if (assets) assets.revokeAll();
  const frag = renderLessonBlocks(pack, id, { assetUrl: (a) => assets.url(a) });
  if (frag) view.append(frag);
  view.dataset.lesson = id;
}

function load(text) {
  if (assets) assets.revokeAll();
  const result = parsePack(text);
  showReport(result);
  clear(lessonSelect); clear(view);
  pack = result.pack; assets = pack ? createAssetStore(pack) : null;
  lessonSelect.disabled = !pack;
  if (!pack) return;
  for (const l of lessonIndex(pack)) lessonSelect.append(h('option', { value: l.lessonId }, `${l.chapterTitle} — ${l.title}`));
  showLesson(lessonSelect.value);
}

lessonSelect.addEventListener('change', () => showLesson(lessonSelect.value));

fileInput.addEventListener('change', async () => {
  const file = fileInput.files && fileInput.files[0];
  if (file) load(await file.text());
});

$('load-sample').addEventListener('click', async () => {
  const res = await fetch('../sample-pack/sample-course.json');
  load(await res.text());
});

if (location.hash === '#sample') $('load-sample').click();
