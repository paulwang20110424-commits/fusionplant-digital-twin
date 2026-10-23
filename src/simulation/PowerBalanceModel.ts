import { MACHINE, PHYS } from './constants';
import type { ControlInputs, PowerState } from '@/types/simulation';
import { clamp, ratio, safeDiv, signedRatio } from '@/utils/math';

/**
 * PowerBalanceModel — explicit system boundary for plant-level energy accounting.
 *
 * BOUNDARY (shown verbatim in the UI):
 *   Fusion + absorbed auxiliary power -> primary coolant -> steam -> turbine ->
 *   generator -> busbar. On the input side we count every on-site electrical load:
 *   heating wall-plug power, magnet power supplies, cryogenics, coolant pumps,
 *   vacuum pumps and control racks.
 *
 *   Q_plasma      = P_fusion / P_aux_absorbed                (plasma boundary)
 *   P_thermal     = P_fusion + P_aux_absorbed + P_waste_heat  (MWth to the loop)
 *   P_gross       = eta_th * P_thermal                        (MWe at the generator terminals)
 *   P_aux_plant   = heating + magnets + cryo + pumps + control
 *   P_net         = P_gross - P_aux_plant                     (>0 = export)
 *   Q_engineering = P_net / P_aux_plant
 *
 * Dividing by zero (no auxiliary heating, no on-site load) yields null and the UI
 * displays "N/A" rather than Infinity.
 */

export interface PowerBalanceInput {
  fusionPowerMW: number;
  heatingDeliveredMW: number;
  wasteHeatMW: number;
  toroidalFieldT: number;
  coilCurrentKA: number;
  coolantFlowKgS: number;
  cryoLoadPct: number;
  thermalEfficiency: number;
  controls: ControlInputs;
  /** Total wall-plug power drawn by the heating plant, MW. */
  heatingGridMW: number;
}

export function plantLoads(input: PowerBalanceInput): PowerState['loads'] {
  const heating = Math.max(0, input.heatingGridMW);
  const fieldFraction = clamp(input.toroidalFieldT / MACHINE.referenceToroidalFieldT, 0, 1.6);
  const magnets = MACHINE.magnetSupplyNominalMW * fieldFraction * fieldFraction;
  const cryogenics = MACHINE.cryoNominalMW * clamp(input.cryoLoadPct / 100, 0.35, 1.4);
  const flowFraction = clamp(input.coolantFlowKgS / 12000, 0.2, 1.4);
  const coolantPumps = MACHINE.coolantPumpNominalMW * Math.pow(flowFraction, MACHINE.pumpFlowExponent);
  const vacuumPumps = MACHINE.vacuumPumpNominalMW;
  const controls = MACHINE.controlRackMW;
  return {
    heating,
    magnets,
    cryogenics,
    coolantPumps,
    vacuumPumps,
    controls,
  };
}

export function computePowerBalance(input: PowerBalanceInput, plasmaEnergyMJ: number): PowerState {
  const fusionPowerMW = Math.max(0, input.fusionPowerMW);
  const auxiliaryMW = Math.max(0, input.heatingDeliveredMW);
  const thermalOutputMW = Math.max(0, fusionPowerMW + auxiliaryMW + input.wasteHeatMW);

  const efficiency = clamp(input.thermalEfficiency, 0, 0.45);
  const electricalOutputMW = thermalOutputMW * efficiency;

  const loads = plantLoads(input);
  const plantAuxiliaryMW =
    loads.heating + loads.magnets + loads.cryogenics + loads.coolantPumps + loads.vacuumPumps + loads.controls;

  const netElectricMW = electricalOutputMW - plantAuxiliaryMW;

  const qPlasma = ratio(fusionPowerMW, auxiliaryMW);
  const qEngineering = signedRatio(netElectricMW, plantAuxiliaryMW);

  return {
    fusionPowerMW,
    auxiliaryHeatingMW: auxiliaryMW,
    plasmaEnergyMJ,
    thermalOutputMW,
    electricalOutputMW,
    plantAuxiliaryMW,
    netElectricMW,
    qPlasma,
    qEngineering,
    loads,
  };
}

/**
 * Rankine-cycle efficiency with a low-temperature penalty. A cold loop cannot
 * drive the turbine efficiently, so the efficiency falls off below design point.
 */
export function thermalEfficiencyFromCoolant(outletC: number, inletC: number): number {
  // Design point of the simplified Rankine cycle is a mean coolant temperature of
  // ~255 degC. Efficiency is derated smoothly away from that point, so a cold or
  // overheated loop cannot drive the generator at rated efficiency.
  const meanC = (outletC + inletC) / 2;
  const deviation = Math.abs(meanC - 255);
  const derate = clamp(1 - Math.max(0, deviation - 30) / 400, 0.35, 1);
  return clamp(MACHINE.thermalEfficiency * derate, 0.1, 0.35);
}

/** Q_engineering expressed with the gross (rather than net) electric output. */
export function grossEngineeringQ(grossMW: number, plantAuxiliaryMW: number): number | null {
  return ratio(grossMW, plantAuxiliaryMW);
}

/** Surplus/deficit relative to plant consumption, % of gross output. */
export function plantSelfSufficiencyPct(grossMW: number, auxiliaryMW: number): number | null {
  return ratio(grossMW - auxiliaryMW, Math.max(grossMW, 1e-9));
}

export const POWER_MODEL_NOTES = {
  boundary:
    'System boundary: fusion power + absorbed auxiliary power -> primary coolant -> steam -> turbine -> generator. All on-site electrical loads are counted as input.',
  thermal: 'P_thermal = P_fusion + P_aux,absorbed + P_recovered,waste  (MWth)',
  gross: 'P_electric,gross = eta_Rankine * P_thermal,  eta_Rankine <= 0.33',
  auxiliary:
    'P_aux,plant = P_heating,grid + P_magnets + P_cryo + P_coolant pumps + P_vacuum pumps + P_controls',
  net: 'P_net = P_electric,gross - P_aux,plant  (negative = plant imports electricity)',
  qPlasma: 'Q_plasma = P_fusion / P_aux,absorbed  (plasma-level gain)',
  qEngineering:
    'Q_engineering = P_net / P_aux,plant  (site-level gain, >1 means net electricity production in this simplified model)',
  caution:
    'Q_engineering is NOT a design claim. Real plants add tritium breeding, blankets, maintenance and availability losses that this model does not represent.',
  thermalEff: `eta_th = clamp(${MACHINE.thermalEfficiency} * (1 - max(0, 180 - T_mean)*4e-4), 0.12, 0.35)`,
  plasmaEnergy: 'W_plasma = 3 n T V',
  constants: `cp,coolant = ${PHYS.coolantCp} J/(kg K)`,
} as const;

export { safeDiv };
