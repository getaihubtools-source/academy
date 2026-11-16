// لایه نازک Promise روی IndexedDB (بدون کتابخانه)

export function reqP(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });
}

// migrations: آرایه‌ای از توابع؛ نسخه DB = تعداد آن‌ها
export function openDb({ name, migrations, factory = globalThis.indexedDB, onBlocked } = {}) {
  return new Promise((resolve, reject) => {
    if (!factory) { reject(new Error('IndexedDB is not available')); return; }
    let req;
    try { req = factory.open(name, migrations.length); } catch (err) { reject(err); return; }

    req.onupgradeneeded = (event) => {
      const db = req.result;
      const tx = req.transaction;
      for (let v = event.oldVersion; v < migrations.length; v++) migrations[v](db, tx, v);
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close(); // تب دیگر در حال ارتقا؛ مانع آن نشو
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => { if (onBlocked) onBlocked(); };
  });
}

export async function dbGet(db, store, key) {
  const tx = db.transaction(store, 'readonly');
  return reqP(tx.objectStore(store).get(key));
}

export async function dbPut(db, store, value) {
  const tx = db.transaction(store, 'readwrite');
  const req = tx.objectStore(store).put(value);
  await txDone(tx);
  return req.result;
}

export async function dbDelete(db, store, key) {
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  await txDone(tx);
}

export async function dbGetAll(db, store) {
  const tx = db.transaction(store, 'readonly');
  return reqP(tx.objectStore(store).getAll());
}

export async function dbGetAllByIndex(db, store, index, query) {
  const tx = db.transaction(store, 'readonly');
  return reqP(tx.objectStore(store).index(index).getAll(query));
}

export async function dbCount(db, store) {
  const tx = db.transaction(store, 'readonly');
  return reqP(tx.objectStore(store).count());
}

export async function dbClear(db, store) {
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).clear();
  await txDone(tx);
}
