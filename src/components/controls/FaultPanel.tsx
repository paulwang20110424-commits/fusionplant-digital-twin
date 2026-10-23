import { useState } from 'react';
import type { FaultKind } from '@/types/simulation';
import { FAULT_DEFINITIONS, FAULT_MAP } from '@/simulation/faults';
import { useSimulationStore } from '@/store/simulationStore';
import { Toggle } from './Fields';
import { SectionLabel } from '@/components/ui/Panel';

const SEVERITY_PRESETS = [
  { label: 'MINOR', value: 0.3 },
  { label: 'MAJOR', value: 0.65 },
  { label: 'SEVERE', value: 1 },
];

function ActiveFaultCard({ id }: { id: string }) {
  const fault = useSimulationStore((state) => state.faults.find((entry) => entry.id === id));
  const clearFault = useSimulationStore((state) => state.clearFault);
  const [expanded, setExpanded] = useState(false);
  if (!fault) return null;
  const definition = FAULT_MAP[fault.kind];

  return (
    <div className="rounded-sm border border-amber-500/35 bg-amber-500/[0.05] p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="led led-pulse text-warn" />
            <span className="truncate text-[10.5px] font-semibold text-amber-200">{definition.name}</span>
          </div>
          <div className="num mt-0.5 text-[8.5px] text-amber-200/60">
            severity {(fault.severity * 100).toFixed(0)}% · injected T+{fault.injectedAtS.toFixed(1)}s
          </div>
        </div>
        <button type="button" className="btn btn-xs" onClick={() => clearFault(fault.id)}>
          CLEAR
        </button>
      </div>

      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-sm bg-black/40">
        <div
          className="h-full bg-gradient-to-r from-amber-500/60 to-red-500/80"
          style={{ width: `${Math.min(100, fault.severity * 100)}%` }}
        />
      </div>

      <p className="mt-1.5 text-[9.5px] leading-snug text-muted">{fault.effect}</p>

      <button
        type="button"
        className="mt-1 text-[8.5px] uppercase tracking-[0.14em] text-sys/80 hover:text-sys"
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? '▾ hide diagnosis' : '▸ diagnosis & recovery'}
      </button>

      {expanded && (
        <div className="mt-1.5 space-y-1.5 border-t border-amber-500/20 pt-1.5">
          <div>
            <div className="label mb-0.5">Diagnosis</div>
            <p className="text-[9.5px] leading-snug text-slate-300">{definition.diagnosis}</p>
          </div>
          <div>
            <div className="label mb-0.5">Affected parameters</div>
            <ul className="list-inside list-disc text-[9px] text-muted">
              {definition.affectedParameters.map((parameter) => (
                <li key={parameter}>{parameter}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="label mb-0.5">Simulated recovery steps</div>
            <ol className="list-inside list-decimal space-y-0.5 text-[9px] text-muted">
              {definition.recoverySteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

export function FaultPanel({ compact = false }: { compact?: boolean }) {
  const faults = useSimulationStore((state) => state.faults);
  const injectFault = useSimulationStore((state) => state.injectFault);
  const clearAllFaults = useSimulationStore((state) => state.clearAllFaults);
  const injectionPaused = useSimulationStore((state) => state.faultInjectionPaused);
  const setInjectionPaused = useSimulationStore((state) => state.setFaultInjectionPaused);

  const [severity, setSeverity] = useState(0.65);
  const active = faults.filter((fault) => fault.active);
  const available = compact ? FAULT_DEFINITIONS.slice(0, 4) : FAULT_DEFINITIONS;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[9px] tracking-[0.16em] text-amber-300/90">
          <span className={`led ${active.length ? 'text-crit led-pulse' : 'text-ok'}`} />
          {active.length} ACTIVE {active.length === 1 ? 'FAULT' : 'FAULTS'}
        </span>
        <button
          type="button"
          className="btn btn-xs"
          onClick={clearAllFaults}
          disabled={!active.length}
          title="Clear every injected fault"
        >
          CLEAR ALL
        </button>
      </div>

      <Toggle
        label="Fault injection enabled"
        checked={!injectionPaused}
        onChange={(checked) => setInjectionPaused(!checked)}
        hint="Suspending keeps fault records but removes their physical consequences (recovery rehearsal)"
      />

      {active.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <SectionLabel>Active fault timeline</SectionLabel>
          {active.map((fault) => (
            <ActiveFaultCard key={fault.id} id={fault.id} />
          ))}
        </div>
      )}

      <div className={active.length ? 'flex flex-col gap-1.5' : 'flex flex-col gap-1.5'}>
        <SectionLabel
          right={<span className="num text-[9px] text-faint">{(severity * 100).toFixed(0)}%</span>}
        >
          Injection severity
        </SectionLabel>
        <input
          type="range"
          min={0.05}
          max={1}
          step={0.05}
          value={severity}
          onChange={(event) => setSeverity(Number(event.target.value))}
          className="accent-warn"
        />
        <div className="flex gap-1">
          {SEVERITY_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className={`btn btn-xs flex-1 ${Math.abs(severity - preset.value) < 0.001 ? 'btn-primary' : ''}`}
              onClick={() => setSeverity(preset.value)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <SectionLabel>Available injections</SectionLabel>
        {available.map((definition) => {
          const isActive = active.some((fault) => fault.kind === definition.kind);
          return (
            <div
              key={definition.kind}
              className="flex items-center gap-2 rounded-sm border border-edge/50 bg-white/[0.012] px-2 py-1"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[10px] text-ink">{definition.shortName}</span>
                  <span className="chip chip-idle !h-[14px] !px-1 !text-[7.5px]">{definition.subsystem}</span>
                </div>
                <div className="truncate text-[8.5px] text-faint">{definition.name}</div>
              </div>
              <button
                type="button"
                className="btn btn-xs"
                disabled={isActive || injectionPaused}
                onClick={() => injectFault(definition.kind as FaultKind, severity)}
                title={definition.description}
              >
                {isActive ? 'ACTIVE' : 'INJECT'}
              </button>
            </div>
          );
        })}
      </div>

      {compact && (
        <p className="text-[8.5px] leading-snug text-faint">
          Full catalogue with diagnosis and recovery guidance is on the SIMULATION page.
        </p>
      )}
    </div>
  );
}
