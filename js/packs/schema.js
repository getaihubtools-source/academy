// اعتبارسنجی Course Pack (قبل از هر نمایش یا ذخیره‌سازی)
// ساختار: { schemaVersion, manifest, lessons: { [lessonId]: { blocks: [...] } }, assets?: { [id]: { mime, data(base64) } } }
import { createValidator, LIMITS } from '../render/check.js';
import { defaultRegistry } from '../render/blocks/index.js';
import { ID_PATTERN } from '../render/sanitize.js';

export const PACK_SCHEMA_VERSION = 1;
export const SUPPORTED_SCHEMA_VERSIONS = [1];

const TOP_KEYS = new Set(['schemaVersion', 'manifest', 'lessons', 'assets']);
const COURSE_ID = /^[a-z0-9][a-z0-9-]{2,63}$/;
const SEMVER = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const MAX_ISSUES = 200;

// SVG عمداً مجاز نیست (می‌تواند اسکریپت حمل کند)
const ASSET_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

// بایت‌های اول فایل باید با mime اعلام‌شده بخوانند (جلوگیری از جعل نوع فایل)
function magicMatches(mime, b64) {
  if (typeof atob !== 'function') return true;
  let head;
  try { head = atob(b64.slice(0, 24)); } catch { return false; }
  const b = (i) => head.charCodeAt(i);
  switch (mime) {
    case 'image/png': return b(0) === 0x89 && head.slice(1, 4) === 'PNG';
    case 'image/jpeg': return b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff;
    case 'image/gif': return head.slice(0, 4) === 'GIF8';
    case 'image/webp': return head.slice(0, 4) === 'RIFF' && head.slice(8, 12) === 'WEBP';
    default: return false;
  }
}

function decodedSize(b64) {
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

function validateAssets(pack, v) {
  if (pack.assets === undefined) return;
  if (!v.obj(pack.assets, 'assets')) return;
  const ids = Object.keys(pack.assets);
  if (ids.length > LIMITS.assets) { v.error('assets.tooMany', 'assets', `حداکثر ${LIMITS.assets} asset مجاز است`); return; }

  let total = 0;
  for (const id of ids) {
    const p = `assets.${id}`;
    const before = v.issues.length;
    if (!ID_PATTERN.test(id)) v.error('asset.id', p, 'شناسه asset نامعتبر است (حروف کوچک لاتین، عدد و -)');
    const a = pack.assets[id];
    if (!v.obj(a, p)) continue;
    v.oneOf(a.mime, `${p}.mime`, ASSET_MIMES, { required: true });
    if (typeof a.data !== 'string' || a.data === '' || a.data.length % 4 !== 0 || !BASE64.test(a.data)) {
      v.error('asset.data', `${p}.data`, 'داده asset باید base64 معتبر باشد');
    } else {
      const size = decodedSize(a.data);
      total += size;
      if (size > LIMITS.assetBytes) v.error('asset.tooLarge', `${p}.data`, `حجم asset بیش از ${LIMITS.assetBytes / 1024 / 1024}MB است`);
      else if (ASSET_MIMES.includes(a.mime) && !magicMatches(a.mime, a.data)) v.error('asset.magic', `${p}.data`, 'محتوای فایل با نوع (mime) اعلام‌شده نمی‌خواند');
    }
    if (v.issues.length === before) v.assetIds.add(id);
  }
  if (total > LIMITS.totalAssetBytes) v.error('assets.tooLarge', 'assets', `مجموع حجم asset ها بیش از ${LIMITS.totalAssetBytes / 1024 / 1024}MB است`);
}

// خروجی: آرایه شناسه درس‌ها به ترتیب (یا null اگر manifest خراب است)
function validateManifest(pack, v) {
  const m = pack.manifest;
  if (!v.obj(m, 'manifest')) return null;

  if (v.str(m.id, 'manifest.id', { max: 64 }) && !COURSE_ID.test(m.id)) {
    v.error('manifest.id', 'manifest.id', 'شناسه دوره: حروف کوچک لاتین، عدد و -، بین ۳ تا ۶۴ کاراکتر');
  }
  v.str(m.title, 'manifest.title', { max: LIMITS.title });
  v.str(m.subtitle, 'manifest.subtitle', { required: false, max: LIMITS.shortText });
  v.str(m.description, 'manifest.description', { required: false, max: LIMITS.text });
  v.str(m.author, 'manifest.author', { required: false, max: 120 });
  v.oneOf(m.language, 'manifest.language', ['fa', 'en']);
  if (v.str(m.version, 'manifest.version', { max: 20 }) && !SEMVER.test(m.version)) {
    v.error('manifest.version', 'manifest.version', 'نسخه باید به شکل major.minor.patch باشد (مثلاً 1.0.0)');
  }

  if (!v.arr(m.chapters, 'manifest.chapters', { min: 1, max: LIMITS.chapters })) return null;

  const chapterIds = new Set();
  const lessonIds = [];
  const seenLessons = new Set();

  m.chapters.forEach((ch, ci) => {
    const cp = `manifest.chapters[${ci}]`;
    if (!v.obj(ch, cp)) return;
    if (v.str(ch.id, `${cp}.id`, { max: 64 })) {
      if (!ID_PATTERN.test(ch.id)) v.error('chapter.id', `${cp}.id`, 'شناسه فصل نامعتبر است');
      else if (chapterIds.has(ch.id)) v.error('chapter.duplicate', `${cp}.id`, 'شناسه فصل تکراری است');
      chapterIds.add(ch.id);
    }
    v.str(ch.title, `${cp}.title`, { max: LIMITS.title });
    if (!v.arr(ch.lessons, `${cp}.lessons`, { min: 1, max: LIMITS.lessons })) return;

    ch.lessons.forEach((ls, li) => {
      const lp = `${cp}.lessons[${li}]`;
      if (!v.obj(ls, lp)) return;
      if (v.str(ls.id, `${lp}.id`, { max: 64 })) {
        if (!ID_PATTERN.test(ls.id)) v.error('lesson.id', `${lp}.id`, 'شناسه درس نامعتبر است');
        else if (seenLessons.has(ls.id)) v.error('lesson.duplicate', `${lp}.id`, 'شناسه درس در کل دوره باید یکتا باشد');
        else { seenLessons.add(ls.id); lessonIds.push(ls.id); }
      }
      v.str(ls.title, `${lp}.title`, { max: LIMITS.title });
      v.bool(ls.free, `${lp}.free`);
      if (ls.minutes !== undefined && !(Number.isInteger(ls.minutes) && ls.minutes >= 1 && ls.minutes <= 600)) {
        v.error('lesson.minutes', `${lp}.minutes`, 'مدت درس باید عدد صحیح ۱ تا ۶۰۰ دقیقه باشد');
      }
    });
  });

  if (lessonIds.length > LIMITS.lessons) v.error('lessons.tooMany', 'manifest', `حداکثر ${LIMITS.lessons} درس مجاز است`);
  return lessonIds;
}

function validateLessons(pack, lessonIds, v, registry) {
  if (!v.obj(pack.lessons, 'lessons')) return;
  const declared = new Set(lessonIds);

  for (const key of Object.keys(pack.lessons)) {
    if (!declared.has(key)) v.warn('lesson.orphan', `lessons.${key}`, 'این درس در manifest تعریف نشده و نمایش داده نمی‌شود');
  }

  for (const id of lessonIds) {
    if (v.issues.length > MAX_ISSUES) { v.error('pack.tooManyIssues', 'pack', 'تعداد خطاها زیاد است؛ بررسی ادامه نیافت'); return; }
    const p = `lessons.${id}`;
    if (!has(pack.lessons, id)) { v.error('lesson.missing', p, 'محتوای این درس در pack نیست'); continue; }
    const lesson = pack.lessons[id];
    if (!v.obj(lesson, p)) continue;
    if (!v.arr(lesson.blocks, `${p}.blocks`, { min: 1, max: LIMITS.blocksPerLesson })) continue;

    const blockIds = new Set();
    lesson.blocks.forEach((block, i) => {
      if (v.issues.length > MAX_ISSUES) return;
      const bp = `${p}.blocks[${i}]`;
      registry.validateBlock(block, bp, v);
      if (block && typeof block.id === 'string') {
        if (blockIds.has(block.id)) v.error('block.duplicateId', `${bp}.id`, 'شناسه بلوک در این درس تکراری است');
        blockIds.add(block.id);
      }
    });
  }
}

// خروجی: { ok, errors, warnings, issues }
export function validatePack(pack, { registry = defaultRegistry } = {}) {
  const v = createValidator();
  const done = () => ({
    ok: !v.hasErrors(),
    errors: v.issues.filter((i) => i.level === 'error'),
    warnings: v.issues.filter((i) => i.level === 'warn'),
    issues: v.issues,
  });

  if (!v.obj(pack, 'pack')) return done();

  if (!Number.isInteger(pack.schemaVersion)) {
    v.error('schema.version', 'schemaVersion', 'schemaVersion الزامی است و باید عدد صحیح باشد');
    return done();
  }
  if (!SUPPORTED_SCHEMA_VERSIONS.includes(pack.schemaVersion)) {
    const newer = pack.schemaVersion > Math.max(...SUPPORTED_SCHEMA_VERSIONS);
    v.error('schema.unsupported', 'schemaVersion', newer
      ? 'این بسته برای نسخه جدیدتری از برنامه ساخته شده است؛ برنامه را به‌روزرسانی کنید'
      : 'نسخه schema این بسته قدیمی است و دیگر پشتیبانی نمی‌شود');
    return done();
  }

  for (const key of Object.keys(pack)) {
    if (!TOP_KEYS.has(key)) v.warn('pack.unknownKey', key, 'کلید ناشناخته؛ نادیده گرفته می‌شود');
  }

  validateAssets(pack, v);
  const lessonIds = validateManifest(pack, v);
  if (lessonIds) validateLessons(pack, lessonIds, v, registry);
  return done();
}
