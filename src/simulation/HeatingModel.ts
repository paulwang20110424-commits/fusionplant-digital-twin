import { HEATING_EFFICIENCY, MACHINE } from './constants';
import type { ControlInputs, HeatingState } from '@/types/simulation';
import { clamp, safeDiv } from '@/utils/math';

/**
 * HeatingModel — auxiliary heating delivery, wall-plug power and the derived
 * heating statuses.
 */

export interface HeatingDelivery {
  nbiDeliveredMW: number;
  echDeliveredMW: number;
  ichDeliveredMW: number;
  totalDeliveredMW: number;
  wallPlugMW: number;
}

/**
 * Apply beamline/RF transmission and plasma coupling efficiencies, plus a
 * multiplicative availability factor (used by the HEATING_DROOP fault).
 */
export function computeHeatingDelivery(
  controls: ControlInputs,
  availability: { nbi: number; ech: number; ich: number } = { nbi: 1, ech: 1, ich: 1 },
): HeatingDelivery {
  const nbi =
    clamp(controls.nbiPowerMW, 0, 80) * HEATING_EFFICIENCY.nbiCoupling * clamp(availability.nbi, 0, 1);
  const ech =
    clamp(controls.echPowerMW, 0, 60) * HEATING_EFFICIENCY.echCoupling * clamp(availability.ech, 0, 1);
  const ich =
    clamp(controls.ichPowerMW, 0, 60) * HEATING_EFFICIENCY.ichCoupling * clamp(availability.ich, 0, 1);

  const wallPlugMW =
    clamp(controls.nbiPowerMW, 0, 80) / HEATING_EFFICIENCY.nbiWallPlug +
    clamp(controls.echPowerMW, 0, 60) / HEATING_EFFICIENCY.echWallPlug +
    clamp(controls.ichPowerMW, 0, 60) / HEATING_EFFICIENCY.ichWallPlug;

  return {
    nbiDeliveredMW: nbi,
    echDeliveredMW: ech,
    ichDeliveredMW: ich,
    totalDeliveredMW: nbi + ech + ich,
    wallPlugMW,
  };
}

/** Status of an individual heating system. */
export function heatingSystemStatus(
  commandedMW: number,
  availability: number,
  emergencyStop: boolean,
): HeatingState['nbiStatus'] {
  if (emergencyStop) return 'TRIPPED';
  if (commandedMW <= 0.01) return 'OFFLINE';
  if (availability < 0.4) return 'FAULT';
  if (availability < 0.9) return 'DEGRADED';
  return 'RUNNING';
}

/**
 * Electrical load of the heating systems, MW. Delivered power is not the same as
 * consumed power: NBI is ~35% wall-plug efficient, so most input power becomes
 * plant heat rather than plasma heating.
 */
export function heatingElectricalLoadMW(controls: ControlInputs): number {
  return (
    clamp(controls.nbiPowerMW, 0, 80) / HEATING_EFFICIENCY.nbiWallPlug +
    clamp(controls.echPowerMW, 0, 60) / HEATING_EFFICIENCY.echWallPlug +
    clamp(controls.ichPowerMW, 0, 60) / HEATING_EFFICIENCY.ichWallPlug
  );
}

/**
 * Auxiliary heating power that becomes waste heat in the plant rather than
 * reaching the plasma, MW.
 */
export function heatingWasteHeatMW(delivery: HeatingDelivery, heatRecovery: number): number {
  const wallPlug = delivery.wallPlugMW;
  const recovered = clamp(heatRecovery, 0, 1);
  return Math.max(0, wallPlug - delivery.totalDeliveredMW) * recovered;
}

/** Fraction of the delivered auxiliary power that reaches the plasma core. */
export function effectiveCoupling(delivery: HeatingDelivery): number {
  const commanded =
    delivery.nbiDeliveredMW / HEATING_EFFICIENCY.nbiCoupling +
    delivery.echDeliveredMW / HEATING_EFFICIENCY.echCoupling +
    delivery.ichDeliveredMW / HEATING_EFFICIENCY.ichCoupling;
  return safeDiv(delivery.totalDeliveredMW, commanded, 0) ?? 0;
}

export const HEATING_MODEL_NOTES = {
  delivered: 'P_del = P_set * eta_coupling * availability; eta_coupling = 0.85 (NBI), 0.82 (ECH), 0.76 (ICH)',
  wallPlug: 'P_grid = P_set / eta_source; eta_source = 0.35 (NBI), 0.50 (ECH), 0.60 (ICH)',
  wasteHeat: 'P_waste = (P_grid - P_del) * heatRecovery, added to the primary coolant loop',
  turbines: `Turbine on line when thermal duty > ${MACHINE.turbineMinThermalMW} MW and the heat exchanger is available`,
} as const;
