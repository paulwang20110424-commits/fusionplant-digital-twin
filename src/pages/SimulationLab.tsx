import { useMemo, useState } from 'react';
import { Panel } from '@/components/ui/Panel';
import { PageHeader, Callout, ParameterTable, Divider } from '@/components/ui/Layout';
import { ControlSlider } from '@/components/controls/ControlSlider';
import { FaultPanel } from '@/components/controls/FaultPanel';
import { NumberField, SlopeField } from '@/components/controls/Fields';
import { StaticMultiChart, type StaticSeries } from '@/components/charts/StaticMultiChart';
import { useSimulationStore, simulationEngine } from '@/store/simulationStore';
import { CONTROL_SPECS, SCENARIO_DEFINITIONS } from '@/simulation/controlSpecs';
import { getScenario } from '@/simulation/scenarios';
import type { ScenarioId } from '@/types/simulation';
import { formatBytes, formatClock, formatDateTime, formatNumber } from '@/utils/units';
import { downloadTextFile, samplesToCSV, sessionToJSON, timestampSlug } from '@/utils/export';
import { historyBuffer } from '@/store/historyBuffer';
import { validateSeed } from '@/utils/validation';

const VARIANT_OPTIONS: Array<{ id: ScenarioId; label: string; hint: string }> = [
  { id: 'HIGH_HEATING', label: 'HIGH HEATING', hint: 'Auxiliary heating to 100 MW' },
  { id: 'COOLING_STRESS', label: 'COOLING STRESS', hint: 'Reduced primary flow' },
  { id: 'MAGNETIC_DISTURBANCE', label: 'MAGNETIC DISTURBANCE', hint: 'Field error and MHD activity' },
  { id: 'CUSTOM', label: 'CUSTOM (CURRENT)', hint: 'Use the setpoints currently on the console' },
];

const METRIC_OPTIONS = [
  { key: 'temperature', label: 'Plasma temperature', unit: 'keV', digits: 2 },
  { key: 'fusionPower', label: 'Fusion power', unit: 'MW', digits: 1 },
  { key: 'qPlasma', label: 'Q_plasma', unit: '—', digits: 2 },
  { key: 'netElectric', label: 'Net electric', unit: 'MW', digits: 1 },
  { key: 'stability', label: 'Stability index', unit: '—', digits: 3 },
  { key: 'coolantOut', label: 'Coolant outlet', unit: '°C', digits: 1 },
] as const;

function ScenarioCard({ id }: { id: ScenarioId }) {
  const scenario = getScenario(id);
  const scenarioId = useSimulationStore((state) => state.scenarioId);
  const applyScenario = useSimulationStore((state) => state.applyScenario);
  const active = scenarioId === id;

  return (
    <div
      className={`flex flex-col gap-1 rounded-sm border p-2 transition-colors ${
        active ? 'border-sys/60 bg-sys/[0.07]' : 'border-edge/60 bg-white/[0.012] hover:border-edge2'
      }`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="num text-[8px] tracking-[0.16em] text-faint">{scenario.tag}</span>
        {active && <span className="chip chip-info">ACTIVE</span>}
      </div>
      <div className="text-[11px] font-semibold text-ink">{scenario.name}</div>
      <p className="flex-1 text-[8.5px] leading-snug text-muted">{scenario.description}</p>
      <button
        type="button"
        className={`btn btn-xs mt-1 ${active ? 'btn-primary' : ''}`}
        onClick={() => applyScenario(id)}
        disabled={active}
      >
        {active ? 'LOADED' : 'LOAD SCENARIO'}
      </button>
    </div>
  );
}

export function SimulationLab() {
  const frame = useSimulationStore((state) => state.frame);
  const setConfig = useSimulationStore((state) => state.setConfig);
  const setInitialConditions = useSimulationStore((state) => state.setInitialConditions);
  const presets = useSimulationStore((state) => state.presets);
  const savePreset = useSimulationStore((state) => state.savePreset);
  const loadPreset = useSimulationStore((state) => state.loadPreset);
  const deletePreset = useSimulationStore((state) => state.deletePreset);
  const duplicateScenario = useSimulationStore((state) => state.duplicateScenario);
  const start = useSimulationStore((state) => state.start);
  const pause = useSimulationStore((state) => state.pause);
  const resume = useSimulationStore((state) => state.resume);
  const reset = useSimulationStore((state) => state.reset);
  const exportCurrentSession = useSimulationStore((state) => state.exportCurrentSession);
  const pushToast = useSimulationStore((state) => state.pushToast);
  const appendEvent = useSimulationStore((state) => state.appendEvent);
  const whatIfBaseline = useSimulationStore((state) => state.whatIfBaseline);
  const whatIfVariant = useSimulationStore((state) => state.whatIfVariant);
  const comparison = useSimulationStore((state) => state.comparison);
  const whatIfRunning = useSimulationStore((state) => state.whatIfRunning);
  const runWhatIf = useSimulationStore((state) => state.runWhatIf);
  const clearWhatIf = useSimulationStore((state) => state.clearWhatIf);
  const lastValidation = useSimulationStore((state) => state.lastValidation);
  const events = useSimulationStore((state) => state.events);
  const sessions = useSimulationStore((state) => state.sessions);

  const [variant, setVariant] = useState<ScenarioId>('HIGH_HEATING');
  const [metricKey, setMetricKey] = useState<(typeof METRIC_OPTIONS)[number]['key']>('temperature');
  const [presetName, setPresetName] = useState('');
  const [sessionName, setSessionName] = useState('');
  const [seedText, setSeedText] = useState(String(frame.config.seed));

  const scenarioDefaults = useMemo(
    () => (frame.scenarioName === 'Baseline Scenario' ? getScenario('BASELINE').controls : undefined),
    [frame.scenarioName],
  );

  const metric = METRIC_OPTIONS.find((entry) => entry.key === metricKey) ?? METRIC_OPTIONS[0];

  const comparisonSeries = useMemo<StaticSeries[]>(() => {
    if (!whatIfBaseline || !whatIfVariant) return [];
    const build = (result: typeof whatIfBaseline, color: string): StaticSeries => ({
      name: result.label,
      color,
      unit: metric.unit,
      digits: metric.digits,
      data: result.series.map((sample) => [sample.t, sample[metric.key] as number | null]),
      area: false,
    });
    return [build(whatIfBaseline, '#22d3ee'), build(whatIfVariant, '#d946ef')];
  }, [whatIfBaseline, whatIfVariant, metric]);

  const recentChanges = useMemo(
    () =>
      events
        .filter((event) => event.category === 'CONTROL' || event.category === 'PRESET')
        .slice(-9)
        .reverse(),
    [events],
  );

  const applySeed = () => {
    const result = validateSeed(Number(seedText));
    setSeedText(String(result.value));
    setConfig({ seed: result.value });
    if (!result.valid) pushToast(result.message ?? 'Seed adjusted', 'warning');
  };

  const commitSetpoints = () => {
    appendEvent({
      id: `evt-apply-${Date.now()}`,
      tS: frame.simTimeS,
      wallMs: Date.now(),
      category: 'CONTROL',
      level: 'INFO',
      message: 'Setpoint set applied to the simulation engine',
      detail: `NBI ${frame.controls.nbiPowerMW} MW · ECH ${frame.controls.echPowerMW} MW · ICH ${frame.controls.ichPowerMW} MW · I_coil ${frame.controls.coilCurrentSetpointKA} kA · flow ${frame.controls.coolantFlowKgS} kg/s`,
    });
    pushToast('Current setpoint set applied and logged.', 'success');
  };

  const exportPlaybackCsv = () => {
    const samples = historyBuffer.all();
    if (!samples.length) {
      pushToast('Nothing recorded yet — run the simulation first.', 'warning');
      return;
    }
    downloadTextFile(
      `fusionplant-lab-${timestampSlug()}.csv`,
      samplesToCSV(samples, {
        source: 'FusionPlant Digital Twin — simulation lab export',
        scenario: frame.scenarioName,
        controls: JSON.stringify(frame.controls),
        config: JSON.stringify(frame.config),
        data_classification: 'SIMULATED / DEMO DATA — NOT A REAL EXPERIMENT',
      }),
      'text/csv',
    );
    pushToast(`Exported ${samples.length} samples to CSV.`, 'success');
  };

  const exportSessionJson = () => {
    const samples = historyBuffer.all();
    if (!samples.length) {
      pushToast('Nothing recorded yet — run the simulation first.', 'warning');
      return;
    }
    const json = sessionToJSON({
      id: `export-${Date.now()}`,
      name: sessionName.trim() || 'Simulation Lab export',
      createdAt: Date.now(),
      scenarioName: frame.scenarioName,
      samples,
      events,
      alarms: frame.alarms,
      controls: frame.controls,
      config: frame.config,
      durationS: frame.simTimeS,
      sampleCount: samples.length,
      approxBytes: samples.length * 240,
    });
    downloadTextFile(`fusionplant-session-${timestampSlug()}.json`, json, 'application/json');
    pushToast('Session JSON exported.', 'success');
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto scroll-thin p-2">
      <PageHeader
        eyebrow="08 · SIMULATION & COMMISSIONING"
        title="Simulation Lab — WHAT-IF Analysis"
        description="Single control surface for every simulated setpoint, model parameter, fault injection and headless scenario comparison. Changes are applied to the running engine immediately and every modification is timestamped in the event log."
        right={
          <>
            <button type="button" className="btn btn-primary" onClick={start} disabled={frame.status === 'RUNNING'}>
              ▶ RUN EXPERIMENT
            </button>
            <button type="button" className="btn" onClick={pause} disabled={frame.status !== 'RUNNING'}>
              PAUSE
            </button>
            <button type="button" className="btn" onClick={resume} disabled={frame.status !== 'PAUSED'}>
              RESUME
            </button>
            <button type="button" className="btn" onClick={reset}>
              RESET RUN
            </button>
          </>
        }
      />

      {lastValidation && (
        <Callout tone="warn" title="Input validation">
          {lastValidation}
        </Callout>
      )}

      <div className="grid grid-cols-1 gap-2 xl:grid-cols-[320px_minmax(0,1fr)_336px]">
        {/* ---------------- left: parameters ---------------- */}
        <div className="flex flex-col gap-2">
          <Panel title="Operator Setpoints" subtitle="8 validated controls" bodyClassName="!p-2">
            <div className="flex flex-col gap-2.5">
              {CONTROL_SPECS.map((spec) => (
                <ControlSlider
                  key={spec.key}
                  controlKey={spec.key}
                  baselineValue={scenarioDefaults ? scenarioDefaults[spec.key] : null}
                />
              ))}
            </div>
            <div className="mt-2 flex gap-1">
              <button type="button" className="btn btn-xs flex-1" onClick={commitSetpoints}>
                APPLY & LOG
              </button>
              <button
                type="button"
                className="btn btn-xs flex-1"
                onClick={() => {
                  const baseline = getScenario('BASELINE');
                  for (const spec of CONTROL_SPECS) {
                    useSimulationStore.getState().setControl(spec.key, baseline.controls[spec.key]);
                  }
                  pushToast('Setpoints reset to the baseline scenario values.', 'success');
                }}
              >
                RESET SETPOINTS
              </button>
            </div>
          </Panel>

          <Panel title="Simulation Parameters" subtitle="model & runtime" bodyClassName="!p-2">
            <div className="flex flex-col gap-2.5">
              <SlopeField
                label="Simulation time scale"
                value={frame.config.timeScale}
                min={0.5}
                max={20}
                step={0.5}
                onChange={(value) => setConfig({ timeScale: value })}
                format={(value) => `${value.toFixed(1)} ×`}
                hint="Simulated seconds per wall-clock second"
              />
              <SlopeField
                label="Confinement H-factor (H98y2)"
                value={frame.config.confinementH}
                min={0.6}
                max={1.8}
                step={0.05}
                onChange={(value) => setConfig({ confinementH: value })}
                format={(value) => value.toFixed(2)}
                hint="Multiplier on the IPB98(y,2) confinement scaling"
              />
              <SlopeField
                label="Disturbance level"
                value={frame.config.disturbanceLevel}
                min={0}
                max={1}
                step={0.01}
                onChange={(value) => setConfig({ disturbanceLevel: value })}
                format={(value) => `${(value * 100).toFixed(0)} %`}
                hint="Amplitude of slow plasma perturbations"
              />
              <SlopeField
                label="Measurement noise"
                value={frame.config.noiseLevel}
                min={0}
                max={1}
                step={0.01}
                onChange={(value) => setConfig({ noiseLevel: value })}
                format={(value) => `${(value * 100).toFixed(0)} %`}
                hint="Amplitude of diagnostic noise (displayed sensors only)"
              />
              <SlopeField
                label="Auxiliary heat recovery"
                value={frame.config.auxHeatRecovery}
                min={0}
                max={1}
                step={0.05}
                onChange={(value) => setConfig({ auxHeatRecovery: value })}
                format={(value) => `${(value * 100).toFixed(0)} %`}
                hint="Fraction of heating waste heat recovered into the primary loop"
              />
              <SlopeField
                label="Run duration"
                value={frame.config.runDurationS}
                min={30}
                max={600}
                step={10}
                onChange={(value) => setConfig({ runDurationS: value })}
                format={(value) => `${value.toFixed(0)} s`}
                hint="The simulation pauses automatically when this simulated duration is reached"
              />
              <div className="flex items-end gap-1">
                <div className="flex-1">
                  <NumberField
                    label="PRNG seed"
                    value={Number(seedText)}
                    onChange={(value) => setSeedText(String(Number.isFinite(value) ? value : ''))}
                    hint="Deterministic seed for reproducible disturbance / noise sequences"
                  />
                </div>
                <button type="button" className="btn btn-xs h-[26px]" onClick={applySeed}>
                  SET
                </button>
              </div>
            </div>
          </Panel>

          <Panel title="Initial Conditions" subtitle="applied on reset" bodyClassName="!p-2">
            <div className="flex flex-col gap-2.5">
              <SlopeField
                label="Initial plasma temperature"
                value={simulationEngine.initial.temperatureKeV}
                min={0.5}
                max={10}
                step={0.1}
                onChange={(value) => setInitialConditions({ temperatureKeV: value })}
                format={(value) => `${value.toFixed(1)} keV`}
              />
              <SlopeField
                label="Initial electron density"
                value={simulationEngine.initial.densityM3 / 1e19}
                min={0.1}
                max={3}
                step={0.05}
                onChange={(value) => setInitialConditions({ densityM3: value * 1e19 })}
                format={(value) => `${value.toFixed(2)}e19 m⁻³`}
              />
              <SlopeField
                label="Initial coil temperature"
                value={simulationEngine.initial.coilTemperatureK}
                min={4.3}
                max={12}
                step={0.1}
                onChange={(value) => setInitialConditions({ coilTemperatureK: value })}
                format={(value) => `${value.toFixed(1)} K`}
              />
              <p className="text-[8px] leading-snug text-faint">
                These values are used the next time the run is reset or a scenario is loaded.
              </p>
            </div>
          </Panel>
        </div>

        {/* ---------------- center: scenarios + what-if ---------------- */}
        <div className="flex flex-col gap-2">
          <Panel
            title="Scenario Library"
            subtitle="educational operating points"
            right={
              <button type="button" className="btn btn-xs" onClick={duplicateScenario}>
                COPY CURRENT
              </button>
            }
            bodyClassName="!p-2"
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 2xl:grid-cols-3">
              {SCENARIO_DEFINITIONS.map((scenario) => (
                <ScenarioCard key={scenario.id} id={scenario.id} />
              ))}
            </div>
          </Panel>

          <Panel
            title="WHAT-IF Analysis"
            subtitle="headless comparison, live run untouched"
            right={
              <button type="button" className="btn btn-xs" onClick={clearWhatIf} disabled={!whatIfBaseline}>
                CLEAR
              </button>
            }
            bodyClassName="!p-2"
          >
            <div className="flex flex-wrap items-center gap-1">
              {VARIANT_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`btn btn-xs ${variant === option.id ? 'btn-primary' : ''}`}
                  onClick={() => setVariant(option.id)}
                  title={option.hint}
                >
                  {option.label}
                </button>
              ))}
              <button
                type="button"
                className="btn btn-primary ml-auto"
                onClick={() => void runWhatIf(variant)}
                disabled={whatIfRunning}
              >
                {whatIfRunning ? 'RUNNING…' : 'RUN WHAT-IF'}
              </button>
            </div>

            <p className="mt-1.5 text-[8.5px] leading-snug text-faint">
              Runs the baseline and the selected variant headlessly for {Math.min(600, Math.max(60, frame.config.runDurationS))} simulated
              seconds using separate engine instances. Results never modify the live run or its history.
            </p>

            {whatIfBaseline && whatIfVariant ? (
              <>
                <Divider label={`BASELINE vs ${whatIfVariant.label.toUpperCase()}`} />
                <div className="grid grid-cols-1 gap-2 2xl:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap gap-1">
                      {METRIC_OPTIONS.map((option) => (
                        <button
                          key={option.key}
                          type="button"
                          className={`btn btn-xs ${metricKey === option.key ? 'btn-primary' : ''}`}
                          onClick={() => setMetricKey(option.key)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <div className="h-[210px] rounded-sm border border-edge/50 bg-[#04101a]/60 p-1">
                      <StaticMultiChart
                        series={comparisonSeries}
                        leftUnit={metric.unit}
                        showZoom={false}
                        height="100%"
                      />
                    </div>
                  </div>

                  <div className="min-w-0 overflow-y-auto scroll-thin" style={{ maxHeight: 246 }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Metric</th>
                          <th className="text-right">Base</th>
                          <th className="text-right">Variant</th>
                          <th className="text-right">Δ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comparison.map((row) => (
                          <tr key={row.metric} title={`${row.metric} [${row.unit}]`}>
                            <td className="!font-sans !text-[9.5px] text-muted">{row.metric}</td>
                            <td className="text-right">{row.baseline}</td>
                            <td className="text-right text-ink">{row.variant}</td>
                            <td
                              className={`text-right ${
                                row.deltaPct === null
                                  ? 'text-faint'
                                  : row.delta.startsWith('-')
                                    ? 'text-rose-300'
                                    : row.delta.startsWith('+')
                                      ? 'text-emerald-300'
                                      : 'text-muted'
                              }`}
                            >
                              {row.delta}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex h-[150px] flex-col items-center justify-center gap-1 text-center">
                <span className="text-[10px] tracking-[0.16em] text-faint">NO COMPARISON RUN YET</span>
                <span className="max-w-md text-[9px] leading-snug text-faint">
                  Pick a variant and run the analysis. Two isolated engine instances are stepped for the configured
                  duration and the summaries are compared across temperature, power, stability, Q factors and the
                  integrated energy balance.
                </span>
              </div>
            )}
          </Panel>

          <Panel title="Headless Run Summary" subtitle="latest WHAT-IF" bodyClassName="!p-2">
            {whatIfBaseline && whatIfVariant ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {[whatIfBaseline, whatIfVariant].map((result, index) => (
                  <div key={result.label} className="rounded-sm border border-edge/50 bg-white/[0.014] p-2">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-[10px] font-semibold" style={{ color: index === 0 ? '#22d3ee' : '#d946ef' }}>
                        {result.label}
                      </span>
                      <span className="num text-[8.5px] text-faint">{result.durationS} s</span>
                    </div>
                    <ParameterTable
                      dense
                      rows={[
                        { label: 'Final temperature', value: formatNumber(result.summary.finalTemperatureKeV, 2), unit: 'keV' },
                        { label: 'Peak temperature', value: formatNumber(result.summary.peakTemperatureKeV, 2), unit: 'keV' },
                        { label: 'Final fusion power', value: formatNumber(result.summary.finalFusionPowerMW, 1), unit: 'MW' },
                        { label: 'Q_plasma', value: formatNumber(result.summary.finalQPlasma, 2), unit: '—' },
                        { label: 'Q_engineering', value: formatNumber(result.summary.finalQEngineering, 2), unit: '—' },
                        { label: 'Min stability', value: formatNumber(result.summary.minStability, 3), unit: '—' },
                        { label: 'Final net electric', value: formatNumber(result.summary.finalNetElectricMW, 1), unit: 'MW' },
                        { label: 'Integrated thermal', value: formatNumber(result.summary.integratedThermalGJ, 1), unit: 'GJ' },
                        { label: 'Integrated net electric', value: formatNumber(result.summary.integratedNetElectricGJ, 1), unit: 'GJ' },
                        { label: 'Alarms raised', value: String(result.summary.alarms), unit: '' },
                      ]}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-3 text-center text-[10px] text-faint">Run a WHAT-IF analysis to populate this summary.</p>
            )}
          </Panel>
        </div>

        {/* ---------------- right: faults, presets, export ---------------- */}
        <div className="flex flex-col gap-2">
          <Panel title="Fault Injection" subtitle="8 modelled faults" bodyClassName="!p-2">
            <FaultPanel />
          </Panel>

          <Panel
            title="Scenario Presets"
            subtitle={`${presets.length} saved locally`}
            bodyClassName="!p-2"
          >
            <div className="flex gap-1">
              <input
                className="field flex-1"
                placeholder="Preset name…"
                value={presetName}
                onChange={(event) => setPresetName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    savePreset(presetName);
                    setPresetName('');
                  }
                }}
              />
              <button
                type="button"
                className="btn btn-xs"
                onClick={() => {
                  savePreset(presetName);
                  setPresetName('');
                }}
              >
                SAVE
              </button>
            </div>
            <div className="mt-2 flex max-h-[150px] flex-col gap-1 overflow-y-auto scroll-thin">
              {presets.length === 0 && (
                <p className="py-2 text-center text-[9px] text-faint">No presets yet. Configure setpoints and save them.</p>
              )}
              {presets.map((preset) => (
                <div key={preset.id} className="flex items-center gap-1 rounded-sm border border-edge/50 px-1.5 py-1">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[10px] text-ink">{preset.name}</div>
                    <div className="num text-[8px] text-faint">
                      {formatDateTime(preset.createdAt)} · {preset.source}
                    </div>
                  </div>
                  <button type="button" className="btn btn-xs" onClick={() => loadPreset(preset.id)}>
                    LOAD
                  </button>
                  <button type="button" className="btn btn-xs btn-danger" onClick={() => deletePreset(preset.id)}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Export & Recording" bodyClassName="!p-2">
            <div className="flex flex-col gap-1.5">
              <input
                className="field"
                placeholder="Session / export name…"
                value={sessionName}
                onChange={(event) => setSessionName(event.target.value)}
              />
              <div className="grid grid-cols-2 gap-1">
                <button type="button" className="btn btn-xs" onClick={exportPlaybackCsv}>
                  CSV HISTORY
                </button>
                <button type="button" className="btn btn-xs" onClick={exportSessionJson}>
                  JSON SESSION
                </button>
                <button
                  type="button"
                  className="btn btn-xs btn-primary col-span-2"
                  onClick={() => {
                    exportCurrentSession(sessionName);
                    setSessionName('');
                  }}
                >
                  SAVE SESSION LOCALLY
                </button>
              </div>
              <p className="text-[8px] leading-snug text-faint">
                {formatClock(frame.simTimeS)} simulated · {historyBuffer.size} samples in memory · {sessions.length} saved
                session(s). Exports are labelled SIMULATED DATA.
              </p>
            </div>
          </Panel>

          <Panel title="Recent Parameter Changes" subtitle="timestamped" bodyClassName="!p-2">
            <div className="flex max-h-[190px] flex-col gap-1 overflow-y-auto scroll-thin">
              {recentChanges.length === 0 && (
                <p className="py-2 text-center text-[9px] text-faint">No changes yet in this run.</p>
              )}
              {recentChanges.map((event) => (
                <div key={event.id} className="flex items-start gap-1.5 border-l border-sys/30 pl-1.5">
                  <span className="num shrink-0 text-[8px] text-faint">T+{event.tS.toFixed(1)}s</span>
                  <div className="min-w-0">
                    <div className="truncate text-[9px] text-ink">{event.message}</div>
                    {event.detail && <div className="num truncate text-[8px] text-faint">{event.detail}</div>}
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Callout tone="warn" title="Model scope">
            The engine is a transparent, simplified 0-D model. It is suitable for interactive education and UI
            validation only — never for operating real equipment. Baseline reference point: {formatBytes(0)}.
          </Callout>
        </div>
      </div>
    </div>
  );
}
