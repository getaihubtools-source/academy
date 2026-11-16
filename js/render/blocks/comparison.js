import { h } from '../../core/dom.js';
import { t } from '../../core/i18n-fa.js';
import { cleanText } from '../sanitize.js';
import { renderInline } from '../inline.js';
import { LIMITS } from '../check.js';

// { type:'comparison', title?, columns:[۲..۴ برچسب], highlight?: اندیس ستون پیشنهادی,
//   rows:[{ label, cells:[...هم‌تعداد columns] }] }
export const comparison = {
  validate(block, path, v) {
    v.str(block.title, `${path}.title`, { required: false, max: LIMITS.shortText });
    const colsOk = v.arr(block.columns, `${path}.columns`, { min: 2, max: LIMITS.tableCols });
    if (colsOk) block.columns.forEach((c, i) => v.str(c, `${path}.columns[${i}]`, { max: 120 }));

    if (block.highlight !== undefined) {
      const ok = colsOk && Number.isInteger(block.highlight) && block.highlight >= 0 && block.highlight < block.columns.length;
      if (!ok) v.error('comparison.highlight', `${path}.highlight`, 'highlight باید اندیس معتبر یک ستون باشد');
    }

    if (!v.arr(block.rows, `${path}.rows`, { min: 1, max: LIMITS.tableRows })) return;
    block.rows.forEach((row, i) => {
      const rp = `${path}.rows[${i}]`;
      if (!v.obj(row, rp)) return;
      v.str(row.label, `${rp}.label`, { max: 120 });
      if (!v.arr(row.cells, `${rp}.cells`, { min: 1, max: LIMITS.tableCols })) return;
      if (colsOk && row.cells.length !== block.columns.length) {
        v.error('comparison.cells', `${rp}.cells`, `تعداد سلول‌ها (${row.cells.length}) باید با تعداد ستون‌ها (${block.columns.length}) برابر باشد`);
      }
      row.cells.forEach((cell, j) => v.str(cell, `${rp}.cells[${j}]`, { max: LIMITS.shortText }));
    });
  },

  render(block) {
    const hl = Number.isInteger(block.highlight) ? block.highlight : -1;
    const label = block.title ? cleanText(block.title) : t('blk.comparison');
    const table = h('table', { class: 'blk-table' },
      block.title ? h('caption', null, cleanText(block.title)) : null,
      h('thead', null, h('tr', null,
        h('th', { scope: 'col' }, t('blk.comparison.criterion')),
        block.columns.map((c, i) => h('th', { scope: 'col', class: i === hl ? 'is-highlight' : null },
          cleanText(c), i === hl ? h('span', { class: 'badge' }, t('blk.comparison.recommended')) : null)))),
      h('tbody', null, block.rows.map((row) => h('tr', null,
        h('th', { scope: 'row' }, cleanText(row.label)),
        row.cells.map((cell, j) => h('td', { class: j === hl ? 'is-highlight' : null }, renderInline(cell)))))));
    // ناحیه اسکرول افقی باید با کیبورد قابل دسترسی باشد
    return h('div', { class: 'blk blk-table-wrap', role: 'region', 'aria-label': label, tabindex: '0' }, table);
  },
};
