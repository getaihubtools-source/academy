/* ===== aihub-core.js ===== */
/* ==========================================================================
   AIhub Design System — aihub-core.js (v1.1)
   ابزارهای پایه + پوسته (سایدبار/drawer) + منو + تب + split + toast + تم/برند
   بدون وابستگی. سازگار با WebViewهای قدیمی (بدون ?. و ??).
   این فایل برای بقیه ماژول‌ها لازمه و باید اول لود بشه.
   ========================================================================== */
(function (w, d) {
  'use strict';
  var A = w.AIhub = w.AIhub || {};
  var root = d.documentElement;

  function $(s, r) { return (r || d).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || d).querySelectorAll(s)); }
  function store(k, v) {
    try {
      if (v === undefined) return w.localStorage.getItem(k);
      if (v === null) w.localStorage.removeItem(k); else w.localStorage.setItem(k, v);
    } catch (e) {}
    return null;
  }
  A.$ = $; A.$$ = $$; A.store = store;
  A.ready = function (fn) { if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', fn); else fn(); };

  /* ---------- زبان فارسی: ارقام و نرمال‌سازی برای جستجو ---------- */
  var FA = '۰۱۲۳۴۵۶۷۸۹';
  A.fa = function (n) { return String(n).replace(/\d/g, function (c) { return FA.charAt(c); }); };
  A.num = function (n, o) { try { return Number(n).toLocaleString('fa-IR', o); } catch (e) { return A.fa(n); } };
  A.norm = function (s) {
    return String(s == null ? '' : s)
      .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک')
      .replace(/[‌‍‎‏]/g, '')
      .replace(/[ً-ٰٟ]/g, '')
      .replace(/[۰-۹]/g, function (c) { return c.charCodeAt(0) - 0x06F0; })
      .replace(/[٠-٩]/g, function (c) { return c.charCodeAt(0) - 0x0660; })
      .toLowerCase().replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
  };
  var uid = 0;
  A.uid = function (p) { uid += 1; return (p || 'aihub') + '-' + uid; };

  /* ---------- تم و برند ---------- */
  A.theme = {
    get: function () {
      return root.getAttribute('data-theme') || (w.matchMedia && w.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    },
    set: function (t) {
      root.setAttribute('data-theme', t); store('aihub-theme', t);
      $$('[data-theme-toggle]').forEach(function (b) { b.setAttribute('aria-pressed', t === 'dark' ? 'true' : 'false'); });
    },
    toggle: function () { this.set(this.get() === 'dark' ? 'light' : 'dark'); }
  };
  A.brand = {
    get: function () { return root.getAttribute('data-brand') || 'firouzeh'; },
    set: function (n) {
      if (!n || n === 'firouzeh') { root.removeAttribute('data-brand'); store('aihub-brand', null); }
      else { root.setAttribute('data-brand', n); store('aihub-brand', n); }
      d.dispatchEvent(new CustomEvent('aihub:brand', { detail: { brand: A.brand.get() } }));
    }
  };
  (function boot() {
    var t = store('aihub-theme'), b = store('aihub-brand');
    if (t === 'dark' || t === 'light') root.setAttribute('data-theme', t);
    if (b) root.setAttribute('data-brand', b);
  })();

  /* ---------- Toast (با امکان «بازگردانی») ---------- */
  A.toast = function (msg, o) {
    o = o || {};
    var host = $('#toasts');
    if (!host) { host = d.createElement('div'); host.id = 'toasts'; host.className = 'toasts'; d.body.appendChild(host); }
    var t = d.createElement('div');
    t.className = 'toast' + (o.kind ? ' toast--' + o.kind : '');
    t.setAttribute('role', o.kind === 'error' ? 'alert' : 'status');
    var s = d.createElement('span'); s.className = 'toast__msg'; s.textContent = msg; t.appendChild(s);
    var timer;
    function remove() { clearTimeout(timer); if (t.parentNode) t.parentNode.removeChild(t); }
    if (o.action) {
      var b = d.createElement('button'); b.type = 'button'; b.className = 'toast__action'; b.textContent = o.action.label;
      b.onclick = function () { try { if (o.action.onClick) o.action.onClick(); } finally { remove(); } };
      t.appendChild(b);
    }
    host.appendChild(t);
    timer = setTimeout(remove, o.duration || (o.action ? 6500 : 3200));
    return { close: remove };
  };

  /* ---------- Sheet / Dialog (پایین‌کشو در موبایل، مودال در دسکتاپ) ---------- */
  A.sheet = function (html, o) {
    o = o || {};
    var prev = d.activeElement, ov = d.createElement('div'), sh = d.createElement('div');
    ov.className = 'overlay'; sh.className = 'sheet';
    sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-label', o.label || 'پنجره');
    sh.innerHTML = '<div class="sheet__grab"></div>' + html;
    ov.appendChild(sh); d.body.appendChild(ov);
    function close() {
      if (!ov.parentNode) return;
      ov.parentNode.removeChild(ov);
      if (prev && prev.focus) prev.focus();
      if (o.onClose) o.onClose();
    }
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) close(); });
    sh.addEventListener('click', function (e) { if (e.target.closest('[data-sheet-close]')) close(); });
    ov.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
      if (e.key !== 'Tab') return;
      var f = $$('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])', sh).filter(function (x) { return x.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && d.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && d.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    setTimeout(function () { var f = sh.querySelector('[autofocus],input,select,textarea,button'); if (f) f.focus(); }, 30);
    return { el: sh, close: close };
  };

  /* ---------- Shell: سایدبار / ریل / drawer ---------- */
  var drawerOpener = null;
  function app() { return $('.app'); }
  function syncSidebarToggle() {
    var a = app(); if (!a) return;
    var rail = a.getAttribute('data-sidebar') === 'rail';
    $$('[data-sidebar-toggle]').forEach(function (b) {
      b.setAttribute('aria-pressed', rail ? 'true' : 'false');
      b.setAttribute('aria-label', rail ? 'باز کردن منو' : 'جمع کردن منو');
    });
  }
  function openDrawer(opener) {
    var a = app(); if (!a) return;
    drawerOpener = opener || null;
    a.classList.add('is-drawer-open');
    $$('[data-drawer-open]').forEach(function (b) { b.setAttribute('aria-expanded', 'true'); });
    setTimeout(function () { var f = $('.sidebar .nav__item', a); if (f) f.focus(); }, 60);
  }
  function closeDrawer(restore) {
    var a = app(); if (!a || !a.classList.contains('is-drawer-open')) return;
    a.classList.remove('is-drawer-open');
    $$('[data-drawer-open]').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
    if (restore !== false && drawerOpener && drawerOpener.focus) drawerOpener.focus();
    drawerOpener = null;
  }
  A.shell = { openDrawer: openDrawer, closeDrawer: closeDrawer,
    setSidebar: function (mode) { var a = app(); if (!a) return; a.setAttribute('data-sidebar', mode); store('aihub-sidebar', mode); syncSidebarToggle(); },
    toggleSidebar: function () { var a = app(); if (!a) return; this.setSidebar(a.getAttribute('data-sidebar') === 'rail' ? 'expanded' : 'rail'); } };

  /* ---------- Menu (dropdown) ---------- */
  function menuFor(trigger) {
    var sel = trigger.getAttribute('data-menu');
    var m = sel && sel.charAt(0) === '#' ? d.getElementById(sel.slice(1)) : null;
    if (!m) { var n = trigger.nextElementSibling; if (n && n.classList.contains('menu')) m = n; }
    if (m && !m.id) m.id = A.uid('menu');
    return m;
  }
  function triggerFor(menu) { return $('[aria-controls="' + menu.id + '"]'); }
  function closeMenus(except, restoreFocus) {
    $$('.menu.is-open').forEach(function (m) {
      if (m === except) return;
      m.classList.remove('is-open');
      var t = triggerFor(m);
      if (t) { t.setAttribute('aria-expanded', 'false'); if (restoreFocus) t.focus(); }
    });
  }
  function placeMenu(m) {
    m.classList.remove('menu--flip-x', 'menu--up');
    var r = m.getBoundingClientRect(), vw = d.documentElement.clientWidth, vh = w.innerHeight;
    if (r.left < 8 || r.right > vw - 8) m.classList.add('menu--flip-x');
    if (r.bottom > vh - 8) {
      var t = triggerFor(m), tr = t ? t.getBoundingClientRect() : null;
      if (tr && tr.top - r.height - 6 > 8) m.classList.add('menu--up');
    }
  }
  function items(m) { return $$('[role="menuitem"],[role="menuitemradio"],[role="menuitemcheckbox"]', m).filter(function (i) { return !i.disabled && i.getAttribute('aria-disabled') !== 'true'; }); }
  function openMenu(trigger, focusFirst) {
    var m = menuFor(trigger); if (!m) return;
    closeMenus(m);
    trigger.setAttribute('aria-controls', m.id); trigger.setAttribute('aria-haspopup', 'menu'); trigger.setAttribute('aria-expanded', 'true');
    m.setAttribute('role', 'menu'); m.classList.add('is-open');
    placeMenu(m);
    if (focusFirst) { var it = items(m)[0]; if (it) it.focus(); }
  }
  A.menu = { open: openMenu, close: closeMenus };

  /* ---------- Tabs / Segmented ---------- */
  function selectTab(tab, focus) {
    var list = tab.closest('[role="tablist"]'); if (!list) return;
    $$('[role="tab"]', list).forEach(function (t) {
      var on = t === tab;
      t.setAttribute('aria-selected', on ? 'true' : 'false'); t.setAttribute('tabindex', on ? '0' : '-1');
      var pid = t.getAttribute('aria-controls'); var p = pid ? d.getElementById(pid) : null;
      if (p) p.hidden = !on;
    });
    if (focus) tab.focus();
    list.dispatchEvent(new CustomEvent('aihub:tab', { bubbles: true, detail: { tab: tab, value: tab.getAttribute('data-value') || tab.id } }));
  }
  function initTabs() {
    $$('[role="tablist"]').forEach(function (l) {
      var sel = $('[role="tab"][aria-selected="true"]', l) || $('[role="tab"]', l);
      if (sel) selectTab(sel, false);
    });
  }

  /* ---------- Delegated events ---------- */
  d.addEventListener('click', function (e) {
    var t = e.target;
    var el = t.closest ? t.closest('[data-theme-toggle]') : null;
    if (el) { A.theme.toggle(); return; }

    el = t.closest('[data-brand-set]');
    if (el) { A.brand.set(el.getAttribute('data-brand-set')); return; }

    el = t.closest('[data-sidebar-toggle]');
    if (el) { A.shell.toggleSidebar(); return; }

    el = t.closest('[data-drawer-open]');
    if (el) { openDrawer(el); return; }
    if (t.closest('[data-drawer-close]') || (t.classList && t.classList.contains('scrim'))) { closeDrawer(); return; }
    var a = app();
    if (a && a.classList.contains('is-drawer-open') && t.closest('.sidebar .nav__item')) closeDrawer(false);

    el = t.closest('[data-menu]');
    if (el) {
      var m = menuFor(el);
      if (m && m.classList.contains('is-open')) closeMenus(null, false); else openMenu(el, false);
      return;
    }
    var mi = t.closest('.menu__item');
    if (mi && !mi.hasAttribute('data-keep-open')) { var mm = mi.closest('.menu'); if (mm) closeMenus(null, true); }
    else if (!t.closest('.menu')) closeMenus(null, false);

    el = t.closest('[role="tab"]');
    if (el) selectTab(el, false);

    el = t.closest('[data-split-item]');
    if (el) {
      var sp = el.closest('.split');
      if (sp) {
        $$('[data-split-item]', sp).forEach(function (x) { x.removeAttribute('aria-current'); });
        el.setAttribute('aria-current', 'true');
        sp.classList.add('is-detail');
        sp.dispatchEvent(new CustomEvent('aihub:split-select', { bubbles: true, detail: { item: el } }));
        var det = $('.split__detail', sp);
        if (det && w.matchMedia && w.matchMedia('(max-width: 899.98px)').matches) { det.setAttribute('tabindex', '-1'); det.focus(); }
      }
      return;
    }
    el = t.closest('[data-split-back]');
    if (el) {
      var sp2 = el.closest('.split');
      if (sp2) { sp2.classList.remove('is-detail'); var cur = $('[data-split-item][aria-current]', sp2); if (cur) cur.focus(); }
    }
  });

  d.addEventListener('keydown', function (e) {
    var t = e.target;
    // منو
    var openM = $('.menu.is-open');
    if (openM) {
      var its = items(openM), i = its.indexOf(d.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); closeMenus(null, true); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); (its[(i + 1) % its.length] || its[0]).focus(); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); (its[(i - 1 + its.length) % its.length] || its[0]).focus(); return; }
      if (e.key === 'Home') { e.preventDefault(); if (its[0]) its[0].focus(); return; }
      if (e.key === 'End') { e.preventDefault(); if (its.length) its[its.length - 1].focus(); return; }
      if (e.key === 'Tab') { closeMenus(null, false); }
    }
    if (t.closest && t.closest('[data-menu]') && (e.key === 'ArrowDown')) { e.preventDefault(); openMenu(t.closest('[data-menu]'), true); return; }
    // drawer
    if (e.key === 'Escape') { var a = app(); if (a && a.classList.contains('is-drawer-open')) { closeDrawer(); return; } }
    // tablist
    var tab = t.closest ? t.closest('[role="tab"]') : null;
    if (tab) {
      var list = tab.closest('[role="tablist"]'), tabs = $$('[role="tab"]', list), idx = tabs.indexOf(tab);
      var vertical = list.getAttribute('aria-orientation') === 'vertical';
      var rtl = w.getComputedStyle(list).direction === 'rtl';
      var next = vertical ? 'ArrowDown' : (rtl ? 'ArrowLeft' : 'ArrowRight'), prev = vertical ? 'ArrowUp' : (rtl ? 'ArrowRight' : 'ArrowLeft');
      var to = null;
      if (e.key === next) to = tabs[(idx + 1) % tabs.length];
      else if (e.key === prev) to = tabs[(idx - 1 + tabs.length) % tabs.length];
      else if (e.key === 'Home') to = tabs[0];
      else if (e.key === 'End') to = tabs[tabs.length - 1];
      if (to) { e.preventDefault(); selectTab(to, true); }
    }
  });

  w.addEventListener('resize', function () {
    if (w.innerWidth >= 640) closeDrawer(false);
    $$('.menu.is-open').forEach(placeMenu);
  });

  A.ready(function () {
    var a = app();
    if (a) {
      var saved = store('aihub-sidebar');
      if (saved === 'rail' || saved === 'expanded') a.setAttribute('data-sidebar', saved);
      else if (!a.hasAttribute('data-sidebar')) a.setAttribute('data-sidebar', 'expanded');
      syncSidebarToggle();
    }
    $$('[data-theme-toggle]').forEach(function (b) { b.setAttribute('aria-pressed', A.theme.get() === 'dark' ? 'true' : 'false'); });
    initTabs();
  });
})(window, document);

/* ===== aihub-cmdk.js ===== */
/* ==========================================================================
   AIhub Design System — aihub-cmdk.js (v1.1)
   Command palette: Ctrl/⌘+K یا «/» ؛ جستجوی فارسی‌محور (ی/ي، ک/ك، ارقام، نیم‌فاصله)
   نیازمند: aihub-core.js + overlay.css
   API:  AIhub.cmdk.register([{ id, title, group, icon, hint, keywords:[], run }])
         AIhub.cmdk.fromNav('.sidebar .nav__item', 'صفحه‌ها')   ← از لینک‌های منو
         AIhub.cmdk.open() / close()
   ========================================================================== */
(function (w, d) {
  'use strict';
  var A = w.AIhub = w.AIhub || {};
  var norm = A.norm;
  var reg = [], root, input, list, shown = [], active = 0, isOpen = false, opener = null;

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function icon(n) { return n ? '<svg class="ico" aria-hidden="true"><use href="#' + esc(n) + '"/></svg>' : '<span class="ico"></span>'; }

  function build() {
    if (root) return;
    root = d.createElement('div'); root.className = 'cmdk';
    root.innerHTML =
      '<div class="cmdk__panel" role="dialog" aria-modal="true" aria-label="جستجو و دستورها">' +
      '<div class="cmdk__input-row"><svg class="ico" aria-hidden="true"><use href="#i-search"/></svg>' +
      '<input class="cmdk__input" type="text" role="combobox" aria-expanded="true" aria-controls="cmdk-list" aria-autocomplete="list" aria-label="جستجو" placeholder="جستجوی صفحه یا دستور…" autocomplete="off" spellcheck="false">' +
      '<span class="kbd">Esc</span></div>' +
      '<div class="cmdk__list" id="cmdk-list" role="listbox" aria-label="نتایج"></div>' +
      '<div class="cmdk__foot"><span><span class="kbd">↑</span><span class="kbd">↓</span>حرکت</span><span><span class="kbd">Enter</span>انتخاب</span><span><span class="kbd">Esc</span>بستن</span></div></div>';
    d.body.appendChild(root);
    input = root.querySelector('.cmdk__input'); list = root.querySelector('.cmdk__list');
    root.addEventListener('mousedown', function (e) { if (e.target === root) close(); });
    input.addEventListener('input', function () { active = 0; render(); });
    input.addEventListener('keydown', onKey);
    list.addEventListener('mousemove', function (e) {
      var it = e.target.closest('.cmdk__item'); if (!it) return;
      var i = +it.getAttribute('data-i'); if (i !== active) { active = i; mark(false); }
    });
    list.addEventListener('click', function (e) { var it = e.target.closest('.cmdk__item'); if (it) choose(+it.getAttribute('data-i')); });
  }

  function score(it, toks) {
    var title = norm(it.title), hay = norm([it.title, it.group || '', (it.keywords || []).join(' ')].join(' ')), s = 0;
    for (var i = 0; i < toks.length; i++) {
      var p = hay.indexOf(toks[i]); if (p < 0) return 0;
      var tp = title.indexOf(toks[i]);
      s += tp === 0 ? 4 : (tp > 0 ? 3 : 1);
    }
    return s;
  }

  function render() {
    var q = norm(input.value), toks = q ? q.split(' ') : [], res = [];
    reg.forEach(function (it, i) { var s = toks.length ? score(it, toks) : 1; if (s > 0) res.push({ it: it, s: s, i: i }); });
    if (toks.length) res.sort(function (a, b) { return b.s - a.s || a.i - b.i; });
    shown = res.slice(0, 40).map(function (r) { return r.it; });
    if (!shown.length) { list.innerHTML = '<p class="cmdk__empty">نتیجه‌ای پیدا نشد. عبارت دیگری را امتحان کن.</p>'; input.removeAttribute('aria-activedescendant'); return; }
    var html = '', lastG = null;
    shown.forEach(function (it, i) {
      var g = toks.length ? '' : (it.group || '');
      if (!toks.length && g !== lastG) { html += '<div class="cmdk__group" role="presentation">' + esc(g) + '</div>'; lastG = g; }
      html += '<div class="cmdk__item" role="option" id="cmdk-o-' + i + '" data-i="' + i + '" aria-selected="false">' + icon(it.icon) +
        '<span>' + esc(it.title) + '</span>' + (it.hint ? '<span class="cmdk__item__hint">' + esc(it.hint) + '</span>' : '') + '</div>';
    });
    list.innerHTML = html; mark(true);
  }
  function mark(scroll) {
    var items = list.querySelectorAll('.cmdk__item');
    for (var i = 0; i < items.length; i++) items[i].setAttribute('aria-selected', i === active ? 'true' : 'false');
    if (items[active]) { input.setAttribute('aria-activedescendant', items[active].id); if (scroll !== false) items[active].scrollIntoView({ block: 'nearest' }); }
  }
  function choose(i) {
    var it = shown[i]; if (!it) return;
    close(false);
    setTimeout(function () { try { if (it.run) it.run(); } catch (e) { if (w.console) w.console.error(e); } }, 0);
  }
  function onKey(e) {
    var n = shown.length;
    if (e.key === 'ArrowDown') { e.preventDefault(); if (n) { active = (active + 1) % n; mark(); } }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (n) { active = (active - 1 + n) % n; mark(); } }
    else if (e.key === 'Enter') { e.preventDefault(); choose(active); }
    else if (e.key === 'Escape') { e.preventDefault(); close(true); }
    else if (e.key === 'Tab') { e.preventDefault(); }
  }

  function open() {
    build(); if (isOpen) return;
    opener = d.activeElement; isOpen = true;
    root.classList.add('is-open'); input.value = ''; active = 0; render();
    input.focus();
  }
  function close(restore) {
    if (!isOpen) return;
    isOpen = false; root.classList.remove('is-open');
    if (restore !== false && opener && opener.focus) opener.focus();
    opener = null;
  }

  function isTyping(t) { return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); }
  d.addEventListener('keydown', function (e) {
    if (isOpen && e.key === 'Escape') { e.preventDefault(); close(true); return; }
    if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyK' || String(e.key).toLowerCase() === 'k')) { e.preventDefault(); if (isOpen) close(true); else open(); return; }
    if (!isOpen && !isTyping(e.target) && !e.ctrlKey && !e.metaKey && !e.altKey && (e.code === 'Slash')) { e.preventDefault(); open(); }
  });
  d.addEventListener('click', function (e) { var t = e.target.closest ? e.target.closest('[data-cmdk-open]') : null; if (t) { e.preventDefault(); open(); } });

  A.cmdk = {
    register: function (a) { (Array.isArray(a) ? a : [a]).forEach(function (it) { reg.push(it); }); },
    clear: function () { reg = []; },
    open: open, close: function () { close(true); },
    fromNav: function (sel, group) {
      [].forEach.call(d.querySelectorAll(sel), function (a) {
        var lab = a.querySelector('.nav__label'), title = (lab ? lab.textContent : a.textContent).replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
        var use = a.querySelector('use'), ic = use ? (use.getAttribute('href') || '').replace('#', '') : '';
        reg.push({ title: title, group: group || 'صفحه‌ها', icon: ic, hint: 'برو به صفحه', run: function () { a.click(); } });
      });
    }
  };
})(window, document);

/* ===== aihub-charts.js ===== */
/* ==========================================================================
   AIhub Design System — aihub-charts.js (v1.1)
   نمودار SVG بدون وابستگی: bar، line، donut، spark. RTL-aware (زمان از راست به چپ)،
   تم‌پذیر (رنگ از CSS variable)، با جدول جایگزین برای صفحه‌خوان.
   نیازمند: aihub-core.js + data.css
   API:
     AIhub.charts.bar(el,   { labels, series:[{name,values}], height, scale, unit, label, valueLabels })
     AIhub.charts.line(el,  { labels, series:[{name,values}], height, scale, unit, label, area })
     AIhub.charts.donut(el, { items:[{label,value}], size, thickness, centerLabel, unit, label })
     AIhub.charts.spark(el, [values], { height, color:'c1'..'c5' })
   scale: تقسیم مقادیر برای نمایش (مثلاً 1e6) و unit: «میلیون تومان»
   ========================================================================== */
(function (w, d) {
  'use strict';
  var A = w.AIhub = w.AIhub || {};
  var NS = 'chart';

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function isRTL(el) { return w.getComputedStyle(el).direction === 'rtl'; }
  function nf(v, max) { return A.num(v, { maximumFractionDigits: max == null ? 1 : max }); }
  function r1(v) { return Math.round(v * 10) / 10; }
  function nice(max, n) {
    if (!(max > 0)) return { max: 1, step: 0.25, steps: 4 };
    var raw = max / n, p = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), f = raw / p;
    var nfv = f <= 1 ? 1 : (f <= 2 ? 2 : (f <= 2.5 ? 2.5 : (f <= 5 ? 5 : 10)));
    var step = nfv * p, steps = Math.ceil(max / step - 1e-9);
    return { max: step * steps, step: step, steps: steps };
  }

  /* ---------- mount / resize ---------- */
  var ro = null, fallbackBound = false;
  if (w.ResizeObserver) {
    ro = new w.ResizeObserver(function (es) {
      es.forEach(function (e) {
        var el = e.target, wd = Math.round(e.contentRect.width);
        if (el._lastW !== wd && el._draw) el._draw();
      });
    });
  }
  function mount(el, fn) {
    el.classList.add(NS); el._draw = function () { el._lastW = Math.round(el.clientWidth); fn(); };
    el._draw();
    if (ro) ro.observe(el);
    else if (!fallbackBound) {
      fallbackBound = true;
      w.addEventListener('resize', function () { [].forEach.call(d.querySelectorAll('.' + NS), function (e) { if (e._draw) e._draw(); }); });
    }
  }

  /* ---------- tooltip ---------- */
  function bindTip(el) {
    if (el._tipBound) return; el._tipBound = true;
    var last = null;
    function hide() { var t = el.querySelector('.chart__tip'); if (t) t.classList.remove('is-on'); if (last) { last.classList.remove('is-active'); last = null; } }
    el.addEventListener('pointermove', function (e) {
      var g = e.target.closest ? e.target.closest('.chart__cat') : null;
      if (!g || !el.contains(g)) { hide(); return; }
      if (g === last) return;
      if (last) last.classList.remove('is-active');
      last = g; g.classList.add('is-active');
      var tip = el.querySelector('.chart__tip'); if (!tip) return;
      tip.innerHTML = g.getAttribute('data-tip');
      var x = parseFloat(g.getAttribute('data-x')), y = parseFloat(g.getAttribute('data-y')), W = el._w || el.clientWidth;
      tip.classList.add('is-on');
      var tw = tip.offsetWidth, th = tip.offsetHeight;
      x = Math.max(tw / 2 + 2, Math.min(W - tw / 2 - 2, x));
      tip.style.left = x + 'px'; tip.style.top = Math.max(th + 6, y - 8) + 'px';
    });
    el.addEventListener('pointerleave', hide);
  }

  function srTable(c, labels, series) {
    var h = '<table class="sr-only"><caption>' + esc(c.label || 'نمودار') + (c.unit ? ' (' + esc(c.unit) + ')' : '') + '</caption><thead><tr><th></th>';
    series.forEach(function (s) { h += '<th>' + esc(s.name || '') + '</th>'; });
    h += '</tr></thead><tbody>';
    labels.forEach(function (l, i) {
      h += '<tr><th scope="row">' + esc(l) + '</th>';
      series.forEach(function (s) { h += '<td>' + nf((s.values[i] || 0) / (c.scale || 1), 2) + '</td>'; });
      h += '</tr>';
    });
    return h + '</tbody></table>';
  }
  function legend(series) {
    if (series.length < 2) return '';
    var h = '<div class="legend">';
    series.forEach(function (s, k) { h += '<span><i class="c' + (k + 1) + '"></i>' + esc(s.name || '') + '</span>'; });
    return h + '</div>';
  }
  function tipHtml(c, labels, series, i) {
    var h = '<b>' + esc(labels[i]) + '</b>';
    series.forEach(function (s, k) {
      h += '<div>' + (series.length > 1 ? '<i class="c' + (k + 1) + '"></i>' + esc(s.name || '') + ': ' : '') +
        nf((s.values[i] || 0) / (c.scale || 1), 2) + (c.unit ? ' ' + esc(c.unit) : '') + '</div>';
    });
    return h;
  }
  function barPath(x, y, w_, h, r) {
    r = Math.min(r, w_ / 2, h);
    return 'M' + r1(x) + ',' + r1(y + h) + 'L' + r1(x) + ',' + r1(y + r) + 'Q' + r1(x) + ',' + r1(y) + ' ' + r1(x + r) + ',' + r1(y) +
      'L' + r1(x + w_ - r) + ',' + r1(y) + 'Q' + r1(x + w_) + ',' + r1(y) + ' ' + r1(x + w_) + ',' + r1(y + r) + 'L' + r1(x + w_) + ',' + r1(y + h) + 'Z';
  }

  /* ---------- bar + line ---------- */
  function cartesian(el, c, type) {
    var W = Math.max(220, Math.round(el.clientWidth) || 320), H = c.height || 220, rtl = isRTL(el), scale = c.scale || 1;
    var S = c.series, labels = c.labels, n = labels.length, max = 0;
    S.forEach(function (s) { s.values.forEach(function (v) { if (v > max) max = v; }); });
    var nt = nice(max / scale, 4), maxV = nt.max * scale;
    var tickTxt = function (v) { return nf(v, 1); };
    var axisW = Math.max(28, tickTxt(nt.max).length * 7 + 12);
    var padT = (c.valueLabels && type === 'bar') ? 22 : 12, padB = 28;
    var x0 = rtl ? 8 : axisW, x1 = rtl ? W - axisW : W - 8, y0 = padT, y1 = H - padB, ph = y1 - y0, pw = x1 - x0;
    el._w = W;
    function Y(v) { return y1 - (v / maxV) * ph; }
    var band = pw / n;
    function cx(i) { return x0 + band * ((rtl ? n - 1 - i : i) + 0.5); }
    var g = '', t, i;
    for (t = 0; t <= nt.steps; t++) {
      var val = nt.step * t, yy = r1(Y(val * scale));
      g += '<line class="grid' + (t === 0 ? ' grid--zero' : '') + '" x1="' + x0 + '" x2="' + x1 + '" y1="' + yy + '" y2="' + yy + '"/>';
      g += '<text class="tick" x="' + (rtl ? x1 + 8 : x0 - 8) + '" y="' + (yy + 4) + '" text-anchor="' + (rtl ? 'start' : 'end') + '">' + tickTxt(val) + '</text>';
    }
    var every = Math.max(1, Math.ceil(52 / band));
    for (i = 0; i < n; i++) if (i % every === 0) g += '<text x="' + r1(cx(i)) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(labels[i]) + '</text>';

    var cats = '';
    if (type === 'bar') {
      var bw = Math.min(32, band * 0.62 / S.length), gap = Math.min(4, bw * 0.2), gw = S.length * bw + (S.length - 1) * gap;
      for (i = 0; i < n; i++) {
        var cxx = cx(i), top = y1, inner = '';
        S.forEach(function (s, k) {
          var v = s.values[i] || 0, h = (v / maxV) * ph, bx = cxx - gw / 2 + k * (bw + gap), by = y1 - h;
          if (by < top) top = by;
          if (h > 0.5) inner += '<path class="bar c' + (k + 1) + '" d="' + barPath(bx, by, bw, h, 6) + '"/>';
          if (c.valueLabels && S.length === 1 && band >= 30) inner += '<text class="vlabel" x="' + r1(cxx) + '" y="' + r1(by - 6) + '" text-anchor="middle">' + nf(v / scale, 1) + '</text>';
        });
        cats += '<g class="chart__cat" data-x="' + r1(cxx) + '" data-y="' + r1(top) + '" data-tip="' + esc(tipHtml(c, labels, S, i)) + '">' + inner + '<rect class="hit" x="' + r1(cxx - band / 2) + '" y="0" width="' + r1(band) + '" height="' + H + '"/></g>';
      }
    } else {
      S.forEach(function (s, k) {
        var dd = '';
        s.values.forEach(function (v, j) { dd += (j ? 'L' : 'M') + r1(cx(j)) + ',' + r1(Y(v)); });
        if (k === 0 && c.area !== false) cats += '<path class="area c1" d="' + dd + 'L' + r1(cx(n - 1)) + ',' + y1 + 'L' + r1(cx(0)) + ',' + y1 + 'Z"/>';
        cats += '<path class="line c' + (k + 1) + '" d="' + dd + '"/>';
      });
      for (i = 0; i < n; i++) {
        var px = cx(i), ytop = y1, dots = '';
        S.forEach(function (s, k) { var yv = Y(s.values[i] || 0); if (yv < ytop) ytop = yv; dots += '<circle class="dot c' + (k + 1) + '" cx="' + r1(px) + '" cy="' + r1(yv) + '" r="4.5"/>'; });
        cats += '<g class="chart__cat" data-x="' + r1(px) + '" data-y="' + r1(ytop) + '" data-tip="' + esc(tipHtml(c, labels, S, i)) + '"><line class="guide" x1="' + r1(px) + '" x2="' + r1(px) + '" y1="' + y0 + '" y2="' + y1 + '"/>' + dots +
          '<rect class="hit" x="' + r1(px - band / 2) + '" y="0" width="' + r1(band) + '" height="' + H + '"/></g>';
      }
      if (n <= 14) el.classList.add('chart--dots');
    }
    el.setAttribute('role', 'figure'); el.setAttribute('aria-label', c.label || 'نمودار');
    el.innerHTML = '<svg class="chart__svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true" focusable="false">' + g + cats + '</svg>' +
      '<div class="chart__tip" aria-hidden="true"></div>' + legend(S) + srTable(c, labels, S);
    bindTip(el);
  }

  /* ---------- donut ---------- */
  function donut(el, c) {
    var size = c.size || 168, th = c.thickness || 22, items = c.items, total = 0, off = 0, segs = '', leg = '';
    items.forEach(function (it) { total += it.value; });
    var r = (size - th) / 2, C = 2 * Math.PI * r, mid = size / 2;
    segs += '<circle class="track" cx="' + mid + '" cy="' + mid + '" r="' + r + '" fill="none" stroke-width="' + th + '"/>';
    items.forEach(function (it, i) {
      var f = total ? it.value / total : 0, len = Math.max(0, f * C - (items.length > 1 ? 3 : 0));
      segs += '<circle class="seg s' + (i + 1) + '" cx="' + mid + '" cy="' + mid + '" r="' + r + '" fill="none" stroke-width="' + th + '" stroke-dasharray="' + r1(len) + ' ' + r1(C - len) + '" stroke-dashoffset="' + r1(-off) + '" transform="rotate(-90 ' + mid + ' ' + mid + ')"/>';
      off += f * C;
      leg += '<li><i class="s' + (i + 1) + '"></i><span>' + esc(it.label) + '</span><span class="val">' + nf(it.value / (c.scale || 1), 0) + '</span><span class="pct">' + nf(f * 100, 0) + '٪</span></li>';
    });
    el.setAttribute('role', 'figure'); el.setAttribute('aria-label', c.label || 'نمودار دونات');
    el.innerHTML = '<div class="donut"><div class="donut__fig"><svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" aria-hidden="true" focusable="false">' + segs + '</svg>' +
      '<div class="donut__center"><strong>' + nf(total / (c.scale || 1), 0) + '</strong>' + (c.centerLabel ? '<span>' + esc(c.centerLabel) + '</span>' : '') + '</div></div>' +
      '<ul class="donut__legend">' + leg + '</ul></div>';
  }

  /* ---------- sparkline ---------- */
  function spark(el, vals, c) {
    c = c || {};
    var W = Math.max(60, Math.round(el.clientWidth) || 100), H = c.height || 36, rtl = isRTL(el), n = vals.length, pad = 4;
    var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals), rng = (mx - mn) || 1, cls = c.color || 'c1';
    function X(i) { var f = n > 1 ? i / (n - 1) : 0; return rtl ? W - pad - f * (W - 2 * pad) : pad + f * (W - 2 * pad); }
    function Y(v) { return H - pad - ((v - mn) / rng) * (H - 2 * pad); }
    var dd = '';
    vals.forEach(function (v, i) { dd += (i ? 'L' : 'M') + r1(X(i)) + ',' + r1(Y(v)); });
    var lastX = r1(X(n - 1)), lastY = r1(Y(vals[n - 1]));
    el.setAttribute('role', 'img'); el.setAttribute('aria-label', c.label || 'روند');
    el.innerHTML = '<svg class="chart__svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true" focusable="false">' +
      '<path class="spark-area ' + cls + '" d="' + dd + 'L' + lastX + ',' + H + 'L' + r1(X(0)) + ',' + H + 'Z"/><path class="spark-line ' + cls + '" d="' + dd + '"/>' +
      '<circle class="spark-dot ' + cls + '" cx="' + lastX + '" cy="' + lastY + '" r="3.5"/></svg>';
  }

  A.charts = {
    bar: function (el, c) { mount(el, function () { cartesian(el, c, 'bar'); }); },
    line: function (el, c) { mount(el, function () { cartesian(el, c, 'line'); }); },
    donut: function (el, c) { mount(el, function () { donut(el, c); }); },
    spark: function (el, v, c) { mount(el, function () { spark(el, v, c); }); }
  };
})(window, document);
