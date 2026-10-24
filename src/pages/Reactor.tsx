import { Panel } from '@/components/ui/Panel';
import { PageHeader, ParameterTable, Callout } from '@/components/ui/Layout';
import { ReactorView } from '@/components/reactor/ReactorView';
import { StabilityBreakdownPanel } from '@/components/panels/StabilityBreakdown';
import { MetricTile } from '@/components/panels/MetricTile';
import { ControlSlider } from '@/components/controls/ControlSlider';
import { TrendChart } from '@/components/charts/TrendChart';
import { CHART_CONFIGS } from '@/components/charts/chartConfigs';
import { ChartWindowSelector, ChartPauseButton, ChartExportButton } from '@/components/charts/ChartToolbar';
import { useSimulationStore } from '@/store/simulationStore';
import { formatNumber, formatDensity } from '@/utils/units';
import { MODEL_NOTES } from '@/simulation/PlasmaModel';

export function Reactor() {
  const frame = useSimulationStore((state) => state.frame);
  const plasma = frame.plasma;
  const magnetic = frame.magnetic;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto scroll-thin p-2">
      <PageHeader
        eyebrow="02 · REACTOR & PLASMA"
        title="Plasma Discharge Control"
        description="0-D plasma energy balance coupled to the magnet, heating and thermal models. The 3D assembly is a programmatic schematic of an ITER-like tokamak, not CAD geometry."
        right={
          <>
            <span className="chip chip-fusion">SIMULATED PLASMA</span>
            <span className="chip chip-idle">PHASE {frame.phase}</span>
            <span className="chip chip-idle">SCENARIO {frame.scenarioName}</span>
          </>
        }
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 xl:grid-cols-[300px_minmax(0,1fr)_330px]">
        <div className="flex min-h-0 flex-col gap-2">
          <Panel title="Plasma State" subtitle="0-D model output" bodyClassName="!p-2">
            <ParameterTable
              dense
              rows={[
                {
                  label: 'Plasma temperature',
                  value: formatNumber(plasma.temperatureKeV, 2),
                  unit: 'keV',
                  highlight: 'fusion',
                },
                {
                  label: 'Electron density',
                  value: formatDensity(plasma.electronDensity),
                  unit: '',
                  highlight: 'fusion',
                },
                { label: 'Plasma current', value: formatNumber(plasma.currentMA, 2), unit: 'MA' },
                { label: 'Plasma pressure', value: formatNumber(plasma.pressureKPa, 1), unit: 'kPa' },
                { label: 'Confinement time', value: formatNumber(plasma.confinementTimeS, 2), unit: 's' },
                { label: 'Plasma volume', value: formatNumber(plasma.volumeM3, 0), unit: 'm³' },
                { label: 'Stored energy', value: formatNumber(plasma.storedEnergyMJ, 0), unit: 'MJ' },
                { label: 'Reactivity ⟨σv⟩', value: plasma.reactivity.toExponential(2), unit: 'm³/s' },
                { label: 'Alpha heating', value: formatNumber(plasma.alphaPowerMW, 1), unit: 'MW' },
                { label: 'Radiated (brem.)', value: formatNumber(plasma.radiatedPowerMW, 1), unit: 'MW' },
              ]}
            />
          </Panel>

          <Panel title="Shape & Limits" subtitle="equilibrium proxies" bodyClassName="!p-2">
            <ParameterTable
              dense
              rows={[
                { label: 'Elongation κ', value: formatNumber(plasma.elongation, 2), unit: '—' },
                { label: 'Triangularity δ', value: formatNumber(plasma.triangularity, 2), unit: '—' },
                { label: 'Safety factor q95', value: formatNumber(magnetic.q95, 2), unit: '—' },
                {
                  label: 'Normalised beta β_N',
                  value: formatNumber(magnetic.betaN, 2),
                  unit: '—',
                  highlight: magnetic.betaN > 2.9 ? 'warn' : undefined,
                },
                {
                  label: 'Density limit f_GW',
                  value: formatNumber(magnetic.greenwaldFraction, 2),
                  unit: '—',
                  highlight: magnetic.greenwaldFraction > 0.92 ? 'warn' : 'ok',
                },
                {
                  label: 'Field quality',
                  value: formatNumber(magnetic.fieldStability * 100, 0),
                  unit: '%',
                  highlight: magnetic.fieldStability < 0.7 ? 'warn' : 'ok',
                },
              ]}
            />
          </Panel>

          <Panel title="Plasma Setpoints" subtitle="applied immediately" bodyClassName="!p-2">
            <div className="flex flex-col gap-2.5">
              <ControlSlider controlKey="plasmaCurrentTargetMA" compact />
              <ControlSlider controlKey="targetDensity19" compact />
              <ControlSlider controlKey="nbiPowerMW" compact />
            </div>
          </Panel>
        </div>

        <div className="flex min-h-0 flex-col gap-2">
          <ReactorView className="min-h-[320px] flex-1" />
          <Panel
            title={CHART_CONFIGS.temperature.title}
            subtitle="energy balance response"
            className="h-[196px] shrink-0"
            scroll={false}
            bodyClassName="!p-1"
            right={
              <>
                <ChartWindowSelector />
                <ChartPauseButton />
                <ChartExportButton />
              </>
            }
          >
            <TrendChart
              series={CHART_CONFIGS.temperature.series}
              leftUnit="keV"
              rightUnit="×10¹⁹ m⁻³"
              thresholds={CHART_CONFIGS.temperature.thresholds}
            />
          </Panel>
        </div>

        <div className="flex min-h-0 flex-col gap-2 overflow-y-auto scroll-thin">
          <Panel title="Fusion Performance" subtitle="plasma-level metrics" bodyClassName="!p-1.5">
            <div className="mb-1.5 grid grid-cols-2 gap-1.5">
              <MetricTile
                label="Fusion Power"
                value={formatNumber(frame.power.fusionPowerMW, 1)}
                unit="MW"
                channel="fusionPower"
                color="#d946ef"
                status="ok"
                valueScale={1}
                trendUnit="MW"
                trendDigits={1}
              />
              <MetricTile
                label="Q Plasma"
                value={formatNumber(frame.power.qPlasma, 2)}
                unit="—"
                channel="qPlasma"
                color="#a78bfa"
                valueScale={1}
                trendDigits={2}
              />
            </div>
            <ParameterTable
              dense
              rows={[
                {
                  label: 'Aux heating absorbed',
                  value: formatNumber(frame.power.auxiliaryHeatingMW, 1),
                  unit: 'MW',
                },
                { label: 'Alpha self-heating', value: formatNumber(plasma.alphaPowerMW, 1), unit: 'MW' },
                { label: 'Radiated losses', value: formatNumber(plasma.radiatedPowerMW, 1), unit: 'MW' },
                {
                  label: 'Thermal output',
                  value: formatNumber(frame.power.thermalOutputMW, 0),
                  unit: 'MWth',
                },
                {
                  label: 'Q_engineering (site)',
                  value: formatNumber(frame.power.qEngineering, 2),
                  unit: '—',
                },
              ]}
            />
          </Panel>

          <StabilityBreakdownPanel />

          <Callout tone="fusion" title="Plasma model (simplified)">
            <ul className="space-y-0.5 font-mono text-[8.5px] leading-snug">
              <li>{MODEL_NOTES.fusionPower}</li>
              <li>{MODEL_NOTES.energy}</li>
              <li>{MODEL_NOTES.confinement}</li>
              <li>{MODEL_NOTES.densityLimit}</li>
            </ul>
            <p className="mt-1 text-[8px] leading-snug opacity-75">
              Single-temperature 0-D model with no profile, transport or MHD solver. Values are illustrative.
            </p>
          </Callout>
        </div>
      </div>
    </div>
  );
}
