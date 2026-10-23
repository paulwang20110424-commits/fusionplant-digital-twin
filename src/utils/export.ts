import type { AlarmRecord, EventRecord, HistorySample, PersistedSession } from '@/types/simulation';

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

/**
 * Build a CSV document from history samples.
 * Header includes the unit for every channel; undefined gains are left empty.
 */
export function samplesToCSV(samples: HistorySample[], metadata?: Record<string, string>): string {
  const lines: string[] = [];
  if (metadata) {
    lines.push(`# FusionPlant Digital Twin export — SIMULATED DATA, not a real experiment`);
    for (const [key, value] of Object.entries(metadata)) {
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

/** Build the JSON payload for a session export (history + events + alarms + config). */
export function sessionToJSON(session: PersistedSession): string {
  return JSON.stringify(
    {
      application: 'FusionPlant Digital Twin',
      disclaimer:
        'All values are produced by a local simplified simulation for education and software validation. No real fusion device is connected and no measurement or control action is represented.',
      exportVersion: 1,
      exportedAt: new Date().toISOString(),
      session: {
        ...session,
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
