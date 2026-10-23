import type { AlarmLevel, EquipmentStatus } from '@/types/simulation';

const STATUS_CLASS: Record<EquipmentStatus, string> = {
  OFFLINE: 'chip-idle',
  STANDBY: 'chip-info',
  RUNNING: 'chip-ok',
  DEGRADED: 'chip-warn',
  FAULT: 'chip-crit',
  TRIPPED: 'chip-crit',
};

const STATUS_LED: Record<EquipmentStatus, string> = {
  OFFLINE: 'text-faint',
  STANDBY: 'text-ice',
  RUNNING: 'text-ok',
  DEGRADED: 'text-warn',
  FAULT: 'text-crit',
  TRIPPED: 'text-crit',
};

export function StatusChip({ status, label }: { status: EquipmentStatus; label?: string }) {
  return <span className={`chip ${STATUS_CLASS[status]}`}>{label ?? status}</span>;
}

export function StatusDot({ status, pulse = false }: { status: EquipmentStatus; pulse?: boolean }) {
  return <span className={`led ${STATUS_LED[status]} ${pulse && status === 'RUNNING' ? 'led-pulse' : ''}`} />;
}

const ALARM_CLASS: Record<AlarmLevel, string> = {
  INFO: 'chip-info',
  WARNING: 'chip-warn',
  CRITICAL: 'chip-crit',
};

export function AlarmChip({ level }: { level: AlarmLevel }) {
  return <span className={`chip ${ALARM_CLASS[level]}`}>{level}</span>;
}

export function alarmTextClass(level: AlarmLevel): string {
  switch (level) {
    case 'CRITICAL':
      return 'text-red-300';
    case 'WARNING':
      return 'text-amber-300';
    default:
      return 'text-sky-300';
  }
}
