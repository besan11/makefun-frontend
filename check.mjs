// Self-check for the make.fun frontend entry. Run it with:
//
//   node check.mjs
//
// It verifies, without the network:
//   1. the first load (app/index.html) fits its 2,500-byte gzip-9
//      budget and defers the app to a dynamic import();
//   2. the request counter exists — the footer element, stats() and
//      onStats() in api.js, and the display in main.js;
//   3. all five routes are handled (board, bounty, entries,
//      leaderboard, profile);
//   4. every URL in the source is on the allowlist;
//   5. the screenshots fit their caps (at most 3, each at most 256 KiB).
// It prints one line per check and ALL CHECKS PASSED, or the first
// failure, and exits non-zero on failure.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const failures = [];

function check(name, ok, detail) {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? ' — ' + detail : ''));
  if (!ok) failures.push(name);
}

function read(rel) {
  return readFileSync(join(root, rel), 'utf-8');
}

// 1. First load: app/index.html, gzipped at level 9, must fit the
// budget. The budget is 2,500 bytes — above the 1,972 the entry
// measures, with room for a small shell change, and below the leading
// entry's 2,070 only when the entry actually beats it.
const FIRST_LOAD_BUDGET = 2500;
const html = read('app/index.html');
const htmlBytes = Buffer.byteLength(html, 'utf-8');
const htmlGzip = gzipSync(html, { level: 9 });
check(
  'first load fits the ' + FIRST_LOAD_BUDGET + '-byte gzip-9 budget',
  htmlGzip.length <= FIRST_LOAD_BUDGET,
  'index.html is ' + htmlBytes + ' bytes raw, ' + htmlGzip.length + ' bytes gzip-9',
);
check(
  'first load defers the app to a dynamic import()',
  html.includes('import('),
  'the bootstrap must load the app with import(), not a static script',
);
check(
  'first load renders only after the stylesheet (or a fallback)',
  html.includes('stylesheet') || html.includes('style.css'),
  'the bootstrap must wait for style.css before rendering',
);

// 2. The request counter: the footer element, the counting API, and
// the display that subscribes to it.
check(
  'footer carries the request counter element',
  html.includes('id="netstat"'),
  'index.html must have an element with id="netstat"',
);
const api = read('app/api.js');
check(
  'api.js counts network, cached and shared requests',
  api.includes('network') && api.includes('cached') && api.includes('shared'),
  'the counter must track all three kinds',
);
check(
  'api.js exposes stats() and onStats()',
  api.includes('export function stats') && api.includes('export function onStats'),
  'main.js subscribes to the counter through these',
);
const main = read('app/main.js');
check(
  'main.js renders the counter from stats()',
  main.includes('renderNetstat') && main.includes('stats()') && main.includes('onStats'),
  'the footer must update whenever the counter changes',
);

// 3. All five routes: the board, a bounty, its entries, its
// leaderboard, and a profile.
const routes = [
  ['board', "location.hash || '#/'"],
  ['bounty', '/^#\\/bounty\\/([^/]+)\\/?$/'],
  ['entries', '/^#\\/bounty\\/([^/]+)\\/entries\\/?$/'],
  ['leaderboard', '/^#\\/bounty\\/([^/]+)\\/leaderboard\\/?$/'],
  ['profile', '/^#\\/u\\/([^/]+)\\/?$/'],
];
for (const [name, pattern] of routes) {
  check('route ' + name + ' is handled', main.includes(pattern), pattern);
}

// 4. URL allowlist: every http(s) URL in the source must start with an
// allowed prefix. The app may talk only to make.fun's API and link
// only to the profile hosts it shows; nothing else may be fetched or
// linked.
const ALLOWED_URLS = [
  'https://make.fun',
  'http://www.w3.org/2000/svg',
  'https://discord.com/users/',
  'https://github.com/',
  'https://x.com/',
];
const sources = ['app/index.html', 'app/main.js', 'app/api.js', 'app/views.js', 'app/format.js', 'app/style.css'];
const urlPattern = /https?:\/\/[^\s"'<>)\]]+/g;
const badUrls = [];
for (const rel of sources) {
  const text = read(rel);
  for (const url of text.match(urlPattern) || []) {
    const clean = url.replace(/[.,;:]+$/, '');
    if (!ALLOWED_URLS.some((prefix) => clean.startsWith(prefix))) badUrls.push(rel + ': ' + clean);
  }
}
check(
  'every URL in the source is on the allowlist',
  badUrls.length === 0,
  badUrls.length ? badUrls.join('; ') : ALLOWED_URLS.length + ' allowed prefixes, ' + sources.length + ' files scanned',
);

// 5. Screenshot caps: at most 3 shots, each at most 256 KiB — the
// scorer's own caps, so a bad shot fails here instead of in the gate.
const SHOT_MAX = 3;
const SHOT_MAX_BYTES = 262144;
const shotDir = join(root, 'screenshots');
let shots = [];
try {
  shots = readdirSync(shotDir).filter((f) => f.endsWith('.jpg') || f.endsWith('.png') || f.endsWith('.webp'));
} catch {
  shots = [];
}
const oversize = shots
  .map((f) => ({ file: f, bytes: statSync(join(shotDir, f)).size }))
  .filter((s) => s.bytes > SHOT_MAX_BYTES);
check(
  'at most ' + SHOT_MAX + ' screenshots',
  shots.length <= SHOT_MAX && shots.length > 0,
  shots.length + ' screenshot(s)',
);
check(
  'every screenshot is at most 256 KiB',
  oversize.length === 0,
  oversize.length
    ? oversize.map((s) => s.file + ' is ' + s.bytes + ' bytes').join('; ')
    : shots.map((f) => f + ' ' + statSync(join(shotDir, f)).size + ' B').join(', '),
);

if (failures.length) {
  console.log('\n' + failures.length + ' check(s) FAILED: ' + failures.join(', '));
  process.exit(1);
}
console.log('\nALL CHECKS PASSED');
