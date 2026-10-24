import { afterEach, describe, expect, it, vi } from 'vitest';
import { FusionSimulationEngine, summarizeSeries } from '@/simulation/FusionSimulationEngine';
import { DEFAULT_CONFIG, DEFAULT_CONTROLS, INITIAL_CONDITIONS_DEFAULT } from '@/simulation/controlSpecs';
import { HistoryBuffer } from '@/store/historyBuffer';
import { getScenario } from '@/simulation/scenarios';
import type { EventRecord, HistorySample } from '@/types/simulation';

const createEngine = (overrides: Partial<ConstructorParameters<typeof FusionSimulationEngine>[0]> = {}) =>
  new FusionSimulationEngine({
    controls: { ...DEFAULT_CONTROLS },
    config: { ...DEFAULT_CONFIG, noiseLevel: 0, disturbanceLevel: 0 },
    initial: { ...INITIAL_CONDITIONS_DEFAULT },
    ...overrides,
  });

const runFor = (engine: FusionSimulationEngine, seconds: number): HistorySample[] => {
  engine.start();
  const { series } = engine.runHeadless(seconds);
  return series;
};

describe('FusionSimulationEngine — transport', () => {
  it('starts, pauses and resumes with matching status transitions', () => {
    const engine = createEngine();
    expect(engine.status).toBe('IDLE');
    engine.start();
    expect(engine.status).toBe('RUNNING');
    engine.pause();
    expect(engine.status).toBe('PAUSED');
    engine.resume();
    expect(engine.status).toBe('RUNNING');
  });

  it('does not advance a paused or idle engine', () => {
    const engine = createEngine();
    engine.step(1);
    expect(engine.simTimeS).toBe(0);
    engine.start();
    engine.pause();
    engine.step(1);
    expect(engine.simTimeS).toBe(0);
  });

  it('advances at the configured time scale', () => {
    const engine = createEngine({
      config: { ...DEFAULT_CONFIG, timeScale: 4, noiseLevel: 0, disturbanceLevel: 0 },
    });
    engine.start();
    engine.step(0.05);
    // 0.05 s wall * 4 = 0.2 s simulated, exactly four 50 ms integrator steps
    expect(engine.simTimeS).toBeCloseTo(0.2, 6);
    expect(engine.stepCount).toBe(4);
  });

  it('latches an emergency stop and refuses to advance', () => {
    const engine = createEngine();
    engine.start();
    engine.step(0.1);
    const before = engine.simTimeS;
    engine.emergencyStop();
    expect(engine.status).toBe('EMERGENCY_STOP');
    expect(engine.phase).toBe('SCRAM');
    engine.step(0.1);
    expect(engine.simTimeS).toBe(before);
  });

  it('resets back to the configured initial conditions', () => {
    const engine = createEngine();
    runFor(engine, 40);
    expect(engine.temperatureKeV).toBeGreaterThan(INITIAL_CONDITIONS_DEFAULT.temperatureKeV);
    engine.reset();
    expect(engine.simTimeS).toBe(0);
    expect(engine.stepCount).toBe(0);
    expect(engine.temperatureKeV).toBeCloseTo(INITIAL_CONDITIONS_DEFAULT.temperatureKeV, 6);
    expect(engine.faultHistory().length).toBe(0);
    expect(engine.status).toBe('IDLE');
  });
});

describe('FusionSimulationEngine — causality', () => {
  it('heats the plasma when auxiliary heating is increased', () => {
    const low = createEngine({
      controls: { ...DEFAULT_CONTROLS, nbiPowerMW: 5, echPowerMW: 0, ichPowerMW: 0 },
    });
    const high = createEngine({
      controls: { ...DEFAULT_CONTROLS, nbiPowerMW: 50, echPowerMW: 30, ichPowerMW: 20 },
    });
    const lowSeries = runFor(low, 120);
    const highSeries = runFor(high, 120);
    const lowFinal = lowSeries[lowSeries.length - 1];
    const highFinal = highSeries[highSeries.length - 1];
    expect(highFinal.temperature).toBeGreaterThan(lowFinal.temperature);
    expect(highFinal.fusionPower).toBeGreaterThan(lowFinal.fusionPower);
    expect(highFinal.heatingPower).toBeGreaterThan(lowFinal.heatingPower);
  });

  it('raises the coolant outlet temperature when flow is reduced', () => {
    const nominal = createEngine({ controls: { ...DEFAULT_CONTROLS, coolantFlowKgS: 12000 } });
    const restricted = createEngine({ controls: { ...DEFAULT_CONTROLS, coolantFlowKgS: 3500 } });
    const nominalFinal = runFor(nominal, 120).at(-1)!;
    const restrictedFinal = runFor(restricted, 120).at(-1)!;
    expect(restrictedFinal.coolantOut).toBeGreaterThan(nominalFinal.coolantOut);
    expect(restrictedFinal.heatExchangerLoad).toBeGreaterThan(nominalFinal.heatExchangerLoad);
  });

  it('changes the toroidal field when the coil current setpoint changes', () => {
    const engine = createEngine({ controls: { ...DEFAULT_CONTROLS, coilCurrentSetpointKA: 40 } });
    const low = runFor(engine, 60).at(-1)!;
    engine.reset();
    engine.setControl('coilCurrentSetpointKA', 76);
    const high = runFor(engine, 60).at(-1)!;
    expect(high.toroidalField).toBeGreaterThan(low.toroidalField);
    expect(high.toroidalField / low.toroidalField).toBeCloseTo(76 / 40, 1);
  });

  it('tracks the requested density with a lag', () => {
    const engine = createEngine({ controls: { ...DEFAULT_CONTROLS, targetDensity19: 16 } });
    const series = runFor(engine, 60);
    expect(series.at(-1)!.density).toBeGreaterThan(series[0].density * 1.5);
  });

  it('shows fuel-density coupling from neutral beam injection', () => {
    const withBeam = createEngine({ controls: { ...DEFAULT_CONTROLS, nbiPowerMW: 50 } });
    const noBeam = createEngine({ controls: { ...DEFAULT_CONTROLS, nbiPowerMW: 0 } });
    const beamFinal = runFor(withBeam, 40).at(-1)!;
    const noBeamFinal = runFor(noBeam, 40).at(-1)!;
    expect(beamFinal.density).toBeGreaterThan(noBeamFinal.density);
  });
});

describe('FusionSimulationEngine — numeric safety', () => {
  it('never produces NaN or Infinity in a long disturbed run', () => {
    const engine = createEngine({
      config: { ...DEFAULT_CONFIG, noiseLevel: 1, disturbanceLevel: 1, timeScale: 1 },
    });
    engine.start();
    engine.injectFault('MAGNETIC_DISTURBANCE', 1);
    engine.injectFault('COOLANT_LOSS', 1);
    engine.injectFault('VACUUM_LEAK', 1);
    engine.injectFault('SENSOR_DROPOUT', 1);
    engine.injectFault('SENSOR_LATENCY', 1);
    engine.injectFault('COIL_OVERHEAT', 1);
    const { series } = engine.runHeadless(240);
    expect(series.length).toBeGreaterThan(100);
    for (const sample of series) {
      for (const [key, value] of Object.entries(sample)) {
        if (value === null) continue;
        if (typeof value === 'number') {
          expect(Number.isFinite(value), `${key} was ${value}`).toBe(true);
        }
      }
    }
    const frame = engine.snapshot();
    expect(Number.isFinite(frame.power.netElectricMW)).toBe(true);
    expect(frame.power.qPlasma === null || Number.isFinite(frame.power.qPlasma)).toBe(true);
  });

  it('reports N/A gains when no auxiliary power is delivered', () => {
    const engine = createEngine({
      controls: { ...DEFAULT_CONTROLS, nbiPowerMW: 0, echPowerMW: 0, ichPowerMW: 0 },
    });
    engine.start();
    engine.runHeadless(20);
    const frame = engine.snapshot();
    expect(frame.power.auxiliaryHeatingMW).toBe(0);
    expect(frame.power.qPlasma).toBeNull();
  });

  it('is deterministic for a given seed and divergent for another seed', () => {
    const make = (seed: number) => {
      const engine = createEngine({
        config: { ...DEFAULT_CONFIG, seed, noiseLevel: 0.5, disturbanceLevel: 0.5 },
      });
      return runFor(engine, 60);
    };
    const a = make(1234);
    const b = make(1234);
    const c = make(9999);
    expect(a.at(-1)!.temperature).toBeCloseTo(b.at(-1)!.temperature, 9);
    expect(a.at(-1)!.temperature).not.toBeCloseTo(c.at(-1)!.temperature, 6);
  });
});

describe('FusionSimulationEngine — faults', () => {
  it('reduces delivered heating under a HEATING_DROOP fault', () => {
    const engine = createEngine();
    engine.start();
    engine.runHeadless(30);
    const healthy = engine.snapshot().heating.totalDeliveredMW;
    engine.injectFault('HEATING_DROOP', 0.8);
    engine.runHeadless(5);
    const faulty = engine.snapshot().heating.totalDeliveredMW;
    expect(faulty).toBeLessThan(healthy * 0.6);
    engine.clearFault(engine.faultHistory()[0].id);
    engine.runHeadless(2);
    expect(engine.snapshot().heating.totalDeliveredMW).toBeGreaterThan(faulty);
  });

  it('heats the coil and raises the cryogenic load under COIL_OVERHEAT', () => {
    const engine = createEngine();
    engine.injectFault('COIL_OVERHEAT', 1);
    engine.start();
    engine.runHeadless(90);
    const frame = engine.snapshot();
    expect(frame.magnetic.coilTemperatureK).toBeGreaterThan(20);
    expect(frame.magnetic.cryoLoadPct).toBeGreaterThan(60);
  });

  it('does not change physics for a pure sensor bias, only the measurement', () => {
    const clean = createEngine();
    clean.start();
    clean.runHeadless(60);
    const cleanTemp = clean.temperatureKeV;

    const biased = createEngine();
    biased.injectFault('SENSOR_BIAS', 0.8);
    biased.start();
    biased.runHeadless(60);
    expect(biased.temperatureKeV).toBeCloseTo(cleanTemp, 3);
    expect(biased.snapshot().sensors.temperatureKeV).not.toBeCloseTo(cleanTemp, 3);
  });

  it('reports lost sensor channels without breaking the simulation', () => {
    const engine = createEngine();
    engine.injectFault('SENSOR_DROPOUT', 1);
    engine.start();
    engine.runHeadless(20);
    const sensors = engine.snapshot().sensors;
    expect(sensors.temperatureKeV).toBeNull();
    expect(sensors.density).toBeNull();
    expect(sensors.fusionPowerMW).toBeNull();
    expect(sensors.status.temperature).toBe('LOST');
    expect(Number.isFinite(engine.temperatureKeV)).toBe(true);
  });

  it('suspends fault consequences without deleting the fault records', () => {
    const engine = createEngine();
    engine.injectFault('COIL_OVERHEAT', 1);
    engine.start();
    engine.runHeadless(20);
    const hot = engine.coilTemperatureK;
    engine.setFaultsSuspended(true);
    engine.runHeadless(200);
    expect(engine.coilTemperatureK).toBeLessThan(hot);
    expect(engine.faultHistory().filter((fault) => fault.active).length).toBe(1);
  });

  it('refuses to inject the same fault twice', () => {
    const engine = createEngine();
    expect(engine.injectFault('VACUUM_LEAK', 0.5)).not.toBeNull();
    expect(engine.injectFault('VACUUM_LEAK', 0.5)).toBeNull();
  });
});

describe('FusionSimulationEngine — supervision & events', () => {
  it('hands every state change to the event hook', () => {
    const events: EventRecord[] = [];
    const engine = createEngine({ hooks: { onEvent: (event) => events.push(event) } });
    engine.start();
    engine.setControl('nbiPowerMW', 40);
    engine.injectFault('VACUUM_LEAK', 0.4);
    engine.pause();
    expect(
      events.some(
        (event) =>
          event.message.includes('simulation started', 0) || event.message.includes('Simulation started'),
      ),
    ).toBe(true);
    expect(events.some((event) => event.category === 'CONTROL')).toBe(true);
    expect(events.some((event) => event.category === 'FAULT')).toBe(true);
    expect(events.every((event) => Number.isFinite(event.tS))).toBe(true);
  });

  it('raises a coil-temperature alarm when the cold mass overheats', () => {
    const engine = createEngine();
    engine.injectFault('COIL_OVERHEAT', 1);
    engine.start();
    engine.runHeadless(120);
    const alarms = engine.alarmHistory();
    expect(alarms.some((alarm) => alarm.ruleId === 'coil-temp')).toBe(true);
    expect(engine.raisedAlarmCount()).toBeGreaterThan(0);
  });

  it('clears an alarm once the condition recovers', () => {
    const engine = createEngine();
    engine.injectFault('COIL_OVERHEAT', 1);
    engine.start();
    engine.runHeadless(90);
    const raised = engine.alarmHistory().filter((alarm) => alarm.ruleId === 'coil-temp');
    expect(raised.length).toBeGreaterThan(0);
    engine.clearFault(engine.faultHistory()[0].id);
    engine.runHeadless(200);
    const stillActive = engine.alarmHistory().filter((alarm) => alarm.ruleId === 'coil-temp' && alarm.active);
    expect(stillActive.length).toBe(0);
  });

  it('emits history samples at the configured cadence', () => {
    const samples: HistorySample[] = [];
    const engine = createEngine({ hooks: { onSample: (sample) => samples.push(sample) } });
    engine.start();
    engine.runHeadless(20);
    expect(samples.length).toBeGreaterThan(30);
    expect(samples[0].t).toBeLessThan(samples[samples.length - 1].t);
  });
});

describe('scenario headless runs', () => {
  it('produces higher fusion power for the high-heating scenario', () => {
    const baseline = getScenario('BASELINE');
    const high = getScenario('HIGH_HEATING');
    const run = (scenario: typeof baseline) => {
      const engine = new FusionSimulationEngine({
        controls: scenario.controls,
        config: { ...DEFAULT_CONFIG, ...scenario.config },
        initial: scenario.initial,
      });
      return engine.runHeadless(150);
    };
    const baselineRun = run(baseline);
    const highRun = run(high);
    expect(highRun.summary.finalFusionPowerMW).toBeGreaterThan(baselineRun.summary.finalFusionPowerMW);
    expect(highRun.summary.meanHeatingMW).toBeGreaterThan(baselineRun.summary.meanHeatingMW);
  });

  it('summarises integrated energy correctly', () => {
    const engine = createEngine({ controls: { ...DEFAULT_CONTROLS, nbiPowerMW: 40 } });
    const { series, summary } = (engine.start(), engine.runHeadless(60));
    expect(summary.integratedThermalGJ).toBeGreaterThan(0);
    expect(summary.peakTemperatureKeV).toBeGreaterThanOrEqual(summary.finalTemperatureKeV);
    expect(summary.minStability).toBeLessThanOrEqual(1);
    const recomputed = summarizeSeries(series);
    expect(recomputed.integratedThermalGJ).toBeCloseTo(summary.integratedThermalGJ, 6);
  });
});

describe('HistoryBuffer', () => {
  const sample = (t: number): HistorySample => ({ t, wallMs: 0 }) as HistorySample;

  it('retains insertion order and enforces capacity', () => {
    // The buffer enforces a 60-sample floor so small windows still render charts.
    const buffer = new HistoryBuffer(60);
    for (let index = 0; index < 100; index += 1) buffer.push(sample(index));
    expect(buffer.size).toBe(60);
    const all = buffer.all();
    expect(all[0].t).toBe(40);
    expect(all[all.length - 1].t).toBe(99);
  });

  it('slices windows and ranges by simulated time', () => {
    const buffer = new HistoryBuffer(100);
    for (let index = 0; index < 60; index += 1) buffer.push(sample(index * 0.5));
    const window = buffer.window(10);
    expect(window[0].t).toBeGreaterThanOrEqual(19.5);
    expect(window[window.length - 1].t).toBe(29.5);
    const range = buffer.range(5, 8);
    expect(range[0].t).toBeGreaterThanOrEqual(5);
    expect(range[range.length - 1].t).toBeLessThanOrEqual(8);
    expect(buffer.sampleAt(10)?.t).toBe(10);
  });

  it('clears safely', () => {
    const buffer = new HistoryBuffer(4);
    buffer.push(sample(1));
    buffer.clear();
    expect(buffer.size).toBe(0);
    expect(buffer.window(10)).toEqual([]);
    expect(buffer.latest()).toBeNull();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
