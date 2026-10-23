import { Component, useMemo, useState, type ReactNode } from 'react';
import { ReactorScene } from './ReactorScene';
import { Panel } from '@/components/ui/Panel';
import { useSimulationStore } from '@/store/simulationStore';
import type { ReactorComponentId, ReactorViewMode } from '@/types/simulation';
import { formatNumber, formatScientific } from '@/utils/units';
import { StatusChip } from '@/components/ui/StatusChip';

interface ComponentInfo {
  name: string;
  subsystem: string;
  description: string;
  rows: (frame: ReturnType<typeof useSimulationStore.getState>['frame']) => Array<{ label: string; value: string }>;
}

const COMPONENTS: Record<ReactorComponentId, ComponentInfo> = {
  plasma: {
    name: 'Plasma Column',
    subsystem: 'PLASMA',
    description:
      'The D-T plasma torus. Colour intensity follows the simulated core temperature; the glow is a schematic illustration, not a radiation transport solution.',
    rows: (frame) => [
      { label: 'Temperature', value: `${formatNumber(frame.plasma.temperatureKeV, 2)} keV` },
      { label: 'Density', value: `${formatNumber(frame.plasma.electronDensity / 1e19, 2)} ×10¹⁹ m⁻³` },
      { label: 'Plasma current', value: `${formatNumber(frame.plasma.currentMA, 2)} MA` },
      { label: 'Stored energy', value: `${formatNumber(frame.plasma.storedEnergyMJ, 1)} MJ` },
      { label: 'Fusion power', value: `${formatNumber(frame.power.fusionPowerMW, 1)} MW` },
      { label: 'Stability index', value: `${formatNumber(frame.stability.stability * 100, 0)} %` },
    ],
  },
  'vacuum-vessel': {
    name: 'Vacuum Vessel',
    subsystem: 'VACUUM',
    description:
      'Double-wall toroidal vessel enclosing the plasma. Transparent in the 3D view so the internal components remain visible.',
    rows: (frame) => [
      { label: 'Vessel pressure', value: `${formatScientific(frame.thermal.vacuumPressurePa, 2)} Pa` },
      { label: 'Thermal load', value: `${formatNumber(frame.thermal.thermalPowerMW, 0)} MW` },
      { label: 'Coolant outlet', value: `${formatNumber(frame.thermal.coolantOutletC, 1)} °C` },
      { label: 'Plasma volume', value: `${formatNumber(frame.plasma.volumeM3, 0)} m³` },
    ],
  },
  'tf-coil': {
    name: 'Toroidal Field Coils',
    subsystem: 'MAGNET',
    description:
      '18 D-shaped superconducting coils. Field is derived from the total coil current with B = mu0·N·I/(2πR0).',
    rows: (frame) => [
      { label: 'Coil current', value: `${formatNumber(frame.magnetic.coilCurrentKA, 1)} kA` },
      { label: 'Toroidal field', value: `${formatNumber(frame.magnetic.toroidalFieldT, 2)} T` },
      { label: 'Coil temperature', value: `${formatNumber(frame.magnetic.coilTemperatureK, 2)} K` },
      { label: 'Cryogenic load', value: `${formatNumber(frame.magnetic.cryoLoadPct, 0)} %` },
      { label: 'Field quality', value: `${formatNumber(frame.magnetic.fieldStability * 100, 0)} %` },
    ],
  },
  'pf-coil': {
    name: 'Poloidal Field Coils',
    subsystem: 'MAGNET',
    description:
      'Seven ring coils that shape the plasma equilibrium and provide vertical position control. Only the aggregate field is modelled.',
    rows: (frame) => [
      { label: 'Poloidal field', value: `${formatNumber(frame.magnetic.poloidalFieldT, 2)} T` },
      { label: 'Plasma current', value: `${formatNumber(frame.plasma.currentMA, 2)} MA` },
      { label: 'Safety factor q95', value: formatNumber(frame.magnetic.q95, 2) },
      { label: 'Elongation κ', value: formatNumber(frame.plasma.elongation, 2) },
    ],
  },
  'central-solenoid': {
    name: 'Central Solenoid',
    subsystem: 'MAGNET',
    description:
      'Six-module solenoid that drives the plasma current inductively in this simplified model (no current drive physics).',
    rows: (frame) => [
      { label: 'Plasma current', value: `${formatNumber(frame.plasma.currentMA, 2)} MA` },
      { label: 'Requested current', value: `${formatNumber(frame.controls.plasmaCurrentTargetMA, 2)} MA` },
      { label: 'Flux state', value: frame.plasma.currentMA > 1 ? 'DISCHARGING' : 'CHARGED' },
    ],
  },
  divertor: {
    name: 'Divertor',
    subsystem: 'COOLING',
    description:
      'Exhaust region. In this model the full fusion + auxiliary thermal power leaves through the first wall / divertor into the primary coolant.',
    rows: (frame) => [
      { label: 'Exhaust power', value: `${formatNumber(frame.thermal.thermalPowerMW, 0)} MW` },
      { label: 'Coolant ΔT', value: `${formatNumber(frame.thermal.coolantDeltaTK, 1)} K` },
      { label: 'Heat exchanger', value: `${formatNumber(frame.thermal.heatExchangerLoadPct, 0)} %` },
    ],
  },
  cryostat: {
    name: 'Cryostat',
    subsystem: 'MAGNET',
    description: 'Thermal envelope around the superconducting magnets. Rendered as a wireframe shell.',
    rows: (frame) => [
      { label: 'Cryo load', value: `${formatNumber(frame.magnetic.cryoLoadPct, 0)} %` },
      { label: 'Cryo status', value: frame.thermal.cryoStatus },
      { label: 'Cold mass', value: `${formatNumber(frame.magnetic.coilTemperatureK, 2)} K` },
    ],
  },
  'neutral-beam': {
    name: 'Neutral Beam Injector',
    subsystem: 'HEATING',
    description: 'Not modelled geometrically — select from the component list. Beamline delivered power and wall-plug load are simulated.',
    rows: (frame) => [
      { label: 'Delivered', value: `${formatNumber(frame.heating.nbiDeliveredMW, 1)} MW` },
      { label: 'Commanded', value: `${formatNumber(frame.controls.nbiPowerMW, 1)} MW` },
      { label: 'Grid draw', value: `${formatNumber(frame.controls.nbiPowerMW / 0.35, 1)} MW` },
    ],
  },
  'coolant-manifold': {
    name: 'Coolant Manifold',
    subsystem: 'COOLING',
    description: 'Aggregate primary loop representation — no individual pipework is modelled.',
    rows: (frame) => [
      { label: 'Flow', value: `${formatNumber(frame.thermal.coolantFlowKgS, 0)} kg/s` },
      { label: 'Inlet / outlet', value: `${formatNumber(frame.thermal.coolantInletC, 0)} / ${formatNumber(frame.thermal.coolantOutletC, 0)} °C` },
      { label: 'Pump power', value: `${formatNumber(frame.power.loads.coolantPumps, 1)} MW` },
    ],
  },
};

class SceneErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
          <span className="chip chip-warn">3D UNAVAILABLE</span>
          <p className="max-w-sm text-[11px] leading-relaxed text-muted">
            The WebGL scene could not start in this browser ({this.state.error}). All telemetry, charts, controls
            and diagnostics remain fully functional.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

const STRUCTURE_TOGGLES: Array<{ id: ReactorComponentId; name: string }> = [
  { id: 'plasma', name: 'Plasma' },
  { id: 'vacuum-vessel', name: 'Vessel' },
  { id: 'tf-coil', name: 'TF Coils' },
  { id: 'pf-coil', name: 'PF Coils' },
  { id: 'central-solenoid', name: 'Solenoid' },
  { id: 'divertor', name: 'Divertor' },
  { id: 'cryostat', name: 'Cryostat' },
];

const VIEW_BUTTONS: Array<{ id: ReactorViewMode; label: string; hint: string }> = [
  { id: 'FULL', label: 'FULL', hint: 'Complete assembly' },
  { id: 'CUTAWAY', label: 'CUTAWAY', hint: 'Section view: vessel cut open, external coils hidden' },
  { id: 'PLASMA', label: 'PLASMA', hint: 'Plasma and field lines only' },
];

export function ReactorView({ className = '' }: { className?: string }) {
  const viewMode = useSimulationStore((state) => state.reactorView);
  const setViewMode = useSimulationStore((state) => state.setReactorView);
  const selected = useSimulationStore((state) => state.selectedComponent);
  const setSelected = useSimulationStore((state) => state.setSelectedComponent);
  const showFieldLines = useSimulationStore((state) => state.showFieldLines);
  const toggleFieldLines = useSimulationStore((state) => state.toggleFieldLines);
  const showLabels = useSimulationStore((state) => state.showLabels);
  const toggleLabels = useSimulationStore((state) => state.toggleLabels);
  const hiddenStructures = useSimulationStore((state) => state.hiddenStructures);
  const toggleStructure = useSimulationStore((state) => state.toggleStructure);
  const setAllStructures = useSimulationStore((state) => state.setAllStructures);
  const frame = useSimulationStore((state) => state.frame);

  const [autoRotate, setAutoRotate] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);

  const info = COMPONENTS[selected];
  const rows = useMemo(() => info.rows(frame), [info, frame]);

  return (
    <Panel
      title="Tokamak Digital Twin · 3D"
      subtitle="procedural model · schematic"
      className={className}
      scroll={false}
      bodyClassName="!p-0"
      right={
        <>
          <div className="segment mr-1">
            {VIEW_BUTTONS.map((button) => (
              <button
                key={button.id}
                type="button"
                data-active={viewMode === button.id}
                onClick={() => setViewMode(button.id)}
                title={button.hint}
              >
                {button.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={`btn btn-xs ${showFieldLines ? 'btn-primary' : ''}`}
            onClick={toggleFieldLines}
            title="Toggle schematic field lines"
          >
            FIELD
          </button>
          <button
            type="button"
            className={`btn btn-xs ${showLabels ? 'btn-primary' : ''}`}
            onClick={toggleLabels}
            title="Toggle component labels"
          >
            LABELS
          </button>
          <button
            type="button"
            className={`btn btn-xs ${autoRotate ? 'btn-primary' : ''}`}
            onClick={() => setAutoRotate((value) => !value)}
            title="Auto-orbit camera"
          >
            ORBIT
          </button>
          <button type="button" className="btn btn-xs" onClick={() => setResetSignal((value) => value + 1)} title="Reset camera">
            ⤾
          </button>
        </>
      }
    >
      <div className="relative flex-1 min-h-[260px]">
        <SceneErrorBoundary>
          <ReactorScene
            viewMode={viewMode}
            showFieldLines={showFieldLines}
            showLabels={showLabels}
            hiddenStructures={hiddenStructures}
            selected={selected}
            onSelect={setSelected}
            autoRotate={autoRotate}
            resetSignal={resetSignal}
          />
        </SceneErrorBoundary>

        {/* selected component card */}
        <div className="pointer-events-none absolute left-2 top-2 w-[224px] rounded-sm border border-edge2/70 bg-[#04101c]/85 p-2 backdrop-blur-[2px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] tracking-[0.16em] text-sys/80">{info.subsystem}</span>
            <StatusChip status={frame.status === 'RUNNING' ? 'RUNNING' : frame.status === 'IDLE' ? 'STANDBY' : 'DEGRADED'} label={frame.status} />
          </div>
          <h3 className="mt-0.5 text-[12px] font-semibold tracking-wide text-ink">{info.name}</h3>
          <div className="mt-1 flex flex-col gap-[1px]">
            {rows.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-2">
                <span className="text-[8.5px] text-faint">{row.label}</span>
                <span className="num text-[9.5px] text-ink">{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* temperature legend */}
        <div className="pointer-events-none absolute right-2 top-2 w-[104px]">
          <div className="mb-1 text-right text-[8px] tracking-[0.16em] text-faint">PLASMA TEMP</div>
          <div className="h-1.5 w-full rounded-sm bg-gradient-to-r from-cyan-700 via-fuchsia-500 to-white" />
          <div className="mt-0.5 flex justify-between text-[8px] text-faint">
            <span>0</span>
            <span>8 keV</span>
            <span>16+</span>
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-1.5 left-2 right-2 flex items-end justify-between gap-2">
          <p className="max-w-[62%] text-[8px] leading-tight text-faint">
            Drag to orbit · scroll to zoom · click a component. Field lines and plasma glow are illustrative, not an
            MHD or radiation-transport solution.
          </p>
          <span className="chip chip-idle shrink-0">
            {viewMode} VIEW · {showFieldLines ? 'FIELD ON' : 'FIELD OFF'}
          </span>
        </div>
      </div>

      {/* component selection + per-structure visibility */}
      <div className="flex shrink-0 flex-col gap-1 border-t border-edge/60 px-2 py-1.5">
        <div className="flex flex-wrap items-center gap-1">
          <span className="label mr-1 w-[74px] shrink-0">Select</span>
          {(Object.keys(COMPONENTS) as ReactorComponentId[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setSelected(id)}
              className={`chip ${selected === id ? 'chip-info' : 'chip-idle'} transition-colors hover:brightness-125`}
            >
              {COMPONENTS[id].name}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="label mr-1 w-[74px] shrink-0">Visible</span>
          {STRUCTURE_TOGGLES.map((structure) => {
            const hidden = hiddenStructures.includes(structure.id);
            return (
              <button
                key={structure.id}
                type="button"
                onClick={() => toggleStructure(structure.id)}
                aria-pressed={!hidden}
                className={`chip ${hidden ? 'chip-idle opacity-45 line-through' : 'chip-ok'} transition-all hover:brightness-125`}
                title={`${hidden ? 'Show' : 'Hide'} ${structure.name}`}
              >
                {structure.name}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setAllStructures([])}
            className="chip chip-idle ml-auto hover:brightness-125"
            title="Show every structure"
          >
            SHOW ALL
          </button>
        </div>
      </div>
    </Panel>
  );
}
