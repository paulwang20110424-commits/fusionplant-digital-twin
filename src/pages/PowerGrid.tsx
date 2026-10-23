import { Panel } from '@/components/ui/Panel';
import { PageHeader, ParameterTable, Callout } from '@/components/ui/Layout';
import { TrendChart } from '@/components/charts/TrendChart';
import { CHART_CONFIGS } from '@/components/charts/chartConfigs';
import { ChartWindowSelector, ChartPauseButton, ChartExportButton } from '@/components/charts/ChartToolbar';
import { EnergyFlowBars } from '@/components/reactor/EnergyFlowBars';
import { MetricTile } from '@/components/panels/MetricTile';
import { useSimulationStore } from '@/store/simulationStore';
import { formatNumber, formatQ, formatSigned } from '@/utils/units';
import { pctShare } from '@/utils/power';
import { POWER_MODEL_NOTES } from '@/simulation/PowerBalanceModel';

export function PowerGrid() {
  const frame = useSimulationStore((state) => state.frame);
  const power = frame.power;
  const netPositive = power.netElectricMW >= 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto scroll-thin p-2">
      <PageHeader
        eyebrow="06 · POWER GRID"
        title="Energy & Electrical Systems"
        description="Explicit system boundary: fusion heat plus absorbed auxiliary power becomes thermal power, thermal power is converted at a Rankine efficiency, and every on-site electrical load is subtracted to give the net grid exchange."
        right={
          <>
            <span className={`chip ${netPositive ? 'chip-ok' : 'chip-warn'}`}>
              NET {formatSigned(power.netElectricMW, 0)} MW
            </span>
            <span className="chip chip-fusion">Q_PLASMA {formatQ(power.qPlasma, 2)}</span>
            <span className="chip chip-info">Q_ENG {formatQ(power.qEngineering, 2)}</span>
          </>
        }
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 xl:grid-cols-[306px_minmax(0,1fr)_326px]">
        <div className="flex min-h-0 flex-col gap-2 overflow-y-auto scroll-thin">
          <Panel title="Power Summary" subtitle="simulated plant" bodyClassName="!p-1.5">
            <div className="mb-1.5 grid grid-cols-2 gap-1.5">
              <MetricTile
                label="Gross Electric"
                value={formatNumber(power.electricalOutputMW, 1)}
                unit="MW"
                channel="electricalOutput"
                color="#34d399"
                status={power.electricalOutputMW > 1 ? 'ok' : 'idle'}
              />
              <MetricTile
                label="Net Electric"
                value={formatSigned(power.netElectricMW, 0)}
                unit="MW"
                channel="netElectric"
                color="#facc15"
                status={netPositive ? 'ok' : 'warn'}
                trendDigits={0}
              />
            </div>
            <ParameterTable
              dense
              rows={[
                { label: 'Fusion power', value: formatNumber(power.fusionPowerMW, 1), unit: 'MW', highlight: 'fusion' },
                { label: 'Aux heating (absorbed)', value: formatNumber(power.auxiliaryHeatingMW, 1), unit: 'MW' },
                { label: 'Thermal output', value: formatNumber(power.thermalOutputMW, 0), unit: 'MWth' },
                { label: 'Gross electric', value: formatNumber(power.electricalOutputMW, 1), unit: 'MWe' },
                { label: 'Plant auxiliary', value: formatNumber(power.plantAuxiliaryMW, 1), unit: 'MWe' },
                { label: 'Net exchange', value: formatSigned(power.netElectricMW, 1), unit: 'MWe', highlight: netPositive ? 'ok' : 'crit' },
              ]}
            />
          </Panel>

          <Panel title="Electrical Loads" subtitle="on-site consumption" className="min-h-[170px] flex-1" bodyClassName="!p-2">
            <ParameterTable
              dense
              rows={[
                { label: 'Heating wall-plug', value: formatNumber(power.loads.heating, 1), unit: 'MW' },
                { label: 'Magnet power supplies', value: formatNumber(power.loads.magnets, 1), unit: 'MW' },
                { label: 'Cryogenic plant', value: formatNumber(power.loads.cryogenics, 1), unit: 'MW' },
                { label: 'Coolant pumps', value: formatNumber(power.loads.coolantPumps, 1), unit: 'MW' },
                { label: 'Vacuum pumps', value: formatNumber(power.loads.vacuumPumps, 1), unit: 'MW' },
                { label: 'Instrumentation', value: formatNumber(power.loads.controls, 1), unit: 'MW' },
                { label: 'Total', value: formatNumber(power.plantAuxiliaryMW, 1), unit: 'MW', highlight: 'warn' },
              ]}
            />
          </Panel>
        </div>

        <div className="flex min-h-0 flex-col gap-2">
          <Panel
            title="Energy Flow"
            subtitle="generation · recirculation · net"
            className="h-[268px] shrink-0"
            bodyClassName="!p-3"
            right={<span className="chip chip-idle">SITE BOUNDARY</span>}
          >
            <EnergyFlowBars />
            <div className="mt-2 grid grid-cols-3 gap-2 border-t border-edge/40 pt-2">
              <div>
                <div className="label">Self-sufficiency</div>
                <div className="num text-[13px] text-ink">{pctShare(power.electricalOutputMW, power.plantAuxiliaryMW)}</div>
              </div>
              <div>
                <div className="label">Recirculation</div>
                <div className="num text-[13px] text-ink">
                  {pctShare(power.plantAuxiliaryMW, Math.max(power.electricalOutputMW, 1))}
                </div>
              </div>
              <div>
                <div className="label">Q_engineering</div>
                <div className={`num text-[13px] ${power.qEngineering && power.qEngineering > 0 ? 'text-emerald-300' : 'text-amber-300'}`}>
                  {formatQ(power.qEngineering, 3)}
                </div>
              </div>
            </div>
          </Panel>

          <Panel
            title={CHART_CONFIGS.plantPower.title}
            subtitle={CHART_CONFIGS.plantPower.subtitle}
            className="h-[212px] shrink-0"
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
              series={CHART_CONFIGS.plantPower.series}
              leftUnit="MW"
              thresholds={CHART_CONFIGS.plantPower.thresholds}
            />
          </Panel>

          <Panel
            title={CHART_CONFIGS.q.title}
            subtitle="plasma gain vs site gain"
            className="min-h-[160px] flex-1"
            scroll={false}
            bodyClassName="!p-1"
            right={<ChartExportButton />}
          >
            <TrendChart
              series={CHART_CONFIGS.q.series}
              leftUnit="ratio"
              thresholds={CHART_CONFIGS.q.thresholds}
              showZoom={false}
            />
          </Panel>
        </div>

        <div className="flex min-h-0 flex-col gap-2 overflow-y-auto scroll-thin">
          <Callout tone="warn" title="System boundary (important)">
            <ul className="space-y-0.5 font-mono text-[8.5px] leading-snug">
              <li>{POWER_MODEL_NOTES.qPlasma}</li>
              <li>{POWER_MODEL_NOTES.qEngineering}</li>
              <li>{POWER_MODEL_NOTES.thermal}</li>
              <li>{POWER_MODEL_NOTES.gross}</li>
              <li>{POWER_MODEL_NOTES.net}</li>
            </ul>
            <p className="mt-1.5 text-[8px] leading-snug">
              {POWER_MODEL_NOTES.caution} When the denominator is zero or invalid the UI shows N/A instead of an
              infinite gain.
            </p>
          </Callout>

          <Panel title="Conversion Chain" subtitle="step by step" className="min-h-[220px] flex-1" bodyClassName="!p-2">
            <ParameterTable
              dense
              rows={[
                { label: 'Fusion heat', value: formatNumber(power.fusionPowerMW, 1), unit: 'MW' },
                { label: '+ absorbed aux', value: formatNumber(power.auxiliaryHeatingMW, 1), unit: 'MW' },
                { label: '+ recovered waste', value: formatNumber(Math.max(0, power.thermalOutputMW - power.fusionPowerMW - power.auxiliaryHeatingMW), 1), unit: 'MW' },
                { label: '= thermal output', value: formatNumber(power.thermalOutputMW, 0), unit: 'MWth' },
                { label: '× Rankine η', value: power.thermalOutputMW > 1 ? ((power.electricalOutputMW / power.thermalOutputMW) * 100).toFixed(1) : '0.0', unit: '%' },
                { label: '= gross electric', value: formatNumber(power.electricalOutputMW, 1), unit: 'MWe' },
                { label: '− plant loads', value: formatNumber(power.plantAuxiliaryMW, 1), unit: 'MWe' },
                { label: '= net exchange', value: formatSigned(power.netElectricMW, 1), unit: 'MWe', highlight: netPositive ? 'ok' : 'crit' },
              ]}
            />
          </Panel>

          <Callout tone="info" title="Why this plant is net-negative">
            At this operating point Q_plasma is {formatQ(power.qPlasma, 1)} but the neutral beam wall-plug efficiency is
            only 35%, so {formatNumber(power.loads.heating, 0)} MW of the {formatNumber(power.plantAuxiliaryMW, 0)} MW
            on-site load is heating alone. That is why a plasma-level gain of several units can still leave the plant
            importing electricity. This is a feature of the simplified model, not a prediction for any real plant.
          </Callout>
        </div>
      </div>
    </div>
  );
}
