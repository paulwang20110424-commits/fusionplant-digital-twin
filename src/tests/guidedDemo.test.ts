import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_STEPS, getDemoStep, clampStepIndex } from '@/guidedDemo/steps';
import { useGuidedDemoStore } from '@/store/guidedDemoStore';
import { useSimulationStore } from '@/store/simulationStore';

const demo = () => useGuidedDemoStore.getState();

beforeEach(() => {
  demo().resetProgress();
  demo().exit();
});

describe('guided demo — step definitions', () => {
  it('covers the documented flow', () => {
    const ids = DEMO_STEPS.map((step) => step.id);
    expect(ids).toEqual([
      'welcome',
      'heating',
      'plasma',
      'reactor',
      'fault',
      'recover',
      'history',
      'whatif',
      'finish',
    ]);
  });

  it('every step has a title, body and page', () => {
    for (const step of DEMO_STEPS) {
      expect(step.title.length).toBeGreaterThan(3);
      expect(step.body.length).toBeGreaterThan(20);
      expect(typeof step.page).toBe('string');
    }
  });

  it('resolves and clamps indices safely', () => {
    expect(getDemoStep(0)?.id).toBe('welcome');
    expect(getDemoStep(-1)).toBeNull();
    expect(getDemoStep(999)).toBeNull();
    expect(getDemoStep(Number.NaN)).toBeNull();
    expect(clampStepIndex(-5)).toBe(0);
    expect(clampStepIndex(999)).toBe(DEMO_STEPS.length - 1);
    expect(clampStepIndex(Number.NaN)).toBe(0);
  });
});

describe('guided demo — state machine', () => {
  it('starts at the first step', () => {
    expect(demo().active).toBe(false);
    demo().start({ restart: true });
    expect(demo().active).toBe(true);
    expect(demo().stepIndex).toBe(0);
    expect(demo().finished).toBe(false);
  });

  it('moves forward and backward, clamped at both ends', () => {
    demo().start({ restart: true });
    demo().back();
    expect(demo().stepIndex).toBe(0);
    demo().next();
    demo().next();
    expect(demo().stepIndex).toBe(2);
    demo().back();
    expect(demo().stepIndex).toBe(1);
  });

  it('completes the tour when advancing past the last step', () => {
    demo().start({ restart: true });
    for (let index = 0; index < DEMO_STEPS.length; index += 1) demo().next();
    expect(demo().active).toBe(false);
    expect(demo().completed).toBe(true);
    expect(demo().finished).toBe(true);
    expect(demo().stepIndex).toBe(DEMO_STEPS.length - 1);
  });

  it('records a skip but keeps the tour re-openable', () => {
    demo().start({ restart: true });
    demo().next();
    demo().skip();
    expect(demo().active).toBe(false);
    expect(demo().skipped).toBe(true);
    expect(demo().stepIndex).toBe(1);
    // starting again resumes at the stored step, not from zero
    demo().start();
    expect(demo().active).toBe(true);
    expect(demo().stepIndex).toBe(1);
  });

  it('exit closes the tour without marking it skipped', () => {
    demo().start({ restart: true });
    demo().exit();
    expect(demo().active).toBe(false);
    expect(demo().skipped).toBe(false);
  });

  it('restart returns to step one and clears completion', () => {
    demo().start({ restart: true });
    demo().next();
    demo().next();
    demo().restart();
    expect(demo().active).toBe(true);
    expect(demo().stepIndex).toBe(0);
    expect(demo().completed).toBe(false);
  });

  it('resetProgress clears persisted flags', () => {
    demo().start({ restart: true });
    demo().skip();
    demo().resetProgress();
    expect(demo().active).toBe(false);
    expect(demo().skipped).toBe(false);
    expect(demo().completed).toBe(false);
    expect(demo().stepIndex).toBe(0);
  });

  it('goto only works while the tour is active', () => {
    demo().goto(4);
    expect(demo().stepIndex).toBe(0);
    demo().start({ restart: true });
    demo().goto(4);
    expect(demo().stepIndex).toBe(4);
    demo().goto(999);
    expect(demo().stepIndex).toBe(DEMO_STEPS.length - 1);
  });

  it('survives a storage-less environment', () => {
    expect(() => {
      demo().start({ restart: true });
      demo().skip();
      demo().resetProgress();
    }).not.toThrow();
  });
});

describe('guided demo — isolation from the simulation', () => {
  it('does not start, pause or reset the engine', () => {
    const sim = useSimulationStore.getState();
    sim.reset();
    const before = useSimulationStore.getState().frame.status;
    const simTimeBefore = useSimulationStore.getState().frame.simTimeS;

    demo().start({ restart: true });
    demo().next();
    demo().skip();

    const after = useSimulationStore.getState();
    expect(after.frame.status).toBe(before);
    expect(after.frame.simTimeS).toBe(simTimeBefore);
  });

  it('does not inject faults or change setpoints', () => {
    const sim = useSimulationStore.getState();
    sim.reset();
    const controlsBefore = { ...useSimulationStore.getState().frame.controls };
    demo().start({ restart: true });
    for (let index = 0; index < DEMO_STEPS.length; index += 1) demo().next();
    const after = useSimulationStore.getState();
    expect(after.frame.activeFaults).toEqual([]);
    expect(after.frame.controls).toEqual(controlsBefore);
  });
});
