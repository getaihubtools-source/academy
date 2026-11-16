// Block Registry: هر نوع بلوک = { validate(block, path, v), render(block, ctx) }
// افزودن نوع بلوک جدید = یک ماژول + register (بدون دست‌زدن به موتور)
import { h } from '../core/dom.js';
import { t } from '../core/i18n-fa.js';
import { BLOCK_ID_PATTERN } from './sanitize.js';

function unsupportedBlock() {
  return h('div', { class: 'blk blk-unsupported', role: 'note' }, t('blk.unsupported'));
}

export function createRegistry() {
  const map = new Map();

  const registry = {
    register(type, def) {
      if (typeof type !== 'string' || !/^[a-z][a-z0-9-]*$/.test(type)) throw new Error(`Invalid block type name: ${type}`);
      if (map.has(type)) throw new Error(`Block type already registered: ${type}`);
      if (!def || typeof def.validate !== 'function' || typeof def.render !== 'function') {
        throw new Error(`Block "${type}" needs validate() and render()`);
      }
      map.set(type, def);
      return registry;
    },

    has: (type) => map.has(type),
    types: () => [...map.keys()],

    // بلوک ناشناخته خطا نیست (pack ممکن است برای موتور جدیدتر ساخته شده باشد)؛ هشدار + placeholder
    validateBlock(block, path, v) {
      if (!v.obj(block, path)) return;
      if (typeof block.type !== 'string' || block.type === '') { v.error('block.type', `${path}.type`, 'نوع بلوک (type) الزامی است'); return; }
      if (block.id !== undefined && !(typeof block.id === 'string' && BLOCK_ID_PATTERN.test(block.id))) {
        v.error('block.id', `${path}.id`, 'شناسه بلوک نامعتبر است (حروف لاتین، عدد، - و _ تا ۴۰ کاراکتر)');
      }
      const def = map.get(block.type);
      if (!def) { v.warn('block.unknown', path, `نوع بلوک ناشناخته: ${block.type.slice(0, 40)}`); return; }
      def.validate(block, path, v);
    },

    renderBlock(block, ctx) {
      const def = block && typeof block === 'object' ? map.get(block.type) : null;
      if (!def) return unsupportedBlock();
      try {
        const el = def.render(block, ctx);
        if (typeof block.id === 'string' && BLOCK_ID_PATTERN.test(block.id)) el.dataset.blockId = block.id;
        return el;
      } catch (err) {
        console.error('[render] block failed', block.type, err); // خطای یک بلوک کل درس را خراب نمی‌کند
        return unsupportedBlock();
      }
    },

    renderBlocks(blocks, ctx) {
      const frag = document.createDocumentFragment();
      for (const block of Array.isArray(blocks) ? blocks : []) frag.appendChild(registry.renderBlock(block, ctx));
      return frag;
    },
  };
  return registry;
}
