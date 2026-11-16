// Store مینیمال: state تغییرناپذیر (shallow) + subscribe با فیلتر کلید
export function createStore(initial = {}) {
  let state = Object.freeze({ ...initial });
  const subscribers = new Set();

  const get = () => state;

  // patch می‌تواند object یا تابع (state) => object باشد.
  // اگر هیچ کلیدی تغییر نکند false برمی‌گردد و کسی خبردار نمی‌شود.
  function set(patch) {
    const partial = typeof patch === 'function' ? patch(state) : patch;
    const next = { ...state, ...partial };
    const changed = Object.keys(next).filter((k) => !Object.is(next[k], state[k]));
    if (changed.length === 0) return false;

    const prev = state;
    state = Object.freeze(next);
    for (const sub of [...subscribers]) {
      if (sub.keys && !sub.keys.some((k) => changed.includes(k))) continue;
      try { sub.fn(state, prev, changed); } catch (err) { console.error('[store] subscriber failed', err); }
    }
    return true;
  }

  // keys: آرایه‌ای از نام کلیدها؛ فقط با تغییر آن‌ها فراخوانی می‌شود.
  function subscribe(fn, keys = null) {
    const sub = { fn, keys };
    subscribers.add(sub);
    return () => subscribers.delete(sub);
  }

  return { get, set, subscribe };
}
