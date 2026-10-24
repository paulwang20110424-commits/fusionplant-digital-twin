import { Panel } from '@/components/ui/Panel';
import { PageHeader, Callout } from '@/components/ui/Layout';
import { ChartPanel, CorrelationScatter } from '@/components/charts/ChartPanel';
import { CHART_CONFIGS } from '@/components/charts/chartConfigs';
import { ChartWindowSelector, ChartPauseButton, ChartExportButton } from '@/components/charts/ChartToolbar';
import { SensorTable } from '@/components/diagnostics/SensorTable';
import { AlarmHistoryTable, EventLog } from '@/components/diagnostics/EventLog';
import { useSimulationStore } from '@/store/simulationStore';
import { historyBuffer } from '@/store/historyBuffer';

const CHART_ORDER = [
  'temperature',
  'fusion',
  'q',
  'field',
  'cooling',
  'plantPower',
  'stability',
  'plasmaCurrent',
  'heating',
  'exchanger',
];

export function Diagnostics() {
  const frame = useSimulationStore((state) => state.frame);
  const sampleCount = useSimulationStore((state) => state.sampleCount);
  const events = useSimulationStore((state) => state.events);

  const bufferRange = historyBuffer.timeRange;
  const alarms = frame.alarms;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto scroll-thin p-2">
      <PageHeader
        eyebrow="07 · DIAGNOSTICS"
        title="Diagnostics & Live Data"
        description="Measured and simulated channels, all live trend charts, alarm history and the operator event log. Sensor faults affect the measured columns only — the simulated state keeps evolving."
        right={
          <>
            <ChartWindowSelector />
            <ChartPauseButton />
            <ChartExportButton label="CSV ALL" />
            <span className="chip chip-idle">{sampleCount} SAMPLES</span>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-2 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Panel
          title="Sensor Channels"
          subtitle="measured vs simulated"
          className="h-[286px]"
          right={<span className="chip chip-fusion">BIAS / LOSS / LATENCY MODELLED</span>}
        >
          <SensorTable />
          <p className="mt-1.5 border-t border-edge/40 pt-1 text-[8px] leading-snug text-faint">
            Measurement noise scales with the configured noise level. Active SENSOR_BIAS, SENSOR_DROPOUT and
            SENSOR_LATENCY faults modify only this table — alarms and charts read the simulated state.
          </p>
        </Panel>

        <Panel
          title="Alarm History"
          subtitle={`${alarms.filter((alarm) => alarm.active).length} active / ${alarms.length} total`}
          className="h-[286px]"
          bodyClassName="!p-1"
        >
          <AlarmHistoryTable />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 2xl:grid-cols-3">
        {CHART_ORDER.map((key) => {
          const config = CHART_CONFIGS[key];
          if (!config) return null;
          return <ChartPanel key={key} config={config} className="h-[204px]" showZoom={false} />;
        })}
        <CorrelationScatter className="h-[204px]" />
      </div>

      <div className="grid grid-cols-1 gap-2 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Panel
          title="Operator Event Log"
          subtitle={`${events.length} events`}
          className="h-[300px]"
          bodyClassName="!p-2"
        >
          <EventLog height={232} />
        </Panel>

        <div className="flex flex-col gap-2">
          <Panel title="Run Statistics" subtitle="current experiment" bodyClassName="!p-2">
            <div className="flex flex-col gap-1 text-[10px]">
              <StatRow label="Simulated time" value={`${frame.simTimeS.toFixed(1)} s`} />
              <StatRow label="Integrator steps" value={frame.stepCount.toLocaleString('en-US')} />
              <StatRow label="History samples" value={`${sampleCount}`} />
              <StatRow
                label="Buffer window"
                value={`${bufferRange.start.toFixed(0)}–${bufferRange.end.toFixed(0)} s`}
              />
              <StatRow label="Alarms raised" value={`${alarms.length}`} />
              <StatRow label="Active faults" value={`${frame.activeFaults.length}`} />
              <StatRow label="Devices online" value={`${frame.devicesOnline}/${frame.devicesTotal}`} />
            </div>
          </Panel>

          <Callout tone="info" title="Data provenance">
            Every value in this page is produced by the local FusionSimulationEngine at a fixed 50 ms
            simulated step. No network requests, no fabricated backend, no recorded measurements.
          </Callout>
        </div>
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-edge/30 pb-1">
      <span className="text-muted">{label}</span>
      <span className="num text-ink">{value}</span>
    </div>
  );
}
