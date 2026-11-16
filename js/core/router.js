// Hash router (سازگار با GitHub Pages و PWA؛ بدون نیاز به تنظیم سرور)
// آدرس‌ها: #/  #/library  #/settings  و در آینده #/course/:id

function safeDecode(segment) {
  try { return decodeURIComponent(segment); } catch { return segment; }
}

// '#/library?x=1' → { path: '/library', query: URLSearchParams }
export function parseHash(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  const qIndex = raw.indexOf('?');
  const pathPart = qIndex === -1 ? raw : raw.slice(0, qIndex);
  const queryPart = qIndex === -1 ? '' : raw.slice(qIndex + 1);
  const segments = pathPart.split('/').filter(Boolean);
  return { path: '/' + segments.join('/'), query: new URLSearchParams(queryPart) };
}

// اولین route منطبق را برمی‌گرداند: { route, params } یا null
export function matchRoute(routes, path) {
  const segs = path.split('/').filter(Boolean).map(safeDecode);
  for (const route of routes) {
    const parts = route.path.split('/').filter(Boolean);
    if (parts.length !== segs.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].startsWith(':')) params[parts[i].slice(1)] = segs[i];
      else if (parts[i] !== segs[i]) { ok = false; break; }
    }
    if (ok) return { route, params };
  }
  return null;
}

export function browserAdapter(win = window) {
  return {
    getHash: () => win.location.hash,
    setHash(hash, replace = false, silent = false) {
      if (replace) {
        win.history.replaceState(null, '', win.location.pathname + win.location.search + hash);
        if (!silent) win.dispatchEvent(new win.HashChangeEvent('hashchange'));
      } else {
        win.location.hash = hash;
      }
    },
    listen(fn) {
      win.addEventListener('hashchange', fn);
      return () => win.removeEventListener('hashchange', fn);
    },
  };
}

// routes: [{ name, path, ... }] ؛ notFound: route جایگزین وقتی چیزی منطبق نشد
export function createRouter({ routes, notFound, adapter = browserAdapter() }) {
  const listeners = new Set();
  let current = null;
  let stop = null;

  function resolve() {
    const { path, query } = parseHash(adapter.getHash());
    const hit = matchRoute(routes, path);
    current = hit
      ? { name: hit.route.name, path, params: hit.params, query, route: hit.route, found: true }
      : { name: notFound.name, path, params: {}, query, route: notFound, found: false };
    for (const fn of [...listeners]) {
      try { fn(current); } catch (err) { console.error('[router] listener failed', err); }
    }
    return current;
  }

  function start() {
    if (stop) return current;
    stop = adapter.listen(resolve);
    return resolve();
  }

  function destroy() { if (stop) { stop(); stop = null; } listeners.clear(); }

  // silent: فقط آدرس را عوض می‌کند، بدون رندر دوباره صفحه (مثلاً ذخیره عبارت جست‌وجو در URL)
  function navigate(path, { replace = false, silent = false } = {}) {
    adapter.setHash('#' + (path.startsWith('/') ? path : '/' + path), replace || silent, silent);
  }

  function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  const href = (path) => '#' + (path.startsWith('/') ? path : '/' + path);

  return { start, destroy, navigate, onChange, href, current: () => current };
}
