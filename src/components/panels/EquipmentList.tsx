import { useSimulationStore } from '@/store/simulationStore';
import { StatusChip, StatusDot } from '@/components/ui/StatusChip';
import type { EquipmentItem } from '@/types/simulation';
import { componentFromEquipmentId, COMPONENT_REGISTRY } from '@/reactor/componentRegistry';

/**
 * Equipment list.
 *
 * Rows are interactive: selecting one highlights the matching 3D component
 * (bidirectional sync with the reactor view), and the row of the currently
 * selected 3D component is highlighted here in return.
 */
export function EquipmentList({
  subsystems,
  compact = false,
}: {
  subsystems?: EquipmentItem['subsystem'][];
  compact?: boolean;
}) {
  const equipment = useSimulationStore((state) => state.frame.equipment);
  const selectedComponent = useSimulationStore((state) => state.selectedComponent);
  const setSelectedComponent = useSimulationStore((state) => state.setSelectedComponent);
  const setPage = useSimulationStore((state) => state.setPage);
  const activePage = useSimulationStore((state) => state.activePage);

  const visible = subsystems ? equipment.filter((item) => subsystems.includes(item.subsystem)) : equipment;

  return (
    <div className="flex flex-col divide-y divide-edge/40">
      {visible.map((item) => {
        const componentId = componentFromEquipmentId(item.id);
        const isSelected = componentId === selectedComponent;
        const componentLabel = componentId ? COMPONENT_REGISTRY[componentId].label : null;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              if (!componentId) return;
              setSelectedComponent(componentId);
              if (activePage !== 'REACTOR' && activePage !== 'OVERVIEW') setPage('REACTOR');
            }}
            aria-pressed={isSelected}
            aria-label={`${item.name}, status ${item.status}${componentLabel ? `, inspect ${componentLabel} in 3D` : ''}`}
            className={`flex w-full items-center gap-2 px-1 py-[5px] text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sys ${
              isSelected ? 'bg-sys/[0.10] shadow-[inset_2px_0_0_#22d3ee]' : 'hover:bg-white/[0.03]'
            }`}
            title={componentLabel ? `${item.name} — linked to 3D component ${componentLabel}` : item.name}
          >
            <StatusDot status={item.status} pulse />
            <div className="min-w-0 flex-1">
              <div className={`truncate text-[10.5px] ${isSelected ? 'text-sys' : 'text-ink'}`}>
                {item.name}
              </div>
              {!compact && <div className="num truncate text-[9px] text-faint">{item.detail}</div>}
            </div>
            <StatusChip status={item.status} />
          </button>
        );
      })}
    </div>
  );
}

export function EquipmentSummaryBar() {
  const equipment = useSimulationStore((state) => state.frame.equipment);
  const counts = equipment.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1;
    return acc;
  }, {});

  const entries = Object.entries(counts) as Array<[EquipmentItem['status'], number]>;

  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(([status, count]) => (
        <span key={status} className="chip chip-idle gap-1">
          <StatusDot status={status} />
          {status} {count}
        </span>
      ))}
    </div>
  );
}
