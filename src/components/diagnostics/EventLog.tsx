import { useMemo, useState } from 'react';
import { useSimulationStore } from '@/store/simulationStore';
import { AlarmChip, alarmTextClass } from '@/components/ui/StatusChip';
import { eventsToCSV, downloadTextFile, timestampSlug } from '@/utils/export';
import type { AlarmLevel, EventCategory } from '@/types/simulation';
import { filterAlarms, type AlarmFilter } from '@/utils/alarms';
import { formatTimestamp } from '@/utils/units';

const CATEGORIES: Array<'ALL' | EventCategory> = [
  'ALL',
  'ALARM',
  'FAULT',
  'CONTROL',
  'PHASE',
  'SIM',
  'EXPORT',
  'PRESET',
];

const LEVEL_TEXT: Record<AlarmLevel, string> = {
  INFO: 'text-sky-300',
  WARNING: 'text-amber-300',
  CRITICAL: 'text-red-300',
};

/** Full event history with category filters and CSV export. */
export function EventLog({ height = 260, compact = false }: { height?: number; compact?: boolean }) {
  const events = useSimulationStore((state) => state.events);
  const [filter, setFilter] = useState<'ALL' | EventCategory>('ALL');
  const pushToast = useSimulationStore((state) => state.pushToast);

  const visible = useMemo(() => {
    const list = filter === 'ALL' ? events : events.filter((event) => event.category === filter);
    return list.slice(-260).reverse();
  }, [events, filter]);

  const exportEvents = () => {
    if (!events.length) {
      pushToast('No events recorded yet.', 'warning');
      return;
    }
    downloadTextFile(`fusionplant-events-${timestampSlug()}.csv`, eventsToCSV(events), 'text/csv');
    pushToast('Event log exported.', 'success');
  };

  return (
    <div className="flex min-h-0 flex-col">
      <div
        className="mb-1 flex flex-wrap items-center gap-1"
        role="group"
        aria-label="Filter events by category"
      >
        {CATEGORIES.map((category) => (
          <button
            key={category}
            type="button"
            aria-pressed={filter === category}
            onClick={() => setFilter(category)}
            className={`btn btn-xs ${filter === category ? 'btn-primary' : ''}`}
          >
            {category}
          </button>
        ))}
        <span className="num ml-auto text-[8.5px] text-faint">{events.length} events</span>
        <button
          type="button"
          className="btn btn-xs"
          onClick={exportEvents}
          aria-label="Export event log as CSV"
        >
          CSV
        </button>
      </div>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region must be keyboard focusable (WCAG 2.1.1) */}
      <div
        tabIndex={0}
        role="region"
        aria-label="Event log entries"
        className="min-h-0 flex-1 overflow-y-auto scroll-thin focus-visible:outline focus-visible:outline-2 focus-visible:outline-sys"
        style={{ maxHeight: height }}
      >
        {visible.length === 0 ? (
          <p className="py-4 text-center text-[10px] text-faint">No events in this category yet.</p>
        ) : compact ? (
          <div className="flex flex-col gap-1">
            {visible.map((event) => (
              <div key={event.id} className="rounded-sm border border-edge/40 bg-white/[0.012] px-1.5 py-1">
                <div className="flex items-center gap-1.5">
                  <span className="num text-[8px] text-faint">T+{event.tS.toFixed(1)}s</span>
                  <span className={`num text-[8px] ${LEVEL_TEXT[event.level]}`}>{event.level}</span>
                  <span className="text-[8px] uppercase tracking-wider text-faint">{event.category}</span>
                </div>
                <div className={`text-[9.5px] leading-snug ${LEVEL_TEXT[event.level]}`}>{event.message}</div>
                {event.detail && <div className="num text-[8px] leading-snug text-faint">{event.detail}</div>}
              </div>
            ))}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>T+</th>
                <th>Level</th>
                <th>Category</th>
                <th>Message</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((event) => (
                <tr key={event.id}>
                  <td className="text-faint">{event.tS.toFixed(1)}s</td>
                  <td className={LEVEL_TEXT[event.level]}>{event.level}</td>
                  <td className="text-muted">{event.category}</td>
                  <td className={`!whitespace-normal !font-sans !text-[10px] ${LEVEL_TEXT[event.level]}`}>
                    {event.message}
                  </td>
                  <td
                    className="max-w-[260px] !whitespace-normal !font-sans !text-[9px] text-faint"
                    title={event.detail}
                  >
                    {event.detail ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="mt-1 text-right text-[8px] text-faint">
        Last update {events.length ? formatTimestamp(events[events.length - 1].wallMs) : '—'} · newest first
      </div>
    </div>
  );
}

/**
 * Full alarm list for the diagnostics page, filtered by severity.
 * INFO rows are notices: visible here, excluded from the "Active alarms" count.
 */
export function AlarmHistoryTable() {
  const alarms = useSimulationStore((state) => state.frame.alarms);
  const simTime = useSimulationStore((state) => state.frame.simTimeS);
  const [filter, setFilter] = useState<AlarmFilter>('ALL');

  const counts = useMemo(() => {
    const active = alarms.filter((alarm) => alarm.active);
    return {
      ALL: active.length,
      CRITICAL: active.filter((alarm) => alarm.level === 'CRITICAL').length,
      WARNING: active.filter((alarm) => alarm.level === 'WARNING').length,
      INFO: active.filter((alarm) => alarm.level === 'INFO').length,
    } as Record<AlarmFilter, number>;
  }, [alarms]);

  const rows = useMemo(() => filterAlarms(alarms, filter), [alarms, filter]);

  const filters: Array<{ id: AlarmFilter; label: string }> = [
    { id: 'ALL', label: 'ALL' },
    { id: 'CRITICAL', label: 'CRITICAL' },
    { id: 'WARNING', label: 'WARNING' },
    { id: 'INFO', label: 'INFO' },
  ];

  return (
    <div className="flex min-h-0 flex-col">
      <div
        className="mb-1 flex flex-wrap items-center gap-1"
        role="group"
        aria-label="Filter alarm history by severity"
      >
        {filters.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={filter === entry.id}
            onClick={() => setFilter(entry.id)}
            className={`btn btn-xs ${filter === entry.id ? 'btn-primary' : ''}`}
          >
            {entry.label}
            <span className="num ml-1 text-[8px] opacity-70" aria-hidden="true">
              {counts[entry.id]}
            </span>
          </button>
        ))}
        <span className="num ml-auto text-[8px] text-faint">
          alarms: {counts.CRITICAL + counts.WARNING} · notices: {counts.INFO}
        </span>
      </div>

      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region must be keyboard focusable (WCAG 2.1.1) */}
      <div
        tabIndex={0}
        role="region"
        aria-label="Alarm history entries"
        className="min-h-0 flex-1 overflow-y-auto scroll-thin focus-visible:outline focus-visible:outline-2 focus-visible:outline-sys"
        style={{ maxHeight: 232 }}
      >
        {rows.length === 0 ? (
          <p className="py-4 text-center text-[10px] text-faint">
            {filter === 'ALL'
              ? 'No alarms have been raised in this run.'
              : `No ${filter} entries in this run.`}
          </p>
        ) : (
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr>
                <th className="sticky top-0 z-[2] bg-[#08131f] px-1.5 py-1 text-left text-[8.5px] uppercase tracking-[0.14em] text-muted">
                  Level
                </th>
                <th className="sticky top-0 z-[2] bg-[#08131f] px-1.5 py-1 text-left text-[8.5px] uppercase tracking-[0.14em] text-muted">
                  Alarm
                </th>
                <th className="sticky top-0 z-[2] bg-[#08131f] px-1.5 py-1 text-right text-[8.5px] uppercase tracking-[0.14em] text-muted">
                  Timing
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((alarm) => (
                <tr
                  key={alarm.id}
                  className={`border-b border-edge/40 align-top ${alarm.active ? '' : 'opacity-55'}`}
                >
                  <td className="px-1.5 py-1">
                    <AlarmChip level={alarm.level} />
                  </td>
                  <td className="px-1.5 py-1">
                    <div className={`leading-snug ${alarmTextClass(alarm.level)}`}>{alarm.message}</div>
                    <div className="num text-[8px] text-faint">
                      {alarm.source} · {alarm.value}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-1.5 py-1 text-right">
                    <div className="num text-[8.5px] text-muted">T+{alarm.raisedAtS.toFixed(0)}s</div>
                    <div className={`num text-[8px] ${alarm.active ? 'text-emerald-300' : 'text-faint'}`}>
                      {alarm.active
                        ? `ACTIVE ${(simTime - alarm.raisedAtS).toFixed(0)}s`
                        : `CLEARED ${alarm.clearedAtS?.toFixed(0) ?? '—'}s`}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
