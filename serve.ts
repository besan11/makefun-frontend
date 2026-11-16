// A tiny static server for local development: serves the app/ folder
// on http://localhost:8080. No build step, no dependencies, Node 22
// stdlib only.
//
//   node serve.ts            serves on 8080
//   node serve.ts --port 9000
//   MAKEFUN_PORT=9000 node serve.ts
//
// Paths are resolved inside app/ and refused outside it, so a request
// for ../ can never read a file above the app folder.

import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const APP = resolve(new URL('.', import.meta.url).pathname, 'app');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.avif': 'image/avif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function portFromArgs() {
  const args = process.argv.slice(2);
  const at = args.indexOf('--port');
  if (at >= 0 && args[at + 1]) {
    const n = Number(args[at + 1]);
    if (Number.isInteger(n) && n > 0 && n < 65536) return n;
  }
  const env = Number(process.env.MAKEFUN_PORT);
  if (Number.isInteger(env) && env > 0 && env < 65536) return env;
  return 8080;
}

const PORT = portFromArgs();

const server = createServer((req, res) => {
  const raw = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
  const wanted = raw === '/' ? '/index.html' : raw;
  const file = resolve(join(APP, wanted));
  // Refuse anything that escapes the app folder, and anything that is
  // not a plain file on disk.
  if (!file.startsWith(APP + '/') || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found\n');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream' });
  res.end(readFileSync(file));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('Serving app/ at http://localhost:' + PORT);
});
