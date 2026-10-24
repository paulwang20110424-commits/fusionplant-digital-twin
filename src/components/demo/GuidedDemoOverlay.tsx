import { useEffect, useMemo, useState } from 'react';
import { DEMO_STEPS } from '@/guidedDemo/steps';
import { useGuidedDemoStore } from '@/store/guidedDemoStore';
import { useSimulationStore } from '@/store/simulationStore';

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const NBI_GOAL_MW = 40;

/**
 * Guided demo overlay.
 *
 * Non-modal: it highlights the real control and lets the visitor operate the
 * console themselves. It never injects faults, changes setpoints or starts the
 * simulation on its own — the only simulation actions are the ones the visitor
 * performs, exactly as without the tour.
 */
export function GuidedDemoOverlay() {
  const active = useGuidedDemoStore((state) => state.active);
  const stepIndex = useGuidedDemoStore((state) => state.stepIndex);
  const autoAdvance = useGuidedDemoStore((state) => state.autoAdvance);
  const next = useGuidedDemoStore((state) => state.next);
  const back = useGuidedDemoStore((state) => state.back);
  const skip = useGuidedDemoStore((state) => state.skip);
  const exit = useGuidedDemoStore((state) => state.exit);
  const restart = useGuidedDemoStore((state) => state.restart);

  const setPage = useSimulationStore((state) => state.setPage);
  const frame = useSimulationStore((state) => state.frame);
  const faults = useSimulationStore((state) => state.faults);

  const [rect, setRect] = useState<TargetRect | null>(null);

  const step = active ? DEMO_STEPS[stepIndex] : null;

  // Navigate to the step's page and scroll its target into view.
  useEffect(() => {
    if (!active || !step) return undefined;
    setPage(step.page);

    let frameId = 0;
    const measure = () => {
      const element = step.selector ? document.querySelector(step.selector) : null;
      if (!element) {
        setRect(null);
        return;
      }
      const box = element.getBoundingClientRect();
      setRect({ top: box.top, left: box.left, width: box.width, height: box.height });
    };

    const scrollTimer = window.setTimeout(() => {
      const element = step.selector ? document.querySelector(step.selector) : null;
      element?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      measure();
    }, 120);

    const interval = window.setInterval(() => {
      frameId = window.requestAnimationFrame(measure);
    }, 400);

    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);

    return () => {
      window.clearTimeout(scrollTimer);
      window.clearInterval(interval);
      if (frameId) window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
    // step.page and step.selector are stable per step id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, step?.id, setPage]);

  const goalMet = useMemo(() => {
    if (!step?.goal) return false;
    switch (step.goal) {
      case 'simulation-running':
        return frame.status === 'RUNNING';
      case 'nbi-raised':
        return frame.controls.nbiPowerMW >= NBI_GOAL_MW;
      case 'fault-injected':
        return frame.activeFaults.length > 0;
      case 'fault-cleared':
        // "cleared" only counts after a fault was injected at least once in this run.
        return faults.some((fault) => !fault.active) && frame.activeFaults.length === 0;
      default:
        return false;
    }
  }, [step?.goal, frame.status, frame.controls.nbiPowerMW, frame.activeFaults.length, faults]);

  // Auto-advance once the observable goal is met.
  useEffect(() => {
    if (!active || !step?.goal || !goalMet || !autoAdvance) return undefined;
    const timer = window.setTimeout(() => next(), 1100);
    return () => window.clearTimeout(timer);
  }, [active, step?.id, step?.goal, goalMet, autoAdvance, next]);

  if (!active || !step) return null;

  const isLast = stepIndex === DEMO_STEPS.length - 1;
  const progress = ((stepIndex + 1) / DEMO_STEPS.length) * 100;

  return (
    <>
      {/* spotlight ring around the target control */}
      {rect && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-40 rounded-sm border-2 border-sys transition-all duration-300"
          style={{
            top: Math.max(0, rect.top - 4),
            left: Math.max(0, rect.left - 4),
            width: Math.max(0, rect.width + 8),
            height: Math.max(0, rect.height + 8),
            boxShadow: '0 0 0 3px rgba(34,211,238,0.18), 0 0 28px rgba(34,211,238,0.35)',
          }}
        />
      )}

      <section
        role="dialog"
        aria-modal="false"
        aria-labelledby="guided-demo-title"
        className="fixed bottom-3 left-1/2 z-50 w-[min(560px,calc(100vw-1.5rem))] -translate-x-1/2 rounded-sm border border-sys/50 bg-[#04101c]/97 shadow-[0_18px_60px_rgba(0,0,0,0.65)] backdrop-blur-sm"
      >
        <div className="flex items-center justify-between gap-2 border-b border-edge/70 px-3 py-1.5">
          <div className="flex items-center gap-2">
            <span className="chip chip-info">GUIDED DEMO</span>
            <span className="num text-[9px] text-muted">
              STEP {stepIndex + 1} / {DEMO_STEPS.length}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="btn btn-xs"
              onClick={skip}
              aria-label="Skip the guided demo"
              title="Skip the rest of the tour"
            >
              SKIP
            </button>
            <button
              type="button"
              className="btn btn-xs"
              onClick={exit}
              aria-label="Exit the guided demo"
              title="Close the tour (can be resumed later)"
            >
              EXIT
            </button>
          </div>
        </div>

        <div className="h-[2px] w-full bg-white/[0.06]">
          <div
            className="h-full bg-sys/70 transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="px-3 py-2">
          <h2 id="guided-demo-title" className="text-[12.5px] font-semibold tracking-wide text-ink">
            {step.title}
          </h2>
          <p className="mt-1 text-[10.5px] leading-relaxed text-muted">{step.body}</p>

          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {step.hint && <span className="text-[9px] text-faint">{step.hint}</span>}
            {step.goal && (
              <span className={`chip ${goalMet ? 'chip-ok' : 'chip-idle'}`}>
                {goalMet ? '✓ GOAL MET' : 'GOAL PENDING'}
              </span>
            )}
            <span className="chip chip-fusion ml-auto">SIMULATION ONLY</span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1">
            <button type="button" className="btn btn-xs" onClick={back} disabled={stepIndex === 0}>
              ← BACK
            </button>
            <button
              type="button"
              className="btn btn-xs btn-primary"
              onClick={next}
              aria-label={isLast ? 'Finish the guided demo' : 'Go to the next demo step'}
            >
              {isLast ? 'FINISH' : step.informational ? 'NEXT →' : 'MARK DONE →'}
            </button>
            {!isLast && (
              <button
                type="button"
                className="btn btn-xs"
                onClick={restart}
                aria-label="Restart the guided demo from the first step"
              >
                RESTART
              </button>
            )}
            <label className="ml-auto flex items-center gap-1.5 text-[9px] text-muted">
              <input
                type="checkbox"
                checked={autoAdvance}
                onChange={(event) => useGuidedDemoStore.getState().setAutoAdvance(event.target.checked)}
                className="h-3 w-3 accent-cyan-400"
              />
              auto-advance when goal met
            </label>
          </div>
        </div>
      </section>
    </>
  );
}

/** Floating entry point shown on the overview page while the tour is idle. */
export function GuidedDemoLauncher() {
  const active = useGuidedDemoStore((state) => state.active);
  const completed = useGuidedDemoStore((state) => state.completed);
  const skipped = useGuidedDemoStore((state) => state.skipped);
  const start = useGuidedDemoStore((state) => state.start);
  const activePage = useSimulationStore((state) => state.activePage);

  if (active || activePage !== 'OVERVIEW') return null;

  const label = completed ? 'RUN GUIDED DEMO AGAIN' : skipped ? 'RESUME GUIDED DEMO' : 'RUN GUIDED DEMO';

  return (
    <button
      type="button"
      onClick={() => start({ restart: !completed && !skipped })}
      aria-label={label}
      title="Walk through starting the plant, raising heating, injecting a fault and comparing scenarios (about 3 minutes)"
      className="fixed bottom-4 left-4 z-40 flex items-center gap-2 rounded-sm border border-sys/60 bg-[#04141f]/95 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-sys shadow-[0_10px_30px_rgba(0,0,0,0.55)] transition hover:bg-sys/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sys"
    >
      <span aria-hidden="true">✦</span>
      {label}
    </button>
  );
}
