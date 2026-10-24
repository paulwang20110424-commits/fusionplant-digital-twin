#!/usr/bin/env node
/**
 * Verify that every version source agrees.
 *
 * Sources checked:
 *   - package.json            "version"
 *   - package-lock.json       root package version
 *   - src/config/version.ts   APP_VERSION
 *   - README.md               contains the current version string
 *   - CHANGELOG.md            contains a section for the current version
 *
 * Exit code 1 on any mismatch so CI and `npm run verify` fail loudly.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');

const failures = [];
const notes = [];

const pkg = JSON.parse(read('package.json'));
const pkgVersion = pkg.version;

if (!/^\d+\.\d+\.\d+$/.test(pkgVersion ?? '')) {
  failures.push(`package.json version "${pkgVersion}" is not a semver triple`);
}

// package-lock root version
if (existsSync(resolve(root, 'package-lock.json'))) {
  const lock = JSON.parse(read('package-lock.json'));
  const lockVersion = lock.version;
  const lockRoot = lock.packages?.['']?.version;
  if (lockVersion !== pkgVersion) {
    failures.push(`package-lock.json version ${lockVersion} != package.json ${pkgVersion}`);
  }
  if (lockRoot !== undefined && lockRoot !== pkgVersion) {
    failures.push(`package-lock.json packages[""].version ${lockRoot} != package.json ${pkgVersion}`);
  }
  notes.push(`package-lock.json: ${lockVersion}`);
} else {
  notes.push('package-lock.json: absent (skipped)');
}

// src/config/version.ts
const versionSource = read('src/config/version.ts');
const grab = (name) => {
  const match = versionSource.match(new RegExp(`export const ${name}\\s*=\\s*'([^']+)'`));
  return match ? match[1] : null;
};
const appVersion = grab('APP_VERSION');
const modelVersion = grab('MODEL_VERSION');
const schemaRaw = versionSource.match(/export const EXPORT_SCHEMA_VERSION\s*=\s*(\d+)/);
const schemaVersion = schemaRaw ? Number(schemaRaw[1]) : null;

if (!appVersion) {
  failures.push('src/config/version.ts: APP_VERSION not found');
} else if (appVersion !== pkgVersion) {
  failures.push(`src/config/version.ts APP_VERSION ${appVersion} != package.json ${pkgVersion}`);
}
if (!modelVersion) failures.push('src/config/version.ts: MODEL_VERSION not found');
if (schemaVersion === null) failures.push('src/config/version.ts: EXPORT_SCHEMA_VERSION not found');

// README must mention the version
const readme = read('README.md');
if (!readme.includes(`v${pkgVersion}`)) {
  failures.push(`README.md does not mention the current version v${pkgVersion}`);
}

// CHANGELOG must have a section for the version
if (existsSync(resolve(root, 'CHANGELOG.md'))) {
  const changelog = read('CHANGELOG.md');
  if (!changelog.includes(`## [${pkgVersion}]`) && !changelog.includes(`## v${pkgVersion}`)) {
    failures.push(`CHANGELOG.md has no section for ${pkgVersion}`);
  }
} else {
  failures.push('CHANGELOG.md is missing');
}

notes.push(`package.json: ${pkgVersion}`);
notes.push(`APP_VERSION: ${appVersion}`);
notes.push(`MODEL_VERSION: ${modelVersion}`);
notes.push(`EXPORT_SCHEMA_VERSION: ${schemaVersion}`);

if (failures.length) {
  console.error('✗ Version check FAILED');
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error('\nChecked sources:');
  for (const note of notes) console.error(`  · ${note}`);
  process.exit(1);
}

console.log('✓ Version check passed');
for (const note of notes) console.log(`  · ${note}`);
