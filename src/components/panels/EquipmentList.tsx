import { useSimulationStore } from '@/store/simulationStore';
import { StatusChip, StatusDot } from '@/components/ui/StatusChip';
import type { EquipmentItem } from '@/types/simulation';

export function EquipmentList({
  subsystems,
  compact = false,
}: {
  subsystems?: EquipmentItem['subsystem'][];
  compact?: boolean;
}) {
  const equipment = useSimulationStore((state) => state.frame.equipment);
  const visible = subsystems ? equipment.filter((item) => subsystems.includes(item.subsystem)) : equipment;

  return (
    <div className="flex flex-col divide-y divide-edge/40">
      {visible.map((item) => (
        <div key={item.id} className="flex items-center gap-2 px-1 py-[5px]">
          <StatusDot status={item.status} pulse />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[10.5px] text-ink">{item.name}</div>
            {!compact && <div className="num truncate text-[9px] text-faint">{item.detail}</div>}
          </div>
          <StatusChip status={item.status} />
        </div>
      ))}
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
