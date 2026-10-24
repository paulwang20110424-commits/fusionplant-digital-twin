import { useEffect, useState } from 'react';
import { useSimulationStore } from '@/store/simulationStore';
import { useAlarmBuckets } from '@/store/selectors';
import { alarmSummaryText, alarmLevelLabel } from '@/utils/alarms';
import { VERSION_LABEL, VERSION_SHORT } from '@/config/version';
import { formatClock, formatSimClock } from '@/utils/units';
import type { PlantPhase, SimStatus } from '@/types/simulation';

const STATUS_STYLE: Record<SimStatus, { label: string; cls: string; dot: string }> = {
  IDLE: { label: 'READY', cls: 'text-slate-300', dot: 'bg-slate-400' },
  RUNNING: { label: 'RUNNING', cls: 'text-emerald-300', dot: 'bg-emerald-400' },
  PAUSED: { label: 'PAUSED', cls: 'text-amber-300', dot: 'bg-amber-400' },
  EMERGENCY_STOP: { label: 'SCRAM', cls: 'text-red-300', dot: 'bg-red-500' },
};

const PHASE_LABEL: Record<PlantPhase, string> = {
  STANDBY: 'STANDBY',
  RAMP_UP: 'RAMP-UP',
  FLAT_TOP: 'FLAT-TOP',
  RAMP_DOWN: 'RAMP-DOWN',
  SCRAM: 'SCRAM',
};

/**
 * One status field. Always `shrink-0` with a fixed width and `whitespace-nowrap`,
 * so labels such as FLAT-TOP or the sim clock can never be squeezed into a wrap
 * at 1280 px.
 */
function StatusField({
  label,
  value,
  valueClass = 'text-ink',
  width,
  className = '',
  truncate = false,
  title,
}: {
  label: string;
  value: string;
  valueClass?: string;
  width?: string;
  className?: string;
  truncate?: boolean;
  title?: string;
}) {
  return (
    <div
      className={`flex shrink-0 flex-col justify-center border-l border-edge/70 px-2.5 ${width ?? ''} ${className}`}
      title={title}
    >
      <span className="label mb-0.5 whitespace-nowrap leading-none">{label}</span>
      <span
        className={`num whitespace-nowrap text-[11.5px] font-semibold leading-none ${valueClass} ${
          truncate ? 'truncate' : ''
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function CountField({
  label,
  count,
  levelLabel,
  tone,
  ariaLabel,
  className = '',
}: {
  label: string;
  count: number;
  levelLabel: string | null;
  tone: 'crit' | 'warn' | 'info' | 'ok';
  ariaLabel: string;
  className?: string;
}) {
  const toneClass = {
    crit: 'text-red-300',
    warn: 'text-amber-300',
    info: 'text-sky-300',
    ok: 'text-emerald-300',
  }[tone];
  const dotClass = {
    crit: 'text-red-400',
    warn: 'text-amber-400',
    info: 'text-sky-400',
    ok: 'text-emerald-400',
  }[tone];

  return (
    <div
      className={`flex w-[96px] shrink-0 flex-col justify-center border-l border-edge/70 px-2.5 ${className}`}
      aria-label={ariaLabel}
    >
      <span className="label mb-0.5 whitespace-nowrap leading-none">{label}</span>
      <span className="flex items-center gap-1 leading-none">
        <span className={`led ${dotClass}`} aria-hidden="true" />
        <span className={`num text-[11.5px] font-semibold ${toneClass}`}>{count}</span>
        {levelLabel && (
          <span className={`text-[7.5px] font-semibold uppercase tracking-[0.1em] ${toneClass}`}>
            {levelLabel}
          </span>
        )}
      </span>
    </div>
  );
}

const headerAction =
  'inline-flex h-7 items-center justify-center gap-1 whitespace-nowrap rounded-sm border text-[10px] font-semibold uppercase tracking-[0.09em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sys disabled:opacity-40';

export function TopStatusBar() {
  const frame = useSimulationStore((state) => state.frame);
  const start = useSimulationStore((state) => state.start);
  const pause = useSimulationStore((state) => state.pause);
  const resume = useSimulationStore((state) => state.resume);
  const reset = useSimulationStore((state) => state.reset);
  const emergencyStop = useSimulationStore((state) => state.emergencyStop);
  const fullscreen = useSimulationStore((state) => state.fullscreen);
  const setFullscreen = useSimulationStore((state) => state.setFullscreen);

  const buckets = useAlarmBuckets();
  const [wallClock, setWallClock] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setWallClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const status = STATUS_STYLE[frame.status];
  const running = frame.status === 'RUNNING';
  const alarmTone = buckets.criticals.length ? 'crit' : buckets.warnings.length ? 'warn' : 'ok';
  const alarmLevel = buckets.worstLevel === 'INFO' ? null : buckets.worstLevel;

  const handleTransport = () => {
    if (running) pause();
    else if (frame.status === 'PAUSED') resume();
    else start();
  };

  const toggleFullscreen = () => {
    const doc = document;
    if (!doc.fullscreenElement) {
      void doc.documentElement.requestFullscreen?.().then(
        () => setFullscreen(true),
        () => setFullscreen(false),
      );
    } else {
      void doc.exitFullscreen?.().then(() => setFullscreen(false));
    }
  };

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [setFullscreen]);

  const liveMessage = [
    running ? 'Simulation running' : `Simulation ${status.label.toLowerCase()}`,
    `phase ${PHASE_LABEL[frame.phase]}`,
    alarmSummaryText(buckets),
  ].join(', ');

  return (
    <header
      className={`relative z-30 grid h-[58px] shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-stretch border-b border-edge/80 bg-[#050b14]/95 ${
        frame.status === 'EMERGENCY_STOP' ? 'critical-flash' : ''
      }`}
    >
      {/* Screen-reader announcements for run state and alarm counts. */}
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </span>

      {/* brand + version */}
      <div className="flex shrink-0 items-center gap-2 border-r border-edge/70 px-2.5" title={VERSION_LABEL}>
        <svg viewBox="0 0 40 40" className="h-8 w-8 shrink-0" aria-hidden="true" focusable="false">
          <polygon
            points="20,2 36,11 36,29 20,38 4,29 4,11"
            fill="none"
            stroke="#22d3ee"
            strokeWidth="1.4"
            opacity="0.75"
          />
          <ellipse cx="20" cy="20" rx="12" ry="4.6" fill="none" stroke="#d946ef" strokeWidth="1.3" />
          <ellipse
            cx="20"
            cy="20"
            rx="12"
            ry="4.6"
            fill="none"
            stroke="#22d3ee"
            strokeWidth="1.1"
            transform="rotate(60 20 20)"
          />
          <ellipse
            cx="20"
            cy="20"
            rx="12"
            ry="4.6"
            fill="none"
            stroke="#22d3ee"
            strokeWidth="1.1"
            transform="rotate(-60 20 20)"
          />
          <circle cx="20" cy="20" r="2.2" fill="#f0abfc" />
        </svg>
        <div className="hidden leading-none sm:block">
          <div className="whitespace-nowrap text-[12.5px] font-semibold tracking-[0.16em] text-ink">
            FUSIONPLANT
          </div>
          <div className="mt-1 flex items-center gap-1.5 whitespace-nowrap text-[8px] tracking-[0.22em] text-faint">
            <span className="hidden min-[1440px]:inline">DIGITAL TWIN · DEMO</span>
            <span className="min-[1440px]:hidden">TWIN · DEMO</span>
            <span
              className="num rounded-sm border border-sys/35 px-1 py-[1px] text-[7.5px] tracking-[0.08em] text-sys/90"
              aria-label={`Version ${VERSION_SHORT}`}
            >
              {VERSION_SHORT}
            </span>
          </div>
        </div>
        <span className="num text-[10px] tracking-[0.1em] text-sys/90 sm:hidden">{VERSION_SHORT}</span>
      </div>

      {/* status read-outs */}
      <div className="flex min-w-0 items-stretch overflow-hidden">
        <div className="flex shrink-0 items-center gap-2 px-2.5">
          <span className={`led ${status.dot} ${running ? 'led-pulse' : ''}`} aria-hidden="true" />
          <span className={`whitespace-nowrap text-[11.5px] font-bold tracking-[0.12em] ${status.cls}`}>
            {status.label}
          </span>
        </div>

        <StatusField label="PHASE" value={PHASE_LABEL[frame.phase]} width="w-[88px]" />

        <StatusField
          label="SIM CLOCK"
          value={formatSimClock(frame.simTimeS)}
          valueClass="text-sys"
          width="w-[118px]"
          className="hidden sm:flex"
        />

        <StatusField
          label="SPEED"
          value={`${frame.config.timeScale.toFixed(1)}×`}
          width="w-[70px]"
          className="hidden lg:flex"
          title={`Simulation time scale ${frame.config.timeScale.toFixed(1)}x`}
        />

        <StatusField
          label="SCENARIO"
          value={frame.scenarioName}
          className="hidden min-[1440px]:flex min-w-0 max-w-[188px]"
          truncate
          title={frame.scenarioName}
        />

        <StatusField
          label="DEVICES"
          value={`${frame.devicesOnline}/${frame.devicesTotal}`}
          valueClass="text-emerald-200"
          width="w-[84px]"
          className="hidden md:flex"
          title={`${frame.devicesOnline} of ${frame.devicesTotal} simulated devices online`}
        />

        <CountField
          label="ALARMS"
          count={buckets.alarmCount}
          levelLabel={alarmLevel ? alarmLevelLabel(alarmLevel) : null}
          tone={alarmTone}
          ariaLabel={`${buckets.alarmCount} active alarms, ${buckets.criticals.length} critical, ${buckets.warnings.length} warning`}
        />

        <CountField
          label="NOTICES"
          count={buckets.noticeCount}
          levelLabel={buckets.noticeCount > 0 ? 'INFO' : null}
          tone={buckets.noticeCount > 0 ? 'info' : 'ok'}
          ariaLabel={`${buckets.noticeCount} active informational notices`}
          className="hidden md:flex"
        />

        <div className="hidden min-[1440px]:flex shrink-0 flex-col justify-center border-l border-edge/70 px-2.5">
          <span className="label mb-0.5 whitespace-nowrap leading-none">LOCAL</span>
          <span className="num whitespace-nowrap text-[11px] leading-none text-muted">
            {wallClock.toLocaleTimeString('en-GB', { hour12: false })}
          </span>
        </div>
      </div>

      {/* transport controls — fixed width, never shrink, never hidden below 1024 px */}
      <div className="flex shrink-0 items-center gap-1 border-l border-edge/70 px-2">
        <button
          type="button"
          data-demo="start-button"
          className={`${headerAction} min-w-[78px] border-sys/50 bg-sys/15 px-2.5 text-[#c8f6ff] hover:bg-sys/25`}
          onClick={handleTransport}
          disabled={frame.status === 'EMERGENCY_STOP'}
          aria-label={
            running
              ? 'Pause simulation'
              : frame.status === 'PAUSED'
                ? 'Resume simulation'
                : 'Start simulation'
          }
          title={
            running
              ? 'Pause simulation'
              : frame.status === 'PAUSED'
                ? 'Resume simulation'
                : 'Start simulation'
          }
        >
          {running ? (
            <>
              <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden="true" focusable="false">
                <rect x="2" y="1.5" width="2.6" height="9" fill="currentColor" />
                <rect x="7.4" y="1.5" width="2.6" height="9" fill="currentColor" />
              </svg>
              PAUSE
            </>
          ) : (
            <>
              <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden="true" focusable="false">
                <path d="M2.5 1.5 L10.5 6 L2.5 10.5 Z" fill="currentColor" />
              </svg>
              START
            </>
          )}
        </button>

        <button
          type="button"
          className={`${headerAction} w-7 border-edge2 bg-white/[0.02] text-ink hover:border-sys/50 hover:text-[#e6f9ff]`}
          onClick={reset}
          aria-label="Reset simulation"
          title="Reset simulation to the configured initial conditions"
        >
          <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true" focusable="false">
            <path d="M6 2.2 A3.8 3.8 0 1 1 2.2 6" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <path d="M6 0.6 L6 3.6 L3.2 2.1 Z" fill="currentColor" />
          </svg>
        </button>

        <button
          type="button"
          className={`${headerAction} border-red-500/60 bg-red-500/15 px-2 text-red-200 hover:bg-red-500/30`}
          onClick={emergencyStop}
          disabled={frame.status === 'EMERGENCY_STOP'}
          aria-label="Emergency stop — latch simulated SCRAM"
          title="Emergency stop: latches a simulated SCRAM. Reset to re-initialise."
        >
          E-STOP
        </button>

        <button
          type="button"
          className={`${headerAction} hidden w-7 border-edge2 bg-white/[0.02] text-ink hover:border-sys/50 hover:text-[#e6f9ff] sm:inline-flex`}
          onClick={toggleFullscreen}
          aria-label={fullscreen ? 'Exit fullscreen console' : 'Enter fullscreen console'}
          aria-pressed={fullscreen}
          title={fullscreen ? 'Exit fullscreen' : 'Fullscreen console'}
        >
          <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true" focusable="false">
            <path
              d="M1 4 V1 H4 M8 1 H11 V4 M11 8 V11 H8 M4 11 H1 V8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
            />
          </svg>
        </button>
      </div>

      <span className="sr-only">
        Elapsed simulated time {formatClock(frame.simTimeS)}. Step count {frame.stepCount}. Run {frame.runId}.
      </span>
    </header>
  );
}
