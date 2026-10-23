import { Panel } from '@/components/ui/Panel';
import { PageHeader, ParameterTable, Callout } from '@/components/ui/Layout';
import { ControlSlider } from '@/components/controls/ControlSlider';
import { TrendChart } from '@/components/charts/TrendChart';
import { CHART_CONFIGS } from '@/components/charts/chartConfigs';
import { ChartWindowSelector, ChartPauseButton, ChartExportButton } from '@/components/charts/ChartToolbar';
import { ThermalLoopDiagram } from '@/components/reactor/ThermalLoopDiagram';
import { AlarmFeed } from '@/components/panels/AlarmFeed';
import { useSimulationStore } from '@/store/simulationStore';
import { formatNumber } from '@/utils/units';
import { THERMAL_MODEL_NOTES } from '@/simulation/ThermalModel';

export function Cooling() {
  const frame = useSimulationStore((state) => state.frame);
  const thermal = frame.thermal;
  const power = frame.power;

  const deltaT = thermal.coolantDeltaTK;
  const outlet = thermal.coolantOutletC;
  const outletTone = outlet > 380 ? 'crit' : outlet > 330 ? 'warn' : 'ok';

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto scroll-thin p-2">
      <PageHeader
        eyebrow="05 · COOLING & HEAT RECOVERY"
        title="Cooling & Thermal Energy Recovery"
        description="Primary loop energy balance: dT = Q / (m·cp), heat-exchanger duty against effective capacity, and the Rankine conversion chain. Reduced flow raises ΔT and eventually overloads the exchanger."
        right={
          <>
            <span className="chip chip-info">T_OUT {formatNumber(outlet, 1)} °C</span>
            <span className={`chip ${thermal.heatExchangerLoadPct > 92 ? 'chip-warn' : 'chip-ok'}`}>
              HX {formatNumber(thermal.heatExchangerLoadPct, 0)}%
            </span>
            <span className="chip chip-idle">TURBINE {thermal.turbineStatus}</span>
          </>
        }
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 xl:grid-cols-[300px_minmax(0,1fr)_326px]">
        <div className="flex min-h-0 flex-col gap-2 overflow-y-auto scroll-thin">
          <Panel title="Cooling Setpoints" subtitle="primary loop" bodyClassName="!p-2">
            <div className="flex flex-col gap-3">
              <ControlSlider controlKey="coolantFlowKgS" />
              <ControlSlider controlKey="coolantInletTargetC" />
            </div>
          </Panel>

          <Panel title="Loop Parameters" subtitle="simulated" bodyClassName="!p-2">
            <ParameterTable
              dense
              rows={[
                { label: 'Coolant inlet', value: formatNumber(thermal.coolantInletC, 1), unit: '°C' },
                {
                  label: 'Coolant outlet',
                  value: formatNumber(outlet, 1),
                  unit: '°C',
                  highlight: outletTone,
                },
                { label: 'Flow rate', value: formatNumber(thermal.coolantFlowKgS, 0), unit: 'kg/s' },
                { label: 'Loop ΔT', value: formatNumber(deltaT, 2), unit: 'K' },
                { label: 'Thermal duty', value: formatNumber(thermal.thermalPowerMW, 0), unit: 'MWth' },
                {
                  label: 'Exchanger load',
                  value: formatNumber(thermal.heatExchangerLoadPct, 0),
                  unit: '%',
                  highlight: thermal.heatExchangerLoadPct > 92 ? 'warn' : 'ok',
                },
                { label: 'Pump power', value: formatNumber(power.loads.coolantPumps, 1), unit: 'MW' },
                { label: 'Rankine efficiency', value: (thermal.thermalPowerMW > 1 ? (power.electricalOutputMW / thermal.thermalPowerMW) * 100 : 0).toFixed(1), unit: '%' },
              ]}
            />
          </Panel>

          <Panel title="Equipment" subtitle="cooling chain" className="min-h-[130px] flex-1" bodyClassName="!p-2">
            <ParameterTable
              dense
              rows={[
                { label: 'Turbine', value: thermal.turbineStatus, unit: '' },
                { label: 'Generator', value: thermal.generatorStatus, unit: '' },
                { label: 'Cryogenic system', value: thermal.cryoStatus, unit: '' },
                { label: 'Vacuum pressure', value: thermal.vacuumPressurePa.toExponential(2), unit: 'Pa' },
              ]}
            />
          </Panel>
        </div>

        <div className="flex min-h-0 flex-col gap-2">
          <Panel
            title="Primary Loop & Energy Recovery"
            subtitle="live process flow"
            className="h-[188px] shrink-0"
            scroll={false}
            bodyClassName="!p-1"
            right={<span className="chip chip-fusion">SCHEMATIC</span>}
          >
            <ThermalLoopDiagram />
          </Panel>

          <Panel
            title={CHART_CONFIGS.cooling.title}
            subtitle={CHART_CONFIGS.cooling.subtitle}
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
            <TrendChart series={CHART_CONFIGS.cooling.series} leftUnit="K" rightUnit="°C" />
          </Panel>

          <Panel
            title={CHART_CONFIGS.exchanger.title}
            subtitle="rejection capacity margin"
            className="min-h-[160px] flex-1"
            scroll={false}
            bodyClassName="!p-1"
            right={<ChartExportButton />}
          >
            <TrendChart
              series={CHART_CONFIGS.exchanger.series}
              leftUnit="%"
              rightUnit="kg/s"
              thresholds={CHART_CONFIGS.exchanger.thresholds}
              showZoom={false}
            />
          </Panel>
        </div>

        <div className="flex min-h-0 flex-col gap-2 overflow-y-auto scroll-thin">
          <Panel title="Thermal Balance" subtitle="energy accounting" bodyClassName="!p-2">
            <ParameterTable
              dense
              rows={[
                { label: 'Fusion heat', value: formatNumber(power.fusionPowerMW, 0), unit: 'MW' },
                { label: 'Aux heating heat', value: formatNumber(power.auxiliaryHeatingMW, 1), unit: 'MW' },
                { label: 'Recovered waste heat', value: formatNumber(Math.max(0, power.thermalOutputMW - power.fusionPowerMW - power.auxiliaryHeatingMW), 1), unit: 'MW' },
                { label: 'Total thermal', value: formatNumber(power.thermalOutputMW, 0), unit: 'MWth', highlight: 'warn' },
                { label: 'Gross electric', value: formatNumber(power.electricalOutputMW, 1), unit: 'MWe', highlight: 'ok' },
                { label: 'Rejected / losses', value: formatNumber(Math.max(0, power.thermalOutputMW - power.electricalOutputMW), 0), unit: 'MW' },
              ]}
            />
          </Panel>

          <Panel title="Cooling Alarms" subtitle="live supervision" className="min-h-[170px] flex-1" bodyClassName="!p-1">
            <AlarmFeed limit={5} />
          </Panel>

          <Callout tone="info" title="Thermal model">
            <ul className="space-y-0.5 font-mono text-[8.5px] leading-snug">
              <li>{THERMAL_MODEL_NOTES.loop}</li>
              <li>{THERMAL_MODEL_NOTES.exchanger}</li>
              <li>{THERMAL_MODEL_NOTES.inlet}</li>
              <li>{THERMAL_MODEL_NOTES.outlet}</li>
            </ul>
            <p className="mt-1 text-[8px] leading-snug opacity-75">
              Two lumped temperatures with first-order lags represent the whole loop. No two-phase flow, pressure
              dynamics or steam-cycle thermodynamics are solved.
            </p>
          </Callout>
        </div>
      </div>
    </div>
  );
}
