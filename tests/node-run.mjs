// اجرای تست‌ها در Node:  npm install && npm test
import 'fake-indexeddb/auto';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';

const dom = new JSDOM('<!doctype html><html lang="fa" dir="rtl"><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;
globalThis.Event = dom.window.Event;

const sampleText = readFileSync(new URL('../sample-pack/sample-course.json', import.meta.url), 'utf8');

const suites = [
  ['M1', (await import('./m1.test.js')).runTests],
  ['M2', (await import('./m2.test.js')).runTests],
  ['M3', (await import('./m3.test.js')).runTests],
  ['M4', (await import('./m4.test.js')).runTests],
  ['M5', (await import('./m5.test.js')).runTests],
  ['M7', (await import('./m7.test.js')).runTests],
  ['M7-build', (await import('./m7-build.test.js')).runTests],
];

let total = 0;
let failed = 0;
for (const [label, run] of suites) {
  console.log(`\n── ${label} ──`);
  const results = await run({ sampleText });
  for (const r of results) {
    total++;
    if (r.ok) console.log(`  ✓ ${r.name}`);
    else { failed++; console.log(`  ✗ ${r.name}\n      ${r.error}`); }
  }
}
console.log(`\n${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
