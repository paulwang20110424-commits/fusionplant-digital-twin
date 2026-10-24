import type { PageId } from '@/store/simulationStore';

/** Goals the demo can observe in the simulation state to auto-advance a step. */
export type DemoGoal = 'simulation-running' | 'nbi-raised' | 'fault-injected' | 'fault-cleared' | null;

export interface DemoStep {
  id: string;
  title: string;
  body: string;
  /** Page that must be visible for this step. */
  page: PageId;
  /** CSS selector of the element to highlight. */
  selector?: string;
  /** Optional observable goal; when met the step can auto-advance. */
  goal?: DemoGoal;
  /** Extra hint shown under the body. */
  hint?: string;
  /** Whether this step is purely informational. */
  informational?: boolean;
}

/**
 * The guided tour. Pure data so it can be unit tested and reused by the overlay.
 *
 * The tour never injects faults or changes setpoints on the user's behalf: it
 * highlights the control and waits for the visitor to act. Nothing here touches
 * a real device — this is a simulation walkthrough.
 */
export const DEMO_STEPS: DemoStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to the simulated plant',
    body:
      'This console runs a local, simplified fusion-plant model. Every reading is synthetic — no real ' +
      'reactor is connected and nothing you do here controls equipment. Press START when you are ready.',
    page: 'OVERVIEW',
    selector: '[data-demo="start-button"]',
    goal: 'simulation-running',
    hint: 'Goal: start the simulation.',
  },
  {
    id: 'heating',
    title: 'Raise the neutral beam power',
    body:
      'The left panel holds the operator setpoints. Move NBI power to roughly 40 MW and watch the plasma ' +
      'respond: delivered heating rises, temperature climbs, fusion power follows.',
    page: 'OVERVIEW',
    selector: '[data-demo="control-nbiPowerMW"]',
    goal: 'nbi-raised',
    hint: 'Goal: set NBI power to 40 MW or more.',
  },
  {
    id: 'plasma',
    title: 'Read the plasma state',
    body:
      'These KPIs come from the 0-D energy balance. Temperature, density, stored energy and fusion power ' +
      'are model outputs, not measurements. The small number in the corner is the change over ~10 seconds.',
    page: 'OVERVIEW',
    selector: '[data-demo="kpi-grid"]',
    informational: true,
  },
  {
    id: 'reactor',
    title: 'Explore the 3D tokamak',
    body:
      'Drag to orbit, scroll to zoom, and click Plasma, the TF coils or the vacuum vessel. The field lines ' +
      'and the glow are schematic — they are not an MHD calculation.',
    page: 'OVERVIEW',
    selector: '[data-demo="reactor-view"]',
    informational: true,
  },
  {
    id: 'fault',
    title: 'Inject a simulated fault',
    body:
      'Scroll to FAULT INJECTION and inject COOLANT LOSS at about 60%. This only affects the simulation. ' +
      'Watch the coolant outlet temperature and the alarm count react.',
    page: 'OVERVIEW',
    selector: '[data-demo="fault-panel"]',
    goal: 'fault-injected',
    hint: 'Goal: inject any simulated fault.',
  },
  {
    id: 'recover',
    title: 'Clear the fault and watch recovery',
    body:
      'Clear the fault. The plant returns towards its previous operating point; alarms clear as the affected ' +
      'parameters come back into range. In a real plant this would be a procedure — here it is one click.',
    page: 'OVERVIEW',
    selector: '[data-demo="fault-panel"]',
    goal: 'fault-cleared',
    hint: 'Goal: clear every active fault.',
  },
  {
    id: 'history',
    title: 'Record and replay the run',
    body:
      'Open HISTORY. “Capture live buffer” freezes a copy of the recorded telemetry so you can scrub it ' +
      'with the playhead. Playback never modifies the running simulation.',
    page: 'HISTORY',
    selector: '[data-demo="capture-buffer"]',
    hint: 'Capture the live buffer, then scrub the playhead.',
  },
  {
    id: 'whatif',
    title: 'Compare operating scenarios',
    body:
      'Open SIMULATION and run WHAT-IF. Two isolated engines step forward from the same initial state and the ' +
      'console compares temperature, power, Q factors, stability and the integrated energy balance.',
    page: 'SIMULATION',
    selector: '[data-demo="whatif-run"]',
    hint: 'Run the comparison with the default variant.',
  },
  {
    id: 'finish',
    title: 'That is the tour',
    body:
      'You can restart it any time from OVERVIEW, or reset the “tour completed” flag in the Simulation Lab. ' +
      'Remember: this platform is for education and software validation only.',
    page: 'OVERVIEW',
    informational: true,
  },
];

export const DEMO_STEP_COUNT = DEMO_STEPS.length;

export function getDemoStep(index: number): DemoStep | null {
  if (!Number.isFinite(index)) return null;
  const safe = Math.trunc(index);
  if (safe < 0 || safe >= DEMO_STEPS.length) return null;
  return DEMO_STEPS[safe];
}

export function clampStepIndex(index: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.min(DEMO_STEPS.length - 1, Math.max(0, Math.trunc(index)));
}
