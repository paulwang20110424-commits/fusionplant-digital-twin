import type { ControlInputs, SimConfig } from '@/types/simulation';
import { CONTROL_SPEC_MAP } from '@/simulation/controlSpecs';
import { clamp } from './math';

export interface ValidationResult {
  valid: boolean;
  /** Clamped or rejected value to store. */
  value: number;
  message?: string;
  severity?: 'error' | 'warning';
}

/**
 * Validate a numeric control input against its declared range.
 * Invalid (NaN/Infinity) values are rejected, out-of-range values are clamped
 * and reported so the UI can explain exactly what happened.
 */
export function validateControl(key: keyof ControlInputs, raw: number): ValidationResult {
  const spec = CONTROL_SPEC_MAP[key];
  if (!spec)
    return { valid: false, value: 0, message: `Unknown parameter ${String(key)}`, severity: 'error' };
  if (!Number.isFinite(raw)) {
    return {
      valid: false,
      value: spec.min,
      message: `${spec.label} must be a finite number`,
      severity: 'error',
    };
  }
  if (raw < spec.min) {
    return {
      valid: false,
      value: spec.min,
      message: `${spec.label} below minimum — clamped to ${spec.min} ${spec.unit}`,
      severity: 'warning',
    };
  }
  if (raw > spec.max) {
    return {
      valid: false,
      value: spec.max,
      message: `${spec.label} above maximum — clamped to ${spec.max} ${spec.unit}`,
      severity: 'warning',
    };
  }
  return { valid: true, value: raw };
}

/** Validate the whole control set, returning a sanitised patch. */
export function sanitizeControls(inputs: Partial<ControlInputs>, fallback: ControlInputs): ControlInputs {
  const next: ControlInputs = { ...fallback };
  for (const key of Object.keys(inputs) as Array<keyof ControlInputs>) {
    const raw = inputs[key];
    if (raw === undefined) continue;
    const result = validateControl(key, raw);
    // Rejected (non-finite) input keeps the fallback instead of the range minimum.
    if (!result.valid && result.severity === 'error') continue;
    next[key] = result.value;
  }
  return next;
}

export interface ConfigValidation {
  valid: boolean;
  config: SimConfig;
  errors: string[];
  warnings: string[];
}

export function validateConfig(input: Partial<SimConfig>, fallback: SimConfig): ConfigValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const next: SimConfig = { ...fallback, ...input };

  if (!Number.isFinite(next.timeScale) || next.timeScale <= 0) {
    errors.push('Time scale must be greater than zero');
    next.timeScale = fallback.timeScale;
  } else if (next.timeScale > 20) {
    warnings.push('Time scale above 20x may make transients hard to observe');
    next.timeScale = 20;
  }

  if (!Number.isFinite(next.runDurationS) || next.runDurationS < 10) {
    errors.push('Run duration must be at least 10 simulated seconds');
    next.runDurationS = fallback.runDurationS;
  } else if (next.runDurationS > 900) {
    warnings.push('Run durations beyond 900 s are clamped for the headless comparison');
    next.runDurationS = 900;
  }

  next.disturbanceLevel = clamp(Number.isFinite(next.disturbanceLevel) ? next.disturbanceLevel : 0, 0, 1);
  next.noiseLevel = clamp(Number.isFinite(next.noiseLevel) ? next.noiseLevel : 0, 0, 1);
  next.confinementH = clamp(Number.isFinite(next.confinementH) ? next.confinementH : 1, 0.3, 1.8);
  next.auxHeatRecovery = clamp(Number.isFinite(next.auxHeatRecovery) ? next.auxHeatRecovery : 0.85, 0, 1);

  if (!Number.isFinite(next.seed)) {
    next.seed = fallback.seed;
    warnings.push('Invalid seed replaced with the reference seed');
  } else {
    next.seed = Math.trunc(next.seed);
  }

  return { valid: errors.length === 0, config: next, errors, warnings };
}

/** Seed validation for the simulation lab numeric input. */
export function validateSeed(raw: number): ValidationResult {
  if (!Number.isFinite(raw)) {
    return { valid: false, value: 20260101, message: 'Seed must be a finite integer', severity: 'error' };
  }
  const value = Math.trunc(raw);
  if (value < 1 || value > 2147483647) {
    return {
      valid: false,
      value: clamp(value, 1, 2147483647),
      message: 'Seed must be between 1 and 2147483647',
      severity: 'warning',
    };
  }
  return { valid: true, value };
}
