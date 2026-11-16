// نشان‌ها و یادداشت‌ها. نشان می‌تواند «درس» باشد یا «یک بلوک دارای id».
// عنوان درس/دوره هنگام ذخیره کپی می‌شود تا صفحه «ذخیره‌ها» برای نمایش مجبور به خواندن pack نباشد.
import { reqP, txDone } from './idb.js';
import { cleanText } from '../render/sanitize.js';

export const NOTE_MAX = 5000;

export class NoteError extends Error {
  constructor(code) { super(code); this.name = 'NoteError'; this.code = code; } // 'empty' | 'tooLong' | 'notFound'
}

export const bookmarkKey = (courseId, lessonId, blockId = null) =>
  (blockId ? `${courseId}:${lessonId}#${blockId}` : `${courseId}:${lessonId}`);

function uid() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function cleanNote(text) {
  const value = cleanText(typeof text === 'string' ? text : '').trim();
  if (!value) throw new NoteError('empty');
  if (value.length > NOTE_MAX) throw new NoteError('tooLong');
  return value;
}

export function createNotesService(db) {
  return {
    /* ───── نشان‌ها ───── */

    // اگر نشان هست برمی‌دارد، وگرنه می‌سازد. خروجی: { on, record }
    async toggleBookmark({ courseId, lessonId, blockId = null, lessonTitle = '', courseTitle = '', label = '' }) {
      const id = bookmarkKey(courseId, lessonId, blockId);
      const tx = db.transaction('bookmarks', 'readwrite');
      const store = tx.objectStore('bookmarks');
      const existing = await reqP(store.get(id));
      let record = null;
      if (existing) store.delete(id);
      else {
        record = { id, courseId, lessonId, blockId, lessonTitle, courseTitle, label, createdAt: Date.now() };
        store.put(record);
      }
      await txDone(tx);
      return { on: !existing, record };
    },

    async bookmarksOfLesson(courseId, lessonId) {
      const tx = db.transaction('bookmarks', 'readonly');
      const rows = await reqP(tx.objectStore('bookmarks').index('courseId').getAll(courseId));
      return rows.filter((r) => r.lessonId === lessonId);
    },

    async listBookmarks() {
      const tx = db.transaction('bookmarks', 'readonly');
      const rows = await reqP(tx.objectStore('bookmarks').getAll());
      return rows.sort((a, b) => b.createdAt - a.createdAt);
    },

    async removeBookmark(id) {
      const tx = db.transaction('bookmarks', 'readwrite');
      tx.objectStore('bookmarks').delete(id);
      await txDone(tx);
    },

    /* ───── یادداشت‌ها ───── */

    async addNote({ courseId, lessonId, text, lessonTitle = '', courseTitle = '' }) {
      const value = cleanNote(text);
      const now = Date.now();
      const record = { id: `${courseId}:${lessonId}:${uid()}`, courseId, lessonId, lessonTitle, courseTitle, text: value, createdAt: now, updatedAt: now };
      const tx = db.transaction('notes', 'readwrite');
      tx.objectStore('notes').put(record);
      await txDone(tx);
      return record;
    },

    async updateNote(id, text) {
      const value = cleanNote(text);
      const tx = db.transaction('notes', 'readwrite');
      const store = tx.objectStore('notes');
      const prev = await reqP(store.get(id));
      if (!prev) { tx.abort(); await txDone(tx).catch(() => {}); throw new NoteError('notFound'); }
      const record = { ...prev, text: value, updatedAt: Date.now() };
      store.put(record);
      await txDone(tx);
      return record;
    },

    async removeNote(id) {
      const tx = db.transaction('notes', 'readwrite');
      tx.objectStore('notes').delete(id);
      await txDone(tx);
    },

    // جدیدترین اول
    async notesOfLesson(courseId, lessonId) {
      const tx = db.transaction('notes', 'readonly');
      const rows = await reqP(tx.objectStore('notes').index('lesson').getAll(IDBKeyRange.only([courseId, lessonId])));
      return rows.sort((a, b) => b.createdAt - a.createdAt);
    },

    async listNotes() {
      const tx = db.transaction('notes', 'readonly');
      const rows = await reqP(tx.objectStore('notes').getAll());
      return rows.sort((a, b) => b.updatedAt - a.updatedAt);
    },
  };
}
