import { CHART_WINDOWS, historyBuffer, useSimulationStore } from '@/store/simulationStore';
import { downloadTextFile, samplesToCSV, timestampSlug } from '@/utils/export';
import { useSimulationStore as useStore } from '@/store/simulationStore';

/** Shared time-window selector for every live chart. */
export function ChartWindowSelector() {
  const windowSec = useSimulationStore((state) => state.chartWindowSec);
  const setWindow = useSimulationStore((state) => state.setChartWindow);

  return (
    <div className="segment">
      {CHART_WINDOWS.map((option) => (
        <button
          key={option.seconds}
          type="button"
          data-active={option.seconds === windowSec}
          onClick={() => setWindow(option.seconds)}
          title={`Show the last ${option.label} of simulated time`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Freeze/unfreeze chart refresh without pausing the simulation. */
export function ChartPauseButton() {
  const paused = useSimulationStore((state) => state.chartsPaused);
  const toggle = useSimulationStore((state) => state.toggleChartsPaused);

  return (
    <button
      type="button"
      onClick={toggle}
      className={`btn btn-xs ${paused ? 'btn-primary' : ''}`}
      title={paused ? 'Resume chart refresh' : 'Pause chart refresh (simulation keeps running)'}
    >
      {paused ? '▶ LIVE' : '❚❚ HOLD'}
    </button>
  );
}

/** Export the current chart window as CSV, labelled as simulated data. */
export function ChartExportButton({ label = 'CSV' }: { label?: string }) {
  const windowSec = useSimulationStore((state) => state.chartWindowSec);
  const pushToast = useSimulationStore((state) => state.pushToast);
  const appendEvent = useStore((state) => state.appendEvent);
  const simTime = useStore((state) => state.frame.simTimeS);

  const handleExport = () => {
    const samples = historyBuffer.window(windowSec);
    if (samples.length < 2) {
      pushToast('No chart samples available yet — start the simulation first.', 'warning');
      return;
    }
    const csv = samplesToCSV(samples, {
      source: 'FusionPlant Digital Twin — live chart window',
      scenario: useStore.getState().frame.scenarioName,
      simulated_time_window: `${windowSec} s`,
      exported: new Date().toISOString(),
      data_classification: 'SIMULATED / DEMO DATA — NOT A REAL EXPERIMENT',
    });
    downloadTextFile(`fusionplant-chart-${timestampSlug()}.csv`, csv, 'text/csv');
    appendEvent({
      id: `evt-csv-${Date.now()}`,
      tS: simTime,
      wallMs: Date.now(),
      category: 'EXPORT',
      level: 'INFO',
      message: 'Chart window exported to CSV',
      detail: `${samples.length} samples`,
    });
    pushToast('Chart CSV exported.', 'success');
  };

  return (
    <button type="button" className="btn btn-xs" onClick={handleExport} title="Export this chart window to CSV">
      {label}
    </button>
  );
}
