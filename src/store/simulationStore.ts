import { create } from 'zustand';
import type {
  AlarmRecord,
  ComparisonRow,
  ControlInputs,
  EventRecord,
  FaultInstance,
  FaultKind,
  InitialConditions,
  PersistedSession,
  ReactorComponentId,
  ReactorViewMode,
  ScenarioId,
  ScenarioPreset,
  SessionMeta,
  SimConfig,
  SimFrame,
  WhatIfResult,
} from '@/types/simulation';
import { FusionSimulationEngine } from '@/simulation/FusionSimulationEngine';
import { DEFAULT_CONFIG, DEFAULT_CONTROLS, SCENARIO_DEFINITIONS } from '@/simulation/controlSpecs';
import { getScenario, runScenario, compareScenarios } from '@/simulation/scenarios';
import { validateConfig, validateControl } from '@/utils/validation';
import {
  historyBuffer,
  deleteSession as removeStoredSession,
  listSessions,
  loadSession,
  renameSession as renameStoredSession,
  saveSession as persistSession,
  storageUsage,
} from './historyBuffer';
import { CHART_HZ, HISTORY_CAPACITY, PUBLISH_HZ } from '@/simulation/constants';
import { APP_VERSION, MODEL_VERSION } from '@/config/version';
import { HistoryBuffer } from './historyBuffer';

export type PageId =
  | 'OVERVIEW'
  | 'REACTOR'
  | 'MAGNETIC'
  | 'HEATING'
  | 'COOLING'
  | 'POWER'
  | 'DIAGNOSTICS'
  | 'SIMULATION'
  | 'HISTORY';

export interface Toast {
  id: number;
  message: string;
  level: 'info' | 'warning' | 'critical' | 'success';
}

export interface ChartWindow {
  seconds: number;
  label: string;
}

export const CHART_WINDOWS: ChartWindow[] = [
  { seconds: 30, label: '30 s' },
  { seconds: 60, label: '1 min' },
  { seconds: 300, label: '5 min' },
];

const PRESET_KEY = 'fusionplant.presets.v1';

function loadPresets(): ScenarioPreset[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = window.localStorage.getItem(PRESET_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ScenarioPreset[]) : [];
  } catch {
    return [];
  }
}

function persistPresets(presets: ScenarioPreset[]): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(PRESET_KEY, JSON.stringify(presets.slice(0, 20)));
    }
  } catch {
    /* preset storage is best-effort */
  }
}

/** Live engine. Exported for the 3D renderer, which reads it without subscribing. */
export const simulationEngine = new FusionSimulationEngine({
  hooks: {
    onSample: (sample) => {
      historyBuffer.push(sample);
    },
    onEvent: (event) => {
      useSimulationStore.getState().appendEvent(event);
    },
  },
});

let toastSequence = 0;

export interface SimulationStore {
  /* live snapshot */
  frame: SimFrame;
  chartEpoch: number;
  sampleCount: number;
  events: EventRecord[];
  alarms: AlarmRecord[];
  faults: FaultInstance[];
  raisedAlarms: number;

  /* ui */
  activePage: PageId;
  selectedComponent: ReactorComponentId;
  reactorView: ReactorViewMode;
  showFieldLines: boolean;
  showLabels: boolean;
  hiddenStructures: ReactorComponentId[];
  chartWindowSec: number;
  chartsPaused: boolean;
  faultInjectionPaused: boolean;
  fullscreen: boolean;
  /**
   * Armed while the configured run duration may still auto-pause the experiment.
   * It fires once, then disarms, so an explicit resume continues past the cap
   * instead of being trapped by it.
   */
  autoPauseArmed: boolean;

  /* scenarios + lab */
  scenarioId: ScenarioId;
  presets: ScenarioPreset[];
  whatIfBaseline: WhatIfResult | null;
  whatIfVariant: WhatIfResult | null;
  whatIfVariantId: ScenarioId;
  comparison: ComparisonRow[];
  whatIfRunning: boolean;
  whatIfError: string | null;

  /* persistence */
  sessions: SessionMeta[];
  storageBytes: number;
  storageAvailable: boolean;

  /* feedback */
  toasts: Toast[];
  lastValidation: string | null;

  /* actions */
  publish: () => void;
  bumpChart: () => void;
  appendEvent: (event: EventRecord) => void;
  pushToast: (message: string, level?: Toast['level']) => void;
  dismissToast: (id: number) => void;

  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  emergencyStop: () => void;

  setControl: (key: keyof ControlInputs, raw: number) => void;
  setConfig: (patch: Partial<SimConfig>) => void;
  setInitialConditions: (patch: Partial<InitialConditions>) => void;
  applyScenario: (id: ScenarioId) => void;

  injectFault: (kind: FaultKind, severity: number) => void;
  clearFault: (id: string) => void;
  clearAllFaults: () => void;
  setFaultInjectionPaused: (paused: boolean) => void;

  savePreset: (name: string) => void;
  loadPreset: (id: string) => void;
  deletePreset: (id: string) => void;
  duplicateScenario: () => void;

  runWhatIf: (variantId: ScenarioId) => Promise<void>;
  clearWhatIf: () => void;

  exportCurrentSession: (name: string) => void;
  refreshSessions: () => void;
  removeSession: (id: string) => void;
  renameSession: (id: string, name: string) => void;
  importSession: (session: PersistedSession) => void;
  readSession: (id: string) => PersistedSession | null;
  reproduceRun: () => void;
  runConfiguration: () => Record<string, unknown>;

  setPage: (page: PageId) => void;
  setSelectedComponent: (id: ReactorComponentId) => void;
  setReactorView: (mode: ReactorViewMode) => void;
  toggleFieldLines: () => void;
  toggleLabels: () => void;
  toggleStructure: (id: ReactorComponentId) => void;
  setAllStructures: (hidden: ReactorComponentId[]) => void;
  setChartWindow: (seconds: number) => void;
  toggleChartsPaused: () => void;
  setFullscreen: (value: boolean) => void;
  clearValidation: () => void;
}

const initialFrame = simulationEngine.snapshot();

export const useSimulationStore = create<SimulationStore>((set, get) => ({
  frame: initialFrame,
  chartEpoch: 0,
  sampleCount: 0,
  events: [],
  alarms: [],
  faults: [],
  raisedAlarms: 0,

  activePage: 'OVERVIEW',
  selectedComponent: 'plasma',
  reactorView: 'FULL',
  showFieldLines: true,
  showLabels: true,
  hiddenStructures: [],
  chartWindowSec: 60,
  chartsPaused: false,
  faultInjectionPaused: false,
  fullscreen: false,
  autoPauseArmed: true,

  scenarioId: 'BASELINE',
  presets: loadPresets(),
  whatIfBaseline: null,
  whatIfVariant: null,
  whatIfVariantId: 'HIGH_HEATING',
  comparison: [],
  whatIfRunning: false,
  whatIfError: null,

  sessions: [],
  storageBytes: 0,
  storageAvailable: false,

  toasts: [],
  lastValidation: null,

  /* ---------------- runtime plumbing ---------------- */

  publish: () => {
    const engine = simulationEngine;
    // Auto-pause when the configured experimental duration is reached.
    if (
      engine.status === 'RUNNING' &&
      engine.simTimeS >= engine.config.runDurationS &&
      get().autoPauseArmed
    ) {
      engine.pause();
      set({ autoPauseArmed: false });
      get().appendEvent({
        id: `evt-complete-${Date.now()}`,
        tS: engine.simTimeS,
        wallMs: Date.now(),
        category: 'PHASE',
        level: 'INFO',
        message: 'Experiment completed — simulated duration reached',
        detail: `${engine.config.runDurationS} s simulated; the run was paused automatically.`,
      });
      get().pushToast(
        `Experiment reached its configured duration (${engine.config.runDurationS} s simulated) — simulation paused.`,
        'info',
      );
    }
    set({
      frame: engine.snapshot(),
      faults: engine.faultHistory().slice(),
      alarms: engine.alarmHistory().slice(),
      raisedAlarms: engine.raisedAlarmCount(),
      sampleCount: historyBuffer.size,
    });
  },

  bumpChart: () => {
    if (!get().chartsPaused) set({ chartEpoch: get().chartEpoch + 1 });
  },

  appendEvent: (event) => {
    const events = [...get().events, event];
    if (events.length > 600) events.splice(0, events.length - 600);
    set({ events });
  },

  pushToast: (message, level = 'info') => {
    const toast: Toast = { id: ++toastSequence, message, level };
    const toasts = [...get().toasts, toast].slice(-3);
    set({ toasts });
    if (typeof window !== 'undefined') {
      setTimeout(() => get().dismissToast(toast.id), 6000);
    }
  },

  dismissToast: (id) => set({ toasts: get().toasts.filter((toast) => toast.id !== id) }),

  /* ---------------- transport ---------------- */

  start: () => {
    const engine = simulationEngine;
    if (engine.status === 'RUNNING') return;
    if (engine.status === 'EMERGENCY_STOP') {
      // A latched emergency stop must be cleared explicitly; starting again
      // re-initialises the plant with the current initial conditions.
      engine.reset(undefined, engine.scenarioName);
      historyBuffer.clear();
      set({ events: [], faults: [], alarms: [], raisedAlarms: 0, sampleCount: 0 });
    }
    engine.start();
    set({ autoPauseArmed: true });
    get().publish();
    get().bumpChart();
  },

  pause: () => {
    simulationEngine.pause();
    get().publish();
  },

  resume: () => {
    const engine = simulationEngine;
    if (engine.status === 'RUNNING') return;
    if (engine.status === 'PAUSED') {
      engine.resume();
      get().publish();
      return;
    }
    // IDLE (or latched SCRAM) — behave like START so the transport button is
    // never a dead control.
    get().start();
  },

  reset: () => {
    const engine = simulationEngine;
    engine.reset(undefined, engine.scenarioName);
    historyBuffer.clear();
    set({
      events: [],
      faults: [],
      alarms: [],
      raisedAlarms: 0,
      sampleCount: 0,
      whatIfBaseline: null,
      whatIfVariant: null,
      comparison: [],
      autoPauseArmed: true,
    });
    get().publish();
    get().bumpChart();
    get().pushToast('Simulation reset to initial conditions.', 'info');
  },

  emergencyStop: () => {
    simulationEngine.emergencyStop();
    simulationEngine.clearAllFaults();
    get().publish();
    get().pushToast('EMERGENCY STOP latched. Simulation halted — reset to re-initialise.', 'critical');
  },

  /* ---------------- parameters ---------------- */

  setControl: (key, raw) => {
    const result = validateControl(key, raw);
    if (!result.valid && result.severity === 'error') {
      set({ lastValidation: result.message ?? 'Invalid value' });
      get().pushToast(result.message ?? 'Invalid value', 'critical');
      return;
    }
    simulationEngine.setControl(key, result.value);
    set({
      scenarioId: get().scenarioId === 'BASELINE' ? 'CUSTOM' : get().scenarioId,
      lastValidation: result.valid ? null : (result.message ?? null),
    });
    if (!result.valid) {
      // Out-of-range values are clamped: tell the operator exactly what happened.
      get().pushToast(result.message ?? 'Value was clamped to the valid range.', 'warning');
    }
    get().publish();
  },

  setConfig: (patch) => {
    const validation = validateConfig(patch, simulationEngine.config);
    simulationEngine.setConfig(validation.config);
    if (patch.runDurationS !== undefined) set({ autoPauseArmed: true });
    set({ lastValidation: validation.errors[0] ?? validation.warnings[0] ?? null });
    if (validation.errors.length) get().pushToast(validation.errors[0], 'critical');
    get().publish();
  },

  setInitialConditions: (patch) => {
    simulationEngine.initial = { ...simulationEngine.initial, ...patch };
    get().appendEvent({
      id: `evt-initial-${Date.now()}`,
      tS: simulationEngine.simTimeS,
      wallMs: Date.now(),
      category: 'CONTROL',
      level: 'INFO',
      message: 'Initial conditions updated',
      detail: `T0=${simulationEngine.initial.temperatureKeV} keV, n0=${(simulationEngine.initial.densityM3 / 1e19).toFixed(2)}e19 m^-3 — applies on next reset`,
    });
    get().publish();
  },

  applyScenario: (id) => {
    const scenario = getScenario(id);
    const engine = simulationEngine;
    engine.reset(scenario.initial, scenario.name);
    engine.setConfig({ ...DEFAULT_CONFIG, ...scenario.config });
    for (const key of Object.keys(scenario.controls) as Array<keyof ControlInputs>) {
      engine.controls[key] = scenario.controls[key];
    }
    historyBuffer.clear();
    set({
      scenarioId: id,
      events: [],
      faults: [],
      alarms: [],
      raisedAlarms: 0,
      sampleCount: 0,
      autoPauseArmed: true,
    });
    get().appendEvent({
      id: `evt-scenario-${Date.now()}`,
      tS: 0,
      wallMs: Date.now(),
      category: 'PRESET',
      level: 'INFO',
      message: `Scenario loaded: ${scenario.name}`,
      detail: scenario.description,
    });
    get().publish();
    get().bumpChart();
    get().pushToast(`Scenario "${scenario.name}" loaded. Press START to run.`, 'success');
  },

  /* ---------------- faults ---------------- */

  injectFault: (kind, severity) => {
    if (get().faultInjectionPaused) {
      get().pushToast('Fault injection is paused. Resume it in the fault panel first.', 'warning');
      return;
    }
    const fault = simulationEngine.injectFault(kind, severity);
    if (!fault) {
      get().pushToast('This fault is already active.', 'warning');
      return;
    }
    get().publish();
    get().pushToast(`Fault injected: ${kind} (severity ${(severity * 100).toFixed(0)}%)`, 'warning');
  },

  clearFault: (id) => {
    simulationEngine.clearFault(id);
    get().publish();
    get().pushToast('Fault cleared.', 'success');
  },

  clearAllFaults: () => {
    simulationEngine.clearAllFaults();
    get().publish();
    get().pushToast('All active faults cleared.', 'success');
  },

  setFaultInjectionPaused: (paused) => {
    set({ faultInjectionPaused: paused });
    simulationEngine.setFaultsSuspended(paused);
    get().publish();
    get().appendEvent({
      id: `evt-faultgate-${Date.now()}`,
      tS: simulationEngine.simTimeS,
      wallMs: Date.now(),
      category: 'FAULT',
      level: 'INFO',
      message: paused ? 'Fault effects suspended (recovery rehearsal)' : 'Fault effects re-enabled',
      detail: paused
        ? 'Active fault records are retained but their physical consequences are not applied.'
        : 'Active faults now affect the simulation again.',
    });
  },

  /* ---------------- presets ---------------- */

  savePreset: (name) => {
    const preset: ScenarioPreset = {
      id: `preset-${Date.now()}`,
      name: name.trim() || `Preset ${get().presets.length + 1}`,
      createdAt: Date.now(),
      controls: { ...simulationEngine.controls },
      config: { ...simulationEngine.config },
      initial: { ...simulationEngine.initial },
      source: get().scenarioId,
    };
    const presets = [preset, ...get().presets].slice(0, 20);
    persistPresets(presets);
    set({ presets });
    get().appendEvent({
      id: `evt-preset-${preset.id}`,
      tS: simulationEngine.simTimeS,
      wallMs: Date.now(),
      category: 'PRESET',
      level: 'INFO',
      message: `Preset saved: ${preset.name}`,
      detail: JSON.stringify(preset.controls),
    });
    get().pushToast(`Preset "${preset.name}" saved.`, 'success');
  },

  loadPreset: (id) => {
    const preset = get().presets.find((entry) => entry.id === id);
    if (!preset) return;
    const engine = simulationEngine;
    engine.reset(preset.initial, preset.name);
    engine.setConfig(preset.config);
    for (const key of Object.keys(preset.controls) as Array<keyof ControlInputs>) {
      engine.controls[key] = preset.controls[key];
    }
    historyBuffer.clear();
    set({ scenarioId: preset.source, events: [], faults: [], alarms: [], sampleCount: 0 });
    get().publish();
    get().bumpChart();
    get().pushToast(`Preset "${preset.name}" loaded.`, 'success');
  },

  deletePreset: (id) => {
    const presets = get().presets.filter((preset) => preset.id !== id);
    persistPresets(presets);
    set({ presets });
  },

  duplicateScenario: () => {
    get().savePreset(`${simulationEngine.scenarioName} copy`);
  },

  /* ---------------- what-if ---------------- */

  runWhatIf: async (variantId) => {
    set({ whatIfRunning: true, whatIfError: null });
    // Yield once so the spinner can paint before the headless runs block the thread.
    await new Promise((resolve) => setTimeout(resolve, 30));
    try {
      const engine = simulationEngine;
      const duration = Math.max(60, Math.min(engine.config.runDurationS, 600));
      const baseline = runScenario('BASELINE', duration);

      let variant: WhatIfResult;
      if (variantId === 'CUSTOM') {
        variant = {
          ...runScenario('CUSTOM', duration, {
            controls: { ...engine.controls },
            config: { ...engine.config },
          }),
          label: 'Custom Scenario (current settings)',
        };
      } else {
        variant = runScenario(variantId, duration);
      }

      set({
        whatIfBaseline: baseline,
        whatIfVariant: variant,
        whatIfVariantId: variantId,
        comparison: compareScenarios(baseline, variant),
        whatIfRunning: false,
      });
      get().appendEvent({
        id: `evt-whatif-${Date.now()}`,
        tS: engine.simTimeS,
        wallMs: Date.now(),
        category: 'SIM',
        level: 'INFO',
        message: `WHAT-IF comparison completed (${duration} s simulated)`,
        detail: `Baseline vs ${variant.label}`,
      });
    } catch (error) {
      set({ whatIfRunning: false, whatIfError: (error as Error).message });
      get().pushToast(`WHAT-IF run failed: ${(error as Error).message}`, 'critical');
    }
  },

  clearWhatIf: () => set({ whatIfBaseline: null, whatIfVariant: null, comparison: [], whatIfError: null }),

  /* ---------------- persistence ---------------- */

  exportCurrentSession: (name) => {
    const engine = simulationEngine;
    const samples = historyBuffer.all();
    if (!samples.length) {
      get().pushToast('No recorded samples yet — start the simulation first.', 'warning');
      return;
    }
    const session: PersistedSession = {
      id: `session-${Date.now()}`,
      name: name.trim() || `Session ${new Date().toLocaleTimeString()}`,
      createdAt: Date.now(),
      scenarioName: engine.scenarioName,
      samples,
      events: get().events.slice(-300),
      alarms: get().alarms,
      controls: { ...engine.controls },
      config: { ...engine.config },
      durationS: engine.simTimeS,
      sampleCount: samples.length,
      approxBytes: samples.length * 240,
    };
    const result = persistSession(session);
    get().refreshSessions();
    if (result.ok) {
      get().appendEvent({
        id: `evt-save-${Date.now()}`,
        tS: engine.simTimeS,
        wallMs: Date.now(),
        category: 'EXPORT',
        level: 'INFO',
        message: `Session recorded locally: ${session.name}`,
        detail: `${samples.length} samples, ${(session.durationS ?? 0).toFixed(1)} s simulated${
          result.evicted ? `, ${result.evicted} older session(s) evicted` : ''
        }`,
      });
      get().pushToast(
        result.evicted
          ? `Session saved (${result.evicted} older session removed to stay within quota).`
          : 'Session saved to browser storage.',
        'success',
      );
    } else {
      get().pushToast(result.error ?? 'Could not save session.', 'critical');
    }
  },

  refreshSessions: () => {
    const usage = storageUsage();
    set({ sessions: listSessions(), storageBytes: usage.bytes, storageAvailable: usage.available });
  },

  removeSession: (id) => {
    const ok = removeStoredSession(id);
    get().refreshSessions();
    get().pushToast(ok ? 'Session deleted.' : 'Could not delete the session.', ok ? 'success' : 'critical');
  },

  readSession: (id) => loadSession(id),

  renameSession: (id, name) => {
    const ok = renameStoredSession(id, name);
    get().refreshSessions();
    get().pushToast(ok ? 'Session renamed.' : 'Could not rename the session.', ok ? 'success' : 'critical');
  },

  importSession: (session) => {
    const result = persistSession(session);
    get().refreshSessions();
    if (result.ok) {
      get().appendEvent({
        id: `evt-import-${Date.now()}`,
        tS: 0,
        wallMs: Date.now(),
        category: 'EXPORT',
        level: 'INFO',
        message: `Imported session: ${session.name}`,
        detail: `${session.sampleCount} samples · schema-compatible import`,
      });
      get().pushToast(`Imported "${session.name}" (${session.sampleCount} samples).`, 'success');
    } else {
      get().pushToast(result.error ?? 'Import failed.', 'critical');
    }
  },

  /** Restart the current configuration with the same seed and initial state. */
  reproduceRun: () => {
    const engine = simulationEngine;
    engine.reset(undefined, engine.scenarioName);
    historyBuffer.clear();
    set({
      events: [],
      faults: [],
      alarms: [],
      raisedAlarms: 0,
      sampleCount: 0,
      autoPauseArmed: true,
      whatIfBaseline: null,
      whatIfVariant: null,
      comparison: [],
    });
    engine.start();
    get().publish();
    get().bumpChart();
    get().appendEvent({
      id: `evt-reproduce-${Date.now()}`,
      tS: 0,
      wallMs: Date.now(),
      category: 'SIM',
      level: 'INFO',
      message: 'Run reproduced from the current configuration',
      detail: `runId ${engine.runId} · seed ${engine.config.seed} · scenario ${engine.scenarioName}`,
    });
    get().pushToast(`Reproducing run ${engine.runId} (seed ${engine.config.seed}).`, 'success');
  },

  /** Everything needed to reproduce the current run, as a plain object. */
  runConfiguration: () => {
    const engine = simulationEngine;
    return {
      appVersion: APP_VERSION,
      modelVersion: MODEL_VERSION,
      runId: engine.runId,
      randomSeed: engine.config.seed,
      scenario: engine.scenarioName,
      timeScale: engine.config.timeScale,
      runDurationS: engine.config.runDurationS,
      controls: { ...engine.controls },
      initialConditions: { ...engine.initial },
      config: { ...engine.config },
      activeFaults: engine
        .faultHistory()
        .filter((fault) => fault.active)
        .map((fault) => ({
          kind: fault.kind,
          severity: fault.severity,
          injectedAtS: fault.injectedAtS,
        })),
    };
  },

  /* ---------------- ui ---------------- */

  setPage: (page) => set({ activePage: page }),
  setSelectedComponent: (id) => set({ selectedComponent: id }),
  setReactorView: (mode) => set({ reactorView: mode }),
  toggleFieldLines: () => set({ showFieldLines: !get().showFieldLines }),
  toggleLabels: () => set({ showLabels: !get().showLabels }),
  toggleStructure: (id) => {
    const hidden = get().hiddenStructures;
    set({
      hiddenStructures: hidden.includes(id) ? hidden.filter((entry) => entry !== id) : [...hidden, id],
    });
  },
  setAllStructures: (hidden) => set({ hiddenStructures: hidden }),
  setChartWindow: (seconds) => set({ chartWindowSec: seconds }),
  toggleChartsPaused: () => {
    set({ chartsPaused: !get().chartsPaused });
    get().pushToast(
      get().chartsPaused ? 'Chart refresh paused (simulation continues).' : 'Chart refresh resumed.',
      'info',
    );
  },
  setFullscreen: (value) => set({ fullscreen: value }),
  clearValidation: () => set({ lastValidation: null }),
}));

/**
 * Downsample helper kept for callers that need a compact series (e.g. previews).
 */
export function compactSeries<T>(samples: T[], maxPoints: number): T[] {
  if (samples.length <= maxPoints) return samples;
  const stride = samples.length / maxPoints;
  const result: T[] = [];
  for (let i = 0; i < maxPoints; i += 1)
    result.push(samples[Math.min(samples.length - 1, Math.floor(i * stride))]);
  return result;
}

/* ------------------------- runtime loop ------------------------- */

let rafId: number | null = null;
let lastFrameMs = 0;
let publishAccumulatorMs = 0;
let chartAccumulatorMs = 0;

/**
 * Single animation loop driving the engine. Publishing is throttled to PUBLISH_HZ
 * and chart refreshes to CHART_HZ so the render tree is not rebuilt at 60 Hz.
 * Returns a cleanup function; safe to call repeatedly (e.g. React StrictMode).
 */
export function startSimulationRuntime(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  if (rafId !== null) {
    return () => stopSimulationRuntime();
  }
  const publishInterval = 1000 / PUBLISH_HZ;
  const chartInterval = 1000 / CHART_HZ;
  lastFrameMs = performance.now();
  publishAccumulatorMs = publishInterval;
  chartAccumulatorMs = chartInterval;

  const loop = (now: number) => {
    const deltaMs = Math.min(now - lastFrameMs, 250);
    lastFrameMs = now;

    simulationEngine.step(deltaMs / 1000);

    publishAccumulatorMs += deltaMs;
    if (publishAccumulatorMs >= publishInterval) {
      publishAccumulatorMs = 0;
      useSimulationStore.getState().publish();
    }

    chartAccumulatorMs += deltaMs;
    if (chartAccumulatorMs >= chartInterval) {
      chartAccumulatorMs = 0;
      useSimulationStore.getState().bumpChart();
    }

    rafId = requestAnimationFrame(loop);
  };

  rafId = requestAnimationFrame(loop);
  return () => stopSimulationRuntime();
}

export function stopSimulationRuntime(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

export { CHART_WINDOWS as CHART_WINDOW_OPTIONS, historyBuffer };
export const DEFAULT_SCENARIOS = SCENARIO_DEFINITIONS;
export const DEFAULT_CONTROL_INPUTS = DEFAULT_CONTROLS;
export const ENGINE = simulationEngine;
export const HISTORY_CAPACITY_SAMPLES = HISTORY_CAPACITY;
export type { HistoryBuffer };
