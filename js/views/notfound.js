import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t } from '../core/i18n-fa.js';

export async function render({ router }) {
  const el = h('section', { class: 'pg', 'aria-labelledby': 'page-title' },
    h('div', { class: 'card' }, h('div', { class: 'empty' },
      h('span', { class: 'empty__art' }, icon('alert')),
      h('h1', { id: 'page-title', class: 'empty__title' }, t('nf.title')),
      h('p', null, t('nf.text')),
      h('a', { class: 'btn btn--primary', href: router.href('/') }, t('nf.home')))));
  return { el };
}
