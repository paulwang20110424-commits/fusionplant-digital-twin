import { MACHINE, PHYS } from './constants';
import { clamp, safeDiv } from '@/utils/math';

/**
 * PlasmaModel — simplified 0-D plasma physics.
 *
 * All relations are transparent, textbook-level approximations chosen for
 * interactive behaviour, not predictive accuracy. See `MODEL_NOTES` at the
 * bottom of this file for the exact equations exposed in the UI.
 */

/**
 * D-T fusion reactivity <sigma v> in m^3/s.
 *
 * Uses the classic NRL Plasma Formulary approximation for the D-T reaction:
 *   <sigma v> = 3.68e-12 * T_keV^(-2/3) * exp(-19.94 / T_keV^(1/3))  [cm^3/s]
 * Valid roughly for 1 <= T <= 25 keV; clamped outside that band.
 */
export function fusionReactivity(temperatureKeV: number): number {
  const T = clamp(temperatureKeV, 0.2, 100);
  const cm3PerS = 3.68e-12 * Math.pow(T, -2 / 3) * Math.exp(-19.94 / Math.cbrt(T));
  return cm3PerS * 1e-6;
}

/**
 * Fusion power from a 50:50 D-T mixture with n_D = n_T = n_e / 2.
 *   P_fus = (n_e/2)^2 * <sigma v> * E_fus * V
 * Returns MW.
 */
export function fusionPowerMW(
  electronDensity: number,
  temperatureKeV: number,
  volumeM3: number = MACHINE.plasmaVolumeM3,
): number {
  if (!(electronDensity > 0) || !(temperatureKeV > 0)) return 0;
  const n = electronDensity;
  const reactivity = fusionReactivity(temperatureKeV);
  const powerW = 0.25 * n * n * reactivity * PHYS.dTFusionJoule * volumeM3;
  return Number.isFinite(powerW) ? powerW / 1e6 : 0;
}

/** Alpha (self-heating) power, MW. */
export function alphaPowerMW(fusionPowerMWValue: number): number {
  return Math.max(0, fusionPowerMWValue) * PHYS.alphaFraction;
}

/**
 * Total plasma pressure including ions and electrons: p = 2 n k T.
 * Returned in kPa for display.
 */
export function plasmaPressureKPa(electronDensity: number, temperatureKeV: number): number {
  if (!(electronDensity > 0) || !(temperatureKeV > 0)) return 0;
  return (2 * electronDensity * temperatureKeV * PHYS.keVToJoule) / 1000;
}

/**
 * Stored thermal energy of a 0-D plasma: W = 3 n T V (electrons + ions).
 * Returned in MJ.
 */
export function storedEnergyMJ(
  electronDensity: number,
  temperatureKeV: number,
  volumeM3: number = MACHINE.plasmaVolumeM3,
): number {
  if (!(electronDensity > 0) || !(temperatureKeV > 0)) return 0;
  return (3 * electronDensity * temperatureKeV * volumeM3 * PHYS.keVToJoule) / 1e6;
}

/**
 * Inverse of `storedEnergyMJ`: temperature implied by a stored energy.
 * Used by the energy-balance integrator.
 */
export function temperatureFromEnergyMJ(
  energyMJ: number,
  electronDensity: number,
  volumeM3: number = MACHINE.plasmaVolumeM3,
): number {
  const capacity = 3 * electronDensity * volumeM3 * PHYS.keVToJoule;
  const denominator = safeDiv(capacity, 1e6);
  if (!denominator) return 0;
  return Math.max(0, energyMJ / denominator);
}

/**
 * IPB98(y,2) energy confinement scaling, seconds.
 *
 *   tau_E = 0.0562 * H * Ip^0.93 * Bt^0.15 * P^-0.69 * n19^0.41
 *           * M^0.19 * R^1.97 * eps^0.58 * kappa^0.78
 *
 * A generic ITER-like geometry is used (R0 = 6.2 m, a = 2.0 m, kappa = 1.7,
 * M = 2.5 for D-T). Absolute values land in the few-second range, which is the
 * expected order of magnitude for a device of this size.
 */
export function confinementTimeS(params: {
  currentMA: number;
  toroidalFieldT: number;
  lossPowerMW: number;
  electronDensity: number;
  hFactor: number;
  elongation?: number;
}): number {
  const current = clamp(params.currentMA, 0.1, 30);
  const field = clamp(params.toroidalFieldT, 0.1, 20);
  const power = clamp(params.lossPowerMW, 1, 5000);
  const density19 = clamp(params.electronDensity / 1e19, 0.01, 100);
  const h = clamp(params.hFactor, 0.2, 2);
  const kappa = clamp(params.elongation ?? MACHINE.elongation, 1, 2.6);
  const eps = MACHINE.minorRadiusM / MACHINE.majorRadiusM;
  const mass = 2.5;

  const tau =
    0.0562 *
    h *
    Math.pow(current, 0.93) *
    Math.pow(field, 0.15) *
    Math.pow(power, -0.69) *
    Math.pow(density19, 0.41) *
    Math.pow(mass, 0.19) *
    Math.pow(MACHINE.majorRadiusM, 1.97) *
    Math.pow(eps, 0.58) *
    Math.pow(kappa, 0.78);

  return clamp(tau, 0.05, 15);
}

/** Bremsstrahlung radiation proxy, MW. */
export function radiatedPowerMW(
  electronDensity: number,
  temperatureKeV: number,
  volumeM3: number = MACHINE.plasmaVolumeM3,
  effectiveZ = 1.5,
): number {
  if (!(electronDensity > 0) || !(temperatureKeV > 0)) return 0;
  const powerW =
    5.35e-37 * effectiveZ * electronDensity * electronDensity * Math.sqrt(temperatureKeV) * volumeM3;
  return Number.isFinite(powerW) ? powerW / 1e6 : 0;
}

/** Normalised beta (Troyon parameter), %*m*T/MA. */
export function normalizedBeta(
  electronDensity: number,
  temperatureKeV: number,
  toroidalFieldT: number,
  currentMA: number,
): number {
  const pressurePa = 2 * electronDensity * temperatureKeV * PHYS.keVToJoule;
  const field = Math.max(toroidalFieldT, 0.05);
  const betaTPercent = ((2 * PHYS.mu0 * pressurePa) / (field * field)) * 100;
  const betaN = safeDiv(betaTPercent * MACHINE.minorRadiusM * field, currentMA, 0);
  return clamp(betaN ?? 0, 0, 20);
}

/** Toroidal beta, %. */
export function toroidalBetaPercent(
  electronDensity: number,
  temperatureKeV: number,
  toroidalFieldT: number,
): number {
  const pressurePa = 2 * electronDensity * temperatureKeV * PHYS.keVToJoule;
  const field = Math.max(toroidalFieldT, 0.05);
  const value = ((2 * PHYS.mu0 * pressurePa) / (field * field)) * 100;
  return clamp(value, 0, 100);
}

/** Greenwald density limit in 1e20 m^-3. */
export function greenwaldDensityLimit(currentMA: number): number {
  return clamp(currentMA / (Math.PI * MACHINE.minorRadiusM * MACHINE.minorRadiusM), 0, 10);
}

/** Density limit fraction n / n_GW. */
export function greenwaldFraction(electronDensity: number, currentMA: number): number {
  const limit = greenwaldDensityLimit(currentMA);
  if (limit <= 0) return 0;
  return clamp(electronDensity / 1e20 / limit, 0, 5);
}

/**
 * Cylindrical safety factor proxy with a shaping correction.
 *   q_cyl = 2 pi a^2 Bt / (mu0 R Ip)
 *   q95   ~= q_cyl * (1 + kappa^2) / 2 * 1.17
 */
export function safetyFactorProxy(
  toroidalFieldT: number,
  currentMA: number,
  elongation = MACHINE.elongation,
): number {
  if (currentMA <= 0.01) return 20;
  const qCyl =
    (2 * Math.PI * MACHINE.minorRadiusM ** 2 * toroidalFieldT) /
    (PHYS.mu0 * MACHINE.majorRadiusM * currentMA * 1e6);
  const shaped = qCyl * ((1 + elongation * elongation) / 2) * 1.17;
  return clamp(shaped, 0.5, 20);
}

/**
 * One explicit Euler step of the 0-D energy balance.
 *   dW/dt = P_aux,absorbed + P_alpha - W / tau_E - P_rad
 * Returns the new temperature, already clamped to a physical floor.
 */
export function integratePlasmaTemperature(params: {
  temperatureKeV: number;
  electronDensity: number;
  volumeM3: number;
  absorbedAuxMW: number;
  alphaMW: number;
  radiatedMW: number;
  confinementTimeS: number;
  dt: number;
}): number {
  const n = Math.max(params.electronDensity, 1e17);
  const capacityJPerKeV = 3 * n * params.volumeM3 * PHYS.keVToJoule;
  const storedMJ = storedEnergyMJ(n, params.temperatureKeV, params.volumeM3);
  const lossMW = safeDiv(storedMJ, params.confinementTimeS, storedMJ);
  const netMW = params.absorbedAuxMW + params.alphaMW - (lossMW ?? 0) - params.radiatedMW;
  const deltaT = safeDiv(netMW * 1e6 * params.dt, capacityJPerKeV, 0) ?? 0;
  return clamp(params.temperatureKeV + deltaT, 0.02, 80);
}

/** Density relaxation towards a fuelling target with particle confinement lag. */
export function integrateDensity(params: {
  density: number;
  targetDensity: number;
  dt: number;
  tauS: number;
}): number {
  const target = clamp(params.targetDensity, 1e17, 5e20);
  const alpha = 1 - Math.exp(-params.dt / Math.max(params.tauS, 0.05));
  return clamp(params.density + (target - params.density) * alpha, 1e17, 5e20);
}

export const MODEL_NOTES = {
  reactivity: '<sigma v> = 3.68e-12 * T^-2/3 * exp(-19.94 / T^1/3) cm^3/s (NRL D-T fit)',
  fusionPower: 'P_fus = (n_e/2)^2 * <sigma v> * 17.59 MeV * V',
  energy: 'dW/dt = P_aux,abs + P_alpha - W/tau_E - P_rad,  W = 3 n T V,  P_alpha = 0.2 P_fus',
  confinement:
    'IPB98(y,2): tau_E = 0.0562 H Ip^0.93 Bt^0.15 P^-0.69 n19^0.41 M^0.19 R^1.97 eps^0.58 kappa^0.78',
  beta: 'beta_t = 2 mu0 p / Bt^2,  beta_N = beta_t a Bt / Ip',
  densityLimit: 'n_GW = Ip / (pi a^2) [1e20 m^-3]',
  safetyFactor: 'q95 ~= (2 pi a^2 Bt / (mu0 R Ip)) * (1+kappa^2)/2 * 1.17',
} as const;
