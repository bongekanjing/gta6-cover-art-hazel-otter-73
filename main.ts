// main.ts — hand the entry in.
//
// Copies this repository's app/ and screenshots/ into the output directory
// (MAKEFUN_OUTPUT_DIR, or /output) and writes dossier.json with the vendored
// make.fun library. Node standard library plus that one import; nothing here
// touches the network or the app's own code.

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** The caps the scorer's gate.json names: only text_max_bytes shapes the bytes. */
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
};

mkdirSync(out, { recursive: true });

// A clean output: a stale file from an earlier run must never ride along.
for (const name of ['app', 'screenshots']) {
  rmSync(join(out, name), { recursive: true, force: true });
}

cpSync(join(here, 'app'), join(out, 'app'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

const dossier = buildDossier(out, CAPS);
writeFileSync(join(out, 'dossier.json'), dossier);

console.log(`wrote ${join(out, 'dossier.json')} (${dossier.length} bytes)`);
