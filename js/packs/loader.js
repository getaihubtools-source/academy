// بارگذاری Pack: متن JSON → اعتبارسنجی → (بعداً در M6: رمزگشایی قبل از این مرحله)
import { LIMITS } from '../render/check.js';
import { validatePack } from './schema.js';

function failure(code, message) {
  const issue = { level: 'error', code, path: '', message };
  return { ok: false, pack: null, errors: [issue], warnings: [], issues: [issue] };
}

// خروجی: { ok, pack|null, errors, warnings, issues }
export function parsePack(text, { registry } = {}) {
  if (typeof text !== 'string') return failure('pack.type', 'ورودی باید متن JSON باشد');
  if (text.length > LIMITS.packChars) return failure('pack.tooLarge', 'حجم فایل pack بیش از حد مجاز است');

  let data;
  try {
    data = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch {
    return failure('pack.json', 'فایل JSON معتبر نیست');
  }

  const result = registry ? validatePack(data, { registry }) : validatePack(data);
  return { ...result, pack: result.ok ? data : null };
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// تصاویر فقط هنگام نیاز به Blob URL تبدیل می‌شوند؛ revokeAll() هنگام خروج از دوره صدا زده شود.
export function createAssetStore(pack, { urlApi = globalThis.URL } = {}) {
  const cache = new Map();
  return {
    url(id) {
      if (cache.has(id)) return cache.get(id);
      const assets = pack && pack.assets;
      if (!assets || !Object.prototype.hasOwnProperty.call(assets, id)) return null;
      const { mime, data } = assets[id];
      const url = urlApi.createObjectURL(new Blob([base64ToBytes(data)], { type: mime }));
      cache.set(id, url);
      return url;
    },
    revokeAll() {
      for (const url of cache.values()) urlApi.revokeObjectURL(url);
      cache.clear();
    },
  };
}

// فهرست مسطح درس‌ها به ترتیب (برای ناوبری/پیشرفت در M3)
export function lessonIndex(pack) {
  const out = [];
  for (const ch of pack.manifest.chapters) {
    for (const ls of ch.lessons) {
      out.push({ chapterId: ch.id, chapterTitle: ch.title, lessonId: ls.id, title: ls.title, minutes: ls.minutes || null, free: ls.free === true });
    }
  }
  return out;
}
