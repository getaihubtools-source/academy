import { h } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { t } from '../../core/i18n-fa.js';
import { copyText } from '../../features/clipboard.js';
import { cleanText } from '../sanitize.js';
import { renderInline } from '../inline.js';
import { LIMITS } from '../check.js';

const FEEDBACK_MS = 2000;

// { type:'prompt', title?, text, lang?: 'fa'|'en' (پیش‌فرض fa), note? }
// ctx.copy (اختیاری): جایگزین copyText برای تست
export const prompt = {
  validate(block, path, v) {
    v.str(block.title, `${path}.title`, { required: false, max: LIMITS.shortText });
    v.str(block.text, `${path}.text`, { max: LIMITS.promptText });
    v.oneOf(block.lang, `${path}.lang`, ['fa', 'en']);
    v.str(block.note, `${path}.note`, { required: false, max: LIMITS.text });
  },

  render(block, ctx) {
    const lang = block.lang === 'en' ? 'en' : 'fa';
    const copy = (ctx && ctx.copy) || copyText;
    const text = cleanText(block.text);

    const pre = h('pre', { class: 'blk-prompt__text', dir: lang === 'en' ? 'ltr' : 'rtl', lang }, text);
    const status = h('span', { class: 'sr-only', role: 'status' });
    const label = h('span', null, t('blk.prompt.copy'));
    let timer = null;

    const feedback = (message, announce) => {
      label.textContent = message;
      status.textContent = '';
      setTimeout(() => { status.textContent = announce; }, 30); // تغییر در فریم بعد تا صفحه‌خوان بخواند
      clearTimeout(timer);
      timer = setTimeout(() => { label.textContent = t('blk.prompt.copy'); }, FEEDBACK_MS);
    };

    const button = h('button', {
      class: 'btn btn--sm blk-prompt__copy', type: 'button',
      'aria-label': block.title ? `${t('blk.prompt.copyLabel')}: ${cleanText(block.title)}` : t('blk.prompt.copyLabel'),
      onclick: async () => {
        const ok = await copy(text);
        if (ok) { feedback(t('blk.prompt.copied'), t('blk.prompt.copied.announce')); return; }
        // کپی خودکار ممکن نشد: متن را انتخاب کن تا کاربر با Ctrl+C / منوی لمسی کپی کند
        try {
          const sel = globalThis.getSelection && globalThis.getSelection();
          if (sel) { sel.removeAllRanges(); const r = document.createRange(); r.selectNodeContents(pre); sel.addRange(r); }
        } catch { /* انتخاب پشتیبانی نشد */ }
        feedback(t('blk.prompt.copyFail'), t('blk.prompt.copyFail.hint'));
      },
    }, icon('copy'), label);

    return h('div', { class: 'blk blk-prompt' },
      h('div', { class: 'blk-prompt__head' },
        h('span', { class: 'badge' }, t('blk.prompt')),
        block.title ? h('strong', null, cleanText(block.title)) : null,
        button),
      pre,
      status,
      block.note ? h('p', { class: 'blk-prompt__note' }, renderInline(block.note)) : null);
  },
};
