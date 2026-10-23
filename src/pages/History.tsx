import { useEffect, useMemo, useRef, useState } from 'react';
import { Panel } from '@/components/ui/Panel';
import { PageHeader, Callout, ParameterTable } from '@/components/ui/Layout';
import { StaticMultiChart, type StaticSeries } from '@/components/charts/StaticMultiChart';
import { EventLog } from '@/components/diagnostics/EventLog';
import { useSimulationStore } from '@/store/simulationStore';
import { historyBuffer } from '@/store/historyBuffer';
import type { HistorySample, PersistedSession } from '@/types/simulation';
import { summarizeSeries } from '@/simulation/FusionSimulationEngine';
import { downloadTextFile, samplesToCSV, sessionToJSON, timestampSlug } from '@/utils/export';
import { formatBytes, formatClock, formatDateTime, formatNumber } from '@/utils/units';

type SourceId = 'LIVE' | string;

interface Dataset {
  id: SourceId;
  label: string;
  scenario: string;
  samples: HistorySample[];
}

const METRICS = [
  { key: 'temperature', label: 'Temperature', unit: 'keV', digits: 2, color: '#22d3ee' },
  { key: 'fusionPower', label: 'Fusion power', unit: 'MW', digits: 1, color: '#d946ef' },
  { key: 'qPlasma', label: 'Q_plasma', unit: '—', digits: 2, color: '#a78bfa' },
  { key: 'netElectric', label: 'Net electric', unit: 'MW', digits: 1, color: '#facc15' },
  { key: 'stability', label: 'Stability', unit: '—', digits: 3, color: '#a3e635' },
] as const;

function summaryOf(samples: HistorySample[]) {
  return summarizeSeries(samples);
}

export function History() {
  const sessions = useSimulationStore((state) => state.sessions);
  const storageBytes = useSimulationStore((state) => state.storageBytes);
  const storageAvailable = useSimulationStore((state) => state.storageAvailable);
  const refreshSessions = useSimulationStore((state) => state.refreshSessions);
  const readSession = useSimulationStore((state) => state.readSession);
  const removeSession = useSimulationStore((state) => state.removeSession);
  const pushToast = useSimulationStore((state) => state.pushToast);
  const appendEvent = useSimulationStore((state) => state.appendEvent);
  const liveFrame = useSimulationStore((state) => state.frame);

  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [compare, setCompare] = useState<Dataset | null>(null);
  const [cursor, setCursor] = useState(0);
  const [range, setRange] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(8);
  const [metricKey, setMetricKey] = useState<(typeof METRICS)[number]['key']>('temperature');
  const [sessionName, setSessionName] = useState('');

  const timerRef = useRef<number | null>(null);
  const metric = METRICS.find((entry) => entry.key === metricKey) ?? METRICS[0];

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  // Capture the live buffer once on mount so playback is independent of the live run.
  useEffect(() => {
    const samples = historyBuffer.all();
    if (samples.length) {
      setDataset({
        id: 'LIVE',
        label: 'Live buffer snapshot',
        scenario: 'current run',
        samples,
      });
      setRange({ start: 0, end: Math.max(0, samples.length - 1) });
      setCursor(Math.max(0, samples.length - 1));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!playing || !dataset) return undefined;
    timerRef.current = window.setInterval(() => {
      setCursor((current) => {
        const next = current + speed;
        if (next > range.end) {
          return range.start;
        }
        return next;
      });
    }, 100);
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [playing, speed, dataset, range.start, range.end]);

  const captureLive = () => {
    const samples = historyBuffer.all();
    if (!samples.length) {
      pushToast('The live buffer is empty — start the simulation first.', 'warning');
      return;
    }
    setDataset({ id: 'LIVE', label: 'Live buffer snapshot', scenario: liveFrame.scenarioName, samples });
    setRange({ start: 0, end: samples.length - 1 });
    setCursor(samples.length - 1);
    pushToast(`Captured ${samples.length} samples from the live buffer.`, 'success');
    appendEvent({
      id: `evt-capture-${Date.now()}`,
      tS: liveFrame.simTimeS,
      wallMs: Date.now(),
      category: 'EXPORT',
      level: 'INFO',
      message: 'Live history captured for playback',
      detail: `${samples.length} samples`,
    });
  };

  const loadInto = (slot: 'A' | 'B', id: string) => {
    const session = readSession(id);
    if (!session) {
      pushToast('Could not read that session from browser storage.', 'critical');
      return;
    }
    const loaded: Dataset = {
      id: session.id,
      label: session.name,
      scenario: session.scenarioName,
      samples: session.samples,
    };
    if (slot === 'A') {
      setDataset(loaded);
      setRange({ start: 0, end: Math.max(0, session.samples.length - 1) });
      setCursor(0);
    } else {
      setCompare(loaded);
    }
    pushToast(`Session "${session.name}" loaded into slot ${slot}.`, 'success');
  };

  const windowSamples = useMemo(() => {
    if (!dataset) return [];
    const start = Math.min(range.start, dataset.samples.length - 1);
    const end = Math.min(range.end, dataset.samples.length - 1);
    return dataset.samples.slice(start, Math.max(start + 1, end + 1));
  }, [dataset, range]);

  const cursorSample = useMemo(() => {
    if (!dataset || !dataset.samples.length) return null;
    return dataset.samples[Math.min(cursor, dataset.samples.length - 1)] ?? null;
  }, [dataset, cursor]);

  const series = useMemo<StaticSeries[]>(() => {
    const result: StaticSeries[] = [];
    if (dataset) {
      result.push({
        name: `${dataset.label} · ${metric.label}`,
        color: metric.color,
        unit: metric.unit,
        digits: metric.digits,
        data: windowSamples.map((sample) => [sample.t, sample[metric.key] as number | null]),
        area: true,
      });
    }
    if (compare) {
      const compareWindow = compare.samples.filter(
        (sample) => sample.t >= windowSamples[0]?.t && sample.t <= windowSamples[windowSamples.length - 1]?.t,
      );
      result.push({
        name: `B: ${compare.label}`,
        color: '#d946ef',
        unit: metric.unit,
        digits: metric.digits,
        data: compareWindow.map((sample) => [sample.t, sample[metric.key] as number | null]),
        dashed: true,
      });
    }
    return result;
  }, [dataset, compare, windowSamples, metric]);

  const summaryA = useMemo(() => summaryOf(dataset?.samples ?? []), [dataset]);
  const summaryB = useMemo(() => summaryOf(compare?.samples ?? []), [compare]);

  const exportRangeCsv = () => {
    if (!windowSamples.length) {
      pushToast('Select a range with samples first.', 'warning');
      return;
    }
    downloadTextFile(
      `fusionplant-history-${timestampSlug()}.csv`,
      samplesToCSV(windowSamples, {
        source: 'FusionPlant Digital Twin — historical playback range',
        dataset: dataset?.label ?? 'n/a',
        scenario: dataset?.scenario ?? 'n/a',
        range_seconds: `${windowSamples[0].t.toFixed(1)} to ${windowSamples[windowSamples.length - 1].t.toFixed(1)}`,
        data_classification: 'SIMULATED / DEMO DATA — NOT A REAL EXPERIMENT',
      }),
      'text/csv',
    );
    pushToast(`Exported ${windowSamples.length} samples.`, 'success');
  };

  const exportRangeJson = () => {
    if (!dataset) return;
    const session: PersistedSession = {
      id: `history-${Date.now()}`,
      name: dataset.label,
      createdAt: Date.now(),
      scenarioName: dataset.scenario,
      samples: windowSamples,
      events: [],
      alarms: [],
      controls: liveFrame.controls,
      config: liveFrame.config,
      durationS: windowSamples.length ? windowSamples[windowSamples.length - 1].t - windowSamples[0].t : 0,
      sampleCount: windowSamples.length,
      approxBytes: windowSamples.length * 240,
    };
    downloadTextFile(`fusionplant-history-${timestampSlug()}.json`, sessionToJSON(session), 'application/json');
    pushToast('Range exported as JSON.', 'success');
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto scroll-thin p-2">
      <PageHeader
        eyebrow="09 · HISTORY & PLAYBACK"
        title="Recorded Data, Events & Comparison"
        description="Browse the in-memory history buffer or a session saved in browser storage, scrub or replay a selected interval, and compare two experiments. Playback is read-only: it never touches the running simulation."
        right={
          <>
            <button type="button" className="btn btn-xs" onClick={captureLive}>
              CAPTURE LIVE BUFFER
            </button>
            <button type="button" className="btn btn-xs" onClick={refreshSessions}>
              REFRESH STORAGE
            </button>
            <span className={`chip ${storageAvailable ? 'chip-ok' : 'chip-warn'}`}>
              {storageAvailable ? `${formatBytes(storageBytes)} USED` : 'STORAGE UNAVAILABLE'}
            </span>
          </>
        }
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 xl:grid-cols-[286px_minmax(0,1fr)_320px]">
        {/* ---------------- sessions ---------------- */}
        <div className="flex flex-col gap-2">
          <Panel title="Saved Sessions" subtitle={`${sessions.length} in browser storage`} bodyClassName="!p-2">
            <div className="flex max-h-[260px] flex-col gap-1 overflow-y-auto scroll-thin">
              {sessions.length === 0 && (
                <p className="py-3 text-center text-[9px] leading-snug text-faint">
                  No saved sessions. Record one from the SIMULATION LAB, or capture the live buffer above.
                </p>
              )}
              {sessions.map((session) => (
                <div key={session.id} className="rounded-sm border border-edge/50 bg-white/[0.012] p-1.5">
                  <div className="flex items-start justify-between gap-1">
                    <span className="truncate text-[10px] text-ink">{session.name}</span>
                    <span className="num shrink-0 text-[8px] text-faint">{formatBytes(session.approxBytes)}</span>
                  </div>
                  <div className="num text-[8px] text-faint">
                    {formatDateTime(session.createdAt)} · {session.sampleCount} pts · {formatClock(session.durationS)}
                  </div>
                  <div className="mt-1 flex gap-1">
                    <button type="button" className="btn btn-xs flex-1" onClick={() => loadInto('A', session.id)}>
                      LOAD A
                    </button>
                    <button type="button" className="btn btn-xs flex-1" onClick={() => loadInto('B', session.id)}>
                      COMPARE B
                    </button>
                    <button
                      type="button"
                      className="btn btn-xs btn-danger"
                      onClick={() => removeSession(session.id)}
                      title="Delete session"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-1.5 border-t border-edge/40 pt-1 text-[8px] leading-snug text-faint">
              Sessions are compacted and capped so the browser quota cannot be exhausted; the oldest entry is evicted
              when the limit is reached.
            </p>
          </Panel>

          <Panel title="Dataset A" subtitle={dataset?.label ?? 'none selected'} bodyClassName="!p-2">
            {dataset ? (
              <ParameterTable
                dense
                rows={[
                  { label: 'Scenario', value: dataset.scenario, unit: '' },
                  { label: 'Samples', value: String(dataset.samples.length), unit: '' },
                  {
                    label: 'Time span',
                    value: dataset.samples.length
                      ? `${dataset.samples[0].t.toFixed(0)}–${dataset.samples[dataset.samples.length - 1].t.toFixed(0)}`
                      : '—',
                    unit: 's',
                  },
                  { label: 'Peak temperature', value: formatNumber(summaryA.peakTemperatureKeV, 2), unit: 'keV' },
                  { label: 'Peak fusion power', value: formatNumber(summaryA.peakFusionPowerMW, 1), unit: 'MW' },
                  { label: 'Integrated thermal', value: formatNumber(summaryA.integratedThermalGJ, 1), unit: 'GJ' },
                  { label: 'Integrated net electric', value: formatNumber(summaryA.integratedNetElectricGJ, 1), unit: 'GJ' },
                ]}
              />
            ) : (
              <p className="py-2 text-center text-[9px] text-faint">Capture the live buffer or load a session.</p>
            )}
          </Panel>

          <Panel title="Dataset B" subtitle={compare?.label ?? 'none selected'} className="min-h-[180px] flex-1" bodyClassName="!p-2">
            {compare ? (
              <>
                <ParameterTable
                  dense
                  rows={[
                    { label: 'Scenario', value: compare.scenario, unit: '' },
                    { label: 'Samples', value: String(compare.samples.length), unit: '' },
                    { label: 'Peak temperature', value: formatNumber(summaryB.peakTemperatureKeV, 2), unit: 'keV' },
                    { label: 'Peak fusion power', value: formatNumber(summaryB.peakFusionPowerMW, 1), unit: 'MW' },
                    { label: 'Integrated thermal', value: formatNumber(summaryB.integratedThermalGJ, 1), unit: 'GJ' },
                  ]}
                />
                <button type="button" className="btn btn-xs mt-1 w-full" onClick={() => setCompare(null)}>
                  CLEAR B
                </button>
              </>
            ) : (
              <p className="py-2 text-center text-[9px] text-faint">
                Load a second session with COMPARE B to overlay two experiments.
              </p>
            )}
          </Panel>
        </div>

        {/* ---------------- playback ---------------- */}
        <div className="flex min-w-0 flex-col gap-2">
          <Panel
            title="Playback"
            subtitle={dataset ? `${windowSamples.length} samples in selected range` : 'no dataset'}
            right={
              <>
                <div className="segment">
                  {METRICS.map((entry) => (
                    <button
                      key={entry.key}
                      type="button"
                      data-active={metricKey === entry.key}
                      onClick={() => setMetricKey(entry.key)}
                    >
                      {entry.label.split(' ')[0].toUpperCase()}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className={`btn btn-xs ${playing ? 'btn-primary' : ''}`}
                  onClick={() => setPlaying((value) => !value)}
                  disabled={!dataset}
                >
                  {playing ? '❚❚ PAUSE' : '▶ PLAY'}
                </button>
              </>
            }
            bodyClassName="!p-2"
          >
            <div className="h-[250px] rounded-sm border border-edge/50 bg-[#04101a]/60 p-1">
              {dataset ? (
                <StaticMultiChart
                  series={series}
                  leftUnit={metric.unit}
                  showZoom={false}
                  cursor={cursorSample?.t ?? null}
                  cursorLabel={`PLAYHEAD ${cursorSample ? cursorSample.t.toFixed(0) : 0}s`}
                  height="100%"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-[10px] tracking-wider text-faint">
                  NO DATASET LOADED
                </div>
              )}
            </div>

            {dataset && (
              <>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <div>
                    <div className="mb-0.5 flex items-center justify-between">
                      <span className="label">Range start</span>
                      <span className="num text-[8.5px] text-muted">
                        {dataset.samples[Math.min(range.start, dataset.samples.length - 1)]?.t.toFixed(1) ?? 0} s
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0, dataset.samples.length - 2)}
                      value={Math.min(range.start, dataset.samples.length - 1)}
                      onChange={(event) =>
                        setRange((current) => ({
                          start: Math.min(Number(event.target.value), current.end - 1),
                          end: current.end,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <div className="mb-0.5 flex items-center justify-between">
                      <span className="label">Range end</span>
                      <span className="num text-[8.5px] text-muted">
                        {dataset.samples[Math.min(range.end, dataset.samples.length - 1)]?.t.toFixed(1) ?? 0} s
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={Math.max(1, dataset.samples.length - 1)}
                      value={Math.min(range.end, dataset.samples.length - 1)}
                      onChange={(event) =>
                        setRange((current) => ({
                          start: current.start,
                          end: Math.max(Number(event.target.value), current.start + 1),
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="mt-1">
                  <div className="mb-0.5 flex items-center justify-between">
                    <span className="label">Playhead</span>
                    <span className="num text-[8.5px] text-sys">
                      {cursorSample ? `T+ ${cursorSample.t.toFixed(1)} s` : '—'}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={range.start}
                    max={Math.max(range.start, range.end)}
                    value={Math.min(cursor, range.end)}
                    onChange={(event) => {
                      setPlaying(false);
                      setCursor(Number(event.target.value));
                    }}
                  />
                </div>

                <div className="mt-1 flex items-center gap-1">
                  <span className="label">Speed</span>
                  {[1, 4, 8, 20].map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={`btn btn-xs ${speed === value ? 'btn-primary' : ''}`}
                      onClick={() => setSpeed(value)}
                    >
                      {value}×
                    </button>
                  ))}
                  <button type="button" className="btn btn-xs ml-auto" onClick={exportRangeCsv}>
                    EXPORT RANGE CSV
                  </button>
                  <button type="button" className="btn btn-xs" onClick={exportRangeJson}>
                    EXPORT JSON
                  </button>
                </div>
              </>
            )}
          </Panel>

          <Panel title="Playhead Read-Out" subtitle="sample at cursor" bodyClassName="!p-2">
            {cursorSample ? (
              <div className="grid grid-cols-2 gap-x-4 md:grid-cols-4">
                <ReadOut label="Temperature" value={formatNumber(cursorSample.temperature, 2)} unit="keV" />
                <ReadOut label="Density" value={formatNumber(cursorSample.density / 1e19, 2)} unit="1e19 m⁻³" />
                <ReadOut label="Fusion power" value={formatNumber(cursorSample.fusionPower, 1)} unit="MW" />
                <ReadOut label="Heating" value={formatNumber(cursorSample.heatingPower, 1)} unit="MW" />
                <ReadOut label="Q plasma" value={formatNumber(cursorSample.qPlasma, 2)} unit="—" />
                <ReadOut label="Q engineering" value={formatNumber(cursorSample.qEngineering, 2)} unit="—" />
                <ReadOut label="Coil temp" value={formatNumber(cursorSample.coilTemperature, 2)} unit="K" />
                <ReadOut label="Coolant out" value={formatNumber(cursorSample.coolantOut, 1)} unit="°C" />
                <ReadOut label="Stability" value={formatNumber(cursorSample.stability, 3)} unit="—" />
                <ReadOut label="B_tor" value={formatNumber(cursorSample.toroidalField, 2)} unit="T" />
                <ReadOut label="Thermal" value={formatNumber(cursorSample.thermalPower, 0)} unit="MW" />
                <ReadOut label="Net electric" value={formatNumber(cursorSample.netElectric, 1)} unit="MW" />
              </div>
            ) : (
              <p className="py-2 text-center text-[9px] text-faint">No sample under the cursor.</p>
            )}
          </Panel>
        </div>

        {/* ---------------- right: comparison, events, storage ---------------- */}
        <div className="flex flex-col gap-2">
          <Panel title="Experiment Comparison" subtitle="A vs B summary" bodyClassName="!p-2">
            {compare && dataset ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th className="text-right">A</th>
                    <th className="text-right">B</th>
                  </tr>
                </thead>
                <tbody>
                  <CompareRow label="Peak temp" unit="keV" a={summaryA.peakTemperatureKeV} b={summaryB.peakTemperatureKeV} digits={2} />
                  <CompareRow label="Peak fusion" unit="MW" a={summaryA.peakFusionPowerMW} b={summaryB.peakFusionPowerMW} digits={1} />
                  <CompareRow label="Final Q" unit="—" a={summaryA.finalQPlasma} b={summaryB.finalQPlasma} digits={2} allowNull />
                  <CompareRow label="Q_eng" unit="—" a={summaryA.finalQEngineering} b={summaryB.finalQEngineering} digits={2} allowNull />
                  <CompareRow label="Min stability" unit="—" a={summaryA.minStability} b={summaryB.minStability} digits={3} />
                  <CompareRow label="Thermal ∫" unit="GJ" a={summaryA.integratedThermalGJ} b={summaryB.integratedThermalGJ} digits={1} />
                  <CompareRow label="Net electric ∫" unit="GJ" a={summaryA.integratedNetElectricGJ} b={summaryB.integratedNetElectricGJ} digits={1} />
                  <CompareRow label="Peak coil T" unit="K" a={summaryA.finalCoilTempK} b={summaryB.finalCoilTempK} digits={2} />
                </tbody>
              </table>
            ) : (
              <p className="py-3 text-center text-[9px] leading-snug text-faint">
                Load a dataset into A and another into B to compare integrated energy balances, gains and stability.
              </p>
            )}
          </Panel>

          <Panel title="Save This Run" subtitle="browser storage" bodyClassName="!p-2">
            <input
              className="field"
              placeholder="Session name…"
              value={sessionName}
              onChange={(event) => setSessionName(event.target.value)}
            />
            <div className="mt-1 grid grid-cols-2 gap-1">
              <button
                type="button"
                className="btn btn-xs btn-primary"
                onClick={() => {
                  useSimulationStore.getState().exportCurrentSession(sessionName || `History ${new Date().toLocaleTimeString()}`);
                  setSessionName('');
                }}
              >
                SAVE LIVE SESSION
              </button>
              <button
                type="button"
                className="btn btn-xs"
                onClick={() => {
                  refreshSessions();
                  pushToast('Session list refreshed from browser storage.', 'info');
                }}
              >
                REFRESH
              </button>
            </div>
            <p className="mt-1.5 text-[8px] leading-snug text-faint">
              Saved sessions survive a page refresh. Restore them with LOAD A / COMPARE B. Capacity is limited by the
              browser quota; older sessions are evicted automatically.
            </p>
          </Panel>

          <Callout tone="info" title="Playback isolation">
            Playback operates on immutable copies of recorded samples. It cannot advance, rewind or otherwise modify
            the live simulation engine or its history buffer.
          </Callout>

          <Panel title="Event Log" subtitle="all recorded actions" className="min-h-[240px] flex-1" bodyClassName="!p-2">
            <EventLog height={220} compact />
          </Panel>
        </div>
      </div>
    </div>
  );
}

function ReadOut({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="border-b border-edge/25 py-0.5">
      <div className="label truncate">{label}</div>
      <div className="num text-[11px] text-ink">
        {value} <span className="text-[8px] text-faint">{unit}</span>
      </div>
    </div>
  );
}

function CompareRow({
  label,
  unit,
  a,
  b,
  digits,
  allowNull = false,
}: {
  label: string;
  unit: string;
  a: number | null;
  b: number | null;
  digits: number;
  allowNull?: boolean;
}) {
  const format = (value: number | null) => {
    if (value === null || !Number.isFinite(value)) return allowNull ? 'N/A' : '—';
    return value.toFixed(digits);
  };
  const better =
    a !== null && b !== null && Number.isFinite(a) && Number.isFinite(b) ? b > a : null;

  return (
    <tr>
      <td className="!font-sans !text-[9.5px] text-muted">
        {label} <span className="text-faint">[{unit}]</span>
      </td>
      <td className="text-right">{format(a)}</td>
      <td className={`text-right ${better === null ? '' : better ? 'text-emerald-300' : 'text-amber-300'}`}>
        {format(b)}
      </td>
    </tr>
  );
}
