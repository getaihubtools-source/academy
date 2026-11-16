// ایندکس و جست‌وجوی آفلاین (خالص؛ بدون DOM و DB)
// ایندکس هنگام نصب pack ساخته و در store «searchIndex» ذخیره می‌شود.
// قاعده تطبیق: همه کلمه‌های عبارت باید «داخل یک بلوک» (یا عنوان درس) پیدا شوند (AND، زیررشته‌ای).
import { normalizeFa, normalizeWithMap } from './normalize.js';
import { plainText } from '../render/inline.js';
import { lessonIndex } from '../packs/loader.js';

// با هر تغییر در قواعد نرمال‌سازی/استخراج باید افزایش یابد تا ایندکس‌های قدیمی بازسازی شوند
export const INDEX_VERSION = 2;

const MAX_TOKENS = 6;
const MIN_QUERY_CHARS = 2;
const KIND_WEIGHT = { title: 10, heading: 6, prompt: 3, body: 2 };

/* ───────── استخراج متن بلوک‌ها ───────── */
const str = (v) => (typeof v === 'string' ? plainText(v) : '');
const joined = (parts) => parts.map(str).filter(Boolean).join('\n');

function listText(items, out = []) {
  for (const item of Array.isArray(items) ? items : []) {
    if (typeof item === 'string') out.push(str(item));
    else if (item && typeof item === 'object') { out.push(str(item.text)); listText(item.items, out); }
  }
  return out;
}

// خروجی: { kind, text } یا null (بلوک بدون متن قابل‌جست‌وجو / نوع ناشناخته)
export function extractBlock(block) {
  if (!block || typeof block !== 'object') return null;
  let kind = 'body';
  let parts;
  switch (block.type) {
    case 'heading': kind = 'heading'; parts = [block.text]; break;
    case 'text': parts = [block.text]; break;
    case 'list': parts = listText(block.items); break;
    case 'image': parts = [block.alt, block.caption]; break;
    case 'prompt': kind = 'prompt'; parts = [block.title, block.text, block.note]; break;
    case 'steps': parts = [block.title, ...(Array.isArray(block.items) ? block.items.flatMap((i) => [i && i.title, i && i.text]) : [])]; break;
    case 'comparison':
      parts = [block.title, ...(Array.isArray(block.columns) ? block.columns : []),
        ...(Array.isArray(block.rows) ? block.rows.flatMap((r) => [r && r.label, ...(r && Array.isArray(r.cells) ? r.cells : [])]) : [])];
      break;
    case 'callout': parts = [block.title, block.text]; break;
    case 'video': parts = [block.title]; break;
    case 'tool': parts = [block.name, block.description, block.bestFor, ...(Array.isArray(block.pros) ? block.pros : []), ...(Array.isArray(block.cons) ? block.cons : [])]; break;
    case 'quiz':
      parts = [block.title, ...(Array.isArray(block.questions) ? block.questions.flatMap((q) => [q && q.text, ...(q && Array.isArray(q.options) ? q.options : [])]) : [])];
      break;
    case 'exercise': case 'project':
      parts = [block.title, block.text, ...(Array.isArray(block.items) ? block.items : []), ...(Array.isArray(block.criteria) ? block.criteria : [])];
      break;
    default: return null;
  }
  const text = joined(parts);
  return text ? { kind, text } : null;
}

/* ───────── ساخت ایندکس ───────── */
export function buildSearchIndex(pack) {
  const index = lessonIndex(pack);
  const lessons = {};
  const entries = [];

  for (const l of index) {
    lessons[l.lessonId] = { title: l.title, chapterTitle: l.chapterTitle };
    entries.push({ l: l.lessonId, b: -1, id: null, k: 'title', t: l.title, n: normalizeFa(l.title) });

    const blocks = pack.lessons && pack.lessons[l.lessonId] && pack.lessons[l.lessonId].blocks;
    (Array.isArray(blocks) ? blocks : []).forEach((block, b) => {
      const ex = extractBlock(block);
      if (!ex) return;
      entries.push({ l: l.lessonId, b, id: typeof block.id === 'string' ? block.id : null, k: ex.kind, t: ex.text, n: normalizeFa(ex.text) });
    });
  }

  return {
    courseId: pack.manifest.id,
    indexVersion: INDEX_VERSION,
    packVersion: pack.manifest.version,
    lessons,
    entries,
  };
}

/* ───────── پرس‌وجو ───────── */
// خروجی: { tokens, valid }
export function parseQuery(query) {
  const norm = normalizeFa(query);
  const tokens = [...new Set(norm.split(' ').filter(Boolean))].slice(0, MAX_TOKENS);
  return { tokens, valid: norm.replace(/ /g, '').length >= MIN_QUERY_CHARS };
}

function countOccurrences(haystack, needle) {
  let count = 0;
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + needle.length)) count++;
  return count;
}

// indexes: آرایه‌ای از ایندکس‌ها (یک یا چند دوره). خروجی: نتایج گروه‌شده به‌ازای درس، به ترتیب امتیاز.
export function searchIndexes(indexes, query, { limit = 40, perLesson = 3 } = {}) {
  const { tokens, valid } = parseQuery(query);
  if (!valid) return [];

  const groups = new Map();
  let order = 0;

  for (const idx of indexes) {
    for (const entry of idx.entries) {
      if (!tokens.every((tk) => entry.n.includes(tk))) continue;
      const occurrences = tokens.reduce((sum, tk) => sum + countOccurrences(entry.n, tk), 0);
      const score = (KIND_WEIGHT[entry.k] || 1) * tokens.length + Math.min(5, occurrences);

      const key = `${idx.courseId}\u0000${entry.l}`;
      let g = groups.get(key);
      if (!g) {
        const meta = idx.lessons[entry.l] || { title: entry.l, chapterTitle: '' };
        g = { courseId: idx.courseId, lessonId: entry.l, title: meta.title, chapterTitle: meta.chapterTitle, score: 0, hits: [], order: order++ };
        groups.set(key, g);
      }
      g.hits.push({ b: entry.b, id: entry.id, kind: entry.k, text: entry.t, score });
    }
  }

  const results = [];
  for (const g of groups.values()) {
    g.hits.sort((a, b) => b.score - a.score || a.b - b.b);
    g.hits = g.hits.slice(0, perLesson);
    g.score = g.hits.reduce((sum, h, i) => sum + h.score * (i === 0 ? 1 : 0.25), 0);
    results.push(g);
  }
  results.sort((a, b) => b.score - a.score || a.order - b.order);
  return results.slice(0, limit);
}

/* ───────── snippet با هایلایت ───────── */
// خروجی: { segments: [{ text, mark }], startCut, endCut } — هایلایت با نگاشت موقعیت روی «متن اصلی» انجام می‌شود
const TRAILING_MARKS = /[\u064B-\u065F\u0670\u0640]/;

export function buildSnippet(text, tokens, { width = 150, lead = 40 } = {}) {
  const original = typeof text === 'string' ? text : '';
  const { norm, map } = normalizeWithMap(original);

  const ranges = [];
  let first = -1;
  for (const tk of tokens) {
    for (let i = norm.indexOf(tk); i !== -1; i = norm.indexOf(tk, i + tk.length)) {
      if (first === -1 || i < first) first = i;
      let e = map[i + tk.length - 1] + 1;
      while (e < original.length && TRAILING_MARKS.test(original[e])) e++; // اعراب/کشیده بعد از آخرین حرف هم برجسته شود
      ranges.push([map[i], e]);
    }
  }

  const anchor = first === -1 ? 0 : map[first];
  const start = Math.max(0, anchor - lead);
  const end = Math.min(original.length, start + width);

  // ادغام بازه‌های هم‌پوشان و برش به پنجره
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [s, e] of ranges) {
    const cs = Math.max(s, start);
    const ce = Math.min(e, end);
    if (ce <= cs) continue;
    const last = merged[merged.length - 1];
    if (last && cs <= last[1]) last[1] = Math.max(last[1], ce);
    else merged.push([cs, ce]);
  }

  const clean = (s) => s.replace(/\s+/g, ' ');
  const segments = [];
  let cursor = start;
  for (const [s, e] of merged) {
    if (s > cursor) segments.push({ text: clean(original.slice(cursor, s)), mark: false });
    segments.push({ text: clean(original.slice(s, e)), mark: true });
    cursor = e;
  }
  if (cursor < end) segments.push({ text: clean(original.slice(cursor, end)), mark: false });

  return { segments: segments.filter((x) => x.text !== ''), startCut: start > 0, endCut: end < original.length };
}
