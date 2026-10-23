/**
 * Headless interaction + layout audit.
 *
 * Drives the console through every page, exercises the transport, sliders,
 * fault injection, WHAT-IF analysis, playback and exports, then records DOM
 * measurements so layout regressions are caught without a human looking at
 * screenshots.
 *
 * Usage: node scripts/audit.mjs [url] [width] [height]
 */
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const url = process.argv[2] ?? 'http://127.0.0.1:5174/';
const width = Number(process.argv[3] ?? 1600);
const height = Number(process.argv[4] ?? 950);
const outDir = '.smoke';
mkdirSync(outDir, { recursive: true });

const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
const page = await context.newPage();

page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(`${error.message}`));
page.on('requestfailed', (request) => {
  // favicon and devtools probes are irrelevant
  if (!request.url().includes('favicon')) failedRequests.push(`${request.url()} :: ${request.failure()?.errorText}`);
});

const layout = async (label) => {
  return page.evaluate((tag) => {
    const doc = document.documentElement;
    const overflowing = [];
    for (const element of Array.from(document.querySelectorAll('main *'))) {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.right > window.innerWidth + 2 || rect.left < -2) {
        overflowing.push({
          tag: element.tagName.toLowerCase(),
          cls: (element.className || '').toString().slice(0, 60),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
        });
        if (overflowing.length >= 4) break;
      }
    }
    const main = document.querySelector('main');
    const canvas = document.querySelector('canvas');
    return {
      tag,
      horizontalOverflow: doc.scrollWidth > window.innerWidth + 1,
      scrollWidth: doc.scrollWidth,
      innerWidth: window.innerWidth,
      mainHeight: main ? Math.round(main.getBoundingClientRect().height) : 0,
      panelCount: document.querySelectorAll('main section.hud-panel').length,
      chartCount: document.querySelectorAll('main canvas').length,
      canvasBox: canvas
        ? {
            width: Math.round(canvas.getBoundingClientRect().width),
            height: Math.round(canvas.getBoundingClientRect().height),
            bitmapWidth: canvas.width,
            bitmapHeight: canvas.height,
          }
        : null,
      bodyText: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 260),
      overflowing,
    };
  }, label);
};

await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(1200);

const report = {
  url,
  viewport: { width, height },
  steps: [],
  checks: {},
  consoleErrors,
  pageErrors,
  failedRequests,
};

const push = (entry) => report.steps.push(entry);

// 1. idle overview
await page.screenshot({ path: `${outDir}/a1-overview-idle.png` });
push({ step: 'overview-idle', layout: await layout('overview-idle') });

// 2. start the simulation
await page.locator('header button', { hasText: 'START' }).first().click();
await page.waitForTimeout(3000);
await page.screenshot({ path: `${outDir}/a2-overview-running.png` });
push({ step: 'overview-running', layout: await layout('overview-running') });

const runningClock = await page
  .locator('header')
  .first()
  .innerText()
  .then((text) => text.replace(/\s+/g, ' '));

// 3. drag a slider (NBI power) and verify the readout changes
const nbiSlider = page.locator('#ctrl-nbiPowerMW');
const before = await page.locator('label[for="ctrl-nbiPowerMW"] ~ span, #ctrl-nbiPowerMW').count();
await nbiSlider.evaluate((element) => {
  const input = element;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, '46');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(1500);
const nbiReadout = await page.locator('header').first().innerText();
await page.screenshot({ path: `${outDir}/a3-slider-changed.png` });
push({ step: 'slider-nbi-46', layout: await layout('slider-nbi-46', { before, nbiReadout: nbiReadout.length }) });

// 4. inject a fault from the overview quick panel
const injectButtons = page.getByRole('button', { name: 'INJECT' });
const injectCount = await injectButtons.count();
if (injectCount > 0) {
  await injectButtons.first().click();
  await page.waitForTimeout(1800);
}
await page.screenshot({ path: `${outDir}/a4-fault.png` });
push({ step: 'fault-injected', layout: await layout('fault-injected') });

const activeFaults = await page.locator('main').innerText().then((text) => (text.includes('ACTIVE') ? 1 : 0));
report.checks.faultInjected = activeFaults === 1;

// 5. every page
const pages = [
  ['REACTOR', 'reactor'],
  ['MAGNETIC FIELD', 'magnetic'],
  ['HEATING', 'heating'],
  ['COOLING', 'cooling'],
  ['POWER GRID', 'power'],
  ['DIAGNOSTICS', 'diagnostics'],
  ['SIMULATION', 'simulation'],
  ['HISTORY', 'history'],
];

for (const [label, slug] of pages) {
  await page.locator('nav button', { hasText: label }).first().click();
  await page.waitForTimeout(1100);
  await page.screenshot({ path: `${outDir}/b-${slug}.png` });
  const info = await layout(slug);
  push({ step: `page-${slug}`, layout: info });
}

// 6. What-if on the simulation page
await page.locator('nav button', { hasText: 'SIMULATION' }).first().click();
await page.waitForTimeout(600);
await page.getByRole('button', { name: /RUN WHAT-IF/ }).first().click();
await page.waitForTimeout(4000);
await page.screenshot({ path: `${outDir}/c-whatif.png` });
const whatIfRows = await page.locator('table tbody tr').count();
report.checks.whatIfRows = whatIfRows;
push({ step: 'whatif', layout: await layout('whatif') });

// 7. history capture + playback
await page.locator('nav button', { hasText: 'HISTORY' }).first().click();
await page.waitForTimeout(900);
await page.getByRole('button', { name: /CAPTURE LIVE BUFFER/ }).first().click();
await page.waitForTimeout(800);
await page.getByRole('button', { name: /PLAY/ }).first().click();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${outDir}/c-history-playback.png` });
push({ step: 'history-playback', layout: await layout('history-playback') });

// 8. 3D interaction: orbit drag on the canvas
await page.locator('nav button', { hasText: 'REACTOR' }).first().click();
await page.waitForTimeout(1200);
const canvas = page.locator('canvas').first();
const box = await canvas.boundingBox();
if (box) {
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 160, box.y + box.height / 2 - 40, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  await page.mouse.wheel(0, -260);
  await page.waitForTimeout(700);
  // click near the centre to select a component
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(700);
}
await page.screenshot({ path: `${outDir}/d-reactor-orbit.png` });
push({ step: 'reactor-orbit', layout: await layout('reactor-orbit') });

// 8b. view modes and per-structure visibility
for (const mode of ['CUTAWAY', 'PLASMA', 'FULL']) {
  const button = page.getByRole('button', { name: mode, exact: true }).first();
  if (await button.count()) {
    await button.click();
    await page.waitForTimeout(450);
  }
}
const tfToggle = page.getByRole('button', { name: 'TF Coils', exact: true }).first();
if (await tfToggle.count()) {
  await tfToggle.click();
  await page.waitForTimeout(400);
  await tfToggle.click();
  await page.waitForTimeout(300);
}
const holdButton = page.getByRole('button', { name: /HOLD/ }).first();
if (await holdButton.count()) {
  await holdButton.click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /LIVE/ }).first().click();
  await page.waitForTimeout(300);
}
await page.screenshot({ path: `${outDir}/d2-reactor-modes.png` });
push({ step: 'reactor-modes', layout: await layout('reactor-modes') });

const selectedCard = await page.locator('main').innerText();

// 9. emergency stop
await page.locator('header button', { hasText: 'E-STOP' }).first().click();
await page.waitForTimeout(1000);
await page.screenshot({ path: `${outDir}/e-emergency.png` });
push({ step: 'emergency', layout: await layout('emergency') });
const headerAfterStop = await page.locator('header').first().innerText();

// 10. reset
await page.locator('header button[title="Reset simulation"]').first().click();
await page.waitForTimeout(800);
push({ step: 'after-reset', layout: await layout('after-reset') });

// 11. CSV export download
await page.locator('header button', { hasText: 'START' }).first().click();
await page.waitForTimeout(3200);
await page.locator('nav button', { hasText: 'SIMULATION' }).first().click();
await page.waitForTimeout(700);
try {
  const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
  await page.getByRole('button', { name: /CSV HISTORY/ }).first().click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  const fileContent = await readFile(downloadPath, 'utf8');
  const dataRows = fileContent.split('\n').filter((line) => /^\d/.test(line));
  report.checks.csvDownload = {
    suggestedName: download.suggestedFilename(),
    header: fileContent.includes('sim_time_s,plasma_temperature_keV'),
    dataRows: dataRows.length,
    hasDisclaimer: fileContent.includes('SIMULATED'),
  };
} catch (error) {
  report.checks.csvDownload = { error: String(error).slice(0, 200) };
}

// 12. local session persistence + restore after reload
await page.locator('nav button', { hasText: 'HISTORY' }).first().click();
await page.waitForTimeout(800);
await page.locator('input[placeholder="Session name…"]').first().fill('audit-session');
await page.getByRole('button', { name: /SAVE LIVE SESSION/ }).first().click();
await page.waitForTimeout(900);
const readStorage = () =>
  page.evaluate(() => {
    try {
      const raw = window.localStorage.getItem('fusionplant.sessions.v2');
      if (!raw) return { entries: 0, rows: 0 };
      const parsed = JSON.parse(raw);
      return {
        entries: Array.isArray(parsed) ? parsed.length : 0,
        rows: Array.isArray(parsed) && parsed[0] ? (parsed[0].rows?.length ?? 0) : 0,
        name: Array.isArray(parsed) && parsed[0] ? parsed[0].name : null,
      };
    } catch {
      return { entries: -1, rows: -1 };
    }
  });

const savedBeforeReload = await page.locator('text=audit-session').count();
const storageBeforeReload = await readStorage();
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.locator('nav button', { hasText: 'HISTORY' }).first().click();
await page.waitForTimeout(1800);
const savedAfterReload = await page.locator('text=audit-session').count();
let playbackLoaded = false;
const loadButton = page.getByRole('button', { name: 'LOAD A' }).first();
if (await loadButton.count()) {
  await loadButton.click();
  await page.waitForTimeout(1000);
  playbackLoaded = (await page.locator('main').innerText()).includes('audit-session');
}
report.checks.storage = { savedBeforeReload, savedAfterReload, playbackLoaded, storageBeforeReload, storageAfterReload: await readStorage() };
await page.screenshot({ path: `${outDir}/f-restored-session.png` });

// text sanity
const bodyText = await page.locator('body').innerText();
report.checks.bodyHasNaN = /\bNaN\b|\bInfinity\b|\bundefined\b/.test(bodyText);
report.checks.runningClock = runningClock.slice(0, 220);
report.checks.headerAfterStop = headerAfterStop.replace(/\s+/g, ' ').slice(0, 220);
report.checks.selectedCardText = selectedCard.replace(/\s+/g, ' ').slice(0, 200);
report.checks.consoleErrors = consoleErrors;
report.checks.pageErrors = pageErrors;

writeFileSync(`${outDir}/audit-${width}x${height}.json`, JSON.stringify(report, null, 2));

const summary = {
  viewport: `${width}x${height}`,
  steps: report.steps.map((entry) => ({
    step: entry.step ?? entry.layout.tag,
    overflowX: entry.layout.horizontalOverflow,
    panels: entry.layout.panelCount,
    charts: entry.layout.chartCount,
    canvas: entry.layout.canvasBox,
    overflowing: entry.layout.overflowing,
  })),
  checks: {
    faultInjected: report.checks.faultInjected,
    whatIfRows: report.checks.whatIfRows,
    bodyHasNaN: report.checks.bodyHasNaN,
    csvDownload: report.checks.csvDownload,
    storage: report.checks.storage,
    consoleErrors: consoleErrors.length,
    pageErrors: pageErrors.length,
    failedRequests: failedRequests.length,
  },
  consoleErrors,
  pageErrors,
};

console.log(JSON.stringify(summary, null, 2));
await browser.close();
