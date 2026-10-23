import type { ReactNode } from 'react';

interface PanelProps {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  scroll?: boolean;
  dense?: boolean;
}

/** Standard console panel: title bar with an optional action slot, scrollable body. */
export function Panel({
  title,
  subtitle,
  right,
  children,
  className = '',
  bodyClassName = '',
  scroll = true,
  dense = false,
}: PanelProps) {
  return (
    <section className={`hud-panel corner-tick ${className}`}>
      <header className="hud-header">
        <div className="flex items-baseline gap-2 min-w-0">
          <h2 className="hud-title truncate">{title}</h2>
          {subtitle && <span className="text-[9px] text-faint tracking-wider truncate">{subtitle}</span>}
        </div>
        {right && <div className="flex items-center gap-1 shrink-0">{right}</div>}
      </header>
      <div
        className={`${scroll ? 'hud-body scroll-thin' : 'relative z-[1] flex-1 min-h-0 flex flex-col'} ${
          dense ? 'p-1.5' : 'p-2.5'
        } ${bodyClassName}`}
      >
        {children}
      </div>
    </section>
  );
}

interface SectionLabelProps {
  children: ReactNode;
  right?: ReactNode;
  className?: string;
}

export function SectionLabel({ children, right, className = '' }: SectionLabelProps) {
  return (
    <div className={`flex items-center justify-between gap-2 ${className}`}>
      <span className="label">{children}</span>
      {right}
    </div>
  );
}
