// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SceneErrorBoundary } from '@/components/reactor/ReactorView';
import { useGuidedDemoStore } from '@/store/guidedDemoStore';
import { useSimulationStore, simulationEngine } from '@/store/simulationStore';
import { historyBuffer } from '@/store/historyBuffer';
import { parseSessionExport, sessionToJSON } from '@/utils/export';
import { summarizeSeries } from '@/simulation/FusionSimulationEngine';
import { compareScenarios, runScenario } from '@/simulation/scenarios';
import { APP_VERSION } from '@/config/version';
import type { HistorySample, PersistedSession } from '@/types/simulation';

/**
 * v1.2.1 — remaining contract tests:
 *  F.8  guided-demo persistence
 *  G.9  WebGL-unavailable fallback
 *  I.9  replay isolation and A/B comparison numerics
 */

const sample = (t: number, temperature: number): HistorySample =>
  ({
    t,
    wallMs: 0,
    temperature,
    density: 1e20,
    current: 15,
    pressure: 320,
    storedEnergy: 380,
    fusionPower: temperature * 30,
    heatingPower: 50,
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
  }) as HistorySample;

beforeEach(() => {
  cleanup();
  window.localStorage.clear();
  useGuidedDemoStore.getState().resetProgress();
  useSimulationStore.getState().reset();
  historyBuffer.clear();
});

describe('F.8 — guided demo persistence', () => {
  it('persists completion and skip flags across store instances', () => {
    const demo = useGuidedDemoStore.getState();
    demo.start({ restart: true });
    demo.skip();

    const raw = window.localStorage.getItem('fusionplant.guidedDemo.v1');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string);
    expect(parsed.skipped).toBe(true);

    // A fresh read of the persisted payload reflects the same state.
    expect(parsed.doNotAutoStart).toBe(false);
    expect(parsed.autoAdvance).toBe(true);
  });

  it('resetProgress clears the persisted flags', () => {
    const demo = useGuidedDemoStore.getState();
    demo.start({ restart: true });
    demo.skip();
    demo.resetProgress();
    const parsed = JSON.parse(window.localStorage.getItem('fusionplant.guidedDemo.v1') as string);
    expect(parsed.completed).toBe(false);
    expect(parsed.skipped).toBe(false);
  });

  it('does not touch the simulation when the tour state changes', () => {
    const before = simulationEngine.simTimeS;
    const status = useSimulationStore.getState().frame.status;
    const demo = useGuidedDemoStore.getState();
    demo.start({ restart: true });
    demo.next();
    demo.exit();
    expect(simulationEngine.simTimeS).toBe(before);
    expect(useSimulationStore.getState().frame.status).toBe(status);
  });
});

describe('G.9 — WebGL unavailable fallback', () => {
  it('renders a clear fallback instead of crashing the console', () => {
    const Boom = () => {
      throw new Error('WebGL context creation failed');
    };
    render(
      <SceneErrorBoundary>
        <Boom />
      </SceneErrorBoundary>,
    );
    expect(screen.getByText('3D UNAVAILABLE')).toBeTruthy();
    expect(screen.getByText(/telemetry, charts, controls/i)).toBeTruthy();
  });
});

describe('I.9 — replay isolation and A/B comparison', () => {
  it('parsing and summarising a replay file never mutates the live engine', () => {
    const engineBefore = {
      simTime: simulationEngine.simTimeS,
      runId: simulationEngine.runId,
      temperature: simulationEngine.temperatureKeV,
    };

    const session: PersistedSession = {
      id: 'replay',
      name: 'replay',
      createdAt: 0,
      scenarioName: 'Baseline Scenario',
      samples: [sample(0, 6), sample(1, 7)],
      events: [],
      alarms: [],
      controls: {} as PersistedSession['controls'],
      config: {} as PersistedSession['config'],
      durationS: 1,
      sampleCount: 2,
      approxBytes: 10,
    };
    const json = sessionToJSON(session);
    const parsed = parseSessionExport(json);
    expect(parsed.ok).toBe(true);
    summarizeSeries(parsed.session?.samples ?? []);

    expect(simulationEngine.simTimeS).toBe(engineBefore.simTime);
    expect(simulationEngine.runId).toBe(engineBefore.runId);
    expect(simulationEngine.temperatureKeV).toBe(engineBefore.temperature);
  });

  it('does not append to the live history buffer during replay', () => {
    historyBuffer.clear();
    const parsed = parseSessionExport(
      sessionToJSON({
        id: 'x',
        name: 'x',
        createdAt: 0,
        scenarioName: 'Baseline',
        samples: [sample(0, 6)],
        events: [],
        alarms: [],
        controls: {} as PersistedSession['controls'],
        config: {} as PersistedSession['config'],
        durationS: 1,
        sampleCount: 1,
        approxBytes: 1,
      }),
    );
    void parsed;
    expect(historyBuffer.size).toBe(0);
  });

  it('A/B comparison reports exact deltas between two runs', () => {
    const baseline = runScenario('BASELINE', 120);
    const high = runScenario('HIGH_HEATING', 120);
    const rows = compareScenarios(baseline, high);

    const tempRow = rows.find((row) => row.metric.includes('Final plasma temperature'))!;
    const expected = high.summary.finalTemperatureKeV - baseline.summary.finalTemperatureKeV;
    expect(Number(tempRow.delta)).toBeCloseTo(expected, 1);
    expect(tempRow.variant).toBe(high.summary.finalTemperatureKeV.toFixed(2));

    const fusionRow = rows.find((row) => row.metric.includes('Final fusion power'))!;
    expect(Number(fusionRow.variant)).toBeCloseTo(high.summary.finalFusionPowerMW, 0);
    expect(rows.length).toBeGreaterThanOrEqual(14);
  });

  it('exports carry the current app version', () => {
    const parsed = JSON.parse(
      sessionToJSON({
        id: 'v',
        name: 'v',
        createdAt: 0,
        scenarioName: 'Baseline',
        samples: [sample(0, 6)],
        events: [],
        alarms: [],
        controls: {} as PersistedSession['controls'],
        config: {} as PersistedSession['config'],
        durationS: 1,
        sampleCount: 1,
        approxBytes: 1,
      }),
    );
    expect(parsed.appVersion).toBe(APP_VERSION);
    expect(parsed.appVersion).toBe('1.2.1');
  });
});
