/**
 * Engine-facing types. Kept separate from the UI-facing domain types so the
 * simulation layer can be imported on its own (tests, headless runs, workers).
 */
import type { AlarmRecord, EventRecord, HistorySample } from './simulation';

export interface EngineHooks {
  /** Called whenever the engine records a history sample. */
  onSample?: (sample: HistorySample) => void;
  /** Called for every operator/simulation event worth logging. */
  onEvent?: (event: EventRecord) => void;
  /** Called when alarms are raised or cleared. */
  onAlarms?: (raised: AlarmRecord[], cleared: AlarmRecord[]) => void;
}

export * from './simulation';
