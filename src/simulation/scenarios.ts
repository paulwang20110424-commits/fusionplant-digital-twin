import type {
  ComparisonRow,
  ControlInputs,
  InitialConditions,
  ScenarioDefinition,
  ScenarioId,
  SimConfig,
  WhatIfResult,
} from '@/types/simulation';
import { DEFAULT_CONFIG, SCENARIO_DEFINITIONS } from './controlSpecs';
import { FusionSimulationEngine } from './FusionSimulationEngine';

export function getScenario(id: ScenarioId): ScenarioDefinition {
  return SCENARIO_DEFINITIONS.find((scenario) => scenario.id === id) ?? SCENARIO_DEFINITIONS[0];
}

export function scenarioById(id: string): ScenarioDefinition | undefined {
  return SCENARIO_DEFINITIONS.find((scenario) => scenario.id === id);
}

export interface HeadlessRunOptions {
  controls: ControlInputs;
  config: SimConfig;
  initial: InitialConditions;
  durationS: number;
  label: string;
  scenarioId: ScenarioId;
}

/**
 * Run a scenario headlessly. This is a separate engine instance, so it can never
 * perturb a live run — the comparison is a pure function of its inputs.
 */
export function runHeadlessScenario(options: HeadlessRunOptions): WhatIfResult {
  const engine = new FusionSimulationEngine({
    controls: options.controls,
    config: { ...options.config, timeScale: 1 },
    initial: options.initial,
    scenarioName: options.label,
  });
  const { summary, series } = engine.runHeadless(options.durationS);
  return {
    scenarioId: options.scenarioId,
    label: options.label,
    controls: { ...options.controls },
    config: { ...options.config },
    durationS: options.durationS,
    summary,
    series,
  };
}

/** Run a stored scenario definition with the given duration. */
export function runScenario(
  id: ScenarioId,
  durationS: number,
  overrides?: Partial<ScenarioDefinition>,
): WhatIfResult {
  const base = getScenario(id);
  const controls = { ...base.controls, ...(overrides?.controls ?? {}) };
  const config: SimConfig = { ...DEFAULT_CONFIG, ...base.config, ...(overrides?.config ?? {}) };
  return runHeadlessScenario({
    controls,
    config,
    initial: base.initial,
    durationS,
    label: base.name,
    scenarioId: id,
  });
}

const formatMetric = (value: number | null, digits = 2): string =>
  value === null || !Number.isFinite(value) ? 'N/A' : value.toFixed(digits);

/** Build the comparison table between two headless runs. */
export function compareScenarios(baseline: WhatIfResult, variant: WhatIfResult): ComparisonRow[] {
  const rows: ComparisonRow[] = [];

  const push = (
    metric: string,
    unit: string,
    baseValue: number | null,
    variantValue: number | null,
    digits = 2,
    better: ComparisonRow['better'] = 'higher',
  ) => {
    const delta =
      baseValue === null ||
      variantValue === null ||
      !Number.isFinite(baseValue) ||
      !Number.isFinite(variantValue)
        ? null
        : variantValue - baseValue;
    const deltaPct =
      baseValue === null || variantValue === null || !baseValue
        ? null
        : ((variantValue - baseValue) / Math.abs(baseValue)) * 100;
    rows.push({
      metric,
      unit,
      baseline: formatMetric(baseValue, digits),
      variant: formatMetric(variantValue, digits),
      delta: delta === null ? 'N/A' : `${delta > 0 ? '+' : ''}${delta.toFixed(digits)}`,
      deltaPct,
      better,
    });
  };

  push(
    'Final plasma temperature',
    'keV',
    baseline.summary.finalTemperatureKeV,
    variant.summary.finalTemperatureKeV,
  );
  push(
    'Peak plasma temperature',
    'keV',
    baseline.summary.peakTemperatureKeV,
    variant.summary.peakTemperatureKeV,
  );
  push(
    'Final fusion power',
    'MW',
    baseline.summary.finalFusionPowerMW,
    variant.summary.finalFusionPowerMW,
    1,
  );
  push('Peak fusion power', 'MW', baseline.summary.peakFusionPowerMW, variant.summary.peakFusionPowerMW, 1);
  push(
    'Mean auxiliary heating',
    'MW',
    baseline.summary.meanHeatingMW,
    variant.summary.meanHeatingMW,
    1,
    'neutral',
  );
  push('Final Q_plasma', '—', baseline.summary.finalQPlasma, variant.summary.finalQPlasma, 2);
  push('Final Q_engineering', '—', baseline.summary.finalQEngineering, variant.summary.finalQEngineering, 2);
  push('Final stability index', '—', baseline.summary.finalStability, variant.summary.finalStability, 3);
  push('Minimum stability index', '—', baseline.summary.minStability, variant.summary.minStability, 3);
  push(
    'Final net electric power',
    'MW',
    baseline.summary.finalNetElectricMW,
    variant.summary.finalNetElectricMW,
    1,
  );
  push(
    'Integrated thermal energy',
    'GJ',
    baseline.summary.integratedThermalGJ,
    variant.summary.integratedThermalGJ,
    1,
  );
  push(
    'Integrated net electricity',
    'GJ',
    baseline.summary.integratedNetElectricGJ,
    variant.summary.integratedNetElectricGJ,
    1,
  );
  push(
    'Final coil temperature',
    'K',
    baseline.summary.finalCoilTempK,
    variant.summary.finalCoilTempK,
    2,
    'lower',
  );
  push(
    'Final electron density',
    'm⁻³',
    baseline.summary.finalDensity,
    variant.summary.finalDensity,
    0,
    'neutral',
  );
  push('Alarms raised', 'count', baseline.summary.alarms, variant.summary.alarms, 0, 'lower');

  return rows;
}

/** Human-readable tag for a scenario id. */
export function scenarioTag(id: ScenarioId): string {
  return getScenario(id).tag;
}
