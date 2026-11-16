import { h } from '../../core/dom.js';
import { cleanText } from '../sanitize.js';
import { LIMITS } from '../check.js';

// { type:'heading', level: 2|3 (پیش‌فرض ۲), text }  — سطح ۱ فقط برای عنوان درس رزرو است
export const heading = {
  validate(block, path, v) {
    v.str(block.text, `${path}.text`, { max: LIMITS.shortText });
    v.oneOf(block.level, `${path}.level`, [2, 3]);
  },
  render(block) {
    const level = block.level === 3 ? 3 : 2;
    return h(`h${level}`, { class: 'blk blk-heading' }, cleanText(block.text));
  },
};
