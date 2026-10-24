#!/usr/bin/env node
/**
 * Accessibility smoke check with axe-core.
 *
 * Loads the console in headless Chrome, injects axe-core and runs the WCAG 2 A/AA
 * rule set on several pages. Fails on serious/critical violations; moderate
 * issues are reported but do not fail the build.
 *
 * Usage: node scripts/a11y.mjs [url]
 */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const url = process.argv[2] ?? 'http://127.0.0.1:5174/';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const axeSource = readFileSync(resolve(root, 'node_modules/axe-core/axe.min.js'), 'utf8');

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });

await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(1200);

// Start the simulation so alarms, KPIs and the 3D scene are populated.
await page
  .locator('header button', { hasText: 'START' })
  .first()
  .click()
  .catch(() => {});
await page.waitForTimeout(2000);

const pages = ['OVERVIEW', 'SIMULATION', 'DIAGNOSTICS', 'HISTORY'];
const results = [];

for (const label of pages) {
  await page
    .locator('nav button', { hasText: label })
    .first()
    .click()
    .catch(() => {});
  await page.waitForTimeout(900);

  await page.addScriptTag({ content: axeSource });
  const result = await page.evaluate(async () => {
    const r = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
      resultTypes: ['violations'],
    });
    return r.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.length,
      targets: violation.nodes.slice(0, 3).map((node) => node.target.join(' ')),
    }));
  });

  const serious = result.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  results.push({ page: label, violations: result.length, serious: serious.length, details: result });
}

await page.screenshot({ path: '.smoke/a11y-overview.png' }).catch(() => {});
await browser.close();

let failed = 0;
for (const entry of results) {
  const badge = entry.serious > 0 ? '✗' : '✓';
  if (entry.serious > 0) failed += 1;
  console.log(`${badge} ${entry.page}: ${entry.violations} violation(s), ${entry.serious} serious/critical`);
  for (const detail of entry.details) {
    const marker = detail.impact === 'serious' || detail.impact === 'critical' ? '  ERROR' : '  warn ';
    console.log(`${marker} [${detail.impact}] ${detail.id} — ${detail.help} (${detail.nodes} node(s))`);
    for (const target of detail.targets) console.log(`         ${target}`);
  }
}

if (failed > 0) {
  console.error(`\nAccessibility check failed on ${failed} page(s).`);
  process.exit(1);
}
console.log('\nAccessibility check passed (no serious or critical violations).');
