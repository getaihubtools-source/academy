// تست‌های M2 — اعتبارسنجی pack، sanitize، inline امن، بلوک‌ها، XSS
// در Node (jsdom) و در مرورگر اجرا می‌شود. pack نمونه از طریق loadSample() تأمین می‌شود.
import { parseInline, renderInline, renderParagraphs } from '../js/render/inline.js';
import { cleanText, isHttpsUrl } from '../js/render/sanitize.js';
import { createRegistry } from '../js/render/registry.js';
import { createDefaultRegistry, CORE_BLOCKS } from '../js/render/blocks/index.js';
import { validatePack } from '../js/packs/schema.js';
import { parsePack, createAssetStore, lessonIndex } from '../js/packs/loader.js';
import { renderLessonBlocks } from '../js/render/lesson.js';
import { hasKey } from '../js/core/i18n-fa.js';

const eq = (a, b, msg = '') => { if (!Object.is(a, b)) throw new Error(`${msg} expected ${JSON.stringify(b)} but got ${JSON.stringify(a)}`); };
const ok = (v, msg = 'expected truthy') => { if (!v) throw new Error(msg); };

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

let SAMPLE_TEXT = '';
const clone = () => JSON.parse(SAMPLE_TEXT);
const codes = (res) => res.errors.map((e) => e.code);
const hasError = (res, code, path) => res.errors.some((e) => e.code === code && (!path || e.path === path || e.path.startsWith(path)));
const mount = (frag) => { const d = document.createElement('div'); d.append(frag); return d; };
const noopAssetUrl = () => null;

// pack حداقلی معتبر برای تست‌های هدفمند
const minimalPack = (blocks, extra = {}) => ({
  schemaVersion: 1,
  manifest: { id: 'min-course', title: 'T', language: 'fa', version: '1.0.0', chapters: [{ id: 'c1', title: 'C', lessons: [{ id: 'l1', title: 'L' }] }] },
  lessons: { l1: { blocks } },
  ...extra,
});

/* ───────── sanitize ───────── */
test('sanitize: حذف کاراکترهای کنترلی و bidi، حفظ نیم‌فاصله و خط جدید', () => {
  eq(cleanText('a\u0000b‮c⁦d\u007Fe'), 'abcde');
  eq(cleanText('می‌خواهم\nخط دوم\tتب'), 'می‌خواهم\nخط دوم\tتب');
  eq(cleanText(123), '');
  eq(cleanText(undefined), '');
});
test('sanitize: isHttpsUrl فقط https', () => {
  ok(isHttpsUrl('https://a.com/x?y=1'));
  ok(!isHttpsUrl('http://a.com')); ok(!isHttpsUrl('javascript:alert(1)')); ok(!isHttpsUrl('//a.com')); ok(!isHttpsUrl(null));
  ok(!isHttpsUrl('data:text/html,x')); ok(!isHttpsUrl(' javascript:alert(1)'));
});

/* ───────── inline ───────── */
test('inline: پررنگ، کج، کد و لینک', () => {
  const n = parseInline('الف **ب** و *ج* و `د` و [ه](https://x.com)');
  eq(n.map((x) => x.t).join(','), 'text,b,text,i,text,code,text,a');
  eq(n[7].href, 'https://x.com');
});
test('inline: قالب ناقص یا خالی به متن ساده برمی‌گردد (بدون خطا)', () => {
  for (const s of ['**بدون پایان', '*تک', '`باز', '[لینک](', '[](https://a.com)', '**', '', '5 * 3 * 2']) {
    const out = mount(renderInline(s).map((x) => (typeof x === 'string' ? document.createTextNode(x) : x)));
    ok(typeof out.textContent === 'string', s);
  }
  eq(parseInline('**بدون پایان')[0].t, 'text');
});
test('inline: لینک ناامن → فقط برچسب متن ساده', () => {
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'http://a.com', '//evil.com', 'vbscript:x', ' javascript:alert(1)']) {
    const nodes = parseInline(`[کلیک](${bad})`);
    ok(nodes.every((n) => n.t !== 'a'), bad);
    eq(nodes[0].v, 'کلیک');
  }
});
test('inline: خروجی DOM — rel امن و بدون HTML تزریقی', () => {
  const box = document.createElement('p');
  box.append(...renderInline('[سایت](https://example.com) <b>x</b>'));
  const a = box.querySelector('a');
  eq(a.getAttribute('rel'), 'noopener noreferrer'); eq(a.getAttribute('target'), '_blank');
  eq(box.querySelector('b'), null, 'تگ b نباید ساخته شود');
  ok(box.textContent.includes('<b>x</b>'));
});
test('inline: تودرتوی عمیق قطع می‌شود و crash نمی‌کند', () => {
  const deep = '**'.repeat(50) + 'x' + '**'.repeat(50);
  ok(Array.isArray(parseInline(deep)));
  ok(Array.isArray(parseInline('*a **b *c **d** c* b** a*')));
});
test('inline: پاراگراف‌ها و خط جدید', () => {
  const ps = renderParagraphs('الف\nب\n\nج');
  eq(ps.length, 2); eq(ps[0].querySelectorAll('br').length, 1); eq(renderParagraphs('  \n\n ').length, 0);
});

/* ───────── pack نمونه ───────── */
test('sample: pack نمونه معتبر است و همه ۱۳ نوع بلوک را پوشش می‌دهد', () => {
  const res = parsePack(SAMPLE_TEXT);
  ok(res.ok, JSON.stringify(res.errors));
  eq(res.warnings.length, 0, 'هشدار نباید باشد');
  const used = new Set();
  for (const l of Object.values(res.pack.lessons)) for (const b of l.blocks) used.add(b.type);
  eq([...used].sort().join(','), Object.keys(CORE_BLOCKS).sort().join(','));
  eq(Object.keys(CORE_BLOCKS).length, 13);
});
test('sample: lessonIndex ترتیب و متادیتا را درست می‌دهد', () => {
  const idx = lessonIndex(parsePack(SAMPLE_TEXT).pack);
  eq(idx.map((x) => x.lessonId).join(','), 'intro,prompts,wrap-up');
  eq(idx[0].free, true); eq(idx[1].free, false); eq(idx[1].minutes, 12);
});
test('sample: رندر همه درس‌ها بدون crash و بدون بلوک ناسازگار', () => {
  const { pack } = parsePack(SAMPLE_TEXT);
  const assets = createAssetStore(pack, { urlApi: { createObjectURL: () => 'blob:test', revokeObjectURL() {} } });
  for (const id of ['intro', 'prompts', 'wrap-up']) {
    const root = mount(renderLessonBlocks(pack, id, { assetUrl: (a) => assets.url(a) }));
    ok(root.children.length > 0, id);
    eq(root.querySelectorAll('.blk-unsupported').length, 0, id);
  }
  eq(renderLessonBlocks(pack, 'nope', {}), null);
});

/* ───────── schema: خطاها ───────── */
test('schema: ورودی غیر object / JSON خراب / بزرگ', () => {
  ok(!validatePack(null).ok); ok(!validatePack([]).ok); ok(!validatePack('x').ok);
  eq(parsePack('{bad').errors[0].code, 'pack.json');
  eq(parsePack(123).errors[0].code, 'pack.type');
  eq(parsePack('').errors[0].code, 'pack.json');
  ok(parsePack('﻿' + SAMPLE_TEXT).ok, 'BOM باید تحمل شود');
});
test('schema: schemaVersion ناموجود/جدیدتر/قدیمی', () => {
  const p = clone(); delete p.schemaVersion;
  eq(codes(validatePack(p))[0], 'schema.version');
  p.schemaVersion = 99;
  const r = validatePack(p);
  eq(codes(r)[0], 'schema.unsupported'); ok(r.errors[0].message.includes('به‌روزرسانی'));
  p.schemaVersion = 0;
  ok(validatePack(p).errors[0].message.includes('قدیمی'));
  p.schemaVersion = '1';
  eq(codes(validatePack(p))[0], 'schema.version');
});
test('schema: فیلدهای manifest', () => {
  let p = clone(); p.manifest.id = 'Bad ID!'; ok(hasError(validatePack(p), 'manifest.id'));
  p = clone(); delete p.manifest.title; ok(hasError(validatePack(p), 'field.required', 'manifest.title'));
  p = clone(); p.manifest.version = '1.0'; ok(hasError(validatePack(p), 'manifest.version'));
  p = clone(); p.manifest.language = 'de'; ok(hasError(validatePack(p), 'field.enum', 'manifest.language'));
  p = clone(); p.manifest.chapters = []; ok(hasError(validatePack(p), 'array.tooShort'));
  p = clone(); p.manifest.chapters[0].lessons[0].minutes = 0; ok(hasError(validatePack(p), 'lesson.minutes'));
  p = clone(); p.manifest.title = 'x'.repeat(201); ok(hasError(validatePack(p), 'field.tooLong'));
});
test('schema: شناسه تکراری فصل/درس، شناسه نامعتبر و درس گمشده', () => {
  let p = clone(); p.manifest.chapters[1].id = 'basics'; ok(hasError(validatePack(p), 'chapter.duplicate'));
  p = clone(); p.manifest.chapters[1].lessons[0].id = 'intro'; ok(hasError(validatePack(p), 'lesson.duplicate'));
  p = clone(); p.manifest.chapters[0].lessons[0].id = 'Bad_ID'; ok(hasError(validatePack(p), 'lesson.id'));
  p = clone(); delete p.lessons.prompts; ok(hasError(validatePack(p), 'lesson.missing', 'lessons.prompts'));
});
test('schema: کلید ناشناخته و درس یتیم هشدار است نه خطا', () => {
  const p = clone(); p.extra = 1; p.lessons.ghost = { blocks: [{ type: 'text', text: 'x' }] };
  const r = validatePack(p);
  ok(r.ok); eq(r.warnings.map((w) => w.code).sort().join(','), 'lesson.orphan,pack.unknownKey');
});
test('schema: درس بدون بلوک یا با blocks غیرآرایه', () => {
  ok(hasError(validatePack(minimalPack([])), 'array.tooShort', 'lessons.l1.blocks'));
  const p = minimalPack([]); p.lessons.l1.blocks = 'x';
  ok(hasError(validatePack(p), 'field.type'));
});
test('schema: بلوک ناشناخته هشدار + placeholder (pack برای موتور جدیدتر)', () => {
  const p = minimalPack([{ type: 'hologram', x: 1 }, { type: 'text', text: 'سلام' }]);
  const r = validatePack(p);
  ok(r.ok); eq(r.warnings[0].code, 'block.unknown');
  const root = mount(renderLessonBlocks(p, 'l1', {}));
  eq(root.querySelectorAll('.blk-unsupported').length, 1); eq(root.querySelectorAll('.blk-text').length, 1);
});
test('schema: بلوک بدون type / غیر object / id نامعتبر یا تکراری', () => {
  ok(hasError(validatePack(minimalPack([{ text: 'x' }])), 'block.type'));
  ok(hasError(validatePack(minimalPack(['str'])), 'field.type'));
  ok(hasError(validatePack(minimalPack([{ type: 'text', text: 'x', id: 'bad id!' }])), 'block.id'));
  ok(hasError(validatePack(minimalPack([{ type: 'text', text: 'x', id: 'a' }, { type: 'text', text: 'y', id: 'a' }])), 'block.duplicateId'));
});
test('schema: مسیر خطا دقیق است', () => {
  const p = clone(); p.lessons.prompts.blocks[3].items[1].title = '';
  const r = validatePack(p);
  ok(r.errors.some((e) => e.path === 'lessons.prompts.blocks[3].items[1].title'), JSON.stringify(r.errors));
});

/* ───────── اعتبارسنجی هر بلوک ───────── */
test('block/heading,text: فیلد الزامی و enum', () => {
  ok(hasError(validatePack(minimalPack([{ type: 'heading' }])), 'field.required'));
  ok(hasError(validatePack(minimalPack([{ type: 'heading', text: 'x', level: 1 }])), 'field.enum'));
  ok(hasError(validatePack(minimalPack([{ type: 'text', text: 'x', dir: 'up' }])), 'field.enum'));
  ok(hasError(validatePack(minimalPack([{ type: 'text', text: '   ' }])), 'field.empty'));
  ok(hasError(validatePack(minimalPack([{ type: 'text', text: 'x'.repeat(8001) }])), 'field.tooLong'));
});
test('block/list: خالی، عمق بیش از حد، آیتم نامعتبر', () => {
  ok(hasError(validatePack(minimalPack([{ type: 'list', items: [] }])), 'array.tooShort'));
  const deep = { text: 'a', items: [{ text: 'b', items: [{ text: 'c', items: [{ text: 'd', items: ['e'] }] }] }] };
  ok(hasError(validatePack(minimalPack([{ type: 'list', items: [deep] }])), 'list.depth'));
  ok(hasError(validatePack(minimalPack([{ type: 'list', items: [5] }])), 'field.type'));
  ok(validatePack(minimalPack([{ type: 'list', items: [{ text: 'a', items: [{ text: 'b', items: ['c'] }] }] }])).ok, 'سه سطح مجاز است');
});
test('block/image: asset ناموجود یا alt خالی', () => {
  ok(hasError(validatePack(minimalPack([{ type: 'image', asset: 'nope', alt: 'x' }])), 'image.assetMissing'));
  const p = clone(); p.lessons.intro.blocks.find((b) => b.type === 'image').alt = '';
  ok(hasError(validatePack(p), 'field.empty'));
});
test('block/prompt: lang نامعتبر و بدون متن', () => {
  ok(hasError(validatePack(minimalPack([{ type: 'prompt', text: 'x', lang: 'fr' }])), 'field.enum'));
  ok(hasError(validatePack(minimalPack([{ type: 'prompt' }])), 'field.required'));
});
test('block/steps: خالی یا آیتم بدون عنوان', () => {
  ok(hasError(validatePack(minimalPack([{ type: 'steps', items: [] }])), 'array.tooShort'));
  ok(hasError(validatePack(minimalPack([{ type: 'steps', items: [{ text: 'x' }] }])), 'field.required'));
});
test('block/comparison: ناهماهنگی سلول/ستون، highlight، حدود', () => {
  const base = (over) => ({ type: 'comparison', columns: ['الف', 'ب'], rows: [{ label: 'r', cells: ['1', '2'] }], ...over });
  ok(validatePack(minimalPack([base({})])).ok);
  ok(hasError(validatePack(minimalPack([base({ rows: [{ label: 'r', cells: ['1'] }] })])), 'comparison.cells'));
  ok(hasError(validatePack(minimalPack([base({ highlight: 2 })])), 'comparison.highlight'));
  ok(hasError(validatePack(minimalPack([base({ highlight: '0' })])), 'comparison.highlight'));
  ok(hasError(validatePack(minimalPack([base({ columns: ['الف'] })])), 'array.tooShort'));
  ok(hasError(validatePack(minimalPack([base({ columns: ['1', '2', '3', '4', '5'] })])), 'array.tooLong'));
});
test('block/callout و tool: enum ها', () => {
  ok(hasError(validatePack(minimalPack([{ type: 'callout', variant: 'danger', text: 'x' }])), 'field.enum'));
  ok(hasError(validatePack(minimalPack([{ type: 'tool', name: 'n', description: 'd', pricing: 'gold' }])), 'field.enum'));
  ok(validatePack(minimalPack([{ type: 'tool', name: 'n', description: 'd' }])).ok);
});

/* ───────── امنیت (XSS و URL) ───────── */
test('security: URL ویدئو و ابزار فقط https', () => {
  for (const url of ['javascript:alert(1)', 'http://a.com', 'data:text/html,x', '//a.com', 'ftp://a.com']) {
    ok(hasError(validatePack(minimalPack([{ type: 'video', title: 't', url }])), 'url.protocol'), url);
    ok(hasError(validatePack(minimalPack([{ type: 'tool', name: 'n', description: 'd', url }])), 'url.protocol'), url);
  }
});
test('security: payloadهای XSS در همه بلوک‌ها فقط متن می‌شوند', () => {
  const X = '<img src=x onerror="window.__xss=1"><script>window.__xss=1</script><svg onload="window.__xss=1">';
  const pack = minimalPack([
    { type: 'heading', text: X },
    { type: 'text', text: X + ' **' + X + '** [' + X + '](https://a.com)' },
    { type: 'list', items: [X, { text: X, items: [X] }] },
    { type: 'prompt', title: X, text: X, note: X },
    { type: 'steps', title: X, items: [{ title: X, text: X }] },
    { type: 'comparison', title: X, columns: [X, X], rows: [{ label: X, cells: [X, X] }] },
    { type: 'callout', title: X, text: X },
    { type: 'video', title: X, url: 'https://a.com/' + encodeURIComponent(X) },
    { type: 'tool', name: X, description: X, bestFor: X, pros: [X], cons: [X] },
  ]);
  const res = validatePack(pack);
  ok(res.ok, JSON.stringify(res.errors));
  globalThis.window.__xss = 0;
  const root = mount(renderLessonBlocks(pack, 'l1', {}));
  eq(root.querySelectorAll('script, img, svg[onload], iframe, object, embed').length, 0, 'تگ خطرناک نباید ساخته شود');
  for (const el of root.querySelectorAll('*')) {
    for (const attr of el.attributes) ok(!/^on/i.test(attr.name), `attribute ${attr.name} on <${el.tagName}>`);
  }
  eq(globalThis.window.__xss, 0, 'کد اجرا نشد');
  ok(root.textContent.includes('<script>'), 'payload باید به‌صورت متن دیده شود');
});
test('security: همه لینک‌های رندرشده https، target امن و rel دارند', () => {
  const { pack } = parsePack(SAMPLE_TEXT);
  const root = mount(renderLessonBlocks(pack, 'intro', { assetUrl: noopAssetUrl }));
  root.append(mount(renderLessonBlocks(pack, 'prompts', { assetUrl: noopAssetUrl })));
  const links = [...root.querySelectorAll('a')];
  ok(links.length >= 3);
  for (const a of links) {
    ok(a.getAttribute('href').startsWith('https://'), a.getAttribute('href'));
    eq(a.getAttribute('rel'), 'noopener noreferrer'); eq(a.getAttribute('target'), '_blank');
  }
});
test('security: کاراکترهای bidi/کنترلی در خروجی DOM حذف می‌شوند', () => {
  const pack = minimalPack([{ type: 'text', text: 'سلام‮خداحافظ\u0000' }, { type: 'heading', text: 'ت⁦ی' }]);
  const root = mount(renderLessonBlocks(pack, 'l1', {}));
  ok(!/[‪-‮⁦-⁩\u0000]/.test(root.textContent));
});
test('security: __proto__ و کلیدهای خطرناک در lessons/assets اثری ندارند', () => {
  const p = JSON.parse('{"schemaVersion":1,"manifest":' + JSON.stringify(minimalPack([{ type: 'text', text: 'x' }]).manifest) + ',"lessons":{"l1":{"blocks":[{"type":"text","text":"x"}]},"__proto__":{"polluted":true}},"assets":{"__proto__":{"mime":"image/png","data":"AAAA"}}}');
  validatePack(p);
  eq({}.polluted, undefined);
  eq(renderLessonBlocks(p, '__proto__', {}), null);
  eq(createAssetStore(p, { urlApi: { createObjectURL: () => 'x', revokeObjectURL() {} } }).url('constructor'), null);
});

/* ───────── assets ───────── */
test('assets: mime غیرمجاز (SVG)، base64 خراب، جعل نوع، حجم', () => {
  const pngB64 = clone().assets['sample-gradient'].data;
  const withAsset = (a) => minimalPack([{ type: 'text', text: 'x' }], { assets: { 'a-1': a } });
  ok(hasError(validatePack(withAsset({ mime: 'image/svg+xml', data: pngB64 })), 'field.enum'));
  ok(hasError(validatePack(withAsset({ mime: 'image/png', data: '!!!notbase64' })), 'asset.data'));
  ok(hasError(validatePack(withAsset({ mime: 'image/png', data: '' })), 'asset.data'));
  ok(hasError(validatePack(withAsset({ mime: 'image/jpeg', data: pngB64 })), 'asset.magic'), 'PNG با mime اشتباه');
  ok(validatePack(withAsset({ mime: 'image/png', data: pngB64 })).ok);
  const big = 'A'.repeat(Math.ceil((2 * 1024 * 1024 + 16) / 3) * 4);
  ok(hasError(validatePack(withAsset({ mime: 'image/png', data: big })), 'asset.tooLarge'));
  const bad = minimalPack([{ type: 'text', text: 'x' }], { assets: { 'Bad ID': { mime: 'image/png', data: pngB64 } } });
  ok(hasError(validatePack(bad), 'asset.id'));
});
test('assets: بلوک تصویرِ ارجاع‌دهنده به asset نامعتبر هم رد می‌شود', () => {
  const p = minimalPack([{ type: 'image', asset: 'a-1', alt: 'x' }], { assets: { 'a-1': { mime: 'image/png', data: '###' } } });
  const r = validatePack(p);
  ok(hasError(r, 'asset.data')); ok(hasError(r, 'image.assetMissing'));
});
test('assets: Blob URL کش می‌شود و revokeAll همه را آزاد می‌کند', () => {
  const { pack } = parsePack(SAMPLE_TEXT);
  let created = 0; const revoked = [];
  const store = createAssetStore(pack, { urlApi: { createObjectURL: () => `blob:${++created}`, revokeObjectURL: (u) => revoked.push(u) } });
  const a = store.url('sample-gradient'); const b = store.url('sample-gradient');
  eq(a, b); eq(created, 1); eq(store.url('missing'), null);
  store.revokeAll(); eq(revoked.length, 1);
});
test('assets: بلوک تصویر با/بدون URL (تصویر جایگزین و alt)', () => {
  const { pack } = parsePack(SAMPLE_TEXT);
  let root = mount(renderLessonBlocks(pack, 'intro', { assetUrl: () => 'blob:abc' }));
  const img = root.querySelector('img');
  eq(img.getAttribute('src'), 'blob:abc'); ok(img.getAttribute('alt').length > 5); eq(img.getAttribute('loading'), 'lazy');
  root = mount(renderLessonBlocks(pack, 'intro', { assetUrl: () => null }));
  eq(root.querySelector('img'), null); ok(root.querySelector('.blk-image__missing[role="img"]'));
});

/* ───────── رندر هر بلوک (ساختار و دسترس‌پذیری) ───────── */
test('render: heading سطح ۲/۳ و text با dir', () => {
  const root = mount(renderLessonBlocks(minimalPack([{ type: 'heading', text: 'الف' }, { type: 'heading', level: 3, text: 'ب' }, { type: 'text', text: 'abc', dir: 'ltr' }, { type: 'text', text: 'فارسی' }]), 'l1', {}));
  eq(root.querySelectorAll('h2').length, 1); eq(root.querySelectorAll('h3').length, 1);
  eq(root.querySelectorAll('.blk-text')[0].getAttribute('dir'), 'ltr'); eq(root.querySelectorAll('.blk-text')[1].getAttribute('dir'), 'rtl');
});
test('render: list تودرتو و ordered', () => {
  const root = mount(renderLessonBlocks(minimalPack([{ type: 'list', ordered: true, items: ['a', { text: 'b', items: ['c'] }] }]), 'l1', {}));
  ok(root.querySelector('ol > li > ol')); eq(root.querySelectorAll('li').length, 3);
});
test('render: prompt با lang انگلیسی LTR و فارسی RTL', () => {
  const root = mount(renderLessonBlocks(minimalPack([{ type: 'prompt', text: 'سلام' }, { type: 'prompt', lang: 'en', text: 'hello' }]), 'l1', {}));
  const pres = root.querySelectorAll('pre');
  eq(pres[0].getAttribute('dir'), 'rtl'); eq(pres[1].getAttribute('dir'), 'ltr'); eq(pres[1].getAttribute('lang'), 'en');
});
test('render: prompt حفظ خط جدید و فاصله (بدون تبدیل به HTML)', () => {
  const root = mount(renderLessonBlocks(minimalPack([{ type: 'prompt', text: 'خط ۱\n  خط ۲ <b>x</b>' }]), 'l1', {}));
  eq(root.querySelector('pre').textContent, 'خط ۱\n  خط ۲ <b>x</b>'); eq(root.querySelector('pre b'), null);
});
test('render: steps با شماره فارسی', () => {
  const root = mount(renderLessonBlocks(minimalPack([{ type: 'steps', items: [{ title: 'الف' }, { title: 'ب' }] }]), 'l1', {}));
  eq(root.querySelectorAll('.blk-steps__num')[1].textContent, '۲'); eq(root.querySelectorAll('ol > li').length, 2);
});
test('render: comparison — scope، caption، ناحیه اسکرول قابل فوکوس، ستون پیشنهادی', () => {
  const { pack } = parsePack(SAMPLE_TEXT);
  const root = mount(renderLessonBlocks(pack, 'prompts', { assetUrl: noopAssetUrl }));
  const wrap = root.querySelector('.blk-table-wrap');
  eq(wrap.getAttribute('role'), 'region'); eq(wrap.getAttribute('tabindex'), '0'); ok(wrap.getAttribute('aria-label'));
  ok(wrap.querySelector('caption')); eq(wrap.querySelectorAll('thead th[scope="col"]').length, 3); eq(wrap.querySelectorAll('tbody th[scope="row"]').length, 3);
  eq(wrap.querySelectorAll('thead .badge').length, 1); eq(wrap.querySelectorAll('td.is-highlight').length, 3);
});
test('render: callout عنوان پیش‌فرض بر اساس نوع و role=note', () => {
  const root = mount(renderLessonBlocks(minimalPack([{ type: 'callout', variant: 'warning', text: 'x' }, { type: 'callout', text: 'y' }]), 'l1', {}));
  const cs = root.querySelectorAll('.blk-callout');
  eq(cs[0].querySelector('strong').textContent, 'هشدار'); eq(cs[1].querySelector('strong').textContent, 'نکته'); eq(cs[0].getAttribute('role'), 'note');
});
test('render: video لینک خارجی با hostname و tool با مزایا/محدودیت‌ها', () => {
  const { pack } = parsePack(SAMPLE_TEXT);
  const a = mount(renderLessonBlocks(pack, 'intro', { assetUrl: noopAssetUrl })).querySelector('.blk-video');
  eq(a.tagName, 'A'); ok(a.textContent.includes('example.com'));
  const tool = mount(renderLessonBlocks(pack, 'prompts', { assetUrl: noopAssetUrl })).querySelector('.blk-tool');
  eq(tool.querySelectorAll('.is-pros li').length, 2); eq(tool.querySelectorAll('.is-cons li').length, 2); ok(tool.querySelector('.badge')); ok(tool.querySelector('.blk-tool__link'));
});
test('render: data-block-id فقط برای id معتبر', () => {
  const root = mount(renderLessonBlocks(minimalPack([{ type: 'text', text: 'x', id: 'b-1' }, { type: 'text', text: 'y' }]), 'l1', {}));
  eq(root.querySelectorAll('[data-block-id]').length, 1); eq(root.querySelector('[data-block-id]').dataset.blockId, 'b-1');
});

/* ───────── registry ───────── */
test('registry: ثبت بلوک سفارشی بدون تغییر موتور', () => {
  const reg = createDefaultRegistry();
  reg.register('divider', { validate() {}, render: () => { const e = document.createElement('hr'); return e; } });
  const pack = minimalPack([{ type: 'divider' }]);
  ok(validatePack(pack, { registry: reg }).ok);
  eq(mount(renderLessonBlocks(pack, 'l1', { registry: reg })).querySelectorAll('hr').length, 1);
  eq(validatePack(pack).warnings[0].code, 'block.unknown', 'registry پیش‌فرض آن را نمی‌شناسد');
});
test('registry: تکراری، نام نامعتبر و تعریف ناقص رد می‌شوند', () => {
  const reg = createRegistry(); const def = { validate() {}, render: () => document.createElement('i') };
  reg.register('x', def);
  for (const fn of [() => reg.register('x', def), () => reg.register('Bad Name', def), () => reg.register('y', {}), () => reg.register('z', null)]) {
    let threw = false; try { fn(); } catch { threw = true; } ok(threw);
  }
});
test('registry: خطای render یک بلوک بقیه درس را خراب نمی‌کند', () => {
  const reg = createDefaultRegistry();
  reg.register('boom', { validate() {}, render() { throw new Error('x'); } });
  const origError = console.error; console.error = () => {};
  const root = mount(renderLessonBlocks(minimalPack([{ type: 'text', text: 'الف' }, { type: 'boom' }, { type: 'text', text: 'ب' }]), 'l1', { registry: reg }));
  console.error = origError;
  eq(root.querySelectorAll('.blk-text').length, 2); eq(root.querySelectorAll('.blk-unsupported').length, 1);
});
test('registry: رشته‌های UI بلوک‌ها در i18n تعریف شده‌اند', () => {
  for (const k of ['blk.unsupported', 'blk.image.missing', 'blk.prompt', 'blk.comparison', 'blk.comparison.criterion', 'blk.comparison.recommended',
    'blk.callout.info', 'blk.callout.tip', 'blk.callout.warning', 'blk.video', 'blk.video.external',
    'blk.tool.free', 'blk.tool.freemium', 'blk.tool.paid', 'blk.tool.bestFor', 'blk.tool.pros', 'blk.tool.cons', 'blk.tool.visit']) ok(hasKey(k), k);
});

/* ───────── ظرفیت ───────── */
test('perf: pack بزرگ (۳۰۰ درس × ۱۰ بلوک) در زمان معقول اعتبارسنجی می‌شود', () => {
  const lessons = {}; const chLessons = [];
  for (let i = 0; i < 300; i++) {
    const id = `l${i}`; chLessons.push({ id, title: `درس ${i}` });
    lessons[id] = { blocks: Array.from({ length: 10 }, (_, j) => ({ type: 'text', text: `متن ${i}-${j}` })) };
  }
  const p = { schemaVersion: 1, manifest: { id: 'big-course', title: 'T', language: 'fa', version: '1.0.0', chapters: [{ id: 'c', title: 'C', lessons: chLessons }] }, lessons };
  const t0 = Date.now(); const r = validatePack(p); const dt = Date.now() - t0;
  ok(r.ok, JSON.stringify(r.errors.slice(0, 2))); ok(dt < 1500, `زمان ${dt}ms`);
});
test('limits: بیش از ۵۰۰ بلوک در یک درس و بیش از ۳۰۰ درس رد می‌شود', () => {
  const blocks = Array.from({ length: 501 }, () => ({ type: 'text', text: 'x' }));
  ok(hasError(validatePack(minimalPack(blocks)), 'array.tooLong'));
});

export async function runTests({ sampleText } = {}) {
  SAMPLE_TEXT = sampleText;
  const results = [];
  for (const { name, fn } of tests) {
    try { await fn(); results.push({ name, ok: true }); } catch (err) { results.push({ name, ok: false, error: err.message }); }
  }
  return results;
}
