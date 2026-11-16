// تست‌های فقط-Node: سلامت ساخت PWA (sw.js تازه، پوشش پیش‌کش، manifest، آیکن‌ها)
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildSw, precacheFiles, ROOT } from '../tools/build-sw.mjs';

const ok = (v, msg = 'expected truthy') => { if (!v) throw new Error(msg); };
const eq = (a, b, m = '') => { if (!Object.is(a, b)) throw new Error(`${m} expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); };
const rd = (f) => readFileSync(join(ROOT, f), 'utf8');
const pngSize = (f) => { const b = readFileSync(join(ROOT, f)); eq(b.subarray(1, 4).toString(), 'PNG', f); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('sw.js تازه است (npm run build:sw بعد از هر تغییر)', () => {
  eq(rd('sw.js'), buildSw().source, 'sw.js با فایل‌های فعلی هم‌خوان نیست؛ «npm run build:sw» را اجرا کنید');
});
test('پیش‌کش: هر فایل فهرست‌شده وجود دارد و هر js/css/font/icon پوشش داده می‌شود', () => {
  const { urls } = buildSw();
  for (const u of urls) if (u !== './') ok(existsSync(join(ROOT, u.slice(2))), `missing ${u}`);
  const files = precacheFiles();
  for (const must of ['js/app.js', 'js/views/backup-panel.js', 'js/pwa/register.js', 'css/backup.css', 'fonts/Vazirmatn-Variable.woff2', 'icons/icon-192.png', 'manifest.webmanifest', 'index.html']) ok(files.includes(must), must);
  ok(!files.some((f) => f.startsWith('tests/') || f.startsWith('sample-pack/') || f === 'sw.js'), 'تست/نمونه/sw نباید پیش‌کش شود');
});
test('هر چیزی که index.html لود می‌کند پیش‌کش می‌شود', () => {
  const html = rd('index.html'); const urls = new Set(buildSw().urls);
  const refs = [...html.matchAll(/(?:href|src)="(\.\/[^"]+)"/g)].map((m) => m[1]);
  ok(refs.length >= 10);
  for (const r of refs) ok(urls.has(r), `not precached: ${r}`);
});
test('هر import نسبی در js/ به فایل موجود اشاره می‌کند', () => {
  const { urls } = buildSw();
  for (const u of urls.filter((x) => x.startsWith('./js/'))) {
    const dir = u.split('/').slice(0, -1).join('/');
    for (const m of rd(u.slice(2)).matchAll(/from\s+'(\.[^']+)'/g)) {
      const target = new URL(m[1], `http://x/${dir.slice(2)}/`).pathname.slice(1);
      ok(existsSync(join(ROOT, target)), `${u} imports missing ${m[1]}`);
    }
  }
});
test('manifest: فیلدهای لازم PWA، آیکن‌های واقعی با اندازه درست', () => {
  const m = JSON.parse(rd('manifest.webmanifest'));
  eq(m.display, 'standalone'); eq(m.dir, 'rtl'); eq(m.lang, 'fa'); eq(m.start_url, './'); eq(m.scope, './');
  ok(m.name && m.short_name && /^#[0-9a-f]{6}$/i.test(m.theme_color));
  for (const ic of m.icons) { const [w, h] = ic.sizes.split('x').map(Number); const [pw, ph] = pngSize(ic.src.slice(2)); eq(pw, w); eq(ph, h); }
  ok(m.icons.some((i) => i.sizes === '192x192') && m.icons.some((i) => i.sizes === '512x512'));
  ok(m.icons.some((i) => i.purpose === 'maskable'));
  eq(pngSize('icons/apple-touch-icon.png')[0], 180);
});
test('index.html: manifest، آیکن‌ها و CSP سخت‌گیرانه', () => {
  const html = rd('index.html');
  ok(html.includes('rel="manifest" href="./manifest.webmanifest"') || /rel="manifest"/.test(html));
  ok(/apple-touch-icon/.test(html) && /rel="icon"/.test(html));
  ok(/script-src 'self'/.test(html) && !/unsafe-inline|unsafe-eval/.test(html));
});
test('sw.js: رفتارهای ایمنی (SKIP_WAITING فقط با پیام، حذف کش قدیمی، بدون fetch خارجی)', () => {
  const sw = rd('sw.js');
  ok(/SKIP_WAITING/.test(sw) && /caches\.delete/.test(sw) && /clients\.claim/.test(sw));
  ok(!/skipWaiting\(\)\s*;?\s*\}\s*\)\s*;?\s*$/m.test(sw.split('addEventListener(\'install\'')[1]?.split('addEventListener')[0] || ''), 'install نباید skipWaiting خودکار بزند');
  ok(/origin/.test(sw), 'فقط هم‌مبدأ');
});

export async function runTests() {
  const results = [];
  for (const { name, fn } of tests) {
    try { await fn(); results.push({ name, ok: true }); } catch (err) { results.push({ name, ok: false, error: err.message }); }
  }
  return results;
}
