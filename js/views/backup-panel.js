// بخش «پشتیبان‌گیری و بازیابی» صفحه تنظیمات
import { h } from '../core/dom.js';
import { t, toFaDigits } from '../core/i18n-fa.js';
import { icon } from '../core/icons.js';
import {
  exportBackup, serializeBackup, backupFilename, parseBackup, restoreBackup, backupDue, BackupError,
  BACKUP_STORES, MAX_BACKUP_CHARS,
} from '../db/backup.js';
import { APP_VERSION } from '../core/config.js';

function formatDate(ms) {
  try { return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ms)); }
  catch { return new Date(ms).toISOString(); }
}

// دانلود فایل از طریق Blob (بدون innerHTML و بدون اسکریپت خارجی)
export function downloadText(filename, text, { doc = document, urlApi = URL } = {}) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = urlApi.createObjectURL(blob);
  const a = doc.createElement('a');
  a.href = url; a.download = filename;
  doc.body.append(a); a.click(); a.remove();
  setTimeout(() => urlApi.revokeObjectURL(url), 10000);
}

async function readFileText(file) {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

const errorKey = (err) => (err instanceof BackupError ? `bk.error.${err.code}` : 'bk.error.restore');

export async function backupPanel({ repos, announce, download = downloadText, reload = () => location.reload(), readText = readFileText }) {
  const db = repos.db;
  const status = h('p', { class: 'bk__status', role: 'status' });
  const errorEl = h('p', { class: 'save-error', role: 'alert', hidden: true });
  const lastLine = h('p', { class: 'bk__last' });
  const dueBox = h('div', { class: 'alert alert--warning', role: 'status', hidden: true }, icon('info'), h('p', null, t('bk.due')));
  const previewBox = h('div', { class: 'bk__preview', hidden: true });

  const say = (msg) => { status.textContent = msg; announce(msg); };
  const fail = (key) => { errorEl.textContent = t(key); errorEl.hidden = false; };
  const clearError = () => { errorEl.hidden = true; };

  async function refreshLast() {
    const [row, info] = await Promise.all([repos.meta.get('lastBackupAt'), repos.info()]);
    const last = row && Number.isFinite(row.value) ? row.value : null;
    lastLine.textContent = last ? t('bk.last', { date: formatDate(last) }) : t('bk.never');
    const count = ['progress', 'notes', 'bookmarks', 'quizResults'].reduce((n, k) => n + (info.counts[k] || 0), 0);
    dueBox.hidden = !backupDue({ lastBackupAt: last, recordCount: count });
  }

  /* ───── دانلود ───── */
  const exportBtn = h('button', { class: 'btn btn--primary', type: 'button' }, icon('download'), t('bk.export'));
  exportBtn.addEventListener('click', async () => {
    exportBtn.disabled = true; clearError();
    try {
      const backup = await exportBackup(db, { appVersion: APP_VERSION });
      const total = BACKUP_STORES.reduce((n, k) => n + backup.data[k].length, 0);
      download(backupFilename(new Date()), serializeBackup(backup));
      await repos.meta.put({ key: 'lastBackupAt', value: Date.now() });
      await refreshLast();
      say(t('bk.exported', { n: toFaDigits(total) }));
    } catch (err) {
      console.error('[backup] export failed', err);
      fail('bk.export.error');
    } finally { exportBtn.disabled = false; }
  });

  /* ───── بازیابی ───── */
  function showPreview(parsed) {
    const { backup, summary } = parsed;
    let mode = 'merge';
    const restoreBtn = h('button', { class: 'btn btn--primary', type: 'button' }, t('bk.restore'));
    const confirmBox = h('div', { class: 'bk__confirm', hidden: true },
      h('p', { class: 'save-error', role: 'alert' }, t('bk.restore.warn')));
    const yes = h('button', { class: 'btn btn--danger', type: 'button' }, t('bk.restore.confirm'));
    const no = h('button', { class: 'btn', type: 'button' }, t('bk.restore.cancel'));
    confirmBox.append(h('div', { class: 'bk__actions' }, yes, no));

    async function run() {
      restoreBtn.disabled = yes.disabled = true; clearError();
      say(t('bk.restoring'));
      try {
        const report = await restoreBackup(db, backup, { mode });
        const sum = (k) => BACKUP_STORES.reduce((n, s) => n + report[s][k], 0);
        say(t('bk.restored', { added: toFaDigits(sum('added')), updated: toFaDigits(sum('updated')) }));
        previewBox.hidden = true;
        setTimeout(reload, 1500); // تنظیمات و فهرست‌ها از DB دوباره خوانده شوند
      } catch (err) {
        console.error('[backup] restore failed', err);
        status.textContent = ''; fail('bk.error.restore');
        restoreBtn.disabled = yes.disabled = false;
      }
    }

    restoreBtn.addEventListener('click', () => { if (mode === 'replace') { confirmBox.hidden = false; yes.focus(); } else run(); });
    yes.addEventListener('click', run);
    no.addEventListener('click', () => { confirmBox.hidden = true; });

    const radio = (value, key) => {
      const input = h('input', { type: 'radio', name: 'bk-mode', value, checked: value === 'merge' });
      input.addEventListener('change', () => { mode = value; confirmBox.hidden = true; });
      return h('label', { class: 'bk__radio' }, input, h('span', null, t(key)));
    };

    previewBox.replaceChildren(
      h('h3', null, t('bk.preview')),
      backup.createdAt ? h('p', { class: 'bk__last' }, t('bk.preview.date', { date: formatDate(backup.createdAt) })) : null,
      h('div', { class: 'kv' }, ...BACKUP_STORES.map((k) => h('div', { class: 'kv__row' }, h('span', { class: 'kv__key' }, t(`bk.count.${k}`)), h('span', { class: 'kv__val' }, toFaDigits(summary[k]))))),
      h('fieldset', { class: 'choice-group bk__mode' }, h('legend', null, t('bk.mode')), radio('merge', 'bk.mode.merge'), radio('replace', 'bk.mode.replace')),
      restoreBtn, confirmBox,
    );
    previewBox.hidden = false;
  }

  const input = h('input', { type: 'file', accept: '.json,application/json' });
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    input.value = '';
    previewBox.hidden = true; clearError(); status.textContent = '';
    if (!file) return;
    if (file.size > MAX_BACKUP_CHARS * 2) { fail('bk.error.tooLarge'); return; } // پیش از خواندن در حافظه
    try { showPreview(parseBackup(await readText(file))); }
    catch (err) { if (!(err instanceof BackupError)) console.error('[backup] read failed', err); fail(errorKey(err)); }
  });

  await refreshLast();
  return h('div', { class: 'card bk' },
    h('p', null, t('bk.intro')),
    lastLine, dueBox,
    h('div', { class: 'bk__actions' },
      exportBtn,
      h('label', { class: 'btn' }, icon('upload'), t('bk.import'), input)),
    h('p', { class: 'bk__hint' }, t('bk.import.hint')),
    status, errorEl, previewBox);
}
