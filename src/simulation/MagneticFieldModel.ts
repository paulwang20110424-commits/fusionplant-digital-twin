import { COIL_LIMITS, DYNAMICS, MACHINE, PHYS } from './constants';
import { approach, clamp, safeDiv } from '@/utils/math';

/**
 * MagneticFieldModel — toroidal/poloidal field generation, coil current slew,
 * lumped cold-mass thermal balance and field quality scoring.
 */

/**
 * On-axis toroidal field from the total TF coil current.
 *   B_tor = mu0 * N_turns * I / (2 pi R0)
 * At the reference 68 kA this returns 5.29 T for the generic 18-coil geometry.
 */
export function toroidalFieldT(coilCurrentKA: number): number {
  const current = clamp(coilCurrentKA, 0, 120) * 1000;
  return (PHYS.mu0 * MACHINE.tfTotalTurns * current) / (2 * Math.PI * MACHINE.majorRadiusM);
}

/**
 * Poloidal field at the plasma edge from the plasma current.
 *   B_pol = mu0 * Ip / (2 pi a)
 */
export function poloidalFieldT(plasmaCurrentMA: number): number {
  const current = Math.max(0, plasmaCurrentMA) * 1e6;
  return (PHYS.mu0 * current) / (2 * Math.PI * MACHINE.minorRadiusM);
}

/** Coil current slew (L/R lag) towards the commanded value. */
export function stepCoilCurrent(currentKA: number, setpointKA: number, dt: number): number {
  const slewed = approach(currentKA, clamp(setpointKA, 0, 120), dt, DYNAMICS.coilCurrentTauS);
  return clamp(slewed, 0, 120);
}

/** Ohmic loss in the coil joints/leads, W. */
export function coilOhmicLossW(coilCurrentKA: number): number {
  const current = Math.max(0, coilCurrentKA) * 1000;
  return current * current * DYNAMICS.coilResistanceOhm;
}

/** AC loss proxy during fast current ramps, W. */
export function coilAcLossW(currentKA: number, previousKA: number, dt: number): number {
  if (dt <= 0) return 0;
  const rate = Math.abs(currentKA - previousKA) / dt; // kA/s
  return 18 * rate * rate;
}

/**
 * Lumped cold-mass thermal balance:
 *   C dT/dt = Q_ohmic + Q_ac + Q_fault - h * cryoCapacity * (T - T_cryo)
 */
export function stepCoilTemperature(params: {
  temperatureK: number;
  coilCurrentKA: number;
  previousCurrentKA: number;
  extraHeatW: number;
  cryoCapacity: number;
  dt: number;
}): number {
  const ohmic = coilOhmicLossW(params.coilCurrentKA);
  const ac = coilAcLossW(params.coilCurrentKA, params.previousCurrentKA, params.dt);
  const capacity = clamp(params.cryoCapacity, 0.05, 1.5);
  const cooling = DYNAMICS.coilCoolingConductanceWK * capacity * Math.max(0, params.temperatureK - DYNAMICS.cryogenTemperatureK);
  const net = ohmic + ac + Math.max(0, params.extraHeatW) - cooling;
  const deltaT = (net / DYNAMICS.coilHeatCapacityJK) * params.dt;
  return clamp(params.temperatureK + deltaT, DYNAMICS.cryogenTemperatureK, 120);
}

/** Cryogenic load, % of nominal capacity. Grows with coil heat load and current. */
export function cryoLoadPct(coilTemperatureK: number, coilCurrentKA: number, extraHeatW: number): number {
  const base = 46; // % consumed by steady cold-mass support + current leads
  const currentTerm = 14 * (clamp(coilCurrentKA, 0, 100) / 68);
  const thermalTerm = Math.max(0, coilTemperatureK - COIL_LIMITS.nominalK) * 1.6;
  const faultTerm = extraHeatW / 180;
  return clamp(base + currentTerm + thermalTerm + faultTerm, 0, 140);
}

/**
 * Field quality score (0..1): how well the actual toroidal field tracks the
 * requested field, degraded by cold-mass problems and external disturbances.
 */
export function fieldQuality(params: {
  actualFieldT: number;
  requestedFieldT: number;
  coilTemperatureK: number;
  disturbance: number;
}): number {
  const requested = Math.max(params.requestedFieldT, 0.1);
  const deviation = Math.abs(params.actualFieldT - params.requestedFieldT) / requested;
  const deviationPenalty = clamp(deviation / 0.12, 0, 1) * 0.55;
  const thermalPenalty = clamp((params.coilTemperatureK - COIL_LIMITS.nominalK) / 40, 0, 1) * 0.3;
  const disturbancePenalty = clamp(Math.abs(params.disturbance), 0, 1) * 0.22;
  return clamp(1 - deviationPenalty - thermalPenalty - disturbancePenalty, 0, 1);
}

/** Coil thermal margin, 1 = cold and healthy, 0 = at the quench threshold. */
export function coilThermalMargin(coilTemperatureK: number): number {
  const span = COIL_LIMITS.quenchK - COIL_LIMITS.nominalK;
  return clamp(1 - (coilTemperatureK - COIL_LIMITS.nominalK) / span, 0, 1);
}

/** Percentage deviation of the achieved field from the requested field. */
export function fieldDeviationPct(actualFieldT: number, requestedFieldT: number): number {
  const deviation = safeDiv(Math.abs(actualFieldT - requestedFieldT), Math.max(requestedFieldT, 0.01), 0) ?? 0;
  return deviation * 100;
}

export const MAGNET_MODEL_NOTES = {
  toroidal: 'B_tor = mu0 * N_tf * I_coil / (2 pi R0),  N_tf = 2412 ampere-turns',
  poloidal: 'B_pol = mu0 * Ip / (2 pi a)',
  coilDynamics: 'dI/dt = (I_set - I) / tau_LR,  tau_LR = 1.4 s',
  coilThermal:
    'C dT/dt = I^2 R + AC loss + fault heat - h * cryoCapacity * (T - 4.3 K),  C = 9 kJ/K, h = 260 W/K',
  fieldQuality: 'Q = 1 - 0.55*step(deviation/12%) - 0.30*step(T_coil excess) - 0.22*disturbance',
} as const;
