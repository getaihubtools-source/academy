// Event emitter کوچک (بدون وابستگی)
export function createEmitter() {
  const map = new Map();

  function off(type, fn) {
    const set = map.get(type);
    if (!set) return;
    set.delete(fn);
    if (set.size === 0) map.delete(type);
  }

  function on(type, fn) {
    let set = map.get(type);
    if (!set) { set = new Set(); map.set(type, set); }
    set.add(fn);
    return () => off(type, fn);
  }

  function once(type, fn) {
    const unsubscribe = on(type, (...args) => { unsubscribe(); fn(...args); });
    return unsubscribe;
  }

  // خطای یک listener جلوی بقیه را نمی‌گیرد. تعداد listenerهای اجراشده را برمی‌گرداند.
  function emit(type, ...args) {
    const set = map.get(type);
    if (!set) return 0;
    let count = 0;
    for (const fn of [...set]) {
      try { fn(...args); } catch (err) { console.error(`[events] handler failed for "${type}"`, err); }
      count++;
    }
    return count;
  }

  function clear() { map.clear(); }

  return { on, off, once, emit, clear };
}
