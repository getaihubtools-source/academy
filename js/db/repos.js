// Repository ها: تنها نقطه دسترسی بقیه برنامه به داده‌ها
import { dbGet, dbPut, dbDelete, dbGetAll, dbGetAllByIndex, dbCount, dbClear } from './idb.js';
import { STORE_NAMES } from './schema.js';
import { isValidSetting, normalizeSettings } from '../core/prefs.js';

export function createRepo(db, store) {
  return {
    get: (key) => dbGet(db, store, key),
    put: (value) => dbPut(db, store, value),
    delete: (key) => dbDelete(db, store, key),
    all: () => dbGetAll(db, store),
    byIndex: (index, query) => dbGetAllByIndex(db, store, index, query),
    count: () => dbCount(db, store),
    clear: () => dbClear(db, store),
  };
}

// تنظیمات: رکوردهای { key, value, updatedAt }
function createSettingsRepo(db) {
  const repo = createRepo(db, 'settings');
  return {
    async all() {
      const rows = await repo.all();
      return normalizeSettings(Object.fromEntries(rows.map((r) => [r.key, r.value])));
    },
    async set(key, value) {
      if (!isValidSetting(key, value)) throw new Error(`Invalid setting: ${key}=${String(value)}`);
      await repo.put({ key, value, updatedAt: Date.now() });
    },
  };
}

export function createRepos(db, appVersion = '') {
  const repos = Object.fromEntries(STORE_NAMES.map((name) => [name, createRepo(db, name)]));
  repos.db = db; // برای سرویس‌هایی که تراکنش چندstore ای لازم دارند (js/db/courses.js)
  repos.settings = createSettingsRepo(db);

  // آمار برای صفحه تنظیمات و تست‌ها
  repos.info = async () => {
    const counts = {};
    for (const name of STORE_NAMES) counts[name] = await dbCount(db, name);
    return { name: db.name, version: db.version, counts };
  };

  // اطلاعات سیستمی که بعداً برای بکاپ/مهاجرت لازم می‌شود
  repos.ensureMeta = async () => {
    if (!(await repos.meta.get('createdAt'))) await repos.meta.put({ key: 'createdAt', value: Date.now() });
    await repos.meta.put({ key: 'lastOpenedVersion', value: appVersion });
  };

  return repos;
}
