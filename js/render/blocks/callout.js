import { h } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { t } from '../../core/i18n-fa.js';
import { cleanText } from '../sanitize.js';
import { renderParagraphs } from '../inline.js';
import { LIMITS } from '../check.js';

const VARIANTS = ['info', 'tip', 'warning'];
const ICONS = { info: 'info', tip: 'bulb', warning: 'alert' };

// { type:'callout', variant?: 'info'|'tip'|'warning' (پیش‌فرض info), title?, text }
export const callout = {
  validate(block, path, v) {
    v.oneOf(block.variant, `${path}.variant`, VARIANTS);
    v.str(block.title, `${path}.title`, { required: false, max: LIMITS.shortText });
    v.str(block.text, `${path}.text`, { max: LIMITS.text });
  },
  render(block) {
    const variant = VARIANTS.includes(block.variant) ? block.variant : 'info';
    return h('div', { class: `blk blk-callout blk-callout--${variant}`, role: 'note' },
      icon(ICONS[variant], { size: 22 }),
      h('div', { class: 'blk-callout__body' },
        h('strong', null, block.title ? cleanText(block.title) : t(`blk.callout.${variant}`)),
        renderParagraphs(block.text)));
  },
};
