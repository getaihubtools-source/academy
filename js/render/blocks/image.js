import { h } from '../../core/dom.js';
import { t } from '../../core/i18n-fa.js';
import { cleanText } from '../sanitize.js';
import { renderInline } from '../inline.js';

// { type:'image', asset:'<id>', alt (الزامی برای دسترس‌پذیری), caption? }
// تصویر فقط از asset داخل pack می‌آید (CSP هم تصویر خارجی را مسدود می‌کند).
export const image = {
  validate(block, path, v) {
    if (v.str(block.asset, `${path}.asset`, { max: 64 }) && !v.assetIds.has(block.asset)) {
      v.error('image.assetMissing', `${path}.asset`, 'این asset در pack تعریف نشده است');
    }
    v.str(block.alt, `${path}.alt`, { max: 300 });
    v.str(block.caption, `${path}.caption`, { required: false, max: 300 });
  },

  render(block, ctx) {
    const alt = cleanText(block.alt);
    const src = ctx && typeof ctx.assetUrl === 'function' ? ctx.assetUrl(block.asset) : null;
    const media = src
      ? h('img', { src, alt, loading: 'lazy', decoding: 'async' })
      : h('div', { class: 'blk-image__missing', role: 'img', 'aria-label': alt }, t('blk.image.missing'));
    return h('figure', { class: 'blk blk-image' }, media,
      block.caption ? h('figcaption', null, renderInline(block.caption)) : null);
  },
};
