import type { AlarmLevel, AlarmRecord } from '@/types/simulation';

/**
 * Alarm semantics.
 *
 *   CRITICAL  plant-level problem, operator must act now
 *   WARNING   degraded operation, operator should look
 *   INFO      informational notice about the simulated operating point;
 *             it is NOT an alarm and must never be counted as one
 *
 * Everything in the UI derives from these buckets so the top bar, the alarm
 * feed and the diagnostics table can never disagree.
 */
export interface AlarmBuckets {
  /** All active records, in the order the engine raised them. */
  active: AlarmRecord[];
  /** Active CRITICAL records. */
  criticals: AlarmRecord[];
  /** Active WARNING records. */
  warnings: AlarmRecord[];
  /** Active INFO notices (not alarms). */
  notices: AlarmRecord[];
  /** Total active alarms = critical + warning. */
  alarmCount: number;
  /** Total active notices. */
  noticeCount: number;
  /** Worst active level, or null when everything is clear. */
  worstLevel: AlarmLevel | null;
}

const EMPTY: AlarmBuckets = {
  active: [],
  criticals: [],
  warnings: [],
  notices: [],
  alarmCount: 0,
  noticeCount: 0,
  worstLevel: null,
};

/** Split an alarm list into operational alarms and informational notices. */
export function bucketAlarms(alarms: AlarmRecord[] | null | undefined): AlarmBuckets {
  if (!Array.isArray(alarms) || alarms.length === 0) return EMPTY;

  const active = alarms.filter((alarm) => alarm?.active);
  if (active.length === 0) return EMPTY;

  const criticals: AlarmRecord[] = [];
  const warnings: AlarmRecord[] = [];
  const notices: AlarmRecord[] = [];

  for (const alarm of active) {
    switch (alarm.level) {
      case 'CRITICAL':
        criticals.push(alarm);
        break;
      case 'WARNING':
        warnings.push(alarm);
        break;
      case 'INFO':
      default:
        notices.push(alarm);
        break;
    }
  }

  return {
    active,
    criticals,
    warnings,
    notices,
    alarmCount: criticals.length + warnings.length,
    noticeCount: notices.length,
    worstLevel: criticals.length ? 'CRITICAL' : warnings.length ? 'WARNING' : notices.length ? 'INFO' : null,
  };
}

/** Human label for a level (colour is never the only signal). */
export function alarmLevelLabel(level: AlarmLevel): string {
  switch (level) {
    case 'CRITICAL':
      return 'Critical';
    case 'WARNING':
      return 'Warning';
    default:
      return 'Info';
  }
}

/** Pluralised, screen-reader friendly summary, e.g. "2 active alarms, 1 active notice". */
export function alarmSummaryText(buckets: AlarmBuckets): string {
  const alarmPart = `${buckets.alarmCount} active ${buckets.alarmCount === 1 ? 'alarm' : 'alarms'}`;
  const noticePart = `${buckets.noticeCount} active ${buckets.noticeCount === 1 ? 'notice' : 'notices'}`;
  return `${alarmPart}, ${noticePart}`;
}

/** Filter helper used by the alarm feed and the diagnostics table. */
export type AlarmFilter = 'ALL' | AlarmLevel;

export function filterAlarms(alarms: AlarmRecord[], filter: AlarmFilter): AlarmRecord[] {
  if (filter === 'ALL') return alarms;
  return alarms.filter((alarm) => alarm.level === filter);
}

/** Colour used for a level (pairs with a text label everywhere it is used). */
export function alarmLevelTextClass(level: AlarmLevel): string {
  switch (level) {
    case 'CRITICAL':
      return 'text-red-300';
    case 'WARNING':
      return 'text-amber-300';
    default:
      return 'text-sky-300';
  }
}

/** Tailwind border/background accent for level-coloured rows. */
export function alarmLevelRowClass(level: AlarmLevel): string {
  switch (level) {
    case 'CRITICAL':
      return 'border-red-500/80 bg-red-500/[0.06]';
    case 'WARNING':
      return 'border-amber-500/70 bg-amber-500/[0.05]';
    default:
      return 'border-sky-500/60 bg-sky-500/[0.04]';
  }
}
