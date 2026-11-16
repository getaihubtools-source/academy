// ساخت DOM امن: هرگز innerHTML استفاده نمی‌شود.
// تمام متن‌ها Text Node هستند و URLها فقط در صورت امن بودن اعمال می‌شوند.
// (در M2 رندر محتوای دوره‌ها روی همین پایه ساخته می‌شود.)

// فقط: لینک داخلی (#...)، مسیر نسبی با / ، https و mailto
// allowBlob: فقط برای src تصویر (Blob URL ساخته‌شده توسط خود برنامه از asset های pack)
export function isSafeUrl(url, { allowBlob = false } = {}) {
  if (typeof url !== 'string') return false;
  const u = url.trim();
  if (u.startsWith('#')) return true;
  if (u.startsWith('/') && !u.startsWith('//')) return true;
  try {
    const protocol = new URL(u).protocol;
    return protocol === 'https:' || protocol === 'mailto:' || (allowBlob && protocol === 'blob:');
  } catch {
    return false;
  }
}

const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'poster']);
const BLOCKED_ATTRS = new Set(['innerhtml', 'outerhtml', 'srcdoc']);

function applyAttr(el, key, value) {
  if (value === null || value === undefined || value === false) return;
  const lower = key.toLowerCase();

  if (BLOCKED_ATTRS.has(lower)) return;

  if (key === 'class' || key === 'className') { el.setAttribute('class', String(value)); return; }

  if (key === 'dataset' && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) el.dataset[k] = String(v);
    return;
  }

  if (key === 'style' && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) el.style.setProperty(k, String(v));
    return;
  }

  if (lower.startsWith('on')) {
    // فقط تابع؛ رشته‌ی on* هرگز اعمال نمی‌شود
    if (typeof value === 'function') el.addEventListener(lower.slice(2), value);
    return;
  }

  if (URL_ATTRS.has(lower) && !isSafeUrl(String(value), { allowBlob: lower === 'src' && el.tagName === 'IMG' })) return;

  if (value === true) { el.setAttribute(key, ''); return; }
  el.setAttribute(key, String(value));
}

function appendChild(el, child) {
  if (child === null || child === undefined || child === false || child === true) return;
  if (Array.isArray(child)) { child.forEach((c) => appendChild(el, c)); return; }
  if (typeof Node !== 'undefined' && child instanceof Node) { el.appendChild(child); return; }
  el.appendChild(document.createTextNode(String(child)));
}

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs && typeof attrs === 'object') {
    for (const [k, v] of Object.entries(attrs)) applyAttr(el, k, v);
  }
  appendChild(el, children);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

// SVG داخلی (برای آیکن‌ها): spec = [{ tag, attrs }]
export function svg(children = [], attrs = {}) {
  const root = document.createElementNS(SVG_NS, 'svg');
  for (const [k, v] of Object.entries(attrs)) root.setAttribute(k, String(v));
  for (const { tag, attrs: a } of children) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(a || {})) node.setAttribute(k, String(v));
    root.appendChild(node);
  }
  return root;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}
