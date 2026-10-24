import { useMemo, useState } from 'react';
import { useSimulationStore } from '@/store/simulationStore';
import { useAlarmBuckets } from '@/store/selectors';
import { AlarmChip, alarmTextClass } from '@/components/ui/StatusChip';
import { alarmSummaryText, filterAlarms, type AlarmFilter } from '@/utils/alarms';
import type { AlarmRecord } from '@/types/simulation';

function AlarmRow({ alarm, nowS }: { alarm: AlarmRecord; nowS: number }) {
  const age = Math.max(0, nowS - alarm.raisedAtS);
  return (
    <div
      className={`flex items-start gap-2 border-l-2 px-2 py-1.5 ${
        alarm.level === 'CRITICAL'
          ? 'border-red-500/80 bg-red-500/[0.06]'
          : alarm.level === 'WARNING'
            ? 'border-amber-500/70 bg-amber-500/[0.05]'
            : 'border-sky-500/60 bg-sky-500/[0.04]'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <AlarmChip level={alarm.level} />
          <span className="num text-[8.5px] text-faint">{alarm.source}</span>
          <span className="num ml-auto whitespace-nowrap text-[8.5px] text-faint">
            T+{alarm.raisedAtS.toFixed(0)}s · {age.toFixed(0)}s ago
          </span>
        </div>
        <p className={`mt-0.5 text-[10.5px] leading-snug ${alarmTextClass(alarm.level)}`}>{alarm.message}</p>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span className="num text-[9.5px] text-muted">{alarm.value}</span>
          <span className="num text-[8px] text-faint">T+{alarm.raisedAtS.toFixed(1)}s</span>
        </div>
      </div>
    </div>
  );
}

const FILTERS: Array<{ id: AlarmFilter; label: string }> = [
  { id: 'ALL', label: 'ALL' },
  { id: 'CRITICAL', label: 'CRITICAL' },
  { id: 'WARNING', label: 'WARNING' },
  { id: 'INFO', label: 'INFO' },
];

/**
 * Active alarms and notices.
 *
 * INFO records are presented as *notices*: they are visible and filterable, but
 * never included in the alarm count shown in the top bar.
 */
export function AlarmFeed({ limit = 8 }: { limit?: number }) {
  const alarms = useSimulationStore((state) => state.frame.alarms);
  const simTime = useSimulationStore((state) => state.frame.simTimeS);
  const buckets = useAlarmBuckets();
  const [filter, setFilter] = useState<AlarmFilter>('ALL');

  const active = useMemo(() => {
    const ordered = [...buckets.criticals, ...buckets.warnings, ...buckets.notices];
    return filterAlarms(ordered, filter);
  }, [buckets, filter]);

  const cleared = useMemo(
    () =>
      alarms
        .filter((alarm) => !alarm.active)
        .sort((a, b) => (b.clearedAtS ?? 0) - (a.clearedAtS ?? 0))
        .slice(0, 3),
    [alarms],
  );

  const countFor = (id: AlarmFilter) => {
    if (id === 'ALL') return buckets.active.length;
    if (id === 'CRITICAL') return buckets.criticals.length;
    if (id === 'WARNING') return buckets.warnings.length;
    return buckets.notices.length;
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="mb-1 flex shrink-0 flex-wrap items-center gap-1"
        role="group"
        aria-label="Filter notifications by severity"
      >
        {FILTERS.map((entry) => {
          const isActive = filter === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => setFilter(entry.id)}
              className={`btn btn-xs ${isActive ? 'btn-primary' : ''}`}
            >
              {entry.label}
              <span className="num ml-1 text-[8px] opacity-70" aria-hidden="true">
                {countFor(entry.id)}
              </span>
            </button>
          );
        })}
        <span className="num ml-auto text-[8px] text-faint" aria-live="polite">
          {alarmSummaryText(buckets)}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scroll-thin">
        {active.length === 0 ? (
          <div className="flex h-full min-h-[90px] flex-col items-center justify-center gap-1.5 py-5 text-center">
            <span className={`led ${buckets.alarmCount ? 'text-ok' : 'text-ok'}`} aria-hidden="true" />
            <span className="text-[10px] tracking-[0.14em] text-emerald-300/80">
              {filter === 'ALL' ? 'NO ACTIVE ALARMS OR NOTICES' : `NO ACTIVE ${filter} ENTRIES`}
            </span>
            <span className="text-[9px] text-faint">
              Supervision runs against the simulated state — nothing is connected to a real device.
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {active.slice(0, limit).map((alarm) => (
              <AlarmRow key={alarm.id} alarm={alarm} nowS={simTime} />
            ))}
            {active.length > limit && (
              <p className="px-2 py-1 text-[9px] text-faint">
                +{active.length - limit} more — see DIAGNOSTICS for the full list.
              </p>
            )}
          </div>
        )}

        {filter === 'ALL' && cleared.length > 0 && (
          <div className="mt-1">
            <div className="label px-1 pb-1">Recently cleared</div>
            {cleared.map((alarm) => (
              <div key={alarm.id} className="flex items-center gap-2 px-2 py-1 opacity-55">
                <AlarmChip level={alarm.level} />
                <span className="truncate text-[9.5px] text-muted line-through">{alarm.message}</span>
                <span className="num ml-auto whitespace-nowrap text-[8.5px] text-faint">
                  {alarm.clearedAtS === null ? '—' : `${alarm.clearedAtS.toFixed(0)}s`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
