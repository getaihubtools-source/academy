// قالب‌بندی درون‌خطی امن برای متن درس‌ها (جایگزین HTML)
// سینتکس: **پررنگ**   *کج*   `کد`   [متن](https://آدرس)
// هر چیز دیگر (از جمله <script> یا <img>) متن ساده است و هرگز HTML پارس نمی‌شود.
import { h } from '../core/dom.js';
import { cleanText, isHttpsUrl } from './sanitize.js';

const MAX_DEPTH = 3;

// خروجی: آرایه‌ای از نودها: { t: 'text'|'b'|'i'|'code'|'a', v?, href?, c? }
export function parseInline(input, depth = 0) {
  const s = cleanText(input);
  const nodes = [];
  let buf = '';
  let i = 0;

  const flush = () => { if (buf) { nodes.push({ t: 'text', v: buf }); buf = ''; } };

  while (i < s.length) {
    const ch = s[i];

    if (ch === '`') {
      const end = s.indexOf('`', i + 1);
      if (end > i + 1) { flush(); nodes.push({ t: 'code', v: s.slice(i + 1, end) }); i = end + 1; continue; }
    } else if (ch === '*' && s[i + 1] === '*') {
      const end = s.indexOf('**', i + 2);
      if (end > i + 2 && depth < MAX_DEPTH) { flush(); nodes.push({ t: 'b', c: parseInline(s.slice(i + 2, end), depth + 1) }); i = end + 2; continue; }
    } else if (ch === '*' && s[i + 1] !== ' ' && s[i + 1] !== '*') {
      const end = s.indexOf('*', i + 1);
      if (end > i + 1 && s[end - 1] !== ' ' && depth < MAX_DEPTH) { flush(); nodes.push({ t: 'i', c: parseInline(s.slice(i + 1, end), depth + 1) }); i = end + 1; continue; }
    } else if (ch === '[') {
      const mid = s.indexOf('](', i + 1);
      const end = mid === -1 ? -1 : s.indexOf(')', mid + 2);
      if (mid > i + 1 && end > mid + 2) {
        const label = s.slice(i + 1, mid);
        const href = s.slice(mid + 2, end).trim();
        flush();
        // لینک ناامن: فقط برچسب به‌صورت متن ساده نمایش داده می‌شود
        if (isHttpsUrl(href)) nodes.push({ t: 'a', href, c: [{ t: 'text', v: label }] });
        else nodes.push({ t: 'text', v: label });
        i = end + 1;
        continue;
      }
    }

    buf += ch;
    i++;
  }
  flush();
  return nodes;
}

function toDom(node) {
  switch (node.t) {
    case 'text': return node.v;
    case 'code': return h('code', { class: 'ltr' }, node.v);
    case 'b': return h('strong', null, node.c.map(toDom));
    case 'i': return h('em', null, node.c.map(toDom));
    case 'a': return h('a', { href: node.href, target: '_blank', rel: 'noopener noreferrer' }, node.c.map(toDom));
    default: return '';
  }
}

// متن ساده (بدون نشانه‌گذاری **،*،`،[]()) — برای ایندکس جست‌وجو
export function plainText(input) {
  const walk = (nodes) => nodes.map((n) => (n.t === 'text' || n.t === 'code' ? n.v : walk(n.c || []))).join('');
  return walk(parseInline(input));
}

// آرایه‌ای از نودهای DOM/رشته که مستقیم به h() داده می‌شود
export function renderInline(input) {
  return parseInline(input).map(toDom);
}

// متن چندپاراگرافی: خط خالی = پاراگراف جدید، خط تکی = <br>
export function renderParagraphs(input, attrs = {}) {
  return cleanText(input)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const lines = p.split('\n');
      const kids = [];
      lines.forEach((line, idx) => {
        if (idx > 0) kids.push(h('br'));
        kids.push(...renderInline(line));
      });
      return h('p', attrs, kids);
    });
}
