import { useState } from 'react';
import { Panel } from '@/components/ui/Panel';
import { ParameterTable } from '@/components/ui/Layout';
import { MetricTile } from '@/components/panels/MetricTile';
import { AlarmFeed } from '@/components/panels/AlarmFeed';
import { EquipmentList } from '@/components/panels/EquipmentList';
import { ReactorView } from '@/components/reactor/ReactorView';
import { ControlSlider } from '@/components/controls/ControlSlider';
import { FaultPanel } from '@/components/controls/FaultPanel';
import { ChartWindowSelector, ChartPauseButton } from '@/components/charts/ChartToolbar';
import { TrendChart } from '@/components/charts/TrendChart';
import { CHART_CONFIGS } from '@/components/charts/chartConfigs';
import { useSimulationStore } from '@/store/simulationStore';
import { formatNumber, formatSigned } from '@/utils/units';

const TREND_TABS = [
  { id: 'plasma', label: 'PLASMA', config: CHART_CONFIGS.temperature },
  { id: 'fusion', label: 'FUSION', config: CHART_CONFIGS.fusion },
  { id: 'thermal', label: 'THERMAL', config: CHART_CONFIGS.cooling },
  { id: 'power', label: 'POWER', config: CHART_CONFIGS.plantPower },
] as const;

function LiveTrendsPanel() {
  const [tab, setTab] = useState<(typeof TREND_TABS)[number]['id']>('plasma');
  const active = TREND_TABS.find((entry) => entry.id === tab) ?? TREND_TABS[0];

  return (
    <Panel
      title="Live Time Series"
      subtitle={`${active.config.title} · simulated`}
      className="h-[212px] shrink-0"
      scroll={false}
      bodyClassName="!p-1"
      right={
        <>
          <div className="segment">
            {TREND_TABS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                data-active={entry.id === tab}
                onClick={() => setTab(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <ChartWindowSelector />
          <ChartPauseButton />
        </>
      }
    >
      <TrendChart
        series={active.config.series}
        leftUnit={active.config.leftUnit}
        rightUnit={active.config.rightUnit}
        thresholds={active.config.thresholds}
        height="100%"
      />
    </Panel>
  );
}

function PowerBalancePanel() {
  const power = useSimulationStore((state) => state.frame.power);

  return (
    <Panel title="Power Balance" subtitle="site boundary" className="h-[196px] shrink-0" bodyClassName="!p-2">
      <ParameterTable
        dense
        rows={[
          { label: 'Fusion power', value: formatNumber(power.fusionPowerMW, 1), unit: 'MW', highlight: 'fusion' },
          { label: 'Aux heating (delivered)', value: formatNumber(power.auxiliaryHeatingMW, 1), unit: 'MW' },
          { label: 'Thermal output', value: formatNumber(power.thermalOutputMW, 0), unit: 'MWth' },
          { label: 'Gross electric', value: formatNumber(power.electricalOutputMW, 1), unit: 'MWe', highlight: 'ok' },
          { label: 'Plant auxiliary', value: formatNumber(power.plantAuxiliaryMW, 1), unit: 'MWe', highlight: 'warn' },
          {
            label: 'Net electric',
            value: formatSigned(power.netElectricMW, 1),
            unit: 'MWe',
            highlight: power.netElectricMW >= 0 ? 'ok' : 'crit',
          },
          { label: 'Q_plasma', value: formatNumber(power.qPlasma, 2), unit: '—', highlight: 'fusion' },
          {
            label: 'Q_engineering',
            value: formatNumber(power.qEngineering, 2),
            unit: '—',
            highlight: power.qEngineering === null ? 'warn' : power.qEngineering > 0 ? 'ok' : 'warn',
          },
        ]}
      />
      <p className="mt-1.5 border-t border-edge/40 pt-1 text-[8px] leading-snug text-faint">
        Q_engineering = net electric / on-site electric input. Heating wall-plug, magnets, cryogenics, pumps and
        controls are all counted. Q_plasma is a plasma-level ratio and is never equal to plant efficiency.
      </p>
    </Panel>
  );
}

export function Overview() {
  const frame = useSimulationStore((state) => state.frame);
  const power = frame.power;
  const plasma = frame.plasma;

  const netStatus = power.netElectricMW >= 0 ? 'ok' : 'warn';
  const tempStatus = plasma.temperatureKeV > 24 ? 'crit' : plasma.temperatureKeV > 1 ? 'ok' : 'warn';
  const stabilityStatus =
    frame.stability.stability < 0.4 ? 'crit' : frame.stability.stability < 0.62 ? 'warn' : 'ok';

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-2 overflow-y-auto scroll-thin p-2 xl:grid-cols-[286px_minmax(0,1fr)_338px] xl:overflow-hidden">
      {/* ---------------- left: subsystems & controls ---------------- */}
      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto scroll-thin xl:overflow-hidden">
        <Panel title="Subsystem Status" subtitle="12 modelled devices" className="h-[290px] shrink-0" bodyClassName="!p-1.5">
          <EquipmentList />
        </Panel>

        <Panel title="Quick Controls" subtitle="live setpoints" className="h-[218px] shrink-0" bodyClassName="!p-2">
          <div className="flex flex-col gap-2.5">
            <ControlSlider controlKey="nbiPowerMW" compact />
            <ControlSlider controlKey="echPowerMW" compact />
            <ControlSlider controlKey="coilCurrentSetpointKA" compact />
            <ControlSlider controlKey="coolantFlowKgS" compact />
            <p className="text-[8px] leading-snug text-faint">
              Changes are applied immediately to the simulation engine and logged in the event history.
            </p>
          </div>
        </Panel>

        <Panel title="Fault Injection" subtitle="quick access" className="min-h-[220px] flex-1" bodyClassName="!p-2">
          <FaultPanel compact />
        </Panel>
      </div>

      {/* ---------------- center: 3D + trends ---------------- */}
      <div className="flex min-h-0 flex-col gap-2">
        <ReactorView className="min-h-[300px] flex-1" />
        <LiveTrendsPanel />
      </div>

      {/* ---------------- right: KPIs & alarms ---------------- */}
      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto scroll-thin xl:overflow-hidden">
        <Panel title="Live Plant KPIs" subtitle="simulated telemetry" className="h-[252px] shrink-0" bodyClassName="!p-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            <MetricTile
              label="Fusion Power"
              value={formatNumber(power.fusionPowerMW, 1)}
              unit="MW"
              channel="fusionPower"
              color="#d946ef"
              status={power.fusionPowerMW > 50 ? 'ok' : 'idle'}
            />
            <MetricTile
              label="Q Plasma"
              value={formatNumber(power.qPlasma, 2)}
              unit="—"
              channel="qPlasma"
              color="#a78bfa"
              status="idle"
            />
            <MetricTile
              label="Temp"
              value={formatNumber(plasma.temperatureKeV, 2)}
              unit="keV"
              channel="temperature"
              color="#22d3ee"
              status={tempStatus as 'ok' | 'warn' | 'crit'}
              trendDigits={2}
            />
            <MetricTile
              label="Density"
              value={formatNumber(plasma.electronDensity / 1e19, 2)}
              unit="×10¹⁹"
              channel="density"
              color="#7dd3fc"
            />
            <MetricTile
              label="Net Electric"
              value={formatSigned(power.netElectricMW, 0)}
              unit="MW"
              channel="netElectric"
              color="#facc15"
              status={netStatus as 'ok' | 'warn'}
              trendDigits={0}
            />
            <MetricTile
              label="Stability"
              value={formatNumber(frame.stability.stability * 100, 0)}
              unit="%"
              channel="stability"
              color="#a3e635"
              status={stabilityStatus as 'ok' | 'warn' | 'crit'}
              trendDigits={1}
            />
            <MetricTile
              label="Plasma Current"
              value={formatNumber(plasma.currentMA, 2)}
              unit="MA"
              channel="current"
              color="#38bdf8"
              trendDigits={2}
            />
            <MetricTile
              label="Stored Energy"
              value={formatNumber(plasma.storedEnergyMJ, 0)}
              unit="MJ"
              channel="storedEnergy"
              color="#c084fc"
              trendDigits={0}
            />
          </div>
        </Panel>

        <PowerBalancePanel />

        <Panel
          title="Alarm & Event Supervision"
          subtitle={`${frame.alarms.filter((alarm) => alarm.active).length} active`}
          className="min-h-[200px] flex-1"
          bodyClassName="!p-1"
        >
          <AlarmFeed />
        </Panel>
      </div>
    </div>
  );
}
