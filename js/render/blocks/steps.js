import { h } from '../../core/dom.js';
import { toFaDigits } from '../../core/i18n-fa.js';
import { cleanText } from '../sanitize.js';
import { renderInline } from '../inline.js';
import { LIMITS } from '../check.js';

// { type:'steps', title?, items:[{ title, text }] }
export const steps = {
  validate(block, path, v) {
    v.str(block.title, `${path}.title`, { required: false, max: LIMITS.shortText });
    if (!v.arr(block.items, `${path}.items`, { min: 1, max: LIMITS.steps })) return;
    block.items.forEach((item, i) => {
      const ip = `${path}.items[${i}]`;
      if (!v.obj(item, ip)) return;
      v.str(item.title, `${ip}.title`, { max: LIMITS.shortText });
      v.str(item.text, `${ip}.text`, { required: false, max: LIMITS.text });
    });
  },

  render(block) {
    return h('div', { class: 'blk blk-steps' },
      block.title ? h('h3', { class: 'blk-steps__title' }, cleanText(block.title)) : null,
      h('ol', { class: 'blk-steps__list' },
        block.items.map((item, i) => h('li', { class: 'blk-steps__item' },
          h('span', { class: 'blk-steps__num', 'aria-hidden': 'true' }, toFaDigits(i + 1)),
          h('div', null,
            h('strong', null, cleanText(item.title)),
            item.text ? h('p', null, renderInline(item.text)) : null)))));
  },
};
