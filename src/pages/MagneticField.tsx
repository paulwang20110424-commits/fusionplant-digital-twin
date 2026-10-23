import { Panel } from '@/components/ui/Panel';
import { PageHeader, ParameterTable, Callout } from '@/components/ui/Layout';
import { CoilCrossSection } from '@/components/reactor/CoilCrossSection';
import { StabilityBreakdownPanel } from '@/components/panels/StabilityBreakdown';
import { ControlSlider } from '@/components/controls/ControlSlider';
import { TrendChart } from '@/components/charts/TrendChart';
import { CHART_CONFIGS } from '@/components/charts/chartConfigs';
import { ChartWindowSelector, ChartPauseButton, ChartExportButton } from '@/components/charts/ChartToolbar';
import { useSimulationStore } from '@/store/simulationStore';
import { formatNumber } from '@/utils/units';
import { MAGNET_MODEL_NOTES } from '@/simulation/MagneticFieldModel';
import { COIL_LIMITS } from '@/simulation/constants';

export function MagneticField() {
  const frame = useSimulationStore((state) => state.frame);
  const magnetic = frame.magnetic;
  const coilMargin = frame.stability.coilThermalMargin;

  const deviation =
    Math.abs(magnetic.coilCurrentKA - magnetic.coilCurrentSetpointKA) /
    Math.max(magnetic.coilCurrentSetpointKA, 1);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto scroll-thin p-2">
      <PageHeader
        eyebrow="03 · MAGNETIC FIELD"
        title="Magnetic Confinement System"
        description="Toroidal field generation, poloidal equilibrium, coil current slew and cold-mass thermal balance. The poloidal cross-section is generated from the same geometry as the 3D view."
        right={
          <>
            <span className="chip chip-info">B_TOR {formatNumber(magnetic.toroidalFieldT, 2)} T</span>
            <span className="chip chip-idle">I_COIL {formatNumber(magnetic.coilCurrentKA, 1)} kA</span>
            <span className={`chip ${magnetic.fieldStability > 0.7 ? 'chip-ok' : 'chip-warn'}`}>
              FIELD QUALITY {(magnetic.fieldStability * 100).toFixed(0)}%
            </span>
          </>
        }
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 xl:grid-cols-[306px_minmax(0,1fr)_326px]">
        <div className="flex min-h-0 flex-col gap-2 overflow-y-auto scroll-thin">
          <Panel title="Field Parameters" subtitle="derived from coil current" bodyClassName="!p-2">
            <ParameterTable
              dense
              rows={[
                { label: 'Toroidal field B_tor', value: formatNumber(magnetic.toroidalFieldT, 3), unit: 'T', highlight: 'fusion' },
                { label: 'Poloidal field B_pol', value: formatNumber(magnetic.poloidalFieldT, 3), unit: 'T' },
                { label: 'Coil current', value: formatNumber(magnetic.coilCurrentKA, 1), unit: 'kA' },
                { label: 'Coil setpoint', value: formatNumber(magnetic.coilCurrentSetpointKA, 1), unit: 'kA' },
                {
                  label: 'Setpoint deviation',
                  value: `${(deviation * 100).toFixed(2)} %`,
                  unit: '',
                  highlight: deviation > 0.05 ? 'warn' : 'ok',
                },
                {
                  label: 'Field quality',
                  value: (magnetic.fieldStability * 100).toFixed(1),
                  unit: '%',
                  highlight: magnetic.fieldStability > 0.7 ? 'ok' : 'warn',
                },
                { label: 'Safety factor q95', value: formatNumber(magnetic.q95, 2), unit: '—' },
                {
                  label: 'Normalised beta β_N',
                  value: formatNumber(magnetic.betaN, 2),
                  unit: '—',
                  highlight: magnetic.betaN > 2.9 ? 'warn' : 'ok',
                },
              ]}
            />
          </Panel>

          <Panel title="Coil & Cryogenics" subtitle="lumped cold mass" bodyClassName="!p-2">
            <ParameterTable
              dense
              rows={[
                {
                  label: 'Coil temperature',
                  value: formatNumber(magnetic.coilTemperatureK, 2),
                  unit: 'K',
                  highlight: magnetic.coilTemperatureK > COIL_LIMITS.warningK ? 'crit' : 'ok',
                },
                {
                  label: 'Thermal margin',
                  value: (coilMargin * 100).toFixed(0),
                  unit: '%',
                  highlight: coilMargin < 0.5 ? 'warn' : 'ok',
                },
                {
                  label: 'Cryogenic load',
                  value: formatNumber(magnetic.cryoLoadPct, 0),
                  unit: '%',
                  highlight: magnetic.cryoLoadPct > 85 ? 'warn' : 'ok',
                },
                { label: 'Cryo status', value: frame.thermal.cryoStatus, unit: '' },
                { label: 'Quench threshold', value: String(COIL_LIMITS.quenchK), unit: 'K' },
                { label: 'Magnet supply load', value: formatNumber(frame.power.loads.magnets, 1), unit: 'MW' },
                { label: 'Cryo electrical load', value: formatNumber(frame.power.loads.cryogenics, 1), unit: 'MW' },
              ]}
            />
          </Panel>

          <Panel title="Magnet Setpoints" subtitle="slew rate 1.4 s" className="min-h-[130px] flex-1" bodyClassName="!p-2">
            <div className="flex flex-col gap-2.5">
              <ControlSlider controlKey="coilCurrentSetpointKA" />
              <ControlSlider controlKey="plasmaCurrentTargetMA" />
            </div>
          </Panel>
        </div>

        <div className="flex min-h-0 flex-col gap-2">
          <Panel
            title="Poloidal Cross-Section"
            subtitle="live geometry & field annotations"
            className="min-h-[290px] flex-[1.35]"
            scroll={false}
            bodyClassName="!p-1"
            right={<span className="chip chip-fusion">SCHEMATIC</span>}
          >
            <CoilCrossSection />
          </Panel>

          <Panel
            title={CHART_CONFIGS.field.title}
            subtitle={CHART_CONFIGS.field.subtitle}
            className="h-[186px] shrink-0"
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
              series={CHART_CONFIGS.field.series}
              leftUnit="T"
              rightUnit="kA"
              showZoom={false}
            />
          </Panel>

          <Panel
            title={CHART_CONFIGS.cooling.title}
            subtitle="cold mass vs coolant"
            className="min-h-[160px] flex-1"
            scroll={false}
            bodyClassName="!p-1"
            right={<ChartExportButton />}
          >
            <TrendChart
              series={CHART_CONFIGS.cooling.series}
              leftUnit="K"
              rightUnit="°C"
              showZoom={false}
            />
          </Panel>
        </div>

        <div className="flex min-h-0 flex-col gap-2 overflow-y-auto scroll-thin">
          <StabilityBreakdownPanel />
          <Callout tone="info" title="Magnetic model">
            <ul className="space-y-0.5 font-mono text-[8.5px] leading-snug">
              <li>{MAGNET_MODEL_NOTES.toroidal}</li>
              <li>{MAGNET_MODEL_NOTES.poloidal}</li>
              <li>{MAGNET_MODEL_NOTES.coilDynamics}</li>
              <li>{MAGNET_MODEL_NOTES.coilThermal}</li>
            </ul>
            <p className="mt-1 text-[8px] leading-snug opacity-75">
              Cold-mass thermal capacitance and conductance are compressed for interactive demonstration; the 26 kJ/K
              lump is not a physical value of any real magnet.
            </p>
          </Callout>
          <Panel title="Field Quality Notes" subtitle="what degrades it" className="min-h-[130px] flex-1" bodyClassName="!p-2">
            <ul className="space-y-1 text-[9px] leading-snug text-muted">
              <li>· Coil current lag behind setpoint (L/R time constant 1.4 s)</li>
              <li>· Cold-mass temperature rise reduces achievable field quality</li>
              <li>· Injected magnetic disturbance adds a field error and broadband activity</li>
              <li>· Field quality feeds the confinement H-factor and the stability index</li>
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
