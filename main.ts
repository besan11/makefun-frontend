// Hands this entry in. The frontend is the static files in app/ beside
// this file, read by any static server with app/ at its root. This program
// copies app/ and screenshots/ to the output directory and writes the
// dossier the judge reads, built from those files by the kit's vendored
// library. It runs on Node 22 with the standard library only, no network,
// and both runs write the same bytes.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// In the grader the output directory is /output.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The caps are the scorer's own: at most 3 screenshots of at most 256 KiB,
// at most 993 files and directories in app/ totalling at most 16 MiB, and
// a dossier text of at most 160 KiB. buildDossier refuses anything past
// them, so a bad entry fails here instead of in the gate.
const dossierCaps = {
  text_max_bytes: 163840,
  screenshots: { max: 3, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 16777216,
};

mkdirSync(outputDir, { recursive: true });
cpSync(join(repoRoot, 'app'), join(outputDir, 'app'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

const dossier = buildDossier(outputDir, dossierCaps);
writeFileSync(join(outputDir, 'dossier.json'), dossier);

// A one-line receipt for the maker: the dossier's size, so a bad build
// is obvious before the entry is checked.
console.log('dossier.json: ' + dossier.length + ' bytes written to ' + outputDir);

// The Totals line as well, so the maker sees the first load (files and
// gzip-9 bytes) without opening dossier.json. buildDossier returns
// bytes, so decode them to text first. The dossier is JSON, so the
// line's newline is an escape, not a real one — match up to it.
const totals = new TextDecoder().decode(dossier).match(/Totals: [^\\]+/);
if (totals) console.log(totals[0]);
