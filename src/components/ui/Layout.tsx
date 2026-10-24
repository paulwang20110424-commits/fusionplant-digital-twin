import type { ReactNode } from 'react';

export interface ParameterRow {
  label: string;
  value: string;
  unit: string;
  hint?: string;
  highlight?: 'ok' | 'warn' | 'crit' | 'fusion';
}

const HIGHLIGHT: Record<string, string> = {
  ok: 'text-emerald-200',
  warn: 'text-amber-300',
  crit: 'text-red-300',
  fusion: 'text-fuchsia-200',
};

export function ParameterTable({ rows, dense = false }: { rows: ParameterRow[]; dense?: boolean }) {
  return (
    <div className="flex flex-col divide-y divide-edge/30">
      {rows.map((row) => (
        <div
          key={row.label}
          className={`flex items-baseline justify-between gap-2 ${dense ? 'py-[3px]' : 'py-[5px]'}`}
          title={row.hint}
        >
          <span className="text-[10px] leading-snug text-muted">{row.label}</span>
          <span className="flex shrink-0 items-baseline gap-1">
            <span className={`num text-[11.5px] ${HIGHLIGHT[row.highlight ?? ''] ?? 'text-ink'}`}>
              {row.value}
            </span>
            <span className="metric-unit w-[52px] text-right">{row.unit}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  right,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-edge/60 pb-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[8.5px] tracking-[0.28em] text-faint">{eyebrow}</span>
          <span className="chip chip-fusion">SIMULATED</span>
        </div>
        <h1 className="mt-0.5 text-[17px] font-semibold tracking-[0.08em] text-ink">{title}</h1>
        {description && (
          <p className="mt-0.5 max-w-3xl text-[10.5px] leading-snug text-muted">{description}</p>
        )}
      </div>
      {right && <div className="flex flex-wrap items-center gap-1.5">{right}</div>}
    </div>
  );
}

export function Divider({ label }: { label?: string }) {
  return (
    <div className="my-2 flex items-center gap-2">
      <span className="divide-line flex-1" />
      {label && <span className="label whitespace-nowrap">{label}</span>}
      <span className="divide-line flex-1" />
    </div>
  );
}

export function Callout({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warn' | 'crit' | 'fusion';
  title?: string;
  children: ReactNode;
}) {
  const styles = {
    info: 'border-sky-500/30 bg-sky-500/[0.05] text-sky-100/90',
    warn: 'border-amber-500/35 bg-amber-500/[0.06] text-amber-100/90',
    crit: 'border-red-500/35 bg-red-500/[0.06] text-red-100/90',
    fusion: 'border-fuchsia-500/30 bg-fuchsia-500/[0.05] text-fuchsia-100/90',
  } as const;

  return (
    <div className={`rounded-sm border px-2.5 py-2 text-[10px] leading-relaxed ${styles[tone]}`}>
      {title && (
        <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.16em] opacity-80">{title}</div>
      )}
      {children}
    </div>
  );
}
