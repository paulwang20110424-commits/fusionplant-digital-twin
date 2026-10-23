import { DYNAMICS, LIMITS, MACHINE, PHYS } from './constants';
import { approach, clamp, safeDiv } from '@/utils/math';

/**
 * ThermalModel — primary coolant loop, heat exchanger and vacuum system.
 *
 * The loop is represented as two lumped temperatures (cold leg and hot leg).
 * Energy balance: dT = Q_loop / (m_dot * cp), lagged by the loop thermal inertia.
 */

/** Temperature rise across the first wall / blanket for a given duty, K. */
export function coolantDeltaTK(thermalPowerMW: number, flowKgS: number, cp = PHYS.coolantCp): number {
  const flow = Math.max(flowKgS, 100);
  const delta = safeDiv(Math.max(0, thermalPowerMW) * 1e6, flow * cp, 0) ?? 0;
  return clamp(delta, 0, 500);
}

/** Effective heat rejection capability of the heat exchanger, MW. */
export function heatExchangerCapacityMW(flowKgS: number, availability = 1): number {
  const flowFraction = clamp(flowKgS / 12000, 0.2, 1.4);
  // LMTD-style scaling: duty scales with flow^0.8.
  return MACHINE.heatExchangerRatedMW * Math.pow(flowFraction, 0.8) * clamp(availability, 0, 1);
}

/** Heat exchanger loading, % of its effective rated duty. */
export function heatExchangerLoadPct(thermalPowerMW: number, flowKgS: number, availability = 1): number {
  const capacity = heatExchangerCapacityMW(flowKgS, availability);
  const load = safeDiv(Math.max(0, thermalPowerMW), Math.max(capacity, 1), 0) ?? 0;
  return clamp(load * 100, 0, 200);
}

/**
 * Cold-leg temperature. When the exchanger is overloaded the surplus heat is
 * rejected into the loop itself, so the inlet temperature drifts up.
 */
export function targetInletC(requestedC: number, thermalPowerMW: number, flowKgS: number, availability = 1): number {
  const capacity = heatExchangerCapacityMW(flowKgS, availability);
  const overload = Math.max(0, thermalPowerMW - capacity);
  const overloadPenalty = safeDiv(overload, Math.max(capacity, 1), 0) ?? 0;
  return clamp(requestedC + overloadPenalty * 55, 150, 420);
}

/** Hot-leg temperature with loop inertia. */
export function stepCoolantTemperatures(params: {
  inletC: number;
  outletC: number;
  thermalPowerMW: number;
  flowKgS: number;
  requestedInletC: number;
  exchangerAvailability: number;
  dt: number;
}): { inletC: number; outletC: number; deltaTK: number } {
  const targetInlet = targetInletC(
    params.requestedInletC,
    params.thermalPowerMW,
    params.flowKgS,
    params.exchangerAvailability,
  );
  const inletC = approach(params.inletC, targetInlet, params.dt, DYNAMICS.coolantTauS);

  const deltaTK = coolantDeltaTK(params.thermalPowerMW, params.flowKgS);
  const targetOutlet = inletC + deltaTK;
  const outletC = approach(params.outletC, targetOutlet, params.dt, DYNAMICS.wallTauS);

  return { inletC, outletC, deltaTK };
}

/** Turbine status from thermal duty, hot-leg temperature and trips. */
export function turbineStatus(params: {
  thermalPowerMW: number;
  outletC: number;
  exchangerLoadPct: number;
  tripped: boolean;
}): 'OFFLINE' | 'STANDBY' | 'RUNNING' | 'DEGRADED' | 'TRIPPED' {
  if (params.tripped) return 'TRIPPED';
  if (params.thermalPowerMW < MACHINE.turbineMinThermalMW) return 'STANDBY';
  if (params.exchangerLoadPct > LIMITS.heatExchangerWarnPct || params.outletC > LIMITS.coolantOutWarnC) {
    return 'DEGRADED';
  }
  return 'RUNNING';
}

/** Generator status derived from the turbine state and the electrical output. */
export function generatorStatus(
  turbine: 'OFFLINE' | 'STANDBY' | 'RUNNING' | 'DEGRADED' | 'TRIPPED',
  electricalOutputMW: number,
): 'OFFLINE' | 'STANDBY' | 'RUNNING' | 'DEGRADED' | 'TRIPPED' {
  if (turbine === 'TRIPPED') return 'TRIPPED';
  if (electricalOutputMW < 5) return turbine === 'RUNNING' || turbine === 'DEGRADED' ? 'STANDBY' : turbine;
  if (turbine === 'DEGRADED') return 'DEGRADED';
  return 'RUNNING';
}

/** Cryogenic system status from loading. */
export function cryoStatus(loadPct: number, tripped: boolean): 'OFFLINE' | 'RUNNING' | 'DEGRADED' | 'FAULT' {
  if (tripped) return 'FAULT';
  if (loadPct > LIMITS.cryoCritPct) return 'FAULT';
  if (loadPct > LIMITS.cryoWarnPct) return 'DEGRADED';
  return 'RUNNING';
}

/**
 * Vacuum pressure integration. Base outgassing plus an exponential leak term
 * driven by the VACUUM_LEAK fault; pumping capacity pulls the pressure down.
 */
export function stepVacuumPressure(params: {
  pressurePa: number;
  leakRatePaPerS: number;
  pumpingAvailability: number;
  dt: number;
}): number {
  const base = 4e-6;
  const pumping = clamp(params.pumpingAvailability, 0.05, 1);
  const growth = base + params.leakRatePaPerS;
  // First-order pump-down towards the achievable base pressure for this leak.
  const target = growth / pumping;
  const relaxed = approach(params.pressurePa, Math.max(base, target), params.dt, 2.5);
  return clamp(relaxed, base, 10);
}

export const THERMAL_MODEL_NOTES = {
  loop: 'dT_loop = Q_thermal / (m_dot * cp), cp = 4180 J/(kg K)',
  inlet:
    'T_in -> T_in,requested + 55 K * max(0, (Q_thermal - Q_capacity)/Q_capacity), lagged with tau = 6 s',
  outlet: 'T_out = T_in + dT_loop, lagged with the first-wall time constant tau = 2.5 s',
  exchanger: 'Q_capacity = 1600 MW * (m_dot/12000)^0.8',
  vacuum: 'p -> (p_base + leak) / pumpingAvailability, tau = 2.5 s',
} as const;
