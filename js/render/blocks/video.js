import { h } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { t } from '../../core/i18n-fa.js';
import { cleanText, isHttpsUrl, hostnameOf } from '../sanitize.js';
import { LIMITS } from '../check.js';

// { type:'video', title, url (فقط https) } — در v1 فقط پیوند خارجی؛ بدون iframe (CSP هم مسدود می‌کند)
export const video = {
  validate(block, path, v) {
    v.str(block.title, `${path}.title`, { max: LIMITS.shortText });
    if (v.str(block.url, `${path}.url`, { max: 2000 }) && !isHttpsUrl(block.url)) {
      v.error('url.protocol', `${path}.url`, 'فقط آدرس https مجاز است');
    }
  },
  render(block) {
    return h('a', { class: 'blk blk-video', href: block.url, target: '_blank', rel: 'noopener noreferrer' },
      h('span', { class: 'blk-video__icon' }, icon('play')),
      h('span', { class: 'blk-video__body' },
        h('strong', null, `${t('blk.video')}: ${cleanText(block.title)}`),
        h('small', null, t('blk.video.external'), ' · ', h('span', { class: 'ltr' }, hostnameOf(block.url)))),
      icon('external'));
  },
};
