// Self-check for this entry. Run it from the entry root:
//
//   node check.mjs
//
// It verifies the first-load budget, the request counter, all five
// routes, the URL allowlist, the style requirements, the screenshot
// caps, and that the entry actually serves and builds. It prints
// ALL CHECKS PASSED when every check passes, and exits non-zero on
// the first failure. No network beyond localhost is used: the live
// API is never called here — the screenshot run checks it instead.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const ROOT = new URL('.', import.meta.url).pathname;
const APP = join(ROOT, 'app');

const FIRST_LOAD_BUDGET = 2037;
const SHOT_CAP = 262144;

let passed = 0;

function read(p) {
  return readFileSync(p, 'utf8');
}

function need(cond, msg) {
  if (!cond) throw new Error(msg);
}

function waitFor(fn, timeoutMs, label) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const loop = async () => {
      try {
        if (await fn()) return resolve();
      } catch { /* not ready yet */ }
      if (Date.now() - start > timeoutMs) return reject(new Error('timed out waiting for ' + label));
      setTimeout(loop, 200);
    };
    loop();
  });
}

async function check(name, fn) {
  try {
    const detail = await fn();
    passed += 1;
    console.log('PASS ' + name + (detail ? ' — ' + detail : ''));
  } catch (err) {
    console.error('FAIL ' + name + ' — ' + err.message);
    throw err;
  }
}

const checks = [
  ['first load fits the budget', async () => {
    const raw = readFileSync(join(APP, 'index.html'));
    const gz = gzipSync(raw, { level: 9 }).length;
    need(gz <= FIRST_LOAD_BUDGET, 'index.html is ' + gz + ' bytes gzip-9, over the ' + FIRST_LOAD_BUDGET + ' budget');
    return '1 file, ' + gz + ' bytes gzip-9 (' + raw.length + ' raw)';
  }],

  ['first load is one file', async () => {
    const html = read(join(APP, 'index.html'));
    need(!/<link[^>]+rel=["']stylesheet["']/i.test(html), 'index.html links a stylesheet directly');
    need(!/<script[^>]+src=/i.test(html), 'index.html loads a script by src');
    need(/import\(['"]\.\/main\.js['"]\)/.test(html), 'index.html does not load the app with a dynamic import()');
    return 'stylesheet and app load after the shell, via JS';
  }],

  ['request counter is wired', async () => {
    const api = read(join(APP, 'api.js'));
    const main = read(join(APP, 'main.js'));
    const html = read(join(APP, 'index.html'));
    need(/export function tally/.test(api), 'api.js does not export tally()');
    need(/export function subscribe/.test(api), 'api.js does not export subscribe()');
    need(/subscribe\(paintNet\)/.test(main), 'main.js does not subscribe the footer to the counter');
    need(/id="netstat"/.test(html), 'index.html has no #netstat element');
    need(/class="footer-netstat"/.test(html), 'the counter line is not classed footer-netstat');
    need(/from cache/.test(main), 'the footer text does not show the cached count');
    return 'tally + subscribe + #netstat footer';
  }],

  ['all five routes exist', async () => {
    const main = read(join(APP, 'main.js'));
    for (const [name, re] of [
      ['board', /#\/bounty\/[^/]+/],
      ['bounty', /bountyOne\(/],
      ['leaderboard', /rankList\(/],
      ['entries', /entryPage\(/],
      ['profile', /person\(/],
    ]) {
      need(re.test(main), 'route ' + name + ' is missing from main.js');
    }
    need(/showRanks/.test(main) && /showEntries/.test(main) && /showPerson/.test(main) && /showBounty/.test(main) && /showBoard/.test(main), 'a route handler is missing');
    return 'board, bounty, leaderboard, entries, profile';
  }],

  ['URL allowlist', async () => {
    // The app fetches only make.fun's API, links only to make.fun and
    // to the profile hosts a profile page shows, and builds its SVG
    // tile in the w3.org namespace. Nothing else may be fetched or
    // linked.
    const allowed = [
      'https://make.fun',
      'http://www.w3.org/2000/svg',
      'https://github.com/',
      'https://x.com/',
      'https://discord.com/users/',
    ];
    const files = readdirSync(APP).filter((f) => f.endsWith('.js') || f.endsWith('.html'));
    for (const f of files) {
      const text = read(join(APP, f));
      const urls = [...text.matchAll(/https?:\/\/[^\s"'`)\]]+/g)].map((m) => m[0]);
      for (const u of urls) {
        need(allowed.some((a) => u.startsWith(a)), f + ' references ' + u + ', outside the allowlist');
      }
      need(!/javascript:/i.test(text), f + ' contains a javascript: URL');
    }
    const views = read(join(APP, 'views.js'));
    need(views.includes('https?:\\/\\/'), 'the markdown link rule does not restrict links to http/https');
    return files.length + ' app files, only make.fun + profile hosts + the SVG namespace';
  }],

  ['style requirements', async () => {
    const css = read(join(APP, 'style.css'));
    need(/\.footer-netstat\s*\{[^}]*tabular-nums/.test(css), '.footer-netstat does not use tabular-nums');
    need(/\.prose a\s*\{[^}]*overflow-wrap:\s*anywhere/.test(css), '.prose a does not wrap long URLs');
    return '.footer-netstat tabular-nums, .prose a overflow-wrap anywhere';
  }],

  ['format helpers', async () => {
    const fmt = read(join(APP, 'format.js'));
    need(/export function clock/.test(fmt), 'format.js does not export clock()');
    need(/export function pct/.test(fmt), 'format.js does not export pct()');
    need(/Math\.min\(100/.test(fmt), 'pct() does not cap at 100');
    return 'clock() + pct() capped at 100';
  }],

  ['main.ts prints Totals', async () => {
    const main = read(join(ROOT, 'main.ts'));
    need(/Totals:/.test(main), 'main.ts does not print the Totals line');
    need(/buildDossier/.test(main), 'main.ts does not build the dossier');
    return 'Totals line + dossier build';
  }],

  ['serve.ts port + MIME types', async () => {
    const serve = read(join(ROOT, 'serve.ts'));
    need(/MAKEFUN_PORT/.test(serve), 'serve.ts does not read MAKEFUN_PORT');
    need(/'\.avif'/.test(serve), 'serve.ts has no .avif MIME type');
    need(/'\.txt'/.test(serve), 'serve.ts has no .txt MIME type');
    return 'MAKEFUN_PORT, .avif, .txt';
  }],

  ['screenshot caps', async () => {
    const shots = JSON.parse(read(join(ROOT, 'shots.json')));
    need(Array.isArray(shots) && shots.length === 3, 'shots.json does not list exactly 3 shots');
    for (const s of shots) {
      need(s.file && s.label && s.path && s.viewport, 'a shot entry is missing file/label/path/viewport');
      const p = join(ROOT, 'screenshots', s.file);
      need(existsSync(p), 'missing screenshot ' + s.file);
      const size = statSync(p).size;
      need(size <= SHOT_CAP, s.file + ' is ' + size + ' bytes, over the ' + SHOT_CAP + ' cap');
    }
    return '3 shots, each under 256 KiB';
  }],

  ['entry serves over HTTP', async () => {
    const port = 18123;
    const child = spawn('node', ['serve.ts'], {
      cwd: ROOT,
      env: { ...process.env, MAKEFUN_PORT: String(port) },
      stdio: 'ignore',
    });
    try {
      await waitFor(async () => {
        const r = await fetch('http://127.0.0.1:' + port + '/');
        return r.status === 200;
      }, 10000, 'serve.ts to listen');
      const home = await fetch('http://127.0.0.1:' + port + '/');
      need(home.status === 200, 'GET / answered ' + home.status);
      const body = await home.text();
      need(body.includes('__shotReady'), 'GET / does not serve the app shell');
      const css = await fetch('http://127.0.0.1:' + port + '/style.css');
      need(css.status === 200 && (css.headers.get('content-type') || '').includes('text/css'), 'GET /style.css is not CSS');
      const js = await fetch('http://127.0.0.1:' + port + '/main.js');
      need(js.status === 200, 'GET /main.js answered ' + js.status);
      const escape = await fetch('http://127.0.0.1:' + port + '/..%2fmain.ts');
      need(escape.status === 404, 'a path escaping app/ answered ' + escape.status + ' instead of 404');
      return 'shell + CSS + JS served, escape refused';
    } finally {
      child.kill();
    }
  }],

  ['entry builds a dossier', async () => {
    const out = mkdtempSync(join(tmpdir(), 'makefun-check-'));
    try {
      const child = spawn('node', ['main.ts'], {
        cwd: ROOT,
        env: { ...process.env, MAKEFUN_OUTPUT_DIR: out },
        stdio: 'pipe',
      });
      let stdout = '';
      child.stdout.on('data', (d) => { stdout += d; });
      const code = await new Promise((resolve) => child.on('close', resolve));
      need(code === 0, 'main.ts exited ' + code);
      need(/Totals:/.test(stdout), 'main.ts printed no Totals line');
      need(existsSync(join(out, 'dossier.json')), 'no dossier.json in the output');
      need(existsSync(join(out, 'app', 'index.html')), 'app/ was not copied to the output');
      return stdout.split('\n')[0];
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }],
];

for (const [name, fn] of checks) {
  try {
    await check(name, fn);
  } catch {
    console.error(passed + ' passed, then a check failed.');
    process.exit(1);
  }
}
console.log('ALL CHECKS PASSED (' + passed + '/' + checks.length + ')');
