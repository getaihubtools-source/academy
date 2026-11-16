// ساخت sw.js با فهرست پیش‌کش و نسخه‌ی محتوا-محور:  node tools/build-sw.mjs
// هر تغییر در هر فایل برنامه → نسخه جدید → کاربران پیام «نسخه جدید آماده است» را می‌بینند.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
const INCLUDE_DIRS = ['css', 'js', 'fonts', 'icons'];
const INCLUDE_ROOT = ['index.html', 'manifest.webmanifest'];
const EXT = /\.(html|css|js|woff2|png|webmanifest|json|svg)$/;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (EXT.test(name)) out.push(full);
  }
  return out;
}

export function precacheFiles(root = ROOT) {
  const files = [...INCLUDE_ROOT.map((f) => join(root, f)), ...INCLUDE_DIRS.flatMap((d) => walk(join(root, d)))];
  return files.map((f) => relative(root, f).split(sep).join('/')).sort();
}

export function buildSw(root = ROOT) {
  const files = precacheFiles(root);
  const hash = createHash('sha256');
  for (const f of files) { hash.update(f); hash.update('\0'); hash.update(readFileSync(join(root, f))); hash.update('\0'); }
  const version = hash.digest('hex').slice(0, 12);
  const urls = ['./', ...files.map((f) => `./${f}`)];
  const template = readFileSync(join(root, 'tools/sw.template.js'), 'utf8');
  const source = template.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(urls, null, 2));
  return { source, version, urls };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { source, version, urls } = buildSw();
  writeFileSync(join(ROOT, 'sw.js'), source);
  console.log(`sw.js written — version ${version}, ${urls.length} files`);
}
