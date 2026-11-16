// بخش «نصب و کار آفلاین» صفحه تنظیمات
import { h } from '../core/dom.js';
import { t, toFaDigits } from '../core/i18n-fa.js';
import { storageStatus, requestPersistence, formatBytes } from '../pwa/storage.js';

export function pwaPanel({ pwa, installer, announce, nav = globalThis.navigator }) {
  const offlineVal = h('span', { class: 'kv__val' });
  const installVal = h('span', { class: 'kv__val' });
  const persistVal = h('span', { class: 'kv__val' });
  const usageVal = h('span', { class: 'kv__val' });
  const status = h('p', { class: 'bk__status', role: 'status' });
  const row = (key, val) => h('div', { class: 'kv__row' }, h('span', { class: 'kv__key' }, key), val);

  const installBtn = h('button', { class: 'btn btn--primary btn--sm', type: 'button', hidden: true }, t('pwa.install.button'));
  const persistBtn = h('button', { class: 'btn btn--sm', type: 'button', hidden: true }, t('pwa.persist.button'));
  const checkBtn = h('button', { class: 'btn btn--sm', type: 'button' }, t('pwa.check'));

  const say = (msg) => { status.textContent = msg; announce(msg); };

  function paintOffline() {
    const s = pwa.state;
    const key = s.offlineReady ? 'ready'
      : s.status === 'unsupported' ? 'unsupported'
        : s.status === 'insecure' ? 'insecure'
          : s.status === 'error' ? 'error' : 'pending';
    offlineVal.textContent = t(`pwa.offline.${key}`);
  }

  function paintInstall() {
    const mode = installer.mode();
    installBtn.hidden = mode !== 'prompt';
    installVal.textContent = mode === 'installed' ? t('pwa.install.installed')
      : mode === 'ios' ? t('pwa.install.ios')
        : mode === 'unavailable' ? t('pwa.install.unavailable') : '';
  }

  async function paintStorage() {
    const s = await storageStatus(nav);
    persistVal.textContent = !s.supported ? t('pwa.persist.unsupported') : s.persisted ? t('pwa.persist.on') : t('pwa.persist.off');
    persistBtn.hidden = !s.supported || s.persisted;
    usageVal.textContent = s.usage != null ? `${toFaDigits(formatBytes(s.usage))}${s.quota ? ` / ${toFaDigits(formatBytes(s.quota))}` : ''}` : '—';
    usageVal.setAttribute('dir', 'ltr');
  }

  installBtn.addEventListener('click', async () => {
    installBtn.disabled = true;
    const res = await installer.prompt();
    installBtn.disabled = false;
    if (res === 'accepted') say(t('pwa.install.accepted'));
    paintInstall();
  });
  persistBtn.addEventListener('click', async () => {
    persistBtn.disabled = true;
    const ok = await requestPersistence(nav);
    persistBtn.disabled = false;
    await paintStorage();
    if (!ok) say(t('pwa.persist.denied'));
  });
  checkBtn.addEventListener('click', async () => {
    checkBtn.disabled = true;
    const online = nav && nav.onLine === false ? false : true;
    if (!online) { say(t('pwa.check.offline')); checkBtn.disabled = false; return; }
    const ran = await pwa.checkForUpdate({ force: true });
    checkBtn.disabled = false;
    if (!ran) say(t('pwa.check.offline'));
    else if (!pwa.state.updateAvailable) say(t('pwa.check.none'));
  });

  const unsubs = [pwa.subscribe(paintOffline), installer.subscribe(paintInstall)];
  paintOffline(); paintInstall(); paintStorage();

  const el = h('div', { class: 'card pwa' },
    h('div', { class: 'kv' },
      row(t('pwa.offline'), offlineVal),
      row(t('pwa.install'), h('span', { class: 'kv__val pwa__act' }, installVal, installBtn)),
      row(t('pwa.persist'), h('span', { class: 'kv__val pwa__act' }, persistVal, persistBtn)),
      row(t('pwa.usage'), usageVal)),
    h('div', { class: 'bk__actions' }, checkBtn),
    status);
  return { el, destroy() { unsubs.forEach((u) => u()); } };
}
