import { Panel } from '@/components/ui/Panel';
import { PageHeader, ParameterTable, Callout } from '@/components/ui/Layout';
import { ControlSlider } from '@/components/controls/ControlSlider';
import { TrendChart } from '@/components/charts/TrendChart';
import { CHART_CONFIGS } from '@/components/charts/chartConfigs';
import { ChartWindowSelector, ChartPauseButton, ChartExportButton } from '@/components/charts/ChartToolbar';
import { StatusChip } from '@/components/ui/StatusChip';
import { useSimulationStore } from '@/store/simulationStore';
import { formatNumber } from '@/utils/units';
import { HEATING_MODEL_NOTES } from '@/simulation/HeatingModel';
import { HEATING_EFFICIENCY } from '@/simulation/constants';

interface SystemCardProps {
  name: string;
  code: string;
  commanded: number;
  delivered: number;
  wallPlug: number;
  coupling: number;
  status: Parameters<typeof StatusChip>[0]['status'];
  color: string;
}

function HeatingSystemCard({
  name,
  code,
  commanded,
  delivered,
  wallPlug,
  coupling,
  status,
  color,
}: SystemCardProps) {
  const deliveredPct = commanded > 0 ? Math.min(100, (delivered / commanded) * 100) : 0;
  const maxBar = Math.max(commanded, 1);

  return (
    <div className="rounded-sm border border-edge/60 bg-[#061120]/60 p-2">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="num text-[9px] text-sys">{code}</span>
            <span className="text-[10.5px] text-ink">{name}</span>
          </div>
          <div className="num mt-0.5 text-[8.5px] text-faint">
            η_couple {(coupling * 100).toFixed(0)}% · wall-plug {wallPlug.toFixed(0)} MW
          </div>
        </div>
        <StatusChip status={status} />
      </div>

      <div className="mt-2 flex items-baseline justify-between">
        <span className="metric-value text-[15px]" style={{ color }}>
          {delivered.toFixed(1)}
          <span className="ml-1 text-[9px] text-faint">MW delivered</span>
        </span>
        <span className="num text-[9px] text-muted">cmd {commanded.toFixed(1)} MW</span>
      </div>

      <div className="relative mt-1 h-2 w-full overflow-hidden rounded-sm bg-white/[0.05]">
        <div
          className="absolute inset-y-0 left-0 bg-white/[0.06]"
          style={{ width: `${(commanded / maxBar) * 100}%` }}
        />
        <div
          className="absolute inset-y-0 left-0 rounded-sm transition-[width] duration-300"
          style={{ width: `${deliveredPct}%`, background: `linear-gradient(90deg, ${color}44, ${color})` }}
        />
      </div>
      <div className="mt-0.5 flex justify-between text-[8px] text-faint">
        <span>{deliveredPct.toFixed(0)}% of command delivered</span>
        <span>electrical {wallPlug.toFixed(0)} MW</span>
      </div>
    </div>
  );
}

export function Heating() {
  const frame = useSimulationStore((state) => state.frame);
  const heating = frame.heating;
  const controls = frame.controls;

  const totalCommanded = controls.nbiPowerMW + controls.echPowerMW + controls.ichPowerMW;
  const deliveryRatio = totalCommanded > 0 ? heating.totalDeliveredMW / totalCommanded : 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto scroll-thin p-2">
      <PageHeader
        eyebrow="04 · PLASMA HEATING"
        title="Auxiliary Heating Systems"
        description="Neutral beam, electron cyclotron and ion cyclotron heating. Delivered power is not the same as commanded power, and wall-plug power is not the same as delivered power — both conversions are modelled explicitly."
        right={
          <>
            <span className="chip chip-warn">{formatNumber(totalCommanded, 0)} MW COMMANDED</span>
            <span className="chip chip-ok">{formatNumber(heating.totalDeliveredMW, 1)} MW DELIVERED</span>
            <span className={`chip ${deliveryRatio > 0.9 ? 'chip-ok' : 'chip-warn'}`}>
              DELIVERY {(deliveryRatio * 100).toFixed(0)}%
            </span>
          </>
        }
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 xl:grid-cols-[300px_minmax(0,1fr)_326px]">
        <div className="flex min-h-0 flex-col gap-2 overflow-y-auto scroll-thin">
          <Panel title="Heating Setpoints" subtitle="applied immediately" bodyClassName="!p-2">
            <div className="flex flex-col gap-3">
              <ControlSlider controlKey="nbiPowerMW" />
              <ControlSlider controlKey="echPowerMW" />
              <ControlSlider controlKey="ichPowerMW" />
            </div>
          </Panel>

          <Panel title="Heating Summary" bodyClassName="!p-2">
            <ParameterTable
              dense
              rows={[
                {
                  label: 'Total delivered',
                  value: formatNumber(heating.totalDeliveredMW, 1),
                  unit: 'MW',
                  highlight: 'fusion',
                },
                {
                  label: 'Wall-plug draw',
                  value: formatNumber(heating.wallPlugMW, 1),
                  unit: 'MW',
                  highlight: 'warn',
                },
                {
                  label: 'Waste heat recovered',
                  value: formatNumber(
                    Math.max(0, heating.wallPlugMW - heating.totalDeliveredMW) * frame.config.auxHeatRecovery,
                    1,
                  ),
                  unit: 'MW',
                },
                { label: 'Plasma absorption', value: (deliveryRatio * 100).toFixed(0), unit: '%' },
                { label: 'Fusion power', value: formatNumber(frame.power.fusionPowerMW, 1), unit: 'MW' },
                {
                  label: 'Q_plasma',
                  value: formatNumber(frame.power.qPlasma, 2),
                  unit: '—',
                  highlight: 'fusion',
                },
              ]}
            />
          </Panel>

          <Panel title="Control Notes" className="min-h-[120px] flex-1" bodyClassName="!p-2">
            <p className="text-[9px] leading-snug text-muted">
              The delivered power responds to the setpoint through the coupling efficiency, while the
              electrical demand responds through the source efficiency. A HEATING_DROOP fault multiplies
              availability, so the gap between command and delivery widens and the plasma cools.
            </p>
          </Panel>
        </div>

        <div className="flex min-h-0 flex-col gap-2">
          <Panel title="Power Delivery Chain" subtitle="command → delivered → wall plug" bodyClassName="!p-2">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <HeatingSystemCard
                name="Neutral Beam Injection"
                code="NBI"
                commanded={controls.nbiPowerMW}
                delivered={heating.nbiDeliveredMW}
                wallPlug={controls.nbiPowerMW / HEATING_EFFICIENCY.nbiWallPlug}
                coupling={HEATING_EFFICIENCY.nbiCoupling}
                status={heating.nbiStatus}
                color="#22d3ee"
              />
              <HeatingSystemCard
                name="Electron Cyclotron"
                code="ECH"
                commanded={controls.echPowerMW}
                delivered={heating.echDeliveredMW}
                wallPlug={controls.echPowerMW / HEATING_EFFICIENCY.echWallPlug}
                coupling={HEATING_EFFICIENCY.echCoupling}
                status={heating.echStatus}
                color="#a855f7"
              />
              <HeatingSystemCard
                name="Ion Cyclotron"
                code="ICH"
                commanded={controls.ichPowerMW}
                delivered={heating.ichDeliveredMW}
                wallPlug={controls.ichPowerMW / HEATING_EFFICIENCY.ichWallPlug}
                coupling={HEATING_EFFICIENCY.ichCoupling}
                status={heating.ichStatus}
                color="#f59e0b"
              />
            </div>
          </Panel>

          <Panel
            title={CHART_CONFIGS.heating.title}
            subtitle={CHART_CONFIGS.heating.subtitle}
            className="h-[210px] shrink-0"
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
            <TrendChart series={CHART_CONFIGS.heating.series} leftUnit="MW" rightUnit="—" />
          </Panel>

          <Panel
            title={CHART_CONFIGS.fusion.title}
            subtitle="power response to heating"
            className="min-h-[168px] flex-1"
            scroll={false}
            bodyClassName="!p-1"
            right={<ChartExportButton />}
          >
            <TrendChart series={CHART_CONFIGS.fusion.series} leftUnit="MW" showZoom={false} />
          </Panel>
        </div>

        <div className="flex min-h-0 flex-col gap-2 overflow-y-auto scroll-thin">
          <Panel title="Heating Model" subtitle="transparent efficiencies" bodyClassName="!p-2">
            <ul className="space-y-1 font-mono text-[8.5px] leading-snug text-muted">
              <li>{HEATING_MODEL_NOTES.delivered}</li>
              <li>{HEATING_MODEL_NOTES.wallPlug}</li>
              <li>{HEATING_MODEL_NOTES.wasteHeat}</li>
            </ul>
          </Panel>

          <Callout tone="warn" title="Why Q_engineering differs from Q_plasma">
            Neutral beam injection is roughly 35% wall-plug efficient in this model. At{' '}
            {formatNumber(controls.nbiPowerMW, 0)} MW commanded the beamline draws{' '}
            {formatNumber(controls.nbiPowerMW / HEATING_EFFICIENCY.nbiWallPlug, 0)} MW from the grid, so
            recirculating power is a first-order term in the plant energy balance.
          </Callout>

          <Callout tone="info" title="Model boundary">
            Heating systems are modelled as efficiency chains only. No beam transport, gyrotron physics, wave
            propagation or current-drive effects are represented.
          </Callout>

          <Panel title="Auxiliary Loads" className="min-h-[150px] flex-1" bodyClassName="!p-2">
            <ParameterTable
              dense
              rows={[
                {
                  label: 'Heating electrical load',
                  value: formatNumber(frame.power.loads.heating, 1),
                  unit: 'MW',
                },
                { label: 'Magnet supplies', value: formatNumber(frame.power.loads.magnets, 1), unit: 'MW' },
                { label: 'Cryogenics', value: formatNumber(frame.power.loads.cryogenics, 1), unit: 'MW' },
                {
                  label: 'Coolant pumps',
                  value: formatNumber(frame.power.loads.coolantPumps, 1),
                  unit: 'MW',
                },
                {
                  label: 'Total plant auxiliary',
                  value: formatNumber(frame.power.plantAuxiliaryMW, 1),
                  unit: 'MW',
                },
              ]}
            />
          </Panel>
        </div>
      </div>
    </div>
  );
}
