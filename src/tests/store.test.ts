import { beforeEach, describe, expect, it } from 'vitest';
import { simulationEngine, useSimulationStore } from '@/store/simulationStore';
import { historyBuffer } from '@/store/historyBuffer';
import { samplesToCSV, sessionToJSON, eventsToCSV, CSV_COLUMNS } from '@/utils/export';
import { sanitizeControls, validateConfig, validateControl, validateSeed } from '@/utils/validation';
import { DEFAULT_CONFIG, DEFAULT_CONTROLS } from '@/simulation/controlSpecs';
import type { HistorySample, PersistedSession } from '@/types/simulation';

const get = () => useSimulationStore.getState();

const makeSample = (t: number): HistorySample => ({
  t,
  wallMs: Date.now(),
  temperature: 7.5,
  density: 1.02e20,
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

beforeEach(() => {
  get().clearWhatIf();
  get().reset();
  historyBuffer.clear();
  useSimulationStore.setState({ toasts: [], lastValidation: null, events: [], faults: [], alarms: [] });
});

describe('simulation store — transport actions', () => {
  it('starts an idle run and publishes the new status', () => {
    expect(get().frame.status).toBe('IDLE');
    get().start();
    expect(get().frame.status).toBe('RUNNING');
    expect(simulationEngine.status).toBe('RUNNING');
  });

  it('pauses and resumes', () => {
    get().start();
    get().pause();
    expect(get().frame.status).toBe('PAUSED');
    get().resume();
    expect(get().frame.status).toBe('RUNNING');
  });

  it('treats resume from an idle state as a start', () => {
    expect(get().frame.status).toBe('IDLE');
    get().resume();
    expect(get().frame.status).toBe('RUNNING');
  });

  it('latches an emergency stop and re-initialises on the next start', () => {
    get().start();
    get().emergencyStop();
    expect(get().frame.status).toBe('EMERGENCY_STOP');
    expect(simulationEngine.phase).toBe('SCRAM');
    get().start();
    expect(get().frame.status).toBe('RUNNING');
    expect(simulationEngine.simTimeS).toBe(0);
  });

  it('auto-pauses once at the configured duration and can be resumed', () => {
    get().start();
    simulationEngine.simTimeS = 100_000;
    get().publish();
    expect(get().frame.status).toBe('PAUSED');
    expect(get().autoPauseArmed).toBe(false);
    expect(get().events.some((event) => event.message.includes('Experiment completed'))).toBe(true);

    get().resume();
    expect(get().frame.status).toBe('RUNNING');
    get().publish();
    // The latch must not immediately pause the run again after an explicit resume.
    expect(get().frame.status).toBe('RUNNING');
    simulationEngine.simTimeS = 0;
  });

  it('clears history, faults and events on reset', () => {
    get().start();
    historyBuffer.push(makeSample(1));
    get().injectFault('VACUUM_LEAK', 0.4);
    get().reset();
    expect(historyBuffer.size).toBe(0);
    expect(get().faults.length).toBe(0);
    expect(get().events.length).toBe(0);
    expect(get().frame.simTimeS).toBe(0);
  });
});

describe('simulation store — parameter handling', () => {
  it('applies a valid setpoint to the engine', () => {
    get().setControl('nbiPowerMW', 42);
    expect(simulationEngine.controls.nbiPowerMW).toBe(42);
    expect(get().frame.controls.nbiPowerMW).toBe(42);
    expect(get().lastValidation).toBeNull();
  });

  it('clamps an out-of-range value and reports a warning', () => {
    get().setControl('nbiPowerMW', 999);
    expect(simulationEngine.controls.nbiPowerMW).toBe(50);
    expect(get().lastValidation).toContain('maximum');
    expect(get().toasts.some((toast) => toast.level === 'warning' || toast.level === 'critical')).toBe(true);
  });

  it('rejects a non-finite value without touching the engine', () => {
    const before = simulationEngine.controls.echPowerMW;
    get().setControl('echPowerMW', Number.NaN);
    expect(simulationEngine.controls.echPowerMW).toBe(before);
    expect(get().lastValidation).toBeTruthy();
  });

  it('switches the scenario to CUSTOM after a manual change', () => {
    get().applyScenario('BASELINE');
    get().setControl('nbiPowerMW', 20);
    expect(get().scenarioId).toBe('CUSTOM');
  });

  it('validates and clamps simulation configuration', () => {
    get().setConfig({ timeScale: 999 });
    expect(simulationEngine.config.timeScale).toBe(20);
    get().setConfig({ disturbanceLevel: 5 });
    expect(simulationEngine.config.disturbanceLevel).toBe(1);
    get().setConfig({ seed: 4242 });
    expect(simulationEngine.config.seed).toBe(4242);
  });

  it('applies a scenario to both engine and run state', () => {
    get().applyScenario('COOLING_STRESS');
    expect(simulationEngine.controls.coolantFlowKgS).toBe(3000);
    expect(get().scenarioId).toBe('COOLING_STRESS');
    expect(get().frame.scenarioName).toBe('Cooling Stress Test');
    expect(simulationEngine.simTimeS).toBe(0);
  });

  it('records initial conditions for the next reset', () => {
    get().setInitialConditions({ temperatureKeV: 3.4 });
    expect(simulationEngine.initial.temperatureKeV).toBe(3.4);
    get().reset();
    expect(simulationEngine.temperatureKeV).toBeCloseTo(3.4, 6);
  });
});

describe('simulation store — faults', () => {
  it('injects and clears a fault', () => {
    get().injectFault('COOLANT_LOSS', 0.5);
    expect(get().faults.filter((fault) => fault.active).length).toBe(1);
    const faultId = get().faults[0].id;
    get().clearFault(faultId);
    expect(get().faults.filter((fault) => fault.active).length).toBe(0);
    expect(get().faults[0].clearedAtS).not.toBeNull();
  });

  it('blocks injection while fault injection is paused', () => {
    get().setFaultInjectionPaused(true);
    get().injectFault('VACUUM_LEAK', 0.5);
    expect(get().faults.length).toBe(0);
    expect(simulationEngine.faultsSuspended).toBe(true);
    expect(get().toasts.some((toast) => toast.message.includes('paused'))).toBe(true);
    get().setFaultInjectionPaused(false);
    expect(simulationEngine.faultsSuspended).toBe(false);
  });

  it('clears every active fault at once', () => {
    get().injectFault('VACUUM_LEAK', 0.5);
    get().injectFault('HEATING_DROOP', 0.5);
    get().clearAllFaults();
    expect(get().faults.filter((fault) => fault.active).length).toBe(0);
  });
});

describe('simulation store — presets and what-if', () => {
  it('saves, loads and deletes a preset', () => {
    get().setControl('nbiPowerMW', 12);
    get().savePreset('Test preset');
    const preset = get().presets.find((entry) => entry.name === 'Test preset');
    expect(preset).toBeTruthy();
    get().setControl('nbiPowerMW', 40);
    get().loadPreset(preset!.id);
    expect(simulationEngine.controls.nbiPowerMW).toBe(12);
    get().deletePreset(preset!.id);
    expect(get().presets.find((entry) => entry.id === preset!.id)).toBeUndefined();
  });

  it('runs a headless what-if comparison and builds the comparison table', async () => {
    await get().runWhatIf('HIGH_HEATING');
    expect(get().whatIfBaseline).not.toBeNull();
    expect(get().whatIfVariant).not.toBeNull();
    expect(get().comparison.length).toBeGreaterThan(10);
    expect(get().whatIfRunning).toBe(false);
    const baseline = get().whatIfBaseline!;
    const variant = get().whatIfVariant!;
    expect(variant.summary.finalFusionPowerMW).toBeGreaterThan(baseline.summary.finalFusionPowerMW);
    // Headless runs must not disturb the live engine.
    expect(simulationEngine.simTimeS).toBe(0);
  });

  it('clears what-if results', async () => {
    await get().runWhatIf('COOLING_STRESS');
    expect(get().comparison.length).toBeGreaterThan(0);
    get().clearWhatIf();
    expect(get().comparison.length).toBe(0);
    expect(get().whatIfBaseline).toBeNull();
  });
});

describe('simulation store — persistence without browser storage', () => {
  it('reports storage as unavailable instead of throwing', () => {
    get().refreshSessions();
    expect(get().storageAvailable).toBe(false);
    expect(get().sessions).toEqual([]);
  });

  it('handles saving a session gracefully when storage is blocked', () => {
    historyBuffer.push(makeSample(1));
    historyBuffer.push(makeSample(1.5));
    expect(() => get().exportCurrentSession('offline test')).not.toThrow();
    expect(get().toasts.some((toast) => toast.level === 'critical')).toBe(true);
  });

  it('refuses to export an empty history', () => {
    get().exportCurrentSession('empty');
    expect(get().toasts.some((toast) => toast.message.includes('No recorded samples'))).toBe(true);
  });
});

describe('export utilities', () => {
  it('writes a CSV with metadata, headers and one row per sample', () => {
    const samples = [makeSample(0), makeSample(0.5)];
    const csv = samplesToCSV(samples, { source: 'unit test' });
    const lines = csv.trim().split('\n');
    expect(lines[0].startsWith('#')).toBe(true);
    expect(lines.some((line) => line.includes('source: unit test'))).toBe(true);
    const header = lines.find((line) => line.startsWith('sim_time_s'))!;
    expect(header.split(',')).toHaveLength(CSV_COLUMNS.length);
    expect(lines.filter((line) => /^\d/.test(line))).toHaveLength(2);
    // The first data row must be finite and comma separated
    const firstRow = lines.find((line) => /^\d/.test(line))!.split(',');
    expect(firstRow).toHaveLength(CSV_COLUMNS.length);
    expect(Number.isFinite(Number(firstRow[0]))).toBe(true);
  });

  it('leaves undefined gains empty in CSV output', () => {
    const sample = { ...makeSample(1), qPlasma: null, qEngineering: null };
    const csv = samplesToCSV([sample]);
    const row = csv.trim().split('\n').find((line) => /^\d/.test(line))!;
    const cells = row.split(',');
    const qIndex = CSV_COLUMNS.findIndex((column) => column.key === 'qPlasma');
    expect(cells[qIndex]).toBe('');
  });

  it('exports a JSON session containing the simulation disclaimer', () => {
    const session: PersistedSession = {
      id: 's1',
      name: 'unit',
      createdAt: Date.now(),
      scenarioName: 'Baseline Scenario',
      samples: [makeSample(0), makeSample(1)],
      events: [],
      alarms: [],
      controls: DEFAULT_CONTROLS,
      config: DEFAULT_CONFIG,
      durationS: 1,
      sampleCount: 2,
      approxBytes: 100,
    };
    const parsed = JSON.parse(sessionToJSON(session));
    expect(parsed.disclaimer).toContain('simplified simulation');
    expect(parsed.session.samples).toHaveLength(2);
    expect(parsed.exportVersion).toBe(1);
  });

  it('exports events to CSV', () => {
    const csv = eventsToCSV([
      {
        id: 'e1',
        tS: 3.2,
        wallMs: 0,
        category: 'CONTROL',
        level: 'INFO',
        message: 'Setpoint changed',
        detail: 'a -> b',
      },
    ]);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('sim_time_s,wall_time_ms,category,level,message,detail');
    expect(lines[1]).toContain('Setpoint changed');
  });
});

describe('validation utilities', () => {
  it('accepts in-range values', () => {
    expect(validateControl('nbiPowerMW', 20).valid).toBe(true);
    expect(validateControl('nbiPowerMW', 20).value).toBe(20);
  });

  it('clamps below the minimum and above the maximum', () => {
    const low = validateControl('coilCurrentSetpointKA', 2);
    expect(low.valid).toBe(false);
    expect(low.value).toBe(20);
    expect(low.severity).toBe('warning');
    const high = validateControl('targetDensity19', 99);
    expect(high.value).toBe(20);
  });

  it('rejects non-finite input', () => {
    const result = validateControl('coolantFlowKgS', Number.POSITIVE_INFINITY);
    expect(result.valid).toBe(false);
    expect(result.severity).toBe('error');
    expect(Number.isFinite(result.value)).toBe(true);
  });

  it('sanitises a partial control set', () => {
    const next = sanitizeControls({ nbiPowerMW: 1000, echPowerMW: Number.NaN }, DEFAULT_CONTROLS);
    expect(next.nbiPowerMW).toBe(50);
    expect(next.echPowerMW).toBe(DEFAULT_CONTROLS.echPowerMW);
    expect(next.ichPowerMW).toBe(DEFAULT_CONTROLS.ichPowerMW);
  });

  it('validates config and seed', () => {
    const config = validateConfig({ timeScale: 0, runDurationS: 5 }, DEFAULT_CONFIG);
    expect(config.valid).toBe(false);
    expect(config.errors.length).toBeGreaterThan(0);
    expect(validateSeed(12345).valid).toBe(true);
    expect(validateSeed(Number.NaN).valid).toBe(false);
  });
});
