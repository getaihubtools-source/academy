import { h } from '../../core/dom.js';
import { renderParagraphs } from '../inline.js';
import { LIMITS } from '../check.js';

export const DIRS = ['rtl', 'ltr', 'auto'];
export const dirOf = (block, fallback = 'rtl') => (DIRS.includes(block.dir) ? block.dir : fallback);

// { type:'text', text, dir? } — خط خالی = پاراگراف جدید؛ **پررنگ** *کج* `کد` [لینک](https://...)
export const text = {
  validate(block, path, v) {
    v.str(block.text, `${path}.text`, { max: LIMITS.text });
    v.oneOf(block.dir, `${path}.dir`, DIRS);
  },
  render(block) {
    return h('div', { class: 'blk blk-text', dir: dirOf(block) }, renderParagraphs(block.text));
  },
};
