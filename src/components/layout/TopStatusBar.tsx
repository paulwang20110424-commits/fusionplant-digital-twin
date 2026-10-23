import { useEffect, useState } from 'react';
import { useSimulationStore, simulationEngine } from '@/store/simulationStore';
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

function StatusField({
  label,
  value,
  valueClass = 'text-ink',
  mono = true,
  width,
}: {
  label: string;
  value: string;
  valueClass?: string;
  mono?: boolean;
  width?: string;
}) {
  return (
    <div className={`flex flex-col justify-center px-3 border-l border-edge/70 ${width ?? ''}`}>
      <span className="label leading-none mb-1">{label}</span>
      <span className={`text-[12px] leading-none font-semibold ${mono ? 'num' : ''} ${valueClass}`}>
        {value}
      </span>
    </div>
  );
}

function IconButton({
  title,
  onClick,
  disabled,
  active,
  children,
  danger,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`btn btn-xs h-7 w-7 !px-0 ${danger ? 'btn-danger' : ''} ${active ? 'btn-primary' : ''}`}
    >
      {children}
    </button>
  );
}

export function TopStatusBar() {
  const frame = useSimulationStore((state) => state.frame);
  const start = useSimulationStore((state) => state.start);
  const pause = useSimulationStore((state) => state.pause);
  const resume = useSimulationStore((state) => state.resume);
  const reset = useSimulationStore((state) => state.reset);
  const emergencyStop = useSimulationStore((state) => state.emergencyStop);
  const fullscreen = useSimulationStore((state) => state.fullscreen);
  const setFullscreen = useSimulationStore((state) => state.setFullscreen);

  const [wallClock, setWallClock] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setWallClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const activeAlarms = frame.alarms.filter((alarm) => alarm.active);
  const criticalCount = activeAlarms.filter((alarm) => alarm.level === 'CRITICAL').length;
  const warningCount = activeAlarms.filter((alarm) => alarm.level === 'WARNING').length;
  const status = STATUS_STYLE[frame.status];
  const running = frame.status === 'RUNNING';

  const handleTransport = () => {
    if (running) {
      pause();
    } else if (frame.status === 'PAUSED') {
      resume();
    } else {
      start();
    }
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

  return (
    <header
      className={`relative z-30 flex h-[58px] shrink-0 items-stretch border-b border-edge/80 bg-[#050b14]/95 ${
        frame.status === 'EMERGENCY_STOP' ? 'critical-flash' : ''
      }`}
    >
      {/* brand */}
      <div className="flex items-center gap-2.5 px-3 border-r border-edge/70">
        <svg viewBox="0 0 40 40" className="h-8 w-8 shrink-0" aria-hidden="true">
          <polygon points="20,2 36,11 36,29 20,38 4,29 4,11" fill="none" stroke="#22d3ee" strokeWidth="1.4" opacity="0.75" />
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
        <div className="leading-none">
          <div className="text-[13px] font-semibold tracking-[0.18em] text-ink">FUSIONPLANT</div>
          <div className="mt-1 text-[8.5px] tracking-[0.32em] text-faint">DIGITAL TWIN · DEMO</div>
        </div>
      </div>

      {/* simulation mode */}
      <div className="hidden items-center gap-2 border-r border-edge/70 px-3 lg:flex">
        <span className="flex items-center gap-1.5 rounded-sm border border-fusion/45 bg-fusion/10 px-2 py-1">
          <span className="led led-pulse text-fusion" />
          <span className="text-[9px] font-bold tracking-[0.18em] text-fuchsia-200">SIMULATION MODE</span>
        </span>
        <span className="text-[8.5px] leading-tight text-faint max-w-[132px]">
          Estimated / synthetic telemetry. No real device connected.
        </span>
      </div>

      {/* status fields */}
      <div className="flex min-w-0 flex-1 items-stretch overflow-hidden">
        <div className="flex items-center gap-2 px-3">
          <span className={`led ${status.dot} ${running ? 'led-pulse' : ''}`} />
          <span className={`text-[12px] font-bold tracking-[0.14em] ${status.cls}`}>{status.label}</span>
        </div>
        <StatusField label="PHASE" value={PHASE_LABEL[frame.phase]} width="w-[92px]" />
        <StatusField label="SIM CLOCK" value={formatSimClock(frame.simTimeS)} valueClass="text-sys" width="w-[122px]" />
        <StatusField
          label="TIME SCALE"
          value={`${frame.config.timeScale.toFixed(1)}×`}
          valueClass="text-ink"
          width="w-[78px]"
        />
        <div className="hidden flex-col justify-center px-3 border-l border-edge/70 min-w-0 xl:flex">
          <span className="label leading-none mb-1">SCENARIO</span>
          <span className="truncate text-[12px] leading-none font-semibold text-violet-200">{frame.scenarioName}</span>
        </div>
        <StatusField
          label="DEVICES ONLINE"
          value={`${frame.devicesOnline}/${frame.devicesTotal}`}
          valueClass="text-emerald-200"
          width="w-[106px]"
        />
        <StatusField
          label="ACTIVE ALARMS"
          value={`${activeAlarms.length}`}
          valueClass={criticalCount ? 'text-red-300' : warningCount ? 'text-amber-300' : 'text-emerald-200'}
          width="w-[96px]"
        />
      </div>

      {/* transport */}
      <div className="flex items-center gap-1.5 border-l border-edge/70 px-3">
        <button
          type="button"
          className="btn btn-primary h-7"
          onClick={handleTransport}
          disabled={frame.status === 'EMERGENCY_STOP'}
          title={running ? 'Pause simulation' : 'Resume simulation'}
        >
          {running ? (
            <>
              <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden="true">
                <rect x="2" y="1.5" width="2.6" height="9" fill="currentColor" />
                <rect x="7.4" y="1.5" width="2.6" height="9" fill="currentColor" />
              </svg>
              PAUSE
            </>
          ) : (
            <>
              <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden="true">
                <path d="M2.5 1.5 L10.5 6 L2.5 10.5 Z" fill="currentColor" />
              </svg>
              START
            </>
          )}
        </button>
        <IconButton title="Reset simulation" onClick={reset}>
          <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true">
            <path d="M6 2.2 A3.8 3.8 0 1 1 2.2 6" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <path d="M6 0.6 L6 3.6 L3.2 2.1 Z" fill="currentColor" />
          </svg>
        </IconButton>
        <button
          type="button"
          className="btn btn-danger h-7"
          onClick={emergencyStop}
          disabled={frame.status === 'EMERGENCY_STOP'}
          title="Emergency stop (latch SCRAM)"
        >
          E-STOP
        </button>
        <IconButton
          title={fullscreen ? 'Exit fullscreen' : 'Fullscreen console'}
          onClick={toggleFullscreen}
          active={fullscreen}
        >
          <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true">
            <path d="M1 4 V1 H4 M8 1 H11 V4 M11 8 V11 H8 M4 11 H1 V8" fill="none" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </IconButton>
      </div>

      {/* stopwatch for wall time */}
      <div className="hidden flex-col justify-center border-l border-edge/70 px-3 md:flex">
        <span className="label leading-none mb-1">LOCAL</span>
        <span className="num text-[11px] leading-none text-muted">
          {wallClock.toLocaleTimeString('en-GB', { hour12: false })}
        </span>
      </div>

      {/* engine heartbeat indicator */}
      <div className="hidden items-center border-l border-edge/70 px-2 sm:flex" title="Engine step count">
        <span className="num text-[9px] text-faint">#{frame.stepCount.toString().padStart(6, '0')}</span>
      </div>

      <span className="sr-only">
        Elapsed wall clock {formatClock(frame.simTimeS)}. Engine singleton {String(Boolean(simulationEngine))}
      </span>
    </header>
  );
}
