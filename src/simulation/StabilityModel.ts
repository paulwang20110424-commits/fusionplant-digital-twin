import type { StabilityMetrics } from '@/types/simulation';
import { clamp } from '@/utils/math';

/**
 * StabilityModel — composite "plasma stability" and risk indicators.
 *
 * This is a transparent scoring function, not a stability physics solver. Each
 * penalty term is shown in the UI so the number can be traced back to inputs.
 */

export interface StabilityInput {
  betaLimitFraction: number;
  densityLimitFraction: number;
  coilThermalMargin: number;
  fieldQuality: number;
  vacuumPressurePa: number;
  temperatureKeV: number;
  disturbance: number;
  thermalOverloadPct: number;
}

export interface StabilityBreakdown {
  metrics: StabilityMetrics;
  terms: Array<{ label: string; value: number }>;
}

export function computeStability(input: StabilityInput): StabilityBreakdown {
  const betaPenalty = clamp((input.betaLimitFraction - 0.6) / 0.4, 0, 1) * 0.35;
  const densityPenalty = clamp((input.densityLimitFraction - 0.8) / 0.2, 0, 1) * 0.28;
  const coilPenalty = (1 - clamp(input.coilThermalMargin, 0, 1)) * 0.45;
  const fieldPenalty = (1 - clamp(input.fieldQuality, 0, 1)) * 0.5;
  const vacuumPenalty = clamp(Math.log10(Math.max(input.vacuumPressurePa, 1e-8) / 1e-4) / 3, 0, 1) * 0.3;
  const thermalPenalty = clamp((input.thermalOverloadPct - 90) / 50, 0, 1) * 0.25;
  const ignitionPenalty = input.temperatureKeV < 2 && input.temperatureKeV > 0 ? (1 - input.temperatureKeV / 2) * 0.25 : 0;
  const disturbancePenalty = clamp(Math.abs(input.disturbance), 0, 1) * 0.15;

  const terms = [
    { label: 'Beta limit utilisation', value: betaPenalty },
    { label: 'Density limit utilisation', value: densityPenalty },
    { label: 'Coil thermal margin', value: coilPenalty },
    { label: 'Magnetic field quality', value: fieldPenalty },
    { label: 'Vacuum quality', value: vacuumPenalty },
    { label: 'Heat rejection loading', value: thermalPenalty },
    { label: 'Low-temperature burn', value: ignitionPenalty },
    { label: 'External disturbance', value: disturbancePenalty },
  ];

  const totalPenalty = terms.reduce((acc, term) => acc + term.value, 0);
  const stability = clamp(1 - totalPenalty, 0, 1);
  const riskScore = clamp(totalPenalty / 1.2, 0, 1);

  const dominant = terms.reduce((worst, term) => (term.value > worst.value ? term : worst), terms[0]);

  return {
    metrics: {
      stability,
      fieldQuality: clamp(input.fieldQuality, 0, 1),
      betaLimitFraction: clamp(input.betaLimitFraction, 0, 3),
      densityLimitFraction: clamp(input.densityLimitFraction, 0, 3),
      coilThermalMargin: clamp(input.coilThermalMargin, 0, 1),
      riskScore,
      riskDriver: dominant.value > 0.02 ? dominant.label : 'Nominal',
    },
    terms,
  };
}

export const STABILITY_MODEL_NOTES = {
  index:
    'stability = 1 - (beta penalty + density penalty + coil penalty + field penalty + vacuum penalty + thermal penalty + low-T penalty + disturbance penalty)',
  weights:
    'beta 0.35, density 0.28, coil 0.45, field 0.50, vacuum 0.30, thermal 0.25, low-T 0.25, disturbance 0.15',
  caution:
    'Composite index for interactive demonstration only. It is not an MHD stability calculation and cannot predict disruptions.',
} as const;
