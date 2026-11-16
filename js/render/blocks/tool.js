import { h } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { t } from '../../core/i18n-fa.js';
import { cleanText, isHttpsUrl } from '../sanitize.js';
import { renderInline } from '../inline.js';
import { LIMITS } from '../check.js';

const PRICING = ['free', 'freemium', 'paid'];

// { type:'tool', name, description, pricing?, bestFor?, pros?:[], cons?:[], url? (https) }
export const tool = {
  validate(block, path, v) {
    v.str(block.name, `${path}.name`, { max: 120 });
    v.str(block.description, `${path}.description`, { max: LIMITS.text });
    v.oneOf(block.pricing, `${path}.pricing`, PRICING);
    v.str(block.bestFor, `${path}.bestFor`, { required: false, max: LIMITS.shortText });
    for (const key of ['pros', 'cons']) {
      if (block[key] === undefined) continue;
      if (v.arr(block[key], `${path}.${key}`, { min: 1, max: LIMITS.proItems })) {
        block[key].forEach((s, i) => v.str(s, `${path}.${key}[${i}]`, { max: LIMITS.shortText }));
      }
    }
    if (block.url !== undefined && v.str(block.url, `${path}.url`, { max: 2000 }) && !isHttpsUrl(block.url)) {
      v.error('url.protocol', `${path}.url`, 'فقط آدرس https مجاز است');
    }
  },

  render(block) {
    const pointList = (key, cls) => (Array.isArray(block[key]) && block[key].length
      ? h('div', { class: `blk-tool__points ${cls}` },
        h('h4', null, t(`blk.tool.${key}`)),
        h('ul', null, block[key].map((s) => h('li', null, renderInline(s)))))
      : null);

    return h('article', { class: 'blk blk-tool' },
      h('header', { class: 'blk-tool__head' },
        h('h3', null, h('span', { class: 'ltr' }, cleanText(block.name))),
        PRICING.includes(block.pricing) ? h('span', { class: 'badge' }, t(`blk.tool.${block.pricing}`)) : null),
      h('p', null, renderInline(block.description)),
      block.bestFor ? h('p', { class: 'blk-tool__best' }, h('strong', null, `${t('blk.tool.bestFor')}: `), renderInline(block.bestFor)) : null,
      (block.pros || block.cons)
        ? h('div', { class: 'blk-tool__grid' }, pointList('pros', 'is-pros'), pointList('cons', 'is-cons'))
        : null,
      isHttpsUrl(block.url)
        ? h('a', { class: 'blk-tool__link', href: block.url, target: '_blank', rel: 'noopener noreferrer' },
          t('blk.tool.visit'), icon('external'))
        : null);
  },
};
