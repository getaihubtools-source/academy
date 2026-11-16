import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t, toFaDigits } from '../core/i18n-fa.js';
import { SETTINGS_SPEC } from '../core/prefs.js';
import { APP_VERSION } from '../core/config.js';
import { STORE_NAMES } from '../db/schema.js';
import { dbErrorCallout } from './dashboard.js';
import { backupPanel } from './backup-panel.js';
import { pwaPanel } from './pwa-panel.js';

function choiceGroup({ key, legendKey, current, onPick }) {
  const name = `setting-${key}`;
  const choices = SETTINGS_SPEC[key].values.map((value) =>
    h('label', { class: 'choice' },
      h('input', {
        type: 'radio', name, value, checked: value === current,
        onchange: () => onPick(key, value),
      }),
      h('span', null, t(`set.${key}.${value}`))));
  return h('fieldset', { class: 'choice-group' },
    h('legend', { class: 'field__label' }, t(legendKey)),
    h('div', { class: 'choices' }, choices));
}

// پوسته و رنگ برند از AIhub Design System می‌آیند (ذخیره در localStorage خودِ DS)
const THEMES = ['system', 'light', 'dark'];
const BRANDS = ['firouzeh', 'rose', 'indigo', 'ember'];

function segmented({ legendKey, values, labelOf, current, onPick }) {
  const buttons = values.map((v) => h('button', {
    type: 'button', 'aria-pressed': String(v === current()),
    onclick: () => { onPick(v); buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(values[i] === current()))); },
  }, labelOf(v)));
  const id = `seg-${legendKey.replace(/\W/g, '-')}`;
  return h('div', { class: 'field' },
    h('span', { class: 'field__label', id }, t(legendKey)),
    h('div', { class: 'segmented segmented--wrap', role: 'group', 'aria-labelledby': id }, buttons));
}

function dsAppearance() {
  const DS = typeof window !== 'undefined' ? window.AIhub : null;
  if (!DS || !DS.theme || !DS.brand) return [];
  const themeNow = () => { const v = DS.store('aihub-theme'); return v === 'light' || v === 'dark' ? v : 'system'; };
  const setTheme = (v) => {
    if (v === 'system') { document.documentElement.removeAttribute('data-theme'); DS.store('aihub-theme', null); }
    else DS.theme.set(v);
    DS.$$('[data-theme-toggle]').forEach((b) => b.setAttribute('aria-pressed', DS.theme.get() === 'dark' ? 'true' : 'false'));
  };
  return [
    segmented({ legendKey: 'set.theme', values: THEMES, labelOf: (v) => t(`set.theme.${v}`), current: themeNow, onPick: setTheme }),
    segmented({ legendKey: 'set.brand', values: BRANDS, labelOf: (v) => t(`set.brand.${v}`), current: () => DS.brand.get(), onPick: (v) => DS.brand.set(v) }),
  ];
}

function kv(key, valueNode) {
  return h('div', { class: 'kv__row' }, h('span', { class: 'kv__key' }, key), h('span', { class: 'kv__val' }, valueNode));
}

export async function render({ store, repos, saveSetting, announce = () => {}, pwa, installer, download, reload, readText }) {
  const state = store.get();
  const ready = state.dbStatus === 'ready' && repos;
  const status = h('p', { class: 'sr-only', role: 'status' });

  async function onPick(key, value) {
    const { persisted } = await saveSetting(key, value);
    status.textContent = persisted ? t('set.saved') : t('set.notPersisted');
  }

  let storageCard;
  if (ready) {
    const info = await repos.info();
    storageCard = h('div', { class: 'card' },
      h('div', { class: 'card__head' }, h('h2', null, t('set.storage'))),
      h('div', { class: 'kv' },
        kv(t('set.db.name'), h('span', { class: 'ltr' }, info.name)),
        kv(t('set.db.version'), toFaDigits(info.version)),
        kv(t('set.db.status'), h('span', { class: 'badge' }, t('set.db.ready')))),
      h('h3', { class: 'kv__sub' }, t('set.records')),
      h('div', { class: 'kv' },
        STORE_NAMES.map((name) => kv(t(`store.${name}`), toFaDigits(info.counts[name])))));
  } else {
    storageCard = dbErrorCallout();
  }

  const backup = ready ? await backupPanel({ repos, announce, download, reload, readText }) : null;
  const pwaView = pwa && installer ? pwaPanel({ pwa, installer, announce }) : null;

  const el = h('section', { class: 'pg', 'aria-labelledby': 'page-title' },
    h('header', { class: 'page-head' }, h('h1', { id: 'page-title' }, t('set.title'))),

    h('div', { class: 'grid grid--2' },
      h('section', { class: 'stack' },
        h('div', { class: 'card' },
          h('div', { class: 'card__head' }, h('h2', null, t('set.appearance'))),
          h('div', { class: 'stack' },
            ...dsAppearance(),
            choiceGroup({ key: 'fontScale', legendKey: 'set.fontScale', current: state.settings.fontScale, onPick }),
            choiceGroup({ key: 'motion', legendKey: 'set.motion', current: state.settings.motion, onPick }),
            ready ? null : h('div', { class: 'alert' }, icon('info'), h('p', null, t('set.notPersisted'))))),
        status),
      h('section', { class: 'stack' }, storageCard)),

    h('div', { class: 'grid grid--2' },
      backup ? h('section', { class: 'stack' }, h('div', { class: 'card__head' }, h('h2', null, t('bk.title'))), backup) : null,
      pwaView ? h('section', { class: 'stack' }, h('div', { class: 'card__head' }, h('h2', null, t('pwa.title'))), pwaView.el) : null),

    h('div', { class: 'card' },
      h('div', { class: 'card__head' }, h('h2', null, t('set.about'))),
      h('div', { class: 'kv' }, kv(t('set.appVersion'), h('span', { class: 'ltr' }, APP_VERSION)))));

  return { el, destroy() { if (pwaView) pwaView.destroy(); } };
}
