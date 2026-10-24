import { Component, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { ReactorScene } from './ReactorScene';
import { Panel } from '@/components/ui/Panel';
import { StatusChip } from '@/components/ui/StatusChip';
import { useSimulationStore } from '@/store/simulationStore';
import type { ReactorComponentId, ReactorViewMode } from '@/types/simulation';
import {
  COMPONENT_LIST,
  COMPONENT_REGISTRY,
  FAULT_PROPAGATION,
  faultedComponents,
} from '@/reactor/componentRegistry';
import { FAULT_MAP } from '@/simulation/faults';

/** Alarm sources that are relevant to each component (for the info card). */
const COMPONENT_ALARM_SOURCES: Record<ReactorComponentId, string[]> = {
  plasma: ['PLASMA', 'CONTROL'],
  'vacuum-vessel': ['VACUUM'],
  'tf-coil': ['MAGNET', 'CRYOGENICS'],
  'pf-coil': ['MAGNET'],
  'central-solenoid': ['MAGNET'],
  divertor: ['COOLING'],
  cryostat: ['CRYOGENICS', 'MAGNET'],
  'neutral-beam': ['HEATING'],
  'coolant-manifold': ['COOLING'],
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
            The WebGL scene could not start in this browser ({this.state.error}). All telemetry, charts,
            controls and diagnostics remain fully functional.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

const VIEW_BUTTONS: Array<{ id: ReactorViewMode; label: string; hint: string }> = [
  { id: 'FULL', label: 'FULL', hint: 'Complete assembly' },
  { id: 'CUTAWAY', label: 'CUTAWAY', hint: 'Section view: vessel cut open, external coils hidden' },
  { id: 'PLASMA', label: 'PLASMA', hint: 'Plasma and field lines only' },
];

const STRUCTURE_TOGGLES: Array<{ id: ReactorComponentId; name: string }> = [
  { id: 'plasma', name: 'Plasma' },
  { id: 'vacuum-vessel', name: 'Vessel' },
  { id: 'tf-coil', name: 'TF Coils' },
  { id: 'pf-coil', name: 'PF Coils' },
  { id: 'central-solenoid', name: 'Solenoid' },
  { id: 'divertor', name: 'Divertor' },
  { id: 'cryostat', name: 'Cryostat' },
];

export function ReactorView({ className = '', demoId }: { className?: string; demoId?: string }) {
  const viewMode = useSimulationStore((state) => state.reactorView);
  const setViewMode = useSimulationStore((state) => state.setReactorView);
  const selected = useSimulationStore((state) => state.selectedComponent);
  const setSelected = useSimulationStore((state) => state.setSelectedComponent);
  const setPage = useSimulationStore((state) => state.setPage);
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
  const [hovered, setHovered] = useState<ReactorComponentId | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const pointerFrame = useRef(0);

  const descriptor = COMPONENT_REGISTRY[selected];
  const rows = useMemo(() => descriptor.metrics(frame), [descriptor, frame]);
  const target = useMemo(() => descriptor.target(frame), [descriptor, frame]);

  const faulted = useMemo(() => faultedComponents(frame.activeFaults as never), [frame.activeFaults]);
  const isFaulted = faulted.includes(selected);

  const activeFaultsForComponent = useMemo(
    () =>
      frame.activeFaults
        .map((kind) => FAULT_MAP[kind as keyof typeof FAULT_MAP])
        .filter(
          (definition) =>
            definition && definition.subsystem && descriptor.affectedBy.includes(definition.kind as never),
        ),
    [frame.activeFaults, descriptor],
  );

  const relatedAlarms = useMemo(() => {
    const sources = COMPONENT_ALARM_SOURCES[selected] ?? [];
    return frame.alarms.filter((alarm) => alarm.active && sources.includes(alarm.source)).slice(0, 3);
  }, [frame.alarms, selected]);

  const equipmentStatus = useMemo(() => {
    const item = frame.equipment.find((entry) => descriptor.equipmentIds.includes(entry.id));
    return item?.status ?? (frame.status === 'RUNNING' ? 'RUNNING' : 'STANDBY');
  }, [frame.equipment, frame.status, descriptor.equipmentIds]);

  const propagation = useMemo(() => {
    const active = frame.activeFaults[0];
    if (!active) return [];
    return (FAULT_PROPAGATION[active as keyof typeof FAULT_PROPAGATION] ?? []).map(
      (id) => COMPONENT_REGISTRY[id],
    );
  }, [frame.activeFaults]);

  const onHoverComponent = useCallback((id: ReactorComponentId | null) => setHovered(id), []);
  const hoverDescriptor = hovered ? COMPONENT_REGISTRY[hovered] : null;

  return (
    <Panel
      title="Tokamak Digital Twin · 3D"
      subtitle="procedural model · schematic"
      className={className}
      demoId={demoId}
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
                aria-pressed={viewMode === button.id}
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
            aria-pressed={showFieldLines}
          >
            FIELD
          </button>
          <button
            type="button"
            className={`btn btn-xs ${showLabels ? 'btn-primary' : ''}`}
            onClick={toggleLabels}
            title="Toggle component labels"
            aria-pressed={showLabels}
          >
            LABELS
          </button>
          <button
            type="button"
            className={`btn btn-xs ${autoRotate ? 'btn-primary' : ''}`}
            onClick={() => setAutoRotate((value) => !value)}
            title="Auto-orbit camera"
            aria-pressed={autoRotate}
          >
            ORBIT
          </button>
          <button
            type="button"
            className="btn btn-xs"
            onClick={() => setResetSignal((value) => value + 1)}
            title="Reset camera"
            aria-label="Reset the 3D camera"
          >
            ⤾
          </button>
        </>
      }
    >
      <div
        className="relative flex-1 min-h-[260px]"
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const next = { x: event.clientX - rect.left, y: event.clientY - rect.top };
          if (pointerFrame.current) return;
          pointerFrame.current = window.requestAnimationFrame(() => {
            pointerFrame.current = 0;
            setPointer(next);
          });
        }}
        onPointerLeave={() => {
          setPointer(null);
          setHovered(null);
        }}
      >
        <SceneErrorBoundary>
          <ReactorScene
            viewMode={viewMode}
            showFieldLines={showFieldLines}
            showLabels={showLabels}
            hiddenStructures={hiddenStructures}
            faultedComponents={faulted}
            onHoverComponent={onHoverComponent}
            selected={selected}
            onSelect={setSelected}
            autoRotate={autoRotate}
            resetSignal={resetSignal}
          />
        </SceneErrorBoundary>

        {/* hover tooltip (DOM, so it is readable and does not cost canvas work) */}
        {hoverDescriptor && pointer && (
          <div
            className="pointer-events-none absolute z-10 w-[190px] rounded-sm border border-sys/50 bg-[#04101c]/95 px-2 py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.6)]"
            style={{
              left: Math.min(Math.max(8, pointer.x + 14), 400),
              top: Math.min(Math.max(8, pointer.y + 14), 460),
            }}
            role="tooltip"
          >
            <div className="flex items-center gap-1">
              <span className="truncate text-[10px] font-semibold text-ink">{hoverDescriptor.label}</span>
              {faulted.includes(hoverDescriptor.id) && (
                <span className="chip chip-warn !h-[14px] !px-1 !text-[7px]">FAULT</span>
              )}
            </div>
            <div className="num mt-0.5 truncate text-[8.5px] text-muted">{hoverDescriptor.target(frame)}</div>
            <div className="mt-0.5 text-[8px] text-faint">Click to inspect · simulated device</div>
          </div>
        )}

        {/* selected component card */}
        <div className="pointer-events-auto absolute left-2 top-2 w-[236px] rounded-sm border border-edge2/70 bg-[#04101c]/88 p-2 backdrop-blur-[2px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] tracking-[0.16em] text-sys/80">
              {isFaulted ? 'FAULT AFFECTED' : 'SELECTED'}
            </span>
            <StatusChip status={equipmentStatus} />
          </div>
          <h3 className="mt-0.5 text-[12px] font-semibold tracking-wide text-ink">{descriptor.label}</h3>

          <div className="mt-1 flex flex-col gap-[1px]">
            {rows.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-2">
                <span className="text-[8.5px] text-faint">{row.label}</span>
                <span className="num text-[9.5px] text-ink">{row.value}</span>
              </div>
            ))}
          </div>

          <div className="mt-1 border-t border-edge/40 pt-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[8px] uppercase tracking-[0.1em] text-faint">Target</span>
              <span className="num truncate text-[9px] text-sys/90" title={target}>
                {target}
              </span>
            </div>
          </div>

          {activeFaultsForComponent.length > 0 && (
            <div className="mt-1 rounded-sm border border-amber-500/40 bg-amber-500/[0.08] px-1.5 py-1">
              <div className="flex items-center gap-1 text-[8px] font-semibold uppercase tracking-[0.1em] text-amber-300">
                <span aria-hidden="true">⚠</span> Simulated propagation
              </div>
              <p className="mt-0.5 text-[8.5px] leading-snug text-amber-100/80">
                {activeFaultsForComponent.map((definition) => definition.name).join(', ')}
              </p>
              {propagation.length > 0 && (
                <p className="num mt-0.5 text-[8px] leading-snug text-amber-200/70">
                  {propagation.map((entry) => entry.short).join(' → ')}
                </p>
              )}
            </div>
          )}

          {relatedAlarms.length > 0 && (
            <div className="mt-1 border-t border-edge/40 pt-1">
              <div className="text-[8px] uppercase tracking-[0.1em] text-faint">Related alarms</div>
              {relatedAlarms.map((alarm) => (
                <p
                  key={alarm.id}
                  className="truncate text-[8.5px] leading-snug text-amber-200/85"
                  title={alarm.message}
                >
                  {alarm.level}: {alarm.message}
                </p>
              ))}
            </div>
          )}

          <button
            type="button"
            className="btn btn-xs mt-1.5 w-full"
            onClick={() => setPage(descriptor.page)}
            aria-label={`Open the ${descriptor.page} console page for ${descriptor.label}`}
          >
            OPEN {descriptor.page} PAGE →
          </button>
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
            Drag to orbit · scroll to zoom · click a component. Field lines and plasma glow are illustrative,
            not an MHD or radiation-transport solution.
          </p>
          <span className="chip chip-idle shrink-0">
            {viewMode} VIEW · {showFieldLines ? 'FIELD ON' : 'FIELD OFF'}
            {faulted.length ? ` · ${faulted.length} FAULT AFFECTED` : ''}
          </span>
        </div>
      </div>

      {/* component selection + per-structure visibility */}
      <div className="flex shrink-0 flex-col gap-1 border-t border-edge/60 px-2 py-1.5">
        <div className="flex flex-wrap items-center gap-1">
          <span className="label mr-1 w-[74px] shrink-0">Select</span>
          {COMPONENT_LIST.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setSelected(entry.id)}
              aria-pressed={selected === entry.id}
              className={`chip ${selected === entry.id ? 'chip-info' : 'chip-idle'} transition-colors hover:brightness-125`}
            >
              {faulted.includes(entry.id) ? `⚠ ${entry.short}` : entry.short}
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
