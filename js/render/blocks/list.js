import { h } from '../../core/dom.js';
import { renderInline } from '../inline.js';
import { LIMITS } from '../check.js';

// { type:'list', ordered?, items:[ 'متن' | { text, items:[...] } ] } — حداکثر ۳ سطح تودرتو
export const list = {
  validate(block, path, v) {
    v.bool(block.ordered, `${path}.ordered`);
    if (!v.arr(block.items, `${path}.items`, { min: 1, max: LIMITS.listItems })) return;

    const walk = (items, p, depth) => {
      items.forEach((item, i) => {
        const ip = `${p}[${i}]`;
        if (typeof item === 'string') { v.str(item, ip, { max: LIMITS.shortText * 2 }); return; }
        if (!v.obj(item, ip)) return;
        v.str(item.text, `${ip}.text`, { max: LIMITS.shortText * 2 });
        if (item.items === undefined) return;
        if (depth >= LIMITS.listDepth) { v.error('list.depth', ip, `عمق لیست بیش از ${LIMITS.listDepth} سطح است`); return; }
        if (v.arr(item.items, `${ip}.items`, { min: 1, max: LIMITS.listItems })) walk(item.items, `${ip}.items`, depth + 1);
      });
    };
    walk(block.items, `${path}.items`, 1);
  },

  render(block) {
    const build = (items, ordered, depth) => h(ordered ? 'ol' : 'ul', { class: 'blk-list__list' },
      items.map((item) => {
        if (typeof item === 'string') return h('li', null, renderInline(item));
        const nested = Array.isArray(item.items) && depth < LIMITS.listDepth ? build(item.items, ordered, depth + 1) : null;
        return h('li', null, renderInline(item.text), nested);
      }));
    return h('div', { class: 'blk blk-list' }, build(block.items, block.ordered === true, 1));
  },
};
