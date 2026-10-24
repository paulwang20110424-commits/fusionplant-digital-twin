#!/usr/bin/env node
/**
 * Build size report.
 *
 * Prints the entry and per-chunk sizes (raw + gzip) and enforces *soft* budgets:
 * the job always exits 0 unless a chunk exceeds the hard ceiling, so ordinary
 * feature work produces a warning rather than a red build.
 *
 * Usage: node scripts/build-stats.mjs [--fail-on-ceiling]
 */
import { readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distAssets = resolve(root, 'dist/assets');

const BUDGETS = {
  /** Warn above this gzip size for the entry chunk. */
  entryWarnKb: 160,
  /** Warn above this gzip size for any single chunk. */
  chunkWarnKb: 420,
  /** Hard ceiling: fail above this gzip size. */
  chunkFailKb: 900,
};

let files;
try {
  files = readdirSync(distAssets).filter((name) => name.endsWith('.js') || name.endsWith('.css'));
} catch {
  console.error('dist/assets not found — run `npm run build` first.');
  process.exit(1);
}

const rows = files.map((name) => {
  const path = resolve(distAssets, name);
  const raw = statSync(path).size;
  const gzip = gzipSync(readFileSync(path)).length;
  return { name, raw, gzip, rawKb: raw / 1024, gzipKb: gzip / 1024 };
});

rows.sort((a, b) => b.raw - a.raw);

const entry = rows.find((row) => /^index-.*\.js$/.test(row.name));
const totalGzip = rows.reduce((sum, row) => sum + row.gzipKb, 0);
const largest = rows[0];

console.log('Build size report');
console.log('─────────────────────────────────────────────────────────────');
for (const row of rows.slice(0, 12)) {
  console.log(
    `${row.name.padEnd(40)} ${row.rawKb.toFixed(1).padStart(8)} kB  ${row.gzipKb.toFixed(1).padStart(7)} kB gz`,
  );
}
if (rows.length > 12) console.log(`… ${rows.length - 12} more chunk(s)`);
console.log('─────────────────────────────────────────────────────────────');
console.log(`entry chunk   : ${entry ? `${entry.gzipKb.toFixed(1)} kB gz` : 'n/a'}`);
console.log(`largest chunk : ${largest.name} ${largest.gzipKb.toFixed(1)} kB gz`);
console.log(`total (gzip)  : ${totalGzip.toFixed(1)} kB across ${rows.length} assets`);

const warnings = [];
if (entry && entry.gzipKb > BUDGETS.entryWarnKb) {
  warnings.push(`entry chunk ${entry.gzipKb.toFixed(1)} kB gz exceeds the ${BUDGETS.entryWarnKb} kB budget`);
}
for (const row of rows) {
  if (row.gzipKb > BUDGETS.chunkWarnKb) {
    warnings.push(`${row.name} is ${row.gzipKb.toFixed(1)} kB gz (budget ${BUDGETS.chunkWarnKb} kB)`);
  }
}

for (const warning of warnings) console.warn(`⚠ ${warning}`);

try {
  mkdirSync(resolve(root, '.smoke'), { recursive: true });
  writeFileSync(
    resolve(root, '.smoke/build-stats.json'),
    JSON.stringify(
      { generatedAt: new Date().toISOString(), budgets: BUDGETS, totalGzipKb: totalGzip, rows },
      null,
      2,
    ),
  );
} catch {
  /* reporting only */
}

const overCeiling = rows.filter((row) => row.gzipKb > BUDGETS.chunkFailKb);
if (overCeiling.length && process.argv.includes('--fail-on-ceiling')) {
  console.error(`✗ ${overCeiling.length} chunk(s) exceed the hard ceiling of ${BUDGETS.chunkFailKb} kB gz`);
  process.exit(1);
}

console.log(
  warnings.length ? '\nBudgets exceeded (warning only).' : '\nAll chunks within the configured budgets.',
);
