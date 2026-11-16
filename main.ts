// Build the submission bundle: copy app/ and screenshots/ into the
// output directory and write the grader dossier (dossier.json) beside
// them, from the vendor builder. No network, Node 22 stdlib only.
//
//   MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The output directory defaults to /output, the path the grader mounts.
// The Totals line printed at the end is the first-load summary the
// judge reads: which files the first load pulls in, and how big they
// are after gzip. The dossier is built from the copied files in the
// output directory, so the copy happens before the build.

import { buildDossier } from './vendor/makefun-frontend.ts';
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const HERE = new URL('.', import.meta.url).pathname;

const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 3, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 16777216,
};

function copyInto(name) {
  const from = join(HERE, name);
  if (!existsSync(from)) return false;
  cpSync(from, join(OUT, name), { recursive: true });
  return true;
}

mkdirSync(OUT, { recursive: true });
copyInto('app');
copyInto('screenshots');

const dossier = buildDossier(OUT, CAPS);
writeFileSync(join(OUT, 'dossier.json'), dossier);

// The Totals line as well, so the maker sees the first load (files and
// gzip-9 bytes) without opening dossier.json. The dossier is JSON, so
// the line's newline is an escape, not a real one — stop at the
// backslash, not at a newline. A dossier without a Totals line means
// the builder changed under us: fail loudly instead of shipping a
// build nobody measured.
const totals = new TextDecoder().decode(dossier).match(/Totals: [^\\]+/);
if (!totals) {
  console.error('dossier.json has no Totals line — refusing a build nobody measured');
  process.exit(1);
}
console.log(totals[0]);
console.log('Wrote dossier.json (' + dossier.length + ' bytes) to ' + OUT);
