import type {
  AlarmRecord,
  EventRecord,
  HistorySample,
  PersistedSession,
  SessionMeta,
} from '@/types/simulation';
import { APP_NAME, APP_VERSION, EXPORT_SCHEMA_VERSION, MODEL_VERSION } from '@/config/version';

/** Column definitions used for CSV export: channel, header label, formatter. */
export const CSV_COLUMNS: Array<{ key: keyof HistorySample; header: string; digits?: number }> = [
  { key: 't', header: 'sim_time_s', digits: 2 },
  { key: 'temperature', header: 'plasma_temperature_keV', digits: 4 },
  { key: 'density', header: 'electron_density_m-3', digits: 0 },
  { key: 'current', header: 'plasma_current_MA', digits: 4 },
  { key: 'pressure', header: 'plasma_pressure_kPa', digits: 3 },
  { key: 'storedEnergy', header: 'plasma_energy_MJ', digits: 3 },
  { key: 'confinementTime', header: 'confinement_time_s', digits: 4 },
  { key: 'fusionPower', header: 'fusion_power_MW', digits: 3 },
  { key: 'heatingPower', header: 'aux_heating_MW', digits: 3 },
  { key: 'alphaPower', header: 'alpha_power_MW', digits: 3 },
  { key: 'qPlasma', header: 'q_plasma', digits: 4 },
  { key: 'qEngineering', header: 'q_engineering', digits: 4 },
  { key: 'toroidalField', header: 'toroidal_field_T', digits: 4 },
  { key: 'poloidalField', header: 'poloidal_field_T', digits: 4 },
  { key: 'coilCurrent', header: 'coil_current_kA', digits: 3 },
  { key: 'coilTemperature', header: 'coil_temperature_K', digits: 3 },
  { key: 'fieldStability', header: 'field_quality', digits: 4 },
  { key: 'coolantIn', header: 'coolant_inlet_C', digits: 3 },
  { key: 'coolantOut', header: 'coolant_outlet_C', digits: 3 },
  { key: 'coolantFlow', header: 'coolant_flow_kg_s', digits: 1 },
  { key: 'heatExchangerLoad', header: 'heat_exchanger_load_pct', digits: 2 },
  { key: 'thermalPower', header: 'thermal_power_MW', digits: 3 },
  { key: 'electricalOutput', header: 'electrical_output_MW', digits: 3 },
  { key: 'plantAuxiliary', header: 'plant_auxiliary_MW', digits: 3 },
  { key: 'netElectric', header: 'net_electric_MW', digits: 3 },
  { key: 'stability', header: 'stability_index', digits: 4 },
  { key: 'betaN', header: 'beta_N', digits: 4 },
  { key: 'greenwald', header: 'greenwald_fraction', digits: 4 },
  { key: 'vacuumPressure', header: 'vacuum_pressure_Pa', digits: 10 },
  { key: 'cryoLoad', header: 'cryo_load_pct', digits: 3 },
];

const csvCell = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return String(value);
  }
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** Provenance metadata attached to every export. */
export interface ExportMetadata {
  appVersion: string;
  modelVersion: string;
  exportSchemaVersion: number;
  exportedAt: string;
  runId?: string;
  randomSeed?: number;
  scenario?: string;
  timeScale?: number;
  dataClassification: string;
  [key: string]: string | number | undefined;
}

/** Build the standard metadata block for a CSV or JSON export. */
export function buildExportMetadata(
  source: Partial<{
    runId: string;
    randomSeed: number;
    scenario: string;
    timeScale: number;
    appVersion: string;
    modelVersion: string;
  }> = {},
  extra: Record<string, string | number | undefined> = {},
): ExportMetadata {
  return {
    appVersion: source.appVersion ?? APP_VERSION,
    modelVersion: source.modelVersion ?? MODEL_VERSION,
    exportSchemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    runId: source.runId,
    randomSeed: source.randomSeed,
    scenario: source.scenario,
    timeScale: source.timeScale,
    dataClassification: 'SIMULATED / DEMO DATA — NOT A REAL EXPERIMENT',
    ...extra,
  };
}

/**
 * Build a CSV document from history samples.
 * Header includes the unit for every channel; undefined gains are left empty.
 */
export function samplesToCSV(
  samples: HistorySample[],
  metadata?: ExportMetadata | Record<string, string>,
): string {
  const lines: string[] = [];
  if (metadata) {
    lines.push(`# ${APP_NAME} export — SIMULATED DATA, not a real experiment`);
    for (const [key, value] of Object.entries(metadata)) {
      if (value === undefined) continue;
      lines.push(`# ${key}: ${value}`);
    }
  }
  lines.push(CSV_COLUMNS.map((column) => column.header).join(','));
  for (const sample of samples) {
    const row = CSV_COLUMNS.map((column) => {
      const raw = sample[column.key];
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        return csvCell(column.digits !== undefined ? Number(raw.toFixed(column.digits)) : raw);
      }
      return csvCell(raw);
    });
    lines.push(row.join(','));
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Build the JSON payload for a session export.
 *
 * Schema history:
 *   v1     (v1.0.0)  { application, disclaimer, exportVersion, exportedAt, session }
 *   v1.2.0           adds appVersion / modelVersion / exportSchemaVersion / runId /
 *                    randomSeed / scenario / timeScale — all additive, schema stays 1.
 */
export function sessionToJSON(session: PersistedSession): string {
  const startedAt = session.startedAt ?? new Date(session.createdAt).toISOString();
  const meta = buildExportMetadata({
    runId: session.runId,
    randomSeed: session.randomSeed ?? session.config?.seed,
    scenario: session.scenarioName,
    timeScale: session.timeScale ?? session.config?.timeScale,
    appVersion: session.appVersion ?? APP_VERSION,
    modelVersion: session.modelVersion ?? MODEL_VERSION,
  });

  return JSON.stringify(
    {
      application: APP_NAME,
      disclaimer:
        'All values are produced by a local simplified simulation for education and software validation. ' +
        'No real fusion device is connected and no measurement or control action is represented.',
      appVersion: meta.appVersion,
      modelVersion: meta.modelVersion,
      exportSchemaVersion: meta.exportSchemaVersion,
      /** Legacy alias kept so v1.0.0 readers can still parse the file. */
      exportVersion: 1,
      exportedAt: meta.exportedAt,
      runId: meta.runId,
      randomSeed: meta.randomSeed,
      scenario: meta.scenario,
      timeScale: meta.timeScale,
      startedAt,
      durationS: session.durationS,
      sampleCount: session.sampleCount,
      session: {
        ...session,
        appVersion: meta.appVersion,
        modelVersion: meta.modelVersion,
        randomSeed: meta.randomSeed,
        runId: meta.runId,
        timeScale: meta.timeScale,
        startedAt,
        events: session.events,
        alarms: session.alarms,
      },
    },
    null,
    2,
  );
}

export function eventsToCSV(events: EventRecord[]): string {
  const header = 'sim_time_s,wall_time_ms,category,level,message,detail';
  const rows = events.map((event) =>
    [event.tS.toFixed(2), event.wallMs, event.category, event.level, event.message, event.detail ?? '']
      .map(csvCell)
      .join(','),
  );
  return `${header}\n${rows.join('\n')}\n`;
}

export function alarmsToCSV(alarms: AlarmRecord[]): string {
  const header = 'rule_id,level,source,message,value,raised_at_s,cleared_at_s,active';
  const rows = alarms.map((alarm) =>
    [
      alarm.ruleId,
      alarm.level,
      alarm.source,
      alarm.message,
      alarm.value,
      alarm.raisedAtS.toFixed(2),
      alarm.clearedAtS === null ? '' : alarm.clearedAtS.toFixed(2),
      String(alarm.active),
    ]
      .map(csvCell)
      .join(','),
  );
  return `${header}\n${rows.join('\n')}\n`;
}

/** Trigger a browser download for generated text content. */
export function downloadTextFile(filename: string, content: string, mime = 'text/plain'): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Release the object URL on the next frame so the download can start.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function timestampSlug(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(
    date.getMinutes(),
  )}${pad(date.getSeconds())}`;
}

export function scenarioSlug(scenario: string | undefined): string {
  return (
    (scenario ?? 'scenario')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 24) || 'scenario'
  );
}

/**
 * File names always carry the run identity, scenario, timestamp and app version
 * so a downloaded file can be traced back to the exact run that produced it.
 */
export function buildExportFileName(
  kind: 'session' | 'history' | 'events' | 'whatif',
  meta: { runId?: string; scenario?: string; appVersion?: string },
  extension: 'json' | 'csv',
  date = new Date(),
): string {
  const parts = ['fusionplant', kind, scenarioSlug(meta.scenario)];
  if (meta.runId) parts.push(meta.runId.replace(/[^A-Za-z0-9-]/g, ''));
  parts.push(timestampSlug(date), `v${meta.appVersion ?? APP_VERSION}`);
  return `${parts.join('-')}.${extension}`;
}

/* ------------------------------------------------------------------ */
/* Session import                                                      */
/* ------------------------------------------------------------------ */

export type ImportCompatibility = 'current' | 'legacy' | 'incompatible';

export interface ParsedSessionExport {
  ok: boolean;
  error?: string;
  warnings: string[];
  compatibility: ImportCompatibility;
  schemaVersion: number | null;
  appVersion?: string;
  modelVersion?: string;
  session: PersistedSession | null;
}

const asNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

/**
 * Parse and validate an exported session file.
 *
 * - accepts both the v1.0.0 layout (no schema metadata) and the v1.2.0 layout
 * - ignores unknown fields (forward compatible)
 * - fills missing optional fields with safe defaults
 * - refuses a schema newer than this build instead of replaying it incorrectly
 */
export function parseSessionExport(text: string): ParsedSessionExport {
  const warnings: string[] = [];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return {
      ok: false,
      error: 'The file is not valid JSON.',
      warnings,
      compatibility: 'incompatible',
      schemaVersion: null,
      session: null,
    };
  }

  if (!raw || typeof raw !== 'object') {
    return {
      ok: false,
      error: 'The file does not contain a session object.',
      warnings,
      compatibility: 'incompatible',
      schemaVersion: null,
      session: null,
    };
  }

  const root = raw as Record<string, unknown>;
  const schemaVersion = asNumber(root.exportSchemaVersion) ?? asNumber(root.exportVersion) ?? null;
  const appVersion = asString(root.appVersion);
  const modelVersion = asString(root.modelVersion);

  if (schemaVersion !== null && schemaVersion > EXPORT_SCHEMA_VERSION) {
    return {
      ok: false,
      error:
        `This file uses export schema ${schemaVersion}, but this build understands schema ` +
        `${EXPORT_SCHEMA_VERSION}. Update the application before importing it.`,
      warnings,
      compatibility: 'incompatible',
      schemaVersion,
      appVersion,
      modelVersion,
      session: null,
    };
  }

  // v1.0.0 wraps the payload in `session`; accept a bare session object too.
  const candidate =
    root.session && typeof root.session === 'object' ? (root.session as Record<string, unknown>) : root;

  const samplesRaw = candidate.samples;
  if (!Array.isArray(samplesRaw) || samplesRaw.length === 0) {
    return {
      ok: false,
      error: 'The file contains no history samples.',
      warnings,
      compatibility: 'incompatible',
      schemaVersion,
      appVersion,
      modelVersion,
      session: null,
    };
  }

  const samples: HistorySample[] = [];
  let droppedSamples = 0;
  for (const entry of samplesRaw) {
    if (!entry || typeof entry !== 'object') {
      droppedSamples += 1;
      continue;
    }
    const record = entry as Record<string, unknown>;
    const t = asNumber(record.t);
    if (t === null) {
      droppedSamples += 1;
      continue;
    }
    // Unknown channels are ignored; missing channels become 0 rather than NaN.
    const sample = { ...record, t } as unknown as HistorySample;
    for (const column of CSV_COLUMNS) {
      if (column.key === 'qPlasma' || column.key === 'qEngineering') continue;
      const value = record[column.key];
      (sample as unknown as Record<string, number>)[column.key] = asNumber(value) ?? 0;
    }
    sample.qPlasma = asNumber(record.qPlasma);
    sample.qEngineering = asNumber(record.qEngineering);
    sample.wallMs = asNumber(record.wallMs) ?? 0;
    samples.push(sample);
  }

  if (droppedSamples > 0) {
    warnings.push(`${droppedSamples} malformed sample row(s) were skipped.`);
  }
  if (samples.length === 0) {
    return {
      ok: false,
      error: 'No readable history samples were found in the file.',
      warnings,
      compatibility: 'incompatible',
      schemaVersion,
      appVersion,
      modelVersion,
      session: null,
    };
  }

  if (!appVersion) warnings.push('File has no appVersion; assuming a v1.0.0 export.');
  if (!modelVersion) warnings.push('File has no modelVersion; assuming model 1.0.0.');

  const scenarioName = asString(candidate.scenarioName) ?? asString(root.scenario) ?? 'Imported run';
  const createdAt = asNumber(candidate.createdAt) ?? Date.now();
  const durationS = asNumber(candidate.durationS) ?? samples[samples.length - 1].t - samples[0].t;

  const session: PersistedSession = {
    id: asString(candidate.id) ?? `imported-${createdAt}`,
    name: asString(candidate.name) ?? 'Imported session',
    createdAt,
    scenarioName,
    samples,
    events: Array.isArray(candidate.events) ? (candidate.events as PersistedSession['events']) : [],
    alarms: Array.isArray(candidate.alarms) ? (candidate.alarms as PersistedSession['alarms']) : [],
    controls: (candidate.controls as PersistedSession['controls']) ?? null,
    config: (candidate.config as PersistedSession['config']) ?? null,
    durationS,
    sampleCount: samples.length,
    approxBytes: Math.max(0, text.length),
    runId: asString(candidate.runId) ?? asString(root.runId),
    randomSeed: asNumber(candidate.randomSeed) ?? asNumber(root.randomSeed) ?? undefined,
    appVersion: appVersion ?? '1.0.0',
    modelVersion: modelVersion ?? '1.0.0',
    initialConditions: (candidate.initialConditions as PersistedSession['initialConditions']) ?? undefined,
    faults: Array.isArray(candidate.faults) ? (candidate.faults as PersistedSession['faults']) : [],
    timeScale: asNumber(candidate.timeScale) ?? asNumber(root.timeScale) ?? undefined,
    startedAt: asString(candidate.startedAt) ?? asString(root.startedAt),
  };

  if (!session.controls) warnings.push('File has no control setpoints; defaults will be used.');
  if (!session.randomSeed) warnings.push('File has no random seed; the run cannot be re-executed exactly.');

  const compatibility: ImportCompatibility = schemaVersion === null || !appVersion ? 'legacy' : 'current';

  return {
    ok: true,
    warnings,
    compatibility,
    schemaVersion,
    appVersion,
    modelVersion,
    session,
  };
}

/** Convert a meta record into a session-shaped object for the history list. */
export function sessionMetaFromSession(session: PersistedSession): SessionMeta {
  return {
    id: session.id,
    name: session.name,
    createdAt: session.createdAt,
    scenarioName: session.scenarioName,
    sampleCount: session.sampleCount,
    durationS: session.durationS,
    approxBytes: session.approxBytes,
    runId: session.runId,
    randomSeed: session.randomSeed,
    appVersion: session.appVersion,
    modelVersion: session.modelVersion,
  };
}
