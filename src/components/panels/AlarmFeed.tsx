import { useSimulationStore } from '@/store/simulationStore';
import { AlarmChip, alarmTextClass } from '@/components/ui/StatusChip';
import { formatTimestamp } from '@/utils/units';
import type { AlarmRecord } from '@/types/simulation';

function AlarmRow({ alarm, nowS }: { alarm: AlarmRecord; nowS: number }) {
  const age = nowS - alarm.raisedAtS;
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
          <span className="num ml-auto text-[8.5px] text-faint">
            T+{alarm.raisedAtS.toFixed(0)}s · {age < 0 ? '0' : age.toFixed(0)}s ago
          </span>
        </div>
        <p className={`mt-0.5 text-[10.5px] leading-snug ${alarmTextClass(alarm.level)}`}>{alarm.message}</p>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span className="num text-[9.5px] text-muted">{alarm.value}</span>
          <span className="num text-[8px] text-faint">{formatTimestamp(Date.now() - age * 1000)}</span>
        </div>
      </div>
    </div>
  );
}

/** Active alarms first, then the most recent cleared entries. */
export function AlarmFeed({ limit = 8 }: { limit?: number }) {
  const alarms = useSimulationStore((state) => state.frame.alarms);
  const simTime = useSimulationStore((state) => state.frame.simTimeS);

  const active = alarms.filter((alarm) => alarm.active);
  const cleared = alarms
    .filter((alarm) => !alarm.active)
    .sort((a, b) => (b.clearedAtS ?? 0) - (a.clearedAtS ?? 0));

  if (!active.length && !cleared.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1.5 py-6 text-center">
        <span className="led text-ok" />
        <span className="text-[10px] tracking-[0.14em] text-emerald-300/80">NO ACTIVE ALARMS</span>
        <span className="text-[9px] text-faint">Supervision is running against the simulated state</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {active.slice(0, limit).map((alarm) => (
        <AlarmRow key={alarm.id} alarm={alarm} nowS={simTime} />
      ))}
      {!active.length && (
        <div className="px-2 py-1.5 text-[9.5px] tracking-wider text-emerald-300/80">ALL CLEAR — NO ACTIVE ALARMS</div>
      )}
      {cleared.length > 0 && (
        <div className="mt-1">
          <div className="label px-1 pb-1">Recently cleared</div>
          {cleared.slice(0, 3).map((alarm) => (
            <div key={alarm.id} className="flex items-center gap-2 px-2 py-1 opacity-55">
              <AlarmChip level={alarm.level} />
              <span className="truncate text-[9.5px] text-muted line-through">{alarm.message}</span>
              <span className="num ml-auto text-[8.5px] text-faint">
                {alarm.clearedAtS === null ? '—' : `${alarm.clearedAtS.toFixed(0)}s`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
