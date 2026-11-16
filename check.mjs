// Self-check for this entry: rebuilds the dossier with the kit's own
// library and verifies the claims the README makes, so a regression is
// caught here instead of in the gate. Node 22+, standard library only.
//
//   node check.mjs
//
// What it checks:
//   1. First load is one file (index.html) and at most 2,500 bytes gzip-9.
//   2. The app code loads later, behind a literal import() — never in the
//      first load — and the stylesheet is fetched by script, not linked.
//   3. The request counter exists: api.js counts fetches, cache hits and
//      shared requests; main.js writes them into the footer's #reqstats.
//   4. All five routes exist: board, bounty, leaderboard, entries, profile.
//   5. The dossier's URL list names no origin outside the allowlist.
//   6. The scorer's caps hold: at most 3 screenshots of at most 256 KiB,
//      at most 993 files in app/ totalling at most 16 MiB.
//   7. Every screenshot in shots.json exists on disk.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const appDir = join(root, 'app');
const FIRST_LOAD_GZIP_BUDGET = 2500;
const EXPECTED_ORIGINS = new Set([
  'http://www.w3.org',
  'https://make.fun',
  'https://github.com',
  'https://x.com',
  'https://discord.com',
]);

const failures = [];
const notes = [];

function check(ok, label, detail) {
  notes.push((ok ? 'PASS' : 'FAIL') + '  ' + label + (detail ? ' — ' + detail : ''));
  if (!ok) failures.push(label);
}

function readText(path) {
  return readFileSync(path, 'utf8');
}

// 1-2. Rebuild the dossier and read its Load block.
const outDir = mkdtempSync(join(tmpdir(), 'frontend-check-'));
execFileSync(process.execPath, ['main.ts'], {
  cwd: root,
  env: { ...process.env, MAKEFUN_OUTPUT_DIR: outDir },
  stdio: 'pipe',
});
const dossier = JSON.parse(readText(join(outDir, 'dossier.json')));
const loadText = dossier.text.slice(
  dossier.text.indexOf('## Load'),
  dossier.text.indexOf('## Sources'),
);
const totals = loadText.match(
  /Totals: first load (\d+) files?, (\d+) bytes gzip-9 \((\d+) raw\); later by import\(\) (\d+) files?, (\d+) bytes gzip-9; whole app (\d+) files?, (\d+) bytes/,
);
if (!totals) {
  check(false, 'dossier Totals line parses');
} else {
  const [, firstFiles, firstGzip, firstRaw, laterFiles, laterGzip, appFiles, appBytes] =
    totals.map(Number);
  check(firstFiles === 1, 'first load is 1 file', firstFiles + ' files');
  check(
    firstGzip <= FIRST_LOAD_GZIP_BUDGET,
    'first load gzip-9 within budget',
    firstGzip + ' bytes (budget ' + FIRST_LOAD_GZIP_BUDGET + ')',
  );
  check(laterFiles >= 4, 'app code loads later by import()', laterFiles + ' files, ' + laterGzip + ' bytes gzip-9');
  check(appFiles <= 993 && appBytes <= 16777216, 'whole app within scorer caps', appFiles + ' files, ' + appBytes + ' bytes');
  notes.push('INFO  first load: ' + firstFiles + ' file, ' + firstGzip + ' bytes gzip-9 (' + firstRaw + ' raw)');
  notes.push('INFO  later by import(): ' + laterFiles + ' files, ' + laterGzip + ' bytes gzip-9');
  notes.push('INFO  whole app: ' + appFiles + ' files, ' + appBytes + ' bytes');
}

// The first load must not link a stylesheet or a script src: both arrive
// after it, by script and by import().
const indexHtml = readText(join(appDir, 'index.html'));
check(!/<link[^>]*rel=["']stylesheet["']/.test(indexHtml), 'no linked stylesheet in index.html');
check(!/<script[^>]*\ssrc=/.test(indexHtml), 'no script src in index.html');
check(/import\(['"]\.\/main\.js['"]\)/.test(indexHtml), 'bootstrap imports ./main.js dynamically');

// 3. The request counter.
const apiJs = readText(join(appDir, 'api.js'));
const mainJs = readText(join(appDir, 'main.js'));
check(apiJs.includes('export function requestStats'), 'api.js exports requestStats');
check(apiJs.includes('export function onRequestStats'), 'api.js exports onRequestStats');
check(apiJs.includes('stats.fetches++'), 'api.js counts real fetches');
check(apiJs.includes('stats.cacheHits++'), 'api.js counts cache hits');
check(apiJs.includes('stats.shared++'), 'api.js counts shared requests');
check(indexHtml.includes('id="reqstats"'), 'index.html has the #reqstats line');
check(mainJs.includes('updateReqStats'), 'main.js updates the request line');
check(mainJs.includes("known || getBounty(slug)"), 'leaderboard reuses board data when it can');

// 4. All five routes.
for (const [name, pattern] of [
  ['board #/', /#\//],
  ['bounty #/bounty/<slug>', /#\/bounty\/[^/]+/],
  ['leaderboard /leaderboard', /leaderboard/],
  ['entries /entries', /entries/],
  ['profile #/u/<handle>', /#\/u\//],
]) {
  check(pattern.test(mainJs), 'route exists: ' + name);
}

// 5. No surprise origins in the dossier's URL list.
const urlSection = loadText.slice(loadText.indexOf('URLs in the source:'));
const urls = [...urlSection.matchAll(/^  (https?:\/\/[^ ]+)/gm)].map((m) => m[1]);
const origins = [...new Set(urls.map((u) => {
  const m = u.match(/^(https?:\/\/[^/]+)/);
  return m ? m[1] : u;
}))];
const strange = origins.filter((o) => !EXPECTED_ORIGINS.has(o));
check(strange.length === 0, 'dossier URLs use expected origins only', origins.join(', ') || 'none');
if (strange.length) notes.push('INFO  unexpected origins: ' + strange.join(', '));

// 6-7. Screenshots: the scorer's caps, and every shot in shots.json on disk.
const shots = JSON.parse(readText(join(root, 'shots.json')));
check(shots.length <= 3, 'at most 3 screenshots', shots.length + ' listed');
for (const shot of shots) {
  const path = join(root, 'screenshots', shot.file);
  const ok = existsSync(path) && statSync(path).size <= 262144;
  check(ok, 'screenshot on disk and within 256 KiB: ' + shot.file, existsSync(path) ? statSync(path).size + ' bytes' : 'missing');
}
const shotDir = readdirSync(join(root, 'screenshots')).filter((f) => f.endsWith('.jpg'));
check(
  shotDir.length === shots.length,
  'screenshots/ holds exactly the shots in shots.json',
  shotDir.length + ' files',
);

for (const note of notes) console.log(note);
if (failures.length) {
  console.log('\n' + failures.length + ' check(s) failed.');
  process.exit(1);
}
console.log('\nALL CHECKS PASSED');
