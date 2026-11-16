// ساختار IndexedDB با migration نسخه‌دار.
// قانون: migration قدیمی هرگز ویرایش نمی‌شود؛ تغییر ساختار = افزودن migration جدید به انتهای آرایه.
export const DB_NAME = 'aihub-academy';

// هر migration: (db, tx, oldVersion) → ساختار را از نسخه i به i+1 می‌برد
export const migrations = [
  // v1 — ساختار پایه (store ها از همین ابتدا تثبیت شده‌اند؛ مراحل بعد فقط از آن‌ها استفاده می‌کنند)
  (db) => {
    db.createObjectStore('settings', { keyPath: 'key' });
    db.createObjectStore('meta', { keyPath: 'key' });
    db.createObjectStore('courses', { keyPath: 'id' });
    db.createObjectStore('licenses', { keyPath: 'courseId' });
    db.createObjectStore('searchIndex', { keyPath: 'courseId' });

    const progress = db.createObjectStore('progress', { keyPath: 'id' }); // id: courseId:lessonId
    progress.createIndex('courseId', 'courseId');

    const notes = db.createObjectStore('notes', { keyPath: 'id' });
    notes.createIndex('courseId', 'courseId');
    notes.createIndex('lesson', ['courseId', 'lessonId']);

    const bookmarks = db.createObjectStore('bookmarks', { keyPath: 'id' });
    bookmarks.createIndex('courseId', 'courseId');

    const quizResults = db.createObjectStore('quizResults', { keyPath: 'id' });
    quizResults.createIndex('courseId', 'courseId');
  },

  // v2 (M3) — محتوای کامل pack جدا از متادیتا ذخیره می‌شود تا فهرست کتابخانه
  // مجبور نباشد چند ده مگابایت تصویر را برای نمایش کارت‌ها بخواند.
  (db) => {
    db.createObjectStore('packs', { keyPath: 'id' }); // { id, pack }
  },
];

export const DB_VERSION = migrations.length;

export const STORE_NAMES = [
  'courses', 'packs', 'licenses', 'progress', 'notes', 'bookmarks', 'quizResults', 'searchIndex', 'settings', 'meta',
];

// storeهایی که با حذف یک دوره، رکوردهای آن (با ایندکس courseId) هم پاک می‌شوند
export const COURSE_SCOPED_STORES = ['progress', 'notes', 'bookmarks', 'quizResults'];
