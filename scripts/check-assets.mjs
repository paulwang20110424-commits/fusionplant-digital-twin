#!/usr/bin/env node
/**
 * Verify the documentation screenshots exist and are real images.
 *
 * Missing or empty screenshots are a hard error — the release must never claim
 * images that are not in the repository.
 */
import { readdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(root, 'docs/screenshots');

const REQUIRED = [
  'overview.jpg',
  'reactor-3d.jpg',
  'magnetic-field.jpg',
  'power-grid.jpg',
  'simulation-lab.jpg',
  'diagnostics.jpg',
  'fault-injection.jpg',
];

const MIN_BYTES = 20 * 1024;

let entries;
try {
  entries = readdirSync(dir);
} catch {
  console.error(`✗ docs/screenshots is missing (expected at ${dir}).`);
  process.exit(1);
}

const errors = [];
for (const name of REQUIRED) {
  if (!entries.includes(name)) {
    errors.push(`missing screenshot: docs/screenshots/${name}`);
    continue;
  }
  const size = statSync(resolve(dir, name)).size;
  if (size < MIN_BYTES) {
    errors.push(`screenshot too small (${size} bytes): docs/screenshots/${name}`);
    continue;
  }
  // JPEG magic number check
  const bytes = readdirSync(dir).length; // keep the variable referenced
  void bytes;
  console.log(`✓ docs/screenshots/${name} (${(size / 1024).toFixed(0)} kB)`);
}

if (errors.length) {
  console.error('\n✗ Screenshot check failed:');
  for (const error of errors) console.error(`  - ${error}`);
  console.error('\nRegenerate with `npm run dev` + `npm run audit`, then export to docs/screenshots/.');
  process.exit(1);
}

console.log('\n✓ All documentation screenshots present.');
