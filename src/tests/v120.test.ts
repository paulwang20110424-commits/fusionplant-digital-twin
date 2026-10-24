import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  APP_VERSION,
  EXPORT_SCHEMA_VERSION,
  MODEL_VERSION,
  RELEASE_NAME,
  VERSION_LABEL,
} from '@/config/version';
import {
  buildExportFileName,
  parseSessionExport,
  sessionToJSON,
  samplesToCSV,
  buildExportMetadata,
} from '@/utils/export';
import { bucketAlarms, alarmSummaryText } from '@/utils/alarms';
import { computeTrendDelta, formatTrendDelta, scaleChannelValue } from '@/utils/trend';
import {
  createSeededRandom,
  generateRunId,
  normalizeSeed,
  parseSeed,
  DEFAULT_SEED,
} from '@/simulation/random';
import type { AlarmRecord, HistorySample, PersistedSession } from '@/types/simulation';
import { DEFAULT_CONFIG, DEFAULT_CONTROLS, INITIAL_CONDITIONS_DEFAULT } from '@/simulation/controlSpecs';

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

const sample = (t: number): HistorySample => ({
  t,
  wallMs: 1_700_000_000_000,
  temperature: 7.4,
  density: 1.05e20,
  current: 15,
  pressure: 320,
  storedEnergy: 380,
  fusionPower: 220,
  heatingPower: 49.5,
  alphaPower: 44,
  qPlasma: 4.4,
  qEngineering: -0.46,
  toroidalField: 5.3,
  poloidalField: 1.5,
  coilCurrent: 68,
  coilTemperature: 5.2,
  fieldStability: 0.97,
  coolantIn: 240,
  coolantOut: 248,
  coolantFlow: 12000,
  thermalPower: 350,
  electricalOutput: 115,
  plantAuxiliary: 214,
  netElectric: -99,
  stability: 0.87,
  betaN: 1.6,
  greenwald: 0.86,
  heatExchangerLoad: 50,
  vacuumPressure: 4e-6,
  cryoLoad: 61,
  confinementTime: 4.2,
});

const makeSession = (): PersistedSession => ({
  id: 'test-session',
  name: 'v1.2.0 test',
  createdAt: 1_700_000_000_000,
  scenarioName: 'Baseline Scenario',
  samples: [sample(0), sample(0.5), sample(1)],
  events: [],
  alarms: [],
  controls: DEFAULT_CONTROLS,
  config: DEFAULT_CONFIG,
  durationS: 1,
  sampleCount: 3,
  approxBytes: 100,
  runId: 'FUS-20260101-TEST',
  randomSeed: 20260101,
  appVersion: APP_VERSION,
  modelVersion: MODEL_VERSION,
  initialConditions: INITIAL_CONDITIONS_DEFAULT,
  faults: [],
  timeScale: 2,
  startedAt: '2026-10-23T00:00:00.000Z',
});

/* ------------------------------------------------------------------ */
/* A. version baseline                                                 */
/* ------------------------------------------------------------------ */

describe('v1.2.0 — version baseline', () => {
  it('package.json is 1.2.0 and matches the app constant', () => {
    expect(pkg.version).toBe('1.2.0');
    expect(APP_VERSION).toBe('1.2.0');
    expect(VERSION_LABEL).toContain('v1.2.0');
    expect(RELEASE_NAME.length).toBeGreaterThan(0);
  });

  it('model version is a semver triple and independent of the app version', () => {
    expect(MODEL_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('export schema stays at 1 because v1.2.0 only adds optional fields', () => {
    expect(EXPORT_SCHEMA_VERSION).toBe(1);
  });

  it('JSON export carries appVersion, modelVersion, schema, seed, scenario and timeScale', () => {
    const parsed = JSON.parse(sessionToJSON(makeSession()));
    expect(parsed.appVersion).toBe('1.2.0');
    expect(parsed.modelVersion).toBe(MODEL_VERSION);
    expect(parsed.exportSchemaVersion).toBe(1);
    expect(parsed.exportVersion).toBe(1); // legacy alias retained
    expect(parsed.randomSeed).toBe(20260101);
    expect(parsed.scenario).toBe('Baseline Scenario');
    expect(parsed.timeScale).toBe(2);
    expect(parsed.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(parsed.session.appVersion).toBe('1.2.0');
    expect(parsed.session.samples).toHaveLength(3);
  });

  it('CSV metadata also carries the provenance block', () => {
    const meta = buildExportMetadata({
      runId: 'FUS-1-ABC',
      randomSeed: 7,
      scenario: 'Baseline Scenario',
      timeScale: 2,
    });
    const csv = samplesToCSV([sample(0)], meta);
    expect(csv).toContain('# appVersion: 1.2.0');
    expect(csv).toContain('# modelVersion: ' + MODEL_VERSION);
    expect(csv).toContain('# exportSchemaVersion: 1');
    expect(csv).toContain('# randomSeed: 7');
    expect(csv).toContain('# scenario: Baseline Scenario');
    expect(csv).toContain('# timeScale: 2');
    expect(csv).toContain('# dataClassification: SIMULATED');
  });

  it('file names carry run id, scenario, timestamp and version', () => {
    const name = buildExportFileName(
      'session',
      { runId: 'FUS-20260101-XYZ', scenario: 'Cooling Stress Test' },
      'json',
      new Date('2026-10-23T10:20:30'),
    );
    expect(name).toContain('fusionplant-session');
    expect(name).toContain('cooling-stress-test');
    expect(name).toContain('FUS-20260101-XYZ');
    expect(name).toContain('20261023-102030');
    expect(name).toContain('v1.2.0');
    expect(name.endsWith('.json')).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* B. trend units                                                      */
/* ------------------------------------------------------------------ */

describe('v1.2.0 — KPI trend units', () => {
  it('density delta is computed in 1e19 m^-3, not in raw m^-3', () => {
    const latest = 1.064e20;
    const reference = 1.05e20;
    // This is exactly the old bug: raw m^-3 produces an enormous number.
    expect(computeTrendDelta(latest, reference)).toBeCloseTo(1.4e18, 0);
    const scaled = computeTrendDelta(latest, reference, 1e-19);
    expect(scaled).toBeCloseTo(0.14, 6);
    expect(formatTrendDelta(scaled, { digits: 2, unit: '×10¹⁹' })).toBe('+0.14 ×10¹⁹');
  });

  it('stability delta is expressed in percentage points', () => {
    const delta = computeTrendDelta(0.864, 0.887, 100);
    expect(delta).toBeCloseTo(-2.3, 6);
    expect(formatTrendDelta(delta, { digits: 1, unit: '%' })).toBe('-2.3 %');
  });

  it('never renders the raw m^-3 magnitude for a scaled tile', () => {
    const text = formatTrendDelta(computeTrendDelta(1.064e20, 1.05e20, 1e-19), { digits: 2 });
    expect(text).not.toMatch(/e\+?1[0-9]/i);
    expect(Math.abs(Number(text))).toBeLessThan(100);
  });

  it('renders N/A for null, undefined, NaN and Infinity', () => {
    expect(computeTrendDelta(null, 1)).toBeNull();
    expect(computeTrendDelta(1, undefined)).toBeNull();
    expect(computeTrendDelta(Number.NaN, 1)).toBeNull();
    expect(computeTrendDelta(Number.POSITIVE_INFINITY, 1)).toBeNull();
    expect(computeTrendDelta(1, 2, 0)).toBeNull();
    expect(formatTrendDelta(null)).toBe('N/A');
    expect(formatTrendDelta(Number.NaN)).toBe('N/A');
    expect(formatTrendDelta(Number.POSITIVE_INFINITY)).toBe('N/A');
  });

  it('keeps the previous behaviour when no scale is supplied', () => {
    expect(computeTrendDelta(10, 8)).toBe(2);
    expect(scaleChannelValue(10)).toBe(10);
    expect(formatTrendDelta(2)).toBe('+2.0');
  });

  it('guards absurd magnitudes with a compact format', () => {
    expect(formatTrendDelta(1.5e17)).toMatch(/e\+/);
  });
});

/* ------------------------------------------------------------------ */
/* C. alarm semantics                                                  */
/* ------------------------------------------------------------------ */

const alarm = (id: string, level: AlarmRecord['level'], active = true): AlarmRecord => ({
  id,
  ruleId: `rule-${id}`,
  level,
  source: 'POWER',
  message: `${level} test`,
  value: '1',
  raisedAtS: 1,
  clearedAtS: active ? null : 2,
  active,
});

describe('v1.2.0 — alarm semantics', () => {
  it('INFO is a notice, not an alarm', () => {
    const buckets = bucketAlarms([alarm('a', 'INFO')]);
    expect(buckets.alarmCount).toBe(0);
    expect(buckets.noticeCount).toBe(1);
    expect(buckets.worstLevel).toBe('INFO');
    expect(buckets.criticals).toHaveLength(0);
    expect(buckets.warnings).toHaveLength(0);
  });

  it('WARNING counts as an alarm', () => {
    const buckets = bucketAlarms([alarm('b', 'WARNING'), alarm('c', 'INFO')]);
    expect(buckets.alarmCount).toBe(1);
    expect(buckets.warnings).toHaveLength(1);
    expect(buckets.noticeCount).toBe(1);
  });

  it('CRITICAL counts as an alarm and dominates the worst level', () => {
    const buckets = bucketAlarms([alarm('d', 'CRITICAL'), alarm('e', 'WARNING'), alarm('f', 'INFO')]);
    expect(buckets.alarmCount).toBe(2);
    expect(buckets.criticals).toHaveLength(1);
    expect(buckets.worstLevel).toBe('CRITICAL');
    expect(alarmSummaryText(buckets)).toBe('2 active alarms, 1 active notice');
  });

  it('cleared records are excluded from every bucket', () => {
    const buckets = bucketAlarms([alarm('g', 'CRITICAL', false), alarm('h', 'INFO', false)]);
    expect(buckets.alarmCount).toBe(0);
    expect(buckets.noticeCount).toBe(0);
    expect(buckets.active).toHaveLength(0);
    expect(buckets.worstLevel).toBeNull();
  });

  it('empty and malformed input is safe', () => {
    expect(bucketAlarms([]).alarmCount).toBe(0);
    expect(bucketAlarms(null).noticeCount).toBe(0);
    expect(bucketAlarms(undefined).active).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* H. reproducibility                                                  */
/* ------------------------------------------------------------------ */

describe('v1.2.0 — seeds and reproducibility', () => {
  it('normalises seeds safely', () => {
    expect(normalizeSeed(42)).toBe(42);
    expect(normalizeSeed('42')).toBe(42);
    expect(normalizeSeed(0)).toBe(1);
    expect(normalizeSeed(-17)).toBe(1);
    expect(normalizeSeed(1e12)).toBe(2147483647);
    expect(normalizeSeed(Number.NaN)).toBe(DEFAULT_SEED);
    expect(normalizeSeed(undefined)).toBe(DEFAULT_SEED);
    expect(parseSeed('12345')).toBe(12345);
    expect(parseSeed('abc')).toBeNull();
  });

  it('the same seed produces the same sequence', () => {
    const a = createSeededRandom(20260101);
    const b = createSeededRandom(20260101);
    const c = createSeededRandom(999);
    const sequenceA = Array.from({ length: 8 }, () => a());
    const sequenceB = Array.from({ length: 8 }, () => b());
    const sequenceC = Array.from({ length: 8 }, () => c());
    expect(sequenceA).toEqual(sequenceB);
    expect(sequenceA).not.toEqual(sequenceC);
  });

  it('run ids are stable for a seed and timestamp', () => {
    expect(generateRunId(42, 1_700_000_000_000)).toBe(generateRunId(42, 1_700_000_000_000));
    expect(generateRunId(42, 1_700_000_000_000)).toMatch(/^FUS-42-[0-9A-Z]+$/);
    expect(generateRunId(43, 1_700_000_000_000)).not.toBe(generateRunId(42, 1_700_000_000_000));
  });
});

/* ------------------------------------------------------------------ */
/* I. export / import round trip                                       */
/* ------------------------------------------------------------------ */

describe('v1.2.0 — session import', () => {
  it('round-trips a v1.2.0 export', () => {
    const json = sessionToJSON(makeSession());
    const parsed = parseSessionExport(json);
    expect(parsed.ok).toBe(true);
    expect(parsed.compatibility).toBe('current');
    expect(parsed.appVersion).toBe('1.2.0');
    expect(parsed.session?.samples).toHaveLength(3);
    expect(parsed.session?.randomSeed).toBe(20260101);
    expect(parsed.session?.runId).toBe('FUS-20260101-TEST');
    expect(parsed.warnings).toHaveLength(0);
  });

  it('reads a legacy v1.0.0 file without version metadata', () => {
    const legacy = {
      application: 'FusionPlant Digital Twin',
      disclaimer: 'simulated',
      exportVersion: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      session: {
        id: 'old',
        name: 'old run',
        createdAt: 1_700_000_000_000,
        scenarioName: 'Baseline Scenario',
        samples: [sample(0), sample(0.5)],
        events: [],
        alarms: [],
        controls: DEFAULT_CONTROLS,
        config: DEFAULT_CONFIG,
        durationS: 0.5,
        sampleCount: 2,
        approxBytes: 10,
      },
    };
    const parsed = parseSessionExport(JSON.stringify(legacy));
    expect(parsed.ok).toBe(true);
    expect(parsed.compatibility).toBe('legacy');
    expect(parsed.session?.samples).toHaveLength(2);
    expect(parsed.session?.appVersion).toBe('1.0.0');
    expect(parsed.warnings.length).toBeGreaterThan(0);
  });

  it('refuses a newer export schema instead of replaying it incorrectly', () => {
    const future = { exportSchemaVersion: 99, session: { samples: [sample(0)] } };
    const parsed = parseSessionExport(JSON.stringify(future));
    expect(parsed.ok).toBe(false);
    expect(parsed.compatibility).toBe('incompatible');
    expect(parsed.error).toContain('schema 99');
  });

  it('reports malformed input clearly', () => {
    expect(parseSessionExport('not json').ok).toBe(false);
    expect(parseSessionExport('{"session":{}}').ok).toBe(false);
    const parsed = parseSessionExport(
      JSON.stringify({ session: { samples: [sample(0), { broken: true }] } }),
    );
    expect(parsed.ok).toBe(true);
    expect(parsed.warnings.some((warning) => warning.includes('skipped'))).toBe(true);
  });
});
