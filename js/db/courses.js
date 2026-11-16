// سرویس دوره‌ها و پیشرفت: نصب/به‌روزرسانی/حذف pack و ثبت پیشرفت درس‌ها.
// عملیات چندمرحله‌ای (نصب، حذف) در «یک تراکنش» انجام می‌شود تا نیمه‌کاره نماند.
import { reqP, txDone } from './idb.js';
import { COURSE_SCOPED_STORES } from './schema.js';
import { collectAssessments } from '../features/assessments.js';
import { lessonIndex } from '../packs/loader.js';
import { buildSearchIndex, INDEX_VERSION } from '../features/search.js';

const semverParts = (v) => String(v).split('.').map((n) => Number.parseInt(n, 10) || 0);

// -1 | 0 | 1
export function compareVersions(a, b) {
  const x = semverParts(a);
  const y = semverParts(b);
  for (let i = 0; i < 3; i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0) ? -1 : 1;
  }
  return 0;
}

export class DowngradeError extends Error {
  constructor(installed, incoming) {
    super('downgrade');
    this.name = 'DowngradeError';
    this.installed = installed;
    this.incoming = incoming;
  }
}

function buildMeta(pack, previous, sizeChars) {
  const m = pack.manifest;
  const index = lessonIndex(pack);
  const now = Date.now();
  return {
    id: m.id,
    title: m.title,
    subtitle: m.subtitle || '',
    author: m.author || '',
    language: m.language,
    version: m.version,
    chapterCount: m.chapters.length,
    lessonIds: index.map((l) => l.lessonId),
    assessments: collectAssessments(pack), // برای نمایش خلاصه در داشبورد بدون بارگذاری کل pack
    lessonCount: index.length,
    totalMinutes: index.reduce((sum, l) => sum + (l.minutes || 0), 0),
    sizeChars,
    importedAt: previous ? previous.importedAt : now,
    updatedAt: now,
  };
}

function deleteByCourse(store, courseId) {
  return new Promise((resolve, reject) => {
    const req = store.index('courseId').openCursor(IDBKeyRange.only(courseId));
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) { resolve(); return; }
      cursor.delete();
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

export function createCourseService(db) {
  // pack های خوانده‌شده در حافظه (فقط آخرین مورد) تا قبلی/بعدی بین درس‌ها دوباره از DB نخواند
  let cached = null;
  const forget = (id) => { if (cached && cached.id === id) cached = null; };

  const svc = {
    // pack باید قبلاً با parsePack/validatePack تأیید شده باشد.
    // خروجی: { status: 'installed' | 'updated', meta }؛ نسخه قدیمی‌تر → DowngradeError
    async install(pack, { sizeChars = 0 } = {}) {
      const id = pack.manifest.id;
      const searchIndex = buildSearchIndex(pack); // قبل از باز کردن تراکنش (کار CPU، نه IDB)
      const tx = db.transaction(['courses', 'packs', 'searchIndex'], 'readwrite');
      const courses = tx.objectStore('courses');
      const previous = await reqP(courses.get(id));

      if (previous && compareVersions(pack.manifest.version, previous.version) < 0) {
        tx.abort();
        await txDone(tx).catch(() => {});
        throw new DowngradeError(previous.version, pack.manifest.version);
      }

      const meta = buildMeta(pack, previous, sizeChars);
      courses.put(meta);
      tx.objectStore('packs').put({ id, pack });
      tx.objectStore('searchIndex').put(searchIndex);
      await txDone(tx);
      forget(id);
      return { status: previous ? 'updated' : 'installed', meta };
    },

    // ایندکس جست‌وجوی یک دوره. اگر نبود/قدیمی بود (نسخه قواعد یا نسخه pack) از روی pack دوباره ساخته می‌شود.
    async getSearchIndex(courseId) {
      const meta = await svc.getMeta(courseId);
      if (!meta) return null;
      const rtx = db.transaction('searchIndex', 'readonly');
      const stored = await reqP(rtx.objectStore('searchIndex').get(courseId));
      if (stored && stored.indexVersion === INDEX_VERSION && stored.packVersion === meta.version) return stored;

      const pack = await svc.getPack(courseId);
      if (!pack) return null;
      const rebuilt = buildSearchIndex(pack);
      const wtx = db.transaction('searchIndex', 'readwrite');
      wtx.objectStore('searchIndex').put(rebuilt);
      await txDone(wtx);
      return rebuilt;
    },

    async listCourses() {
      const tx = db.transaction('courses', 'readonly');
      const all = await reqP(tx.objectStore('courses').getAll());
      return all.sort((a, b) => b.updatedAt - a.updatedAt);
    },

    async getMeta(id) {
      const tx = db.transaction('courses', 'readonly');
      return (await reqP(tx.objectStore('courses').get(id))) || null;
    },

    async getPack(id) {
      if (cached && cached.id === id) return cached.pack;
      const tx = db.transaction('packs', 'readonly');
      const row = await reqP(tx.objectStore('packs').get(id));
      if (!row) return null;
      cached = { id, pack: row.pack };
      return row.pack;
    },

    // دوره + همه رکوردهای وابسته (پیشرفت، یادداشت، نشان، آزمون)؛ لایسنس عمداً حفظ می‌شود
    async remove(id) {
      const stores = ['courses', 'packs', ...COURSE_SCOPED_STORES, 'searchIndex'];
      const tx = db.transaction(stores, 'readwrite');
      tx.objectStore('courses').delete(id);
      tx.objectStore('packs').delete(id);
      tx.objectStore('searchIndex').delete(id);
      for (const name of COURSE_SCOPED_STORES) deleteByCourse(tx.objectStore(name), id);
      await txDone(tx);
      forget(id);
    },

    /* ───── پیشرفت ───── */

    // Map<lessonId, record> برای یک دوره
    async progressOf(courseId) {
      const tx = db.transaction('progress', 'readonly');
      const rows = await reqP(tx.objectStore('progress').index('courseId').getAll(courseId));
      return new Map(rows.map((r) => [r.lessonId, r]));
    },

    // Map<courseId, Map<lessonId, record>>
    async progressAll() {
      const tx = db.transaction('progress', 'readonly');
      const rows = await reqP(tx.objectStore('progress').getAll());
      const out = new Map();
      for (const r of rows) {
        if (!out.has(r.courseId)) out.set(r.courseId, new Map());
        out.get(r.courseId).set(r.lessonId, r);
      }
      return out;
    },

    // باز شدن درس: اگر رکوردی نیست «started» می‌شود؛ «done» هرگز پایین‌تر نمی‌آید. updatedAt برای «ادامه» به‌روز می‌شود.
    async touchLesson(courseId, lessonId, lessonTitle = '') {
      const id = `${courseId}:${lessonId}`;
      const tx = db.transaction('progress', 'readwrite');
      const store = tx.objectStore('progress');
      const prev = await reqP(store.get(id));
      const rec = { ...(prev || { id, courseId, lessonId, status: 'started' }), lessonTitle, updatedAt: Date.now() };
      store.put(rec);
      await txDone(tx);
      return rec;
    },

    async setDone(courseId, lessonId, done, lessonTitle = '') {
      const id = `${courseId}:${lessonId}`;
      const tx = db.transaction('progress', 'readwrite');
      const store = tx.objectStore('progress');
      const prev = await reqP(store.get(id));
      const now = Date.now();
      const rec = {
        ...(prev || { id, courseId, lessonId }),
        lessonTitle: lessonTitle || (prev && prev.lessonTitle) || '',
        status: done ? 'done' : 'started',
        updatedAt: now,
        completedAt: done ? now : null,
      };
      store.put(rec);
      await txDone(tx);
      return rec;
    },
  };
  return svc;
}
