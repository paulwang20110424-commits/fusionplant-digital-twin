import { useSimulationStore, type PageId } from '@/store/simulationStore';
import { useAlarmBuckets } from '@/store/selectors';

export const PAGES: Array<{ id: PageId; label: string; short: string; hint: string }> = [
  { id: 'OVERVIEW', label: 'OVERVIEW', short: 'OVR', hint: 'Plant overview' },
  { id: 'REACTOR', label: 'REACTOR', short: 'RCT', hint: 'Reactor & plasma' },
  { id: 'MAGNETIC', label: 'MAGNETIC FIELD', short: 'MAG', hint: 'Magnetic confinement' },
  { id: 'HEATING', label: 'HEATING', short: 'HTG', hint: 'Plasma heating systems' },
  { id: 'COOLING', label: 'COOLING', short: 'CLG', hint: 'Cooling & heat recovery' },
  { id: 'POWER', label: 'POWER GRID', short: 'PWR', hint: 'Energy & power systems' },
  { id: 'DIAGNOSTICS', label: 'DIAGNOSTICS', short: 'DIA', hint: 'Diagnostics & live data' },
  { id: 'SIMULATION', label: 'SIMULATION', short: 'SIM', hint: 'Simulation lab & what-if' },
  { id: 'HISTORY', label: 'HISTORY', short: 'HIS', hint: 'Recorded data & events' },
];

/**
 * Primary console navigation.
 *
 * Real buttons (single-page app), the active page carries aria-current="page",
 * and the strip scrolls horizontally on narrow screens instead of wrapping — the
 * document itself never overflows horizontally.
 */
export function NavBar() {
  const activePage = useSimulationStore((state) => state.activePage);
  const setPage = useSimulationStore((state) => state.setPage);
  const buckets = useAlarmBuckets();

  return (
    <nav
      aria-label="Console pages"
      className="relative z-20 flex h-[38px] shrink-0 items-stretch border-b border-edge/80 bg-[#060d17]/95"
    >
      <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto scroll-thin">
        {PAGES.map((page, index) => {
          const active = page.id === activePage;
          const showBadge = page.id === 'DIAGNOSTICS' && buckets.alarmCount > 0;
          return (
            <button
              key={page.id}
              type="button"
              title={page.hint}
              aria-label={page.label}
              aria-current={active ? 'page' : undefined}
              onClick={() => setPage(page.id)}
              className={`group relative flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3.5 text-[10px] font-semibold tracking-[0.15em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sys ${
                active ? 'bg-sys/10 text-sys' : 'text-muted hover:bg-white/[0.025] hover:text-ink'
              }`}
            >
              <span
                className={`num text-[8.5px] ${active ? 'text-sys/70' : 'text-faint'}`}
                aria-hidden="true"
              >
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="hidden md:inline">{page.label}</span>
              <span className="md:hidden">{page.short}</span>
              {showBadge && (
                <span
                  className="num ml-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-sm bg-red-500/25 px-1 text-[8px] text-red-200"
                  aria-label={`${buckets.alarmCount} active alarms`}
                >
                  {buckets.alarmCount}
                </span>
              )}
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-transparent via-sys to-transparent shadow-[0_0_10px_#22d3ee]"
                />
              )}
            </button>
          );
        })}
      </div>
      <div className="hidden shrink-0 items-center gap-2 border-l border-edge/70 px-3 lg:flex">
        <span className="text-[8.5px] tracking-[0.2em] text-faint">SYNTHETIC TELEMETRY</span>
        <span className="h-1.5 w-1.5 rounded-full bg-ok shadow-[0_0_6px_#34d399]" aria-hidden="true" />
      </div>
    </nav>
  );
}
