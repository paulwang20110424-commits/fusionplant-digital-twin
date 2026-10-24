import { create } from 'zustand';
import { clampStepIndex, DEMO_STEPS, getDemoStep } from '@/guidedDemo/steps';

const STORAGE_KEY = 'fusionplant.guidedDemo.v1';

export interface DemoProgress {
  /** The tour has been completed at least once. */
  completed: boolean;
  /** The tour was skipped at least once. */
  skipped: boolean;
  /** Do not launch automatically on the next visit. */
  doNotAutoStart: boolean;
  /** Auto-advance steps whose observable goal is met. */
  autoAdvance: boolean;
}

export interface GuidedDemoState extends DemoProgress {
  active: boolean;
  stepIndex: number;
  /** True once the last step has been reached and dismissed. */
  finished: boolean;

  start: (options?: { restart?: boolean }) => void;
  next: () => void;
  back: () => void;
  skip: () => void;
  exit: () => void;
  restart: () => void;
  goto: (index: number) => void;
  completeCurrent: () => void;
  setAutoAdvance: (value: boolean) => void;
  setDoNotAutoStart: (value: boolean) => void;
  /** Clears the persisted completion/skip flags (and closes the tour). */
  resetProgress: () => void;
}

const DEFAULT_PROGRESS: DemoProgress = {
  completed: false,
  skipped: false,
  doNotAutoStart: false,
  autoAdvance: true,
};

function readProgress(): DemoProgress {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return { ...DEFAULT_PROGRESS };
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PROGRESS };
    const parsed = JSON.parse(raw) as Partial<DemoProgress>;
    return {
      completed: Boolean(parsed.completed),
      skipped: Boolean(parsed.skipped),
      doNotAutoStart: Boolean(parsed.doNotAutoStart),
      autoAdvance: parsed.autoAdvance !== false,
    };
  } catch {
    return { ...DEFAULT_PROGRESS };
  }
}

function persistProgress(state: DemoProgress): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const payload: DemoProgress = {
      completed: state.completed,
      skipped: state.skipped,
      doNotAutoStart: state.doNotAutoStart,
      autoAdvance: state.autoAdvance,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* progress persistence is best-effort */
  }
}

const initial = readProgress();

/**
 * Guided demo state machine.
 *
 * Deliberately separate from the simulation store: the tour can start, stop and
 * restart without touching the engine, the controls or the recorded history.
 * The only simulation interactions are the ones the visitor performs themselves.
 */
export const useGuidedDemoStore = create<GuidedDemoState>((set, get) => {
  const persist = () => {
    const { completed, skipped, doNotAutoStart, autoAdvance } = get();
    persistProgress({ completed, skipped, doNotAutoStart, autoAdvance });
  };

  return {
    ...initial,
    active: false,
    stepIndex: 0,
    finished: false,

    start: (options) => {
      const restart = options?.restart ?? false;
      set({
        active: true,
        finished: false,
        stepIndex: restart ? 0 : clampStepIndex(get().stepIndex),
        doNotAutoStart: false,
      });
      persist();
    },

    next: () => {
      const { stepIndex, active } = get();
      if (!active) return;
      const last = DEMO_STEPS.length - 1;
      if (stepIndex >= last) {
        set({ active: false, finished: true, completed: true, stepIndex: last });
        persist();
        return;
      }
      set({ stepIndex: stepIndex + 1 });
    },

    back: () => {
      const { stepIndex, active } = get();
      if (!active) return;
      set({ stepIndex: Math.max(0, stepIndex - 1) });
    },

    skip: () => {
      set({ active: false, skipped: true, doNotAutoStart: false });
      persist();
    },

    exit: () => {
      // Exiting is not "skipping": the next visit may still offer the tour.
      set({ active: false });
    },

    restart: () => {
      set({ active: true, stepIndex: 0, finished: false, completed: false });
      persist();
    },

    goto: (index) => {
      if (!get().active) return;
      set({ stepIndex: clampStepIndex(index) });
    },

    completeCurrent: () => {
      // "Mark step done" behaves exactly like Next but never completes the tour
      // unless the visitor is already on the last step.
      get().next();
    },

    setAutoAdvance: (value) => {
      set({ autoAdvance: value });
      persist();
    },

    setDoNotAutoStart: (value) => {
      set({ doNotAutoStart: value });
      persist();
    },

    resetProgress: () => {
      set({ ...DEFAULT_PROGRESS, active: false, stepIndex: 0, finished: false });
      persistProgress(DEFAULT_PROGRESS);
    },
  };
});

/** Current step object (null when the index is out of range). */
export function currentDemoStep(state: GuidedDemoState = useGuidedDemoStore.getState()) {
  return getDemoStep(state.stepIndex);
}
